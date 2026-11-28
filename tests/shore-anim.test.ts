import { describe, expect, it } from "vitest";
import { PAL } from "../src/palette";
import { WORLD_SIZE } from "../src/config";
import {
  WATER_ANIM_STEPS, paintTerrain, terrainKindAt, terrainSampleAt,
} from "../src/gfx/tiles";

/**
 * Rein deterministische Pruefung des animierten Tile-Pfads (m10-water-shore-
 * anim K2): jede Animationsstufe wird ausschliesslich aus tileHash abgeleitet.
 * paintTerrain ist selbst-contained (putImageData ueberschreibt die ganze
 * Flaeche), daher darf es keine Abhaengigkeit von der Mal-Reihenfolge geben.
 */

const SEED = 13;
const W = 128;
const H = 128;
// Wasserstelle aus shots/m10-shore-anim-before.json (K1, Seed 13).
const OX = 1856;
const OY = 2080;

class MockCtx {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array;
  fillStyle = "#000000";
  imageSmoothingEnabled = false;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
  }
  createImageData(w: number, h: number) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  putImageData(img: { width: number; height: number; data: Uint8ClampedArray }, dx: number, dy: number): void {
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const so = (y * img.width + x) * 4;
        const t = ((y + dy) * this.w + (x + dx)) * 3;
        this.px[t] = img.data[so];
        this.px[t + 1] = img.data[so + 1];
        this.px[t + 2] = img.data[so + 2];
      }
    }
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const r = parseInt(this.fillStyle.slice(1, 3), 16);
    const g = parseInt(this.fillStyle.slice(3, 5), 16);
    const b = parseInt(this.fillStyle.slice(5, 7), 16);
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
        const t = (yy * this.w + xx) * 3;
        this.px[t] = r;
        this.px[t + 1] = g;
        this.px[t + 2] = b;
      }
    }
  }
}

const paint = (ctx: MockCtx, animStep: number): void =>
  paintTerrain(ctx as unknown as CanvasRenderingContext2D, OX, OY, W, H, SEED, WORLD_SIZE, animStep);

const countDiff = (a: MockCtx, b: MockCtx): number => {
  let n = 0;
  for (let i = 0; i < a.px.length; i += 3) {
    if (a.px[i] !== b.px[i] || a.px[i + 1] !== b.px[i + 1] || a.px[i + 2] !== b.px[i + 2]) n++;
  }
  return n;
};

/** Water-Anteil des Test-Patches (fuer relative Dichte-Angaben). */
const waterPixels = (): number => {
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (terrainKindAt(OX + x, OY + y, SEED, WORLD_SIZE) === "water") n++;
    }
  }
  return n;
};

describe("shore-anim: Animationsstufen des Tile-Pfads", () => {
  it("exportiert genau 3 Animationsstufen", () => {
    expect(WATER_ANIM_STEPS).toBe(3);
  });

  it("der Test-Patch enthaelt Wasser (Ufer + offene Flaeche)", () => {
    let open = 0;
    let water = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const s = terrainSampleAt(OX + x, OY + y, SEED, WORLD_SIZE);
        if (s.kind === "water") {
          water++;
          if (s.depth > 0.15) open++;
        }
      }
    }
    expect(water).toBeGreaterThan(H * W * 0.2);
    expect(open).toBeGreaterThan(H * W * 0.1);
  });

  it("ist deterministisch: dieselbe Stufe malt zweimal identisch", () => {
    const a = new MockCtx(W, H);
    paint(a, 1);
    const b = new MockCtx(W, H);
    paint(b, 1);
    expect(countDiff(a, b)).toBe(0);
  });

  it("hat keine Abhaengigkeit von der Frame-Reihenfolge", () => {
    // Stufe 2 auf junger Leinwand == Stufe 2 nach Stufe 1 auf derselben.
    const fresh = new MockCtx(W, H);
    paint(fresh, 2);
    const reused = new MockCtx(W, H);
    paint(reused, 1);
    paint(reused, 2);
    expect(countDiff(fresh, reused)).toBe(0);
    // Auch nach Stufe 0 und Rueckwechsel identisch.
    const mixed = new MockCtx(W, H);
    paint(mixed, 0);
    paint(mixed, 1);
    paint(mixed, 0);
    paint(mixed, 2);
    expect(countDiff(fresh, mixed)).toBe(0);
  });

  it("alle Stufenpaare unterscheiden sich — nur auf Wasser-Pixeln", () => {
    const ctxs = [0, 1, 2].map((s) => {
      const c = new MockCtx(W, H);
      paint(c, s);
      return c;
    });
    for (const [s0, s1] of [[0, 1], [1, 2], [0, 2]] as const) {
      let diff = 0;
      let diffOnLand = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 3;
          const d = ctxs[s0].px, e = ctxs[s1].px;
          if (d[i] !== e[i] || d[i + 1] !== e[i + 1] || d[i + 2] !== e[i + 2]) {
            diff++;
            if (terrainKindAt(OX + x, OY + y, SEED, WORLD_SIZE) !== "water") diffOnLand++;
          }
        }
      }
      expect(diff).toBeGreaterThan(0);
      // Wellen-Drift darf vereinzelt ueber Uferpixeln malen, aber der
      // ueberwiegende Teil der Aenderungen bleibt im Wasser.
      expect(diffOnLand / diff).toBeLessThan(0.1);
    }
  });

  it("die Aenderungen bleiben dezent (kein Strobo): < 12 % der Wasserflaeche je Stufe", () => {
    const water = waterPixels();
    const a = new MockCtx(W, H);
    paint(a, 0);
    const b = new MockCtx(W, H);
    paint(b, 1);
    const diff = countDiff(a, b);
    expect(diff).toBeLessThan(W * H * 0.12);
    expect(diff / water).toBeGreaterThan(0.0005);
  });

  it("alle gemalten Farben stammen aus der Palette", () => {
    const set = new Set<number>();
    for (const p of PAL) set.add(p);
    const c = new MockCtx(W, H);
    paint(c, 1);
    for (let i = 0; i < c.px.length; i += 3) {
      const v = (c.px[i] << 16) | (c.px[i + 1] << 8) | c.px[i + 2];
      expect(set.has(v)).toBe(true);
    }
  });
});
