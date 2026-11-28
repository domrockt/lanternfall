import { describe, expect, it } from "vitest";
import { PAL } from "../src/palette";
import { charIndex } from "../src/gfx/textures";
import { GEN_ICONS } from "../src/gfx/gen-icons";

/**
 * m10-icon-contrast #3: Regressionsschutz fuer UI-Icon-Kontrast.
 *
 * Reine Daten-Tests gegen die GEN_ICONS-Raster (kein window/Phaser):
 *  - Koerperkontrast >= 3:1 gegen HUD-Hintergrund #090c10 und Build-Panel #101724
 *    (WCAG, Median-Luminanz des Koerpers ohne die 1-px-ink-Kontur, Index 0)
 *  - 0 Off-Palette-Zeichen (nur Palettenindex 0-31 oder '.')
 *  - binaeres Alpha: nur '.' ist transparent, alles andere opak
 *
 * Befund-Kontext: docs/lanes/m10-icon-contrast.md — Vor-Lane m10-menu-art-crisp
 * hat boots/tome/heart/charm (F3) in gen-icons.ts auf 4.5-10.9:1 gehoben
 * (Commit 00c500e, Merge 942af93); dieser Test verankert das dauerhaft.
 * Mess-Skript: scripts/m10-icon-contrast.mjs (identische Methode).
 */

const HUD_BG = 0x090c10; // HUD-Hintergrund (Befund Vor-Lane m10-menu-art-crisp)
const PANEL_BG = 0x101724; // Build-Panel (night)
const MIN_CONTRAST = 3;

const ICON_KEYS = Object.keys(GEN_ICONS).filter(
  (k) => k.startsWith("weapon_") || k.startsWith("passive_"),
);
const EXPECTED_KEYS = [
  "weapon_ember", "weapon_flail", "weapon_frost", "weapon_lantern", "weapon_storm", "weapon_thorn",
  "passive_boots", "passive_tome", "passive_heart", "passive_charm", "passive_whetstone", "passive_hourglass",
].sort();

function srgbToLin(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(rgb: number): number {
  return 0.2126 * srgbToLin((rgb >> 16) & 255) + 0.7152 * srgbToLin((rgb >> 8) & 255) + 0.0722 * srgbToLin(rgb & 255);
}

function contrast(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** Koerper-Luminanzen: alle opaken Pixel ausser der 1-px-ink-Kontur (Index 0). */
function bodyLuminances(key: string): number[] {
  const rows = GEN_ICONS[key].frames[0];
  const lums: number[] = [];
  for (const row of rows) {
    for (const ch of row) {
      if (ch === ".") continue;
      const idx = charIndex(ch);
      if (idx === 0) continue;
      lums.push(luminance(PAL[idx]));
    }
  }
  return lums;
}

describe("icon-contrast: Kontrast >= 3:1 auf HUD- und Panel-Hintergrund", () => {
  it("genau die 12 Waffen-/Passive-Icon-Klassen", () => {
    expect(ICON_KEYS.sort()).toEqual(EXPECTED_KEYS);
  });

  for (const key of EXPECTED_KEYS) {
    it(`${key}: Koerperkontrast >= ${MIN_CONTRAST}:1 auf beiden Hintergruenden`, () => {
      const lums = bodyLuminances(key);
      expect(lums.length, `${key}: Koerper hat Pixel`).toBeGreaterThan(0);
      const bodyMedian = median(lums);
      expect(contrast(bodyMedian, luminance(HUD_BG)), `${key} HUD #090c10`)
        .toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrast(bodyMedian, luminance(PANEL_BG)), `${key} Panel #101724`)
        .toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
  }

  // Die 4 vormals betroffenen Icons einzeln verankert (F3 der Vor-Lane).
  for (const key of ["passive_boots", "passive_tome", "passive_heart", "passive_charm"]) {
    it(`${key} (F3): Kontrast >= 3:1 (vorher 1.12-2.16)`, () => {
      const bodyMedian = median(bodyLuminances(key));
      expect(contrast(bodyMedian, luminance(HUD_BG))).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrast(bodyMedian, luminance(PANEL_BG))).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
  }
});

describe("icon-contrast: Palette + binaeres Alpha", () => {
  it("0 Off-Palette-Zeichen in den 12 Icons", () => {
    for (const key of EXPECTED_KEYS) {
      for (const row of GEN_ICONS[key].frames[0]) {
        for (const ch of row) {
          if (ch === ".") continue;
          const idx = charIndex(ch);
          expect(idx, `${key}: Zeichen '${ch}'`).toBeGreaterThanOrEqual(0);
          expect(idx, `${key}: Zeichen '${ch}'`).toBeLessThanOrEqual(31);
        }
      }
    }
  });

  it("binaeres Alpha: nur '.' ist transparent (Raster per Konstruktion opak)", () => {
    for (const key of EXPECTED_KEYS) {
      const rows = GEN_ICONS[key].frames[0];
      expect(rows.length).toBe(16);
      for (const row of rows) {
        expect(row.length).toBe(16);
        for (const ch of row) {
          // Jedes Zeichen ist entweder transparent ('.') oder ein voll opaker Index.
          // Kein drittes Zeichen -> kein Partial-Alpha beim Rendern (icons.ts).
          expect(ch === "." || charIndex(ch) >= 0, `${key}: '${ch}'`).toBe(true);
        }
      }
    }
  });
});
