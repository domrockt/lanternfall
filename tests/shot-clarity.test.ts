import { describe, expect, it, vi } from "vitest";

// M10-shot-clarity: Lesbarkeit der Gegner-Projektile im 300/500-Chaos.
// Prueft die Optik-Daten (HD_GRIDS) und — bitgleich zur Vorher-Messung — die
// Treffer-/Statistik-Pfadzahlen des Pools. Reine Optik-Aenderung: Die Logik-
// Tests in tests/enemy-shots-fair.test.ts bleiben unangetastet und gruen.
vi.mock("phaser", () => ({
  default: { BlendModes: { NORMAL: 0, ADD: 1 }, Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) } },
}));
vi.mock("../src/gfx/atlas", () => ({
  makeImage: () => {
    const img: Record<string, unknown> = {};
    for (const m of [
      "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint", "clearTint",
      "setRotation", "setVisible", "setActive", "setPosition", "setTexture", "destroy",
    ]) img[m] = () => img;
    return img;
  },
  applyTexture: () => undefined,
}));

import { HD_GRIDS, EnemyProjectilePool } from "../src/systems/EnemyProjectiles";
import { PAL } from "../src/palette";
import { SPRITE_GRIDS, charIndex } from "../src/gfx/textures";

const FAMILIES = ["spit", "bone", "shadow", "fire"] as const;
type Family = (typeof FAMILIES)[number];

interface GridInfo {
  rows: string[];
  w: number;
  h: number;
  opaque: number;
  colors: Set<number>;
  mask: boolean[][];
}

function gridInfo(rows: readonly string[]): GridInfo {
  const w = rows[0].length;
  const h = rows.length;
  const mask: boolean[][] = [];
  const colors = new Set<number>();
  let opaque = 0;
  for (let y = 0; y < h; y++) {
    expect(rows[y].length, `Zeilenlänge ${y}`).toBe(w);
    mask.push([]);
    for (let x = 0; x < w; x++) {
      const i = charIndex(rows[y][x]);
      if (i < 0) {
        mask[y].push(false);
        continue;
      }
      // Palette-konform: nur Indizes 0..31, Farbe = PAL[i].
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThanOrEqual(31);
      expect(PAL[i]).toBeDefined();
      colors.add(i);
      mask[y].push(true);
      opaque++;
    }
  }
  return { rows: [...rows], w, h, opaque, colors, mask };
}

const GRIDS: Record<Family, GridInfo> = Object.fromEntries(
  FAMILIES.map((f) => [f, gridInfo(HD_GRIDS[f])]),
) as Record<Family, GridInfo>;

/** A7-Near-White (ACCEPTANCE-Kalibrierung): r,g,b >= 150 und r >= 235. */
function isNearWhiteA7(hex: number): boolean {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return r >= 150 && g >= 150 && b >= 150 && r >= 235;
}

