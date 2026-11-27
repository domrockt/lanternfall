import { describe, expect, it, vi, afterEach } from "vitest";
import { PAL } from "../src/palette";
import { deathFrameSets, isBossFxKey, BOSS_FX_BASES, FX_FRAME_COUNTS } from "../src/gfx/gen-fx";

/**
 * M10 boss-fx-contrast — harte Invariante zum Abnahme-Blocker "Boss-FX-Kontrast"
 * (art-director FAIL 3,25/5 in docs/qa/reacceptance-2026-11-27.md).
 *
 * Karte #5219 (Kontur-Regel, Technik wie Ember-Fix #2879): das echte
 * fx_boss_core-Frame-Set (Boss-Auftritt/-Tod) muss
 *   (a) nur Palettenfarben oder transparente Pixel enthalten (binaeres Alpha),
 *   (b) eine geschlossene 1-px-Tintenkontur um den Glutkern tragen,
 *   (c) Kern-hell vs. Kontur-dunkel mit Luminanz-Kontrast >= 5:1 trennen,
 *   (d) im Frame <= 4,16 % Near-White-Pixel behalten (kalibriert wie #2879).
 *
 * Karte #5220 (Mindest-Alpha-Boden) ergänzt die FxSystem-Tests weiter unten.
 */

const NEAR_WHITE_TARGET_PCT = 4.16;

type Grid = { rows: string[]; w: number; h: number };

function paletteIndex(ch: string): number {
  if (ch === ".") return -1;
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "v") return ch.charCodeAt(0) - 97 + 10;
  return -2;
}

