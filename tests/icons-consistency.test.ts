import { describe, expect, it } from "vitest";
import { charIndex } from "../src/gfx/textures";
import { GEN_ICONS } from "../src/gfx/gen-icons";
import { PAL } from "../src/palette";

/**
 * m10-icons-consistency (Board #320, Lane m10-icons-consistency):
 * Einheitliche Kanten-/Lesbarkeitsregeln fuer alle 18 UI-Icons.
 *
 * Schwellen stammen aus der Vorher-Messung (shots/m10-icons-consistency-before.json,
 * Skript scripts/m10-icons-consistency.mjs) und der art-director-Muss-Liste
 * (M1-M6, docs/lanes/m10-icons-consistency.md):
 *  - 0 Off-Palette-Pixel, binaeres Alpha ('.' = transparent, sonst opak)
 *  - geschlossene 1-px-Ink-Kontur (kein loses Konturpixel, 8-Nachbarn)
 *  - KEIN "vereistes" Lichtband: rimShare <= 0.9 (vorher 1.0 bei
 *    evo_thorn_storm/passive_whetstone) — Lichtton nach SHADE-Semantik
 *    (scripts/art/lib.py RAMPS: Licht = li-Ton der Materialrampe)
 *  - zusammenhaengende Silhouette: groesste Komponente >= 60% des Koerpers
 *    (vorher passive_hourglass 39%, Muss M3/M4)
 *  - 16px-Lesbarkeit: WCAG-Kontrast Koerper-Median >= 3:1 gegen HUD #090c10
 *    und Panel #101724 fuer ALLE 18 (vorher evo_thorn_storm 2.32 — die
 *    Kontrast-Lane m10-icon-contrast hatte nur weapon/passive geprueft)
 *  - Evolutionen praechtiger als Basis-Waffen: je evo_* >= 6 Töne und >= 4
 *    Akzentpixel (Glow/Gold 13/20/21/22); Familien-Median evo >= weapon
 *  - kein Icon ohne jeden Lichtton bei Vollschatten (Muss M4, weapon_flail)
 */

type Grid = readonly string[];

const LIGHT_TONES = new Set([3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 19, 20, 21, 22, 25, 26, 27, 30, 31]);
const SHADOW_TONES = new Set([1, 2, 3, 4, 5, 6, 8, 9, 10, 14, 15, 17, 23, 24, 28]);
const ACCENT_TONES = new Set([13, 20, 21, 22]); // Glow/Gold
const BGS = { hud: 0x090c10, panel: 0x101724 };

function gridOf(key: string): Grid {
  const def = GEN_ICONS[key];
  expect(def, `${key} existiert in GEN_ICONS`).toBeDefined();
  expect(def.h, `${key}: 16 Zeilen`).toBe(16);
  return def.frames[0];
}

function idxAt(rows: Grid, x: number, y: number): number | null {
  if (x < 0 || y < 0 || x >= 16 || y >= 16) return null;
  const ch = rows[y][x];
  return ch === "." ? null : charIndex(ch);
}

const isBody = (i: number | null) => i !== null && i > 0;

// --- WCAG (wie scripts/m10-icons-consistency.mjs / m10-icon-contrast) ---
function srgbToLin(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(rgb: number): number {
  return 0.2126 * srgbToLin((rgb >> 16) & 255) + 0.7152 * srgbToLin((rgb >> 8) & 255) + 0.0722 * srgbToLin(rgb & 255);
}
function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

interface Metrics {
  offPalette: number;
  softAlpha: number;
  orphanContour: number;
  bodyPixels: number;
  distinctColors: number;
  accentPixels: number;
  lightPixels: number;
  shadowPixels: number;
  rimLight: number;
  largestComponentShare: number;
  worstContrast: number;
}

function metrics(key: string): Metrics {
  const rows = gridOf(key);
  let offPalette = 0, softAlpha = 0, contour = 0, orphanContour = 0;
  let bodyPixels = 0, accentPixels = 0, lightPixels = 0, shadowPixels = 0, rimLight = 0;
  const colors = new Set<number>();
  const bodyLums: number[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const ch = rows[y][x];
      if (ch === ".") continue;
      const idx = charIndex(ch);
      if (idx < 0 || idx >= PAL.length) { offPalette++; continue; }
      if (idx === 0) {
        contour++;
        // 8-Nachbarn: outline() arbeitet mit Diagonalen, ein Konturpixel ohne
        // Body-Nachbar in 8-Nachbarschaft ist lose/gerissen
        if (![[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
            .some(([dx, dy]) => isBody(idxAt(rows, x + dx, y + dy)))) orphanContour++;
        continue;
      }
      bodyPixels++;
      colors.add(idx);
      if (ACCENT_TONES.has(idx)) accentPixels++;
      if (LIGHT_TONES.has(idx)) {
        lightPixels++;
        const up = idxAt(rows, x, y - 1), lf = idxAt(rows, x - 1, y);
        if (up === 0 || up === null || lf === 0 || lf === null) rimLight++;
      } else if (SHADOW_TONES.has(idx)) shadowPixels++;
      bodyLums.push(luminance(PAL[idx]));
    }
  }
  // groesste 4-connectierte Komponente der Koerperpixel
  const comp = Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => (isBody(idxAt(rows, x, y)) ? 0 : -1) as number));
  let largest = 0, n = 0;
  const stack: Array<[number, number]> = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (comp[y][x] !== 0) continue;
      n++;
      let size = 0;
      stack.push([x, y]);
      comp[y][x] = n;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        size++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (isBody(idxAt(rows, nx, ny)) && comp[ny]?.[nx] === 0) {
            comp[ny][nx] = n;
            stack.push([nx, ny]);
          }
        }
      }
      largest = Math.max(largest, size);
    }
  }
  const bodyMedian = median(bodyLums);
  const worst = Math.min(...Object.values(BGS).map((bg) => contrastRatio(bodyMedian, luminance(bg))));
  return {
    offPalette, softAlpha, orphanContour, bodyPixels,
    distinctColors: colors.size, accentPixels, lightPixels, shadowPixels, rimLight,
    largestComponentShare: bodyPixels ? largest / bodyPixels : 0,
    worstContrast: worst,
  };
}

