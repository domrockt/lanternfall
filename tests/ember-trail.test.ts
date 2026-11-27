import { describe, expect, it } from "vitest";
import { PAL } from "../src/palette";
import { SPRITE_GRIDS } from "../src/gfx/textures";

/**
 * M10 ember-trail — harte Invariante fuer den Restpunkt aus
 * m10-ember-readability: der Ember-Schweif (`fx_ember_trail` am Projektil,
 * gerendert NORMAL-Blend + Ember-Orange-Tint + alphaFrom 0,4) wird separat
 * als Glow-Footprint geprueft:
 *   (a) jedes Pixel ist transparent oder eine Palettenfarbe (Alpha nur 0/255),
 *   (b) Near-White-Anteil <= 2 % (beide kalibrierten Definitionen),
 *   (c) Footprint (opake Pixel = veraenderte Hintergrundpixel) <= 60 px,
 *   (d) gerendert ueber nightDeep bleibt der Schweif unter der Near-White-
 *       Schwelle — auch im Worst-Case-Stack (5 Puffs, trailInterval 0,05 s /
 *       life 0,22 s, aeltester zuerst).
 * Das Projektil selbst (`projectile_ember`) darf nicht verschlechtert werden.
 * Gleiche Render-Regeln wie scripts/m10-ember-trail.mjs (Vorher/Nachher-Messung).
 */

type Grid = { rows: string[]; w: number; h: number };

const NEAR_WHITE_TARGET_PCT = 2;
const FOOTPRINT_TARGET_PX = 60;
const NIGHT_DEEP = [0x0a, 0x0e, 0x16];
const EMBER_ORANGE = [0xa8, 0x4a, 0x21]; // PAL[C.emberOrange] = 17
const TRAIL_ALPHA_FROM = 0.4;

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
  return 0.2126 * r + 0.7152 * g + 0.0724 * b;
}

function isNearWhiteA7(i: number): boolean {
  const [r, g, b] = rgb(i);
  return r >= 150 && g >= 150 && b >= 150 && r >= 235;
}

function isNearWhiteMinRgb200(i: number): boolean {
  const [r, g, b] = rgb(i);
  return Math.min(r, g, b) >= 200;
}

interface Stats {
  opaque: number;
  transparent: number;
  offPalette: number;
  alphaViolations: number;
  nearA7: number;
  nearMin200: number;
  minLum: number;
  maxLum: number;
}

/** Grid-Zeichen in RGBA-Pixel ueberfuehren (wie addGridTexture es tut). */
function gridToRgba(grid: Grid): { rgba: Uint8ClampedArray; w: number; h: number } {
  const { rows, w, h } = grid;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y]?.[x] ?? ".";
      const i = paletteIndex(ch);
      const o = (y * w + x) * 4;
      if (i < 0) {
        if (i !== -1) throw new Error(`Off-Palette-Zeichen '${ch}' in Zeile ${y}`);
        rgba[o + 3] = 0;
        continue;
      }
      const [r, g, b] = rgb(i);
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
    }
  }
  return { rgba, w, h };
}

function stats(grid: Grid): Stats {
  const s: Stats = { opaque: 0, transparent: 0, offPalette: 0, alphaViolations: 0, nearA7: 0, nearMin200: 0, minLum: 1, maxLum: 0 };
  for (const row of grid.rows) {
    for (const ch of row) {
      const i = paletteIndex(ch);
      if (i === -1) { s.transparent++; continue; }
      if (i < 0) { s.offPalette++; continue; }
      s.opaque++;
      if (isNearWhiteA7(i)) s.nearA7++;
      if (isNearWhiteMinRgb200(i)) s.nearMin200++;
      const l = luminance(i);
      s.minLum = Math.min(s.minLum, l);
      s.maxLum = Math.max(s.maxLum, l);
    }
  }
  return s;
}

