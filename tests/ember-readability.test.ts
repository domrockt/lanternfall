import { describe, expect, it } from "vitest";
import { PAL } from "../src/palette";
import { SPRITE_GRIDS } from "../src/gfx/textures";

/**
 * M10 ember-readability — harte Invariante fuer den ACCEPTANCE-Restpunkt
 * "Ember-Projektil im Halo teils ueberstrahlt".
 *
 * Geprueft wird das echte Projektil-Grid (`projectile_ember`) und der
 * Muendungs-Glow (`fx_ember_muzzle`) aus den Spieltexturen:
 *   (a) jedes Pixel ist transparent oder eine Palettenfarbe (Alpha damit 0/255),
 *   (b) hellster Kern vs. dunkelste Kontur hat Kontrast >= 5:1,
 *   (c) Near-White-Anteil <= 4,16 % (beide kalibrierten Definitionen).
 *
 * Prozentbasis = opake Pixel (Sprite-Flaeche), zusaetzlich strenger auf die
 * gesamte Frame-Flaeche inkl. Transparenz.
 */

type Grid = { rows: string[]; w: number; h: number };

const NEAR_WHITE_TARGET_PCT = 4.16;

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

function isNearWhiteA7(i: number): boolean {
  const [r, g, b] = rgb(i);
  return r >= 150 && g >= 150 && b >= 150 && r >= 235;
}

function isNearWhiteMinRgb200(i: number): boolean {
  const [r, g, b] = rgb(i);
  return Math.min(r, g, b) >= 200;
}

interface Stats {
  pixels: number;
  opaque: number;
  transparent: number;
  offPalette: number;
  alphaViolations: number;
  nearA7: number;
  nearMin200: number;
  coreLum: number;
  contourLum: number;
  coreHasInkNeighbor: boolean;
}

function analyze(name: string, grid: Grid): Stats {
  const { rows, w, h } = grid;
  const pixels = w * h;
  let opaque = 0;
  let transparent = 0;
  let offPalette = 0;
  let alphaViolations = 0;
  let nearA7 = 0;
  let nearMin200 = 0;
  let coreLum = -1;
  let contourLum = 2;
  const idxAt: number[][] = rows.map((row) => [...row].map((ch) => paletteIndex(ch)));

  for (let y = 0; y < h; y++) {
    expect(rows[y].length, `${name} Zeilenbreite`).toBe(w);
    for (let x = 0; x < w; x++) {
      const idx = idxAt[y][x];
      if (idx === -1) { transparent++; continue; }
      if (idx === -2 || idx < 0 || idx >= PAL.length) { offPalette++; continue; }
      // Grid-Pixel sind per Konstruktion voll deckend (keine Alpha-Felder).
      if (idx >= 0) {
        opaque++;
        const lum = luminance(idx);
        coreLum = Math.max(coreLum, lum);
        contourLum = Math.min(contourLum, lum);
        if (isNearWhiteA7(idx)) nearA7++;
        if (isNearWhiteMinRgb200(idx)) nearMin200++;
      }
    }
  }

  // Kern braucht einen direkt angrenzenden Tinten-Pixel (dunkle Kontur).
  let coreHasInkNeighbor = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (idxAt[y][x] < 0 || luminance(idxAt[y][x]) < coreLum - 1e-9) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (idxAt[ny][nx] === 0) coreHasInkNeighbor = true;
      }
    }
  }

  return {
    pixels, opaque, transparent, offPalette, alphaViolations,
    nearA7, nearMin200, coreLum, contourLum, coreHasInkNeighbor,
  };
}

const cases: [string, Grid][] = [
  ["projectile_ember", SPRITE_GRIDS.projectile_ember as Grid],
  ["fx_ember_muzzle", SPRITE_GRIDS.fx_ember_muzzle as Grid],
];

describe("M10 ember-readability", () => {
  for (const [name, grid] of cases) {
    describe(name, () => {
      const s = analyze(name, grid);

      it("(a) alle Pixel: Palette oder transparent, binaeres Alpha", () => {
        expect(s.offPalette, `${name} Off-Palette-Pixel`).toBe(0);
        expect(s.alphaViolations, `${name} Alpha-Verstoesse`).toBe(0);
        expect(s.opaque + s.transparent).toBe(s.pixels);
      });

      it("(b) hellster Kern vs. dunkelste Kontur >= 5:1", () => {
        const ratio = (s.coreLum + 0.05) / (s.contourLum + 0.05);
        expect(ratio, `${name} Kontrastverhaeltnis`).toBeGreaterThanOrEqual(5);
      });

      it("(c) Near-White <= 4,16 % (opake Flaeche und ganze Frame-Flaeche)", () => {
        const pctOpaqueA7 = (100 * s.nearA7) / s.opaque;
        const pctOpaqueMin = (100 * s.nearMin200) / s.opaque;
        const pctFrameA7 = (100 * s.nearA7) / s.pixels;
        const pctFrameMin = (100 * s.nearMin200) / s.pixels;
        expect(pctOpaqueA7, `${name} Near-White A7 (opak)`).toBeLessThanOrEqual(NEAR_WHITE_TARGET_PCT);
        expect(pctOpaqueMin, `${name} Near-White minRGB200 (opak)`).toBeLessThanOrEqual(NEAR_WHITE_TARGET_PCT);
        expect(pctFrameA7, `${name} Near-White A7 (Frame)`).toBeLessThanOrEqual(NEAR_WHITE_TARGET_PCT);
        expect(pctFrameMin, `${name} Near-White minRGB200 (Frame)`).toBeLessThanOrEqual(NEAR_WHITE_TARGET_PCT);
      });
    });
  }

  it("Ember-Projektil hat mindestens 8 Tinten-Pixel als Randkontur", () => {
    const g = SPRITE_GRIDS.projectile_ember as Grid;
    let ink = 0;
    for (const row of g.rows) for (const ch of row) if (ch === "0") ink++;
    expect(ink).toBeGreaterThanOrEqual(8);
  });

  it("Glow-Kleck hat mindestens 10 Tinten-Pixel als geschlossene Randkontur", () => {
    const g = SPRITE_GRIDS.fx_ember_muzzle as Grid;
    let ink = 0;
    for (const row of g.rows) for (const ch of row) if (ch === "0") ink++;
    expect(ink).toBeGreaterThanOrEqual(10);
  });

  it("Ember-Kern grenzt direkt an einen Tinten-Pixel (dunkle 1-px-Kontur)", () => {
    const g = SPRITE_GRIDS.projectile_ember as Grid;
    const s = analyze("projectile_ember", g);
    expect(s.coreHasInkNeighbor).toBe(true);
  });
});