const KEYS = Object.keys(GEN_ICONS).sort();

describe("icons-consistency: Raster, Palette, Kontur (alle 18)", () => {
  it("genau 18 Icons (6 Waffen + 6 Powerups + 6 Evolutionen)", () => {
    expect(KEYS.length).toBe(18);
    expect(KEYS.filter((k) => k.startsWith("weapon_")).length).toBe(6);
    expect(KEYS.filter((k) => k.startsWith("passive_")).length).toBe(6);
    expect(KEYS.filter((k) => k.startsWith("evo_")).length).toBe(6);
  });

  for (const key of KEYS) {
    it(`${key}: 16x16, 0 Off-Palette, binaeres Alpha, geschlossene Kontur`, () => {
      const rows = gridOf(key);
      for (const row of rows) expect(row.length, `${key}: Zeilenlaenge`).toBe(16);
      const m = metrics(key);
      expect(m.offPalette, `${key}: Off-Palette-Pixel`).toBe(0);
      expect(m.softAlpha, `${key}: weiches Alpha (nur '.' ist transparent)`).toBe(0);
      expect(m.orphanContour, `${key}: lose Konturpixel`).toBe(0);
      expect(rows.some((r) => r.includes("0")), `${key}: Ink-Kontur fehlt`).toBe(true);
    });
  }
});

describe("icons-consistency: Kantenregeln — kein 'vereistes' Lichtband", () => {
  for (const key of KEYS) {
    it(`${key}: rimShare <= 0.9 (Lichtkante unterbrochen, nicht durchgehend)`, () => {
      const m = metrics(key);
      const rimShare = m.lightPixels ? m.rimLight / m.lightPixels : 0;
      expect(rimShare, `${key}: rimShare ${rimShare.toFixed(3)} (light=${m.lightPixels}, rim=${m.rimLight})`).toBeLessThanOrEqual(0.9);
    });
  }

  it("kein Icon ohne jeden Lichtton bei Vollschatten (Muss M4, weapon_flail)", () => {
    for (const key of KEYS) {
      const m = metrics(key);
      const lightShare = m.bodyPixels ? m.lightPixels / m.bodyPixels : 0;
      const shadowShare = m.bodyPixels ? m.shadowPixels / m.bodyPixels : 0;
      expect(
        lightShare > 0 || shadowShare < 0.9,
        `${key}: lightShare ${lightShare.toFixed(3)}, shadowShare ${shadowShare.toFixed(3)}`,
      ).toBe(true);
    }
  });
});

describe("icons-consistency: 16px-Lesbarkeit", () => {
  for (const key of KEYS) {
    it(`${key}: Silhouette zusammenhaengend (groesste Komponente >= 60%)`, () => {
      const m = metrics(key);
      expect(m.largestComponentShare, `${key}: ${m.largestComponentShare.toFixed(3)}`).toBeGreaterThanOrEqual(0.6);
    });

    it(`${key}: Koerper-Kontrast >= 3:1 gegen HUD und Panel`, () => {
      const m = metrics(key);
      expect(m.worstContrast, `${key}: worstContrast ${m.worstContrast.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("icons-consistency: Evolutionen praechtiger als Basis-Waffen", () => {
  const evoKeys = KEYS.filter((k) => k.startsWith("evo_"));
  const weaponKeys = KEYS.filter((k) => k.startsWith("weapon_"));

  for (const key of evoKeys) {
    it(`${key}: >= 6 Töne und >= 4 Glow/Gold-Akzentpixel`, () => {
      const m = metrics(key);
      expect(m.distinctColors, `${key}: nur ${m.distinctColors} Töne`).toBeGreaterThanOrEqual(6);
      expect(m.accentPixels, `${key}: nur ${m.accentPixels} Akzentpixel`).toBeGreaterThanOrEqual(4);
    });
  }

  it("Familien-Median: Evolutionen >= Basis-Waffen (Töne)", () => {
    const evoMed = median(evoKeys.map((k) => metrics(k).distinctColors));
    const weaponMed = median(weaponKeys.map((k) => metrics(k).distinctColors));
    expect(evoMed).toBeGreaterThanOrEqual(weaponMed);
  });
});