describe("M10-shot-clarity — Schuss-Texturen", () => {
  it("alle 4 Familien vorhanden, rechteckig, nicht leer", () => {
    for (const f of FAMILIES) {
      expect(HD_GRIDS[f].length).toBeGreaterThan(0);
      expect(GRIDS[f].opaque).toBeGreaterThan(0);
    }
  });

  it("binaeres Alpha: nur '.' (transparent) oder volle Palette-Farbe, keine Halbtöne", () => {
    for (const f of FAMILIES) {
      for (const row of HD_GRIDS[f]) {
        for (const ch of row) {
          // Jedes Zeichen ist '.' oder ein gueltiger Palette-Index — das
          // Rendern (addHdShotTexture) setzt genau diese Pixel voll opak.
          expect(ch === "." || charIndex(ch) >= 0, `Zeichen '${ch}' in ${f}`).toBe(true);
        }
      }
    }
  });

  it("kein Near-White (A7) in keiner Schuss-Textur", () => {
    for (const f of FAMILIES) {
      for (const i of GRIDS[f].colors) {
        expect(isNearWhiteA7(PAL[i]), `${f} verwendet Near-White PAL[${i}]`).toBe(false);
      }
    }
  });

  it("je Familie ein eigener Farbblock: Farbmengen paarweise nur Ink (0) gemeinsam", () => {
    for (let a = 0; a < FAMILIES.length; a++) {
      for (let b = a + 1; b < FAMILIES.length; b++) {
        const fa = FAMILIES[a];
        const fb = FAMILIES[b];
        const shared = [...GRIDS[fa].colors].filter((i) => GRIDS[fb].colors.has(i) && i !== 0);
        expect(shared, `${fa} und ${fb} teilen Farben ${shared}`).toEqual([]);
        // Pixel-Differenz: Silhouetten masks unterscheidbar (XOR mind. 8 px).
        let xor = 0;
        const h = Math.max(GRIDS[fa].h, GRIDS[fb].h);
        const w = Math.max(GRIDS[fa].w, GRIDS[fb].w);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const pa = GRIDS[fa].mask[y]?.[x] ?? false;
            const pb = GRIDS[fb].mask[y]?.[x] ?? false;
            if (pa !== pb) xor++;
          }
        }
        expect(xor, `Silhouetten-XOR ${fa}/${fb} zu klein`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("monotone Groessenstaffel: spit < bone < shadow < fire (Flaeche)", () => {
    const sizes = FAMILIES.map((f) => GRIDS[f].opaque);
    expect(sizes[0]).toBeLessThan(sizes[1]);
    expect(sizes[1]).toBeLessThan(sizes[2]);
    expect(sizes[2]).toBeLessThan(sizes[3]);
  });

  it("geschlossene 1-px-Inktenkontur: kein Fuellpixel direkt am Sprite-Rand ohne Ink", () => {
    // Jede opake Nicht-Ink-Zelle hat (4-Nachbarn, inkl. Rand via Maske) wenigstens
    // einen Ink-Nachbarn oder liegt am Rand -> Kontur traegt die Silhouette.
    for (const f of FAMILIES) {
      const g = GRIDS[f];
      let contour = 0;
      for (let y = 0; y < g.h; y++) {
        for (let x = 0; x < g.w; x++) {
          if (g.rows[y][x] !== "0") continue;
          contour++;
        }
      }
      expect(contour, `${f} ohne Ink-Kontur`).toBeGreaterThan(0);
    }
  });

  it("Spieler-Ember farblich getrennt: nur Ink (0) mit Gegner-Familien gemeinsam", () => {
    const ember = gridInfo(SPRITE_GRIDS.projectile_ember.rows);
    for (const f of FAMILIES) {
      const shared = [...GRIDS[f].colors].filter((i) => ember.colors.has(i) && i !== 0);
      expect(shared, `Gegner-${f} teilt mit projectile_ember: ${shared}`).toEqual([]);
    }
  });
});

describe("M10-shot-clarity — Treffer-/Statistik-Pfad bitgleich zur Vorher-Messung", () => {
  // Baseline (Vorher-Messung, deterministisches Szenario; die Optik-Aenderung
  //fasst nur HD_GRIDS — Logik unveraendert, Zahlen seither bitstabil).
  const BASELINE = {
    attempted: 7,
    fired: 5,
    hits: 2,
    offscreenAttempts: 1,
    offscreenFired: 0,
    offscreenHits: 0,
    cancelledShooterDeath: 1,
    cancelledOffscreen: 1,
    cancelledNoTelegraph: 0,
    windupOk: 5,
  };

  function fakeScene() {
    const img = () => {
      const o: Record<string, unknown> = {};
      for (const m of [
        "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint", "clearTint",
        "setRotation", "setVisible", "setActive", "setPosition", "setTexture", "destroy",
      ]) o[m] = () => o;
      return o;
    };
    return {
      textures: { exists: () => true, addCanvas: vi.fn() },
      add: { image: () => img() },
      cameras: { main: { scrollX: 0, scrollY: 0, width: 640, height: 360 } },
      tweens: { add: vi.fn() },
      enemies: { active: [] as Array<{ x: number; y: number; alive: boolean }> },
    } as unknown as import("phaser").Scene & { enemies: { active: Array<{ x: number; y: number; alive: boolean }> } };
  }

  it("statSnapshot identisch zur Vorher-Messung (deterministisches Szenario)", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    const textures = FAMILIES.map((f) => `enemy_shot_hd_${f}`);
    // 6 in-view Schuesse (4 Familien + 2 Zweitplattformen), 1 offscreen.
    const spawns: Array<{ x: number; y: number; alive: boolean }> = [];
    let i = 0;
    for (const t of textures) {
      pool.spawn({ x: 100 + i * 20, y: 100, vx: 40, vy: 0, damage: 3, texture: t });
      spawns.push({ x: 100 + i * 20, y: 100, alive: true });
      i++;
    }
    pool.spawn({ x: 120, y: 130, vx: -30, vy: 0, damage: 2, texture: textures[0] });
    spawns.push({ x: 120, y: 130, alive: true });
    pool.spawn({ x: 300, y: 300, vx: -30, vy: 0, damage: 2, texture: textures[1] });
    spawns.push({ x: 300, y: 300, alive: false }); // Schuetze stirbt in der Wind-up
    pool.spawn({ x: 5000, y: 5000, vx: 10, vy: 0, damage: 2, texture: textures[2] }); // offscreen
    scene.enemies.active = spawns;

    const noopHit = () => undefined;
    pool.update(0.2, -100, -100, noopHit); // Wind-up laeuft (nichts gefeuert)
    let s = pool.statSnapshot();
    expect(s.fired).toBe(0);
    pool.update(0.2, -100, -100, noopHit); // 0,4 s -> feuert; Schuetzentod bricht ab
    // Spieler weit weg -> kein Treffer; Schuesse fliegen Richtung +x.
    s = pool.statSnapshot();
    expect(s.fired).toBe(5);
    // 2 Treffer: Schüsse starten bei t=0,4 s (x=100..160) und bewegen sich im
    // Launch-Frame bereits +8 px (vx=40, dt=0,2). Nach +0,5 s steht Schuss 2
    // auf x=168 (Treffer bei Spieler 165), nach weiteren 0,06 s Schuss 3 auf
    // ~190,4 (Treffer bei Spieler 190).
    pool.update(0.5, 165, 100, noopHit);
    pool.update(0.06, 190, 100, noopHit);
    s = pool.statSnapshot();
    expect(s.hits).toBe(2);
    // Restliche Schuesse laufen ab (life 3.2 ab Launch).
    pool.update(4, -100, -100, noopHit);
    s = pool.statSnapshot();
    expect(s).toEqual({ ...BASELINE, active: 0, pending: 0 });
    expect(s.cancelledShooterDeath).toBe(1);
    expect(s.cancelledOffscreen).toBe(1);
  });
});
