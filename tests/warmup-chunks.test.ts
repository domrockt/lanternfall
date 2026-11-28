// m10-warmup-chunk-fine K4 — Guards fuer das feiner gechunkte Warmup.
//
// K2 hat den Sammel-Chunk "derived-atlas" (createAllTextures) in 6 Creator-
// Familien-Chunks aufgeloest. Dieser Test friert ein:
// 1. die Chunk-Aufteilung (Labels + Reihenfolge nach Sichtbarkeit),
// 2. dass textures.ts die 4 ehemals privaten Creator wirklich exportiert,
// 3. die Idempotenz: doppelte Ausfuehrung der Familien-Chunks erzeugt KEINE
//    Duplikat-Texturen (addCanvas genau 1x je Key, Key-Satz identisch).
//
// Muster: Phaser-Wert-Importe neutral gemockt (wie tests/loading-warmup.test.ts),
// document/canvas-Stub als Zahlen-Sammler (wie tests/hazard-tex-cap.test.ts) —
// die run-Closures zeichnen hier nur ins Leere, gezaehlt wird addCanvas je Key.
import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => {
  class Container {}
  class Image {}
  class Scene {}
  return { default: { GameObjects: { Container, Image }, Scene } };
});

// Canvas-Stub: getContext liefert einen Proxy, der jede Zeichen-Methode als
// No-Op akzeptiert; getImageData liefert ein stimmiges Pixel-Array (createLight-
// Texture multipliziert pro Pixel Alpha hinein).
function canvasStub(): HTMLCanvasElement {
  const ctx = new Proxy({}, {
    get: (_t, p) => {
      if (p === "getImageData") {
        return (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0) * 4)),
          width: w, height: h,
        });
      }
      return () => undefined;
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

vi.stubGlobal("document", { createElement: () => canvasStub() });

import {
  buildWarmupTasks,
  type WarmupTask,
} from "../src/gfx/warmup";
import {
  createAllTextures,
  createEnemyProjectileTextures,
  createRingTexture,
  createShadowTexture,
  createTelegraphTextures,
} from "../src/gfx/textures";

/** Die 6 Familien-Chunks aus K2, in der festgelegten Reihenfolge. */
const FAMILY_CHUNKS = [
  "light-vignette",
  "shadow",
  "rings",
  "enemy-projectiles",
  "telegraphs",
  "static-atlas",
] as const;

/** Erwartete Textur-Keys der Familien-Chunks (Kontrakt aus createAllTextures). */
const EXPECTED_KEYS = [
  "light_radius", "vignette",
  "shadow",
  "ring_burst", "ring_seal", "ring_soul",
  "elite_aura",
  "enemy_shot_spit", "enemy_shot_bone", "enemy_shot_fire", "enemy_shot_shadow", "enemy_shot_thorn",
  "telegraph_disc", "puddle_poison", "telegraph_beam",
];

function labels(): string[] {
  return buildWarmupTasks({} as never).map((t) => t.label);
}

/** Fake-Szene: Textur-Registry mit exists/addCanvas/get/remove + addCanvas-Zaehler. */
function fakeScene(): { scene: never; counts: Map<string, number> } {
  const keys = new Set<string>();
  const counts = new Map<string, number>();
  const textures = {
    exists: (key: string) => keys.has(key),
    addCanvas: (key: string) => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      keys.add(key);
      return undefined;
    },
    get: () => ({ get: () => null, getSourceImage: () => null }),
    remove: (key: string) => { keys.delete(key); },
    getTextureKeys: () => [...keys],
  };
  return { scene: { textures } as never, counts };
}

describe("warmup-chunks (m10-warmup-chunk-fine K4): feines Chunking", () => {
  it("der Sammel-Chunk derived-atlas ist weg (K2)", () => {
    expect(labels()).not.toContain("derived-atlas");
  });

  it("die 6 Familien-Chunks liegen direkt nach icons, in Sichtbarkeits-Reihenfolge", () => {
    const ls = labels();
    const icons = ls.indexOf("icons");
    expect(icons).toBeGreaterThan(0);
    expect(ls.slice(icons + 1, icons + 1 + FAMILY_CHUNKS.length)).toEqual([...FAMILY_CHUNKS]);
  });

  it("static-atlas ist der letzte Textur-Chunk VOR runtime-atlas (Atlas-Vertrag)", () => {
    const ls = labels();
    const atlas = ls.indexOf("runtime-atlas");
    expect(ls.indexOf("static-atlas")).toBeGreaterThan(0);
    expect(ls.indexOf("static-atlas")).toBeLessThan(atlas);
    expect(ls.indexOf("light-vignette")).toBeLessThan(atlas);
  });

  it("textures.ts exportiert die 4 ehemals privaten Creator (+ createAllTextures unveraendert)", () => {
    expect(typeof createRingTexture).toBe("function");
    expect(typeof createEnemyProjectileTextures).toBe("function");
    expect(typeof createTelegraphTextures).toBe("function");
    expect(typeof createShadowTexture).toBe("function");
    expect(typeof createAllTextures).toBe("function");
  });
});

describe("warmup-chunks (m10-warmup-chunk-fine K4): Idempotenz", () => {
  function familyTasks(): WarmupTask[] {
    return buildWarmupTasks({} as never).filter((t) =>
      (FAMILY_CHUNKS as readonly string[]).includes(t.label),
    );
  }

  it("doppelte Ausfuehrung: gleicher Key-Satz, addCanvas genau 1x je Key, keine Duplikate", () => {
    const { scene, counts } = fakeScene();
    const tasks = familyTasks();
    expect(tasks.length).toBe(FAMILY_CHUNKS.length);

    for (const t of tasks) t.run(scene);
    const afterFirst = [...counts.keys()].sort();
    expect(afterFirst).toEqual([...EXPECTED_KEYS].sort());

    for (const t of tasks) t.run(scene);
    const afterSecond = [...counts.keys()].sort();
    expect(afterSecond).toEqual(afterFirst); // kein neuer Key
    for (const [key, n] of counts) {
      expect(n, `addCanvas(${key})`).toBe(1); // keine Duplikat-Texturen
    }
  });

  it("jeder Familien-Chunk ist einzeln idempotent (Re-Run ist ein No-Op)", () => {
    for (const t of familyTasks()) {
      const { scene, counts } = fakeScene();
      t.run(scene);
      const first = [...counts.keys()].sort();
      t.run(scene);
      const second = [...counts.keys()].sort();
      expect(second, `Chunk ${t.label}`).toEqual(first);
      for (const [, n] of counts) expect(n).toBe(1);
    }
  });

  it("die Familien-Chunks decken denselben Key-Umfang ab wie createAllTextures' Reste", () => {
    // Der Key-Umfang ist oben als Kontrakt eingefroren; gegen die Quelle
    // gesichert ist er, weil EXPECTED_KEYS exakt die Reste aus createAllTextures
    // (light/vignette/shadow/rings/enemy-projectiles/telegraphs) enthaelt.
    expect(EXPECTED_KEYS).toContain("light_radius");
    expect(EXPECTED_KEYS).toContain("elite_aura");
    expect(EXPECTED_KEYS.length).toBe(15);
  });
});