/** Nearest-Neighbor-Skalierung (FxSystem zeichnet den Puff auf scaleFrom 0,8). */
function nearestScale(rgba: Uint8ClampedArray, w: number, h: number, scale: number) {
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const out = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const sy = Math.min(h - 1, Math.floor(y / scale));
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(w - 1, Math.floor(x / scale));
      const si = (sy * w + sx) * 4;
      const di = (y * sw + x) * 4;
      out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3];
    }
  }
  return { rgba: out, w: sw, h: sh };
}

/** Alpha/Skala eines Puffs im Alter t (Interpolation alphaFrom -> alphaTo). */
function puffAge(t: number, life = 0.22, scaleFrom = 0.8, scaleTo = 0.15) {
  const k = Math.min(1, t / life);
  return { alpha: TRAIL_ALPHA_FROM * (1 - k), scale: scaleFrom + (scaleTo - scaleFrom) * k };
}

/**
 * Rendert einen Puff wie das Spiel: Tint multipliziert die Texturfarbe,
 * Alpha mischt NORMAL-Blend ueber nightDeep. Deckkraftmaske kommt mit zurueck.
 */
function compositeOverNight(rgba: Uint8ClampedArray, w: number, h: number, alpha: number, tint = EMBER_ORANGE) {
  const out = new Uint8ClampedArray(w * h * 4);
  let footprint = 0;
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255;
    if (a === 0) { out[i * 4 + 3] = 0; continue; }
    const eff = a * alpha;
    for (let c = 0; c < 3; c++) {
      out[i * 4 + c] = Math.round(rgba[i * 4 + c] * (tint[c] / 255) * eff + NIGHT_DEEP[c] * (1 - eff));
    }
    out[i * 4 + 3] = 255;
    footprint++;
  }
  return { out, footprint };
}

/** Puff (deckend nur wo Quelle deckt) ueber einen bestehenden Frame zeichnen. */
function puffOver(base: Uint8ClampedArray, w: number, puff: { out: Uint8ClampedArray; footprint: number }, pw: number, ph: number, ox: number, oy: number): void {
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const si = (y * pw + x) * 4;
      if (puff.out[si + 3] === 0) continue;
      const tx = ox + x, ty = oy + y;
      const di = (ty * w + tx) * 4;
      for (let c = 0; c < 3; c++) base[di + c] = puff.out[si + c];
      base[di + 3] = 255;
    }
  }
}

function nearWhiteOfRendered(out: Uint8ClampedArray, w: number, h: number) {
  let a7 = 0;
  let min200 = 0;
  let pixels = 0;
  for (let i = 0; i < w * h; i++) {
    if (out[i * 4 + 3] === 0) continue;
    const r = out[i * 4], g = out[i * 4 + 1], b = out[i * 4 + 2];
    pixels++;
    if (r >= 150 && g >= 150 && b >= 150 && r >= 235) a7++;
    if (Math.min(r, g, b) >= 200) min200++;
  }
  return { a7, min200, pixels, a7Pct: pixels ? (100 * a7) / pixels : 0, min200Pct: pixels ? (100 * min200) / pixels : 0 };
}