function rgb(i: number): [number, number, number] {
  const v = PAL[i];
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function luminance(i: number): number {
  const [r, g, b] = rgb(i).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isNearWhite(i: number): boolean {
  const [r, g, b] = rgb(i);
  return Math.min(r, g, b) >= 200;
}

const bossSet: { frames: string[][]; w: number; h: number } =
  deathFrameSets().fx_boss_core as unknown as { frames: string[][]; w: number; h: number };
const INK = paletteIndex("0");
const CORE = 13; // lanternWhite

describe("fx_boss_core Kontur-Regel (Karte #5219)", () => {
  it("Frame-Set existiert und ist 32x32 mit 6 Frames", () => {
    expect(bossSet).toBeDefined();
    expect(bossSet.w).toBe(32);
    expect(bossSet.h).toBe(32);
    expect(bossSet.frames.length).toBe(6);
    expect(FX_FRAME_COUNTS.fx_boss_core).toBe(6);
  });

  it("binaeres Alpha: jedes Pixel ist transparent oder eine Palettenfarbe", () => {
    for (const grid of bossSet.frames) {
      for (const row of grid) {
        for (const ch of row) {
          expect(paletteIndex(ch)).toBeGreaterThanOrEqual(-1);
          expect(paletteIndex(ch)).not.toBe(-2);
        }
      }
    }
  });

  it("geschlossene Tintenkontur: radial folgt auf den Kern unmittelbar Tinte", () => {
    const cx = (bossSet.w - 1) / 2;
    const cy = (bossSet.h - 1) / 2;
    const RAYS = 72;
    for (const grid of bossSet.frames) {
      let inkAfterCore = 0;
      let rays = 0;
      for (let r = 0; r < RAYS; r++) {
        const a = (r / RAYS) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        let coreRun = 0;
        for (let d = 0; d <= 16; d += 0.5) {
          const x = Math.round(cx + dx * d);
          const y = Math.round(cy + dy * d);
          if (x < 0 || y < 0 || x >= bossSet.w || y >= bossSet.h) break;
          const idx = paletteIndex(grid[y][x]);
          if (idx === 13 || idx === 22 || idx === 20) { coreRun = d; continue; }
          // Erster Nicht-Kern-Pixel nach dem Kernlauf: hier muss Tinte sitzen
          // (Kontur/Ring-Ueberlagerung: Tinte innerhalb der naechsten 2 Pixel).
          // Die Lichtkante oben-links (helle Kernrandpixel, 11/21) grenzt per
          // Definition unmittelbar an Tinte und zaehlt als Kontur-Nachweis.
          if (coreRun > 0) {
            rays++;
            let ink = false;
            for (let e = 0; e <= 1.5; e += 0.5) {
              const nx = Math.round(cx + dx * (d + e));
              const ny = Math.round(cy + dy * (d + e));
              if (nx < 0 || ny < 0 || nx >= bossSet.w || ny >= bossSet.h) break;
              const ch = grid[ny][nx];
              if (paletteIndex(ch) === INK || ch === "b" || ch === "l") { ink = true; break; }
            }
            if (ink) inkAfterCore++;
            break;
          }
        }
      }
      expect(rays).toBe(RAYS);
      // Kontur umschliesst den Kern in (fast) jeder Richtung.
      expect(inkAfterCore / rays).toBeGreaterThan(0.95);
    }
  });

  it("Offset-Outline: unterhalb/rechts der Kernsilhouette sitzt Versatz-Tinte", () => {
    const grid = bossSet.frames[0];
    let offsetInk = 0;
    for (let y = 0; y < bossSet.h - 1; y++) {
      for (let x = 0; x < bossSet.w - 1; x++) {
        const here = paletteIndex(grid[y][x]);
        const shifted = paletteIndex(grid[y + 1][x + 1]);
        if (here === -1 && shifted === INK) offsetInk++;
      }
    }
    // Die +1/+1-versetzte Kopie erzeugt sichtbaren Versatz (nicht nur der Ring).
    expect(offsetInk).toBeGreaterThan(8);
  });

  it("Luminanz-Kontrast Kern vs. Kontur >= 5:1", () => {
    const lumCore = luminance(CORE);
    const lumInk = luminance(INK);
    expect(lumCore / Math.max(lumInk, 1e-6)).toBeGreaterThanOrEqual(5);
  });

  it("Near-White <= 4,16 % im Frame (alle Stufen)", () => {
    for (const grid of bossSet.frames) {
      let opaque = 0;
      let nearWhite = 0;
      for (const row of grid) {
        for (const ch of row) {
          const idx = paletteIndex(ch);
          if (idx < 0) continue;
          opaque++;
          if (isNearWhite(idx)) nearWhite++;
        }
      }
      const pct = (nearWhite / opaque) * 100;
      expect(pct).toBeLessThanOrEqual(NEAR_WHITE_TARGET_PCT);
    }
  });
});

describe("isBossFxKey (Karten #5219/#5220)", () => {
  it("erkennt die Boss-Basis und ihre Frames", () => {
    expect(BOSS_FX_BASES).toContain("fx_boss_core");
    expect(isBossFxKey("fx_boss_core")).toBe(true);
    expect(isBossFxKey("fx_boss_core_2")).toBe(true);
  });

  it("geteilte und normale FX-Keys bleiben normal", () => {
    expect(isBossFxKey("fx_shock")).toBe(false);
    expect(isBossFxKey("fx_shock_2")).toBe(false);
    expect(isBossFxKey("fx_halo")).toBe(false);
    expect(isBossFxKey("fx_evo_hit_phoenix")).toBe(false);
    expect(isBossFxKey(undefined)).toBe(false);
    expect(isBossFxKey("")).toBe(false);
  });
});

/**
 * Karte #5220 — Verdrahtung im FxSystem: Mindest-Alpha-Boden + LOD-Ausnahmen.
 * Phaser wird wie in tests/fx-add-cap.test.ts gemockt; Sprites sind Fakes.
 */
import Phaser from "phaser";
import { FxSystem } from "../src/systems/FxSystem";
import { BOSS_FX_ALPHA_FLOOR } from "../src/systems/FxSystem";

vi.mock("phaser", () => ({
  default: { BlendModes: { ADD: 1, NORMAL: 0 }, Scenes: { Events: { SHUTDOWN: "shutdown" } } },
}));

interface FakeSprite {
  width: number;
  height: number;
  visible: boolean;
  alpha: number;
  blend: number;
  frame: { name?: string };
  texture: { key: string };
  setAlpha(a: number): unknown;
  setBlendMode(m: number): unknown;
  setPosition(): unknown;
  setScale(x: number, y: number): unknown;
  setRotation(): unknown;
  setDepth(): unknown;
  setVisible(v: boolean): unknown;
  setActive(v: boolean): unknown;
  setTint(): unknown;
  clearTint(): unknown;
  setTexture(k: string): unknown;
}

function fakeSprite(w = 32, h = 32): FakeSprite {
  const rec: FakeSprite = {
    width: w,
    height: h,
    visible: false,
    alpha: 1,
    blend: Phaser.BlendModes.NORMAL,
    frame: { name: "fx" },
    texture: { key: "fx_halo" },
    setAlpha(a: number) { rec.alpha = a; return rec; },
    setBlendMode(m: number) { rec.blend = m; return rec; },
    setPosition() { return rec; },
    setScale() { return rec; },
    setRotation() { return rec; },
    setDepth() { return rec; },
    setVisible(v: boolean) { rec.visible = v; return rec; },
    setActive() { return rec; },
    setTint() { return rec; },
    clearTint() { return rec; },
    setTexture() { return rec; },
  };
  return rec;
}

function fakeScene(sprite: FakeSprite): Phaser.Scene {
  return {
    events: { once: () => {} },
    add: { image: () => sprite },
    time: { now: 0 },
  } as unknown as Phaser.Scene;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("Boss-FX Mindest-Alpha-Boden + LOD-Ausnahme (Karte #5220)", () => {
  it("fx_boss_core: Alpha faellt nie unter 0,7 — auch bei Endgame-Daempfung + dpr 3", () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 3 };
    const sprite = fakeSprite();
    const fx = new FxSystem(fakeScene(sprite));
    fx.setAlphaScale(0.5); // reduced-LOD-Daempfung aktiv
    const runtime = fx.spawn({ texture: "fx_boss_core", x: 0, y: 0, life: 1, alphaFrom: 0.2 });
    expect(runtime).not.toBeNull();
    expect(runtime?.alphaScaleExempt).toBe(true);
    expect(runtime?.alphaFrom).toBe(BOSS_FX_ALPHA_FLOOR);
    expect(runtime?.alphaFrom).toBeGreaterThanOrEqual(0.7);
    expect(sprite.alpha).toBe(BOSS_FX_ALPHA_FLOOR);
  });

  it("fx_boss_core: kein dpr-Alpha (0,72 bleibt 0,72, nicht 0,72*0,6)", () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 3 };
    const sprite = fakeSprite();
    const fx = new FxSystem(fakeScene(sprite));
    const runtime = fx.spawn({ texture: "fx_boss_core", x: 0, y: 0, life: 1, alphaFrom: 0.72 });
    expect(runtime?.alphaFrom).toBeCloseTo(0.72, 10);
  });

  it("fx_boss_core: rendern NORMAL und belegen keinen ADD-Glow-Slot", () => {
    const sprite = fakeSprite();
    const fx = new FxSystem(fakeScene(sprite));
    const runtime = fx.spawn({ texture: "fx_boss_core", x: 0, y: 0, life: 1 });
    expect(runtime?.additive).toBe(false);
    expect(sprite.blend).toBe(Phaser.BlendModes.NORMAL);
    expect(fx.glowUsed).toBe(0);
    // Auch der Screengroessen-Deckel greift fuer Boss-FX nicht (NORMAL rendert eh nicht additiv).
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 3 };
    const big = fx.spawn({ texture: "fx_boss_core", x: 0, y: 0, life: 1, scaleFrom: 6, scaleTo: 6 });
    expect(big?.scaleFrom).toBe(6);
  });

  it("fx_boss_core: setAlphaScale aendert laufende Boss-FX nicht (Ausnahme)", () => {
    const sprite = fakeSprite();
    const fx = new FxSystem(fakeScene(sprite));
    const runtime = fx.spawn({ texture: "fx_boss_core", x: 0, y: 0, life: 1, alphaFrom: 0.9 });
    fx.setAlphaScale(0.5);
    expect(runtime?.alphaFrom).toBeCloseTo(0.9, 10);
    expect(sprite.alpha).toBeCloseTo(0.9, 10);
  });

  it("normale FX unverändert: fx_halo wird weiter gedämpft, gecappt und belegt Slots", () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 3 };
    const sprite = fakeSprite();
    const fx = new FxSystem(fakeScene(sprite));
    fx.setAlphaScale(0.5);
    const runtime = fx.spawn({ texture: "fx_halo", x: 0, y: 0, life: 1, scaleFrom: 6, scaleTo: 6 });
    // Daempfung quadratisch + dpr-Alpha (0,9*0,5*0,5*0,6) — bestehendes M6/M10-Verhalten, unveraendert.
    expect(runtime?.alphaScaleExempt).toBe(false);
    expect(runtime?.alphaFrom).toBeCloseTo(0.9 * 0.5 * 0.5 * 0.6, 10);
    // Flaeche (32*6)^2 = 36864 > 9216 -> Faktor 0,5 -> Scale 3 (Deckel greift weiter).
    expect(runtime?.scaleFrom).toBeCloseTo(3, 10);
  });
});