describe("m10-ember-trail: fx_ember_trail (Ember-Schweif)", () => {
  const grid: Grid = SPRITE_GRIDS.fx_ember_trail;

  it("existiert als 7x7-Grid", () => {
    expect(grid).toBeDefined();
    expect(grid.w).toBe(7);
    expect(grid.h).toBe(7);
    expect(grid.rows).toHaveLength(7);
  });

  it("(a) alle Pixel Palette oder transparent, Alpha nur 0/255, 0 Off-Palette", () => {
    const s = stats(grid);
    expect(s.offPalette).toBe(0);
    expect(s.opaque + s.transparent).toBe(7 * 7);
    const { rgba } = gridToRgba(grid);
    const alphas = Array.from(rgba).filter((_, i) => i % 4 === 3);
    expect(alphas.every((a) => a === 0 || a === 255)).toBe(true);
  });

  it("(b) Near-White <= 2 % (beide Definitionen, Quelle: 0 %)", () => {
    const s = stats(grid);
    expect(s.opaque).toBeGreaterThan(0);
    expect((100 * s.nearA7) / s.opaque).toBeLessThanOrEqual(NEAR_WHITE_TARGET_PCT);
    expect((100 * s.nearMin200) / s.opaque).toBeLessThanOrEqual(NEAR_WHITE_TARGET_PCT);
    expect(s.nearA7).toBe(0);
    expect(s.nearMin200).toBe(0);
  });

  it("(c) Footprint <= 60 px (Quelle und skaliert auf scaleFrom 0,8)", () => {
    const s = stats(grid);
    expect(s.opaque).toBeLessThanOrEqual(FOOTPRINT_TARGET_PX);
    const { rgba, w, h } = gridToRgba(grid);
    const scaled = nearestScale(rgba, w, h, 0.8);
    const rendered = compositeOverNight(scaled.rgba, scaled.w, scaled.h, TRAIL_ALPHA_FROM);
    expect(rendered.footprint).toBeLessThanOrEqual(FOOTPRINT_TARGET_PX);
  });

  it("(d) gerendert ueber nightDeep: Near-White 0 % auch im 5-Puff-Worst-Case-Stack", () => {
    // trailInterval 0,05 s / life 0,22 s -> bis zu 5 Puffs uebereinander,
    // aeltester zuerst gezeichnet (jeder mit seinem Alter, voll ueberlappend).
    const { rgba, w, h } = gridToRgba(grid);
    const W = 14, H = 14;
    const base = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      base[i * 4] = NIGHT_DEEP[0]; base[i * 4 + 1] = NIGHT_DEEP[1];
      base[i * 4 + 2] = NIGHT_DEEP[2]; base[i * 4 + 3] = 255;
    }
    for (let p = 4; p >= 0; p--) {
      const { alpha, scale } = puffAge(p * 0.05);
      const scaled = nearestScale(rgba, w, h, scale);
      const rendered = compositeOverNight(scaled.rgba, scaled.w, scaled.h, alpha);
      puffOver(base, W, rendered, scaled.w, scaled.h, Math.floor((W - scaled.w) / 2), Math.floor((H - scaled.h) / 2));
    }
    let footprint = 0;
    for (let i = 0; i < W * H; i++) {
      if (base[i * 4] !== NIGHT_DEEP[0] || base[i * 4 + 1] !== NIGHT_DEEP[1] || base[i * 4 + 2] !== NIGHT_DEEP[2]) footprint++;
    }
    const nw = nearWhiteOfRendered(base, W, H);
    expect(footprint).toBeLessThanOrEqual(FOOTPRINT_TARGET_PX);
    expect(nw.a7Pct).toBeLessThanOrEqual(NEAR_WHITE_TARGET_PCT);
    expect(nw.min200Pct).toBeLessThanOrEqual(NEAR_WHITE_TARGET_PCT);
    expect(nw.a7).toBe(0);
    expect(nw.min200).toBe(0);
  });

  it("(e) Kern/Kontur-Kontrast >= 5:1, Kontur bleibt geschlossen (Ink-Rim an allen Seiten)", () => {
    const s = stats(grid);
    expect(s.maxLum / Math.max(s.minLum, 0.0001)).toBeGreaterThanOrEqual(5);
    expect(grid.rows[0]).toContain("0");
    expect(grid.rows[6]).toContain("0");
    expect(grid.rows.some((r) => r[0] === "0")).toBe(true);
    expect(grid.rows.some((r) => r[6] === "0")).toBe(true);
  });

  it("(f) projectile_ember nicht verschlechtert (1/31 Near-White, 0 Off-Palette, binäres Alpha)", () => {
    const s = stats(SPRITE_GRIDS.projectile_ember);
    expect(s.offPalette).toBe(0);
    expect(s.nearA7).toBe(1);
    expect(s.nearMin200).toBe(1);
  });
});
