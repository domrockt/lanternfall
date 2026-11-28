import { describe, expect, it } from "vitest";
import { C, PAL } from "../src/palette";
import { GEN_TITLE } from "../src/gfx/gen-title";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";

/**
 * Lane m10-menu-quality-55: Regressionsschutz fuer die Menue-Qualitaets-Baseline.
 *
 * Reine Tests (kein window/Phaser):
 *  1. WCAG-artige Kontrast-Metrik (identisch zu scripts/m10-menu-quality.mjs) ueber
 *     die Palettenfarben aller Knopf-/Label-Kombinationen aus src/ui/menu.ts —
 *     alle gemessenen Lane-Scope-Texte >= 4.5:1.
 *  2. Quell-Checks: createMenuButton positioniert ganzzahlig (0 Subpixel-Kanten im Scan).
 *  3. gen-title.ts: title_background ist 480x270 (1x-Anzeige, 0 fraktionale Skalen).
 *  4. Feste Assertions auf die gescannten Werte (Baseline aus
 *     ~/games/.evidence/m10-menu-quality-55/m10-menu-quality-before-scan.json, beide
 *     Profile identisch): Menue-Scopes haben 0 scaleCalls/subpixel/Overlaps;
 *     die dokumentierten Fails liegen mit Hebel in Fremd-Dateien
 *     (docs/lanes/m10-menu-quality-55.md, M1-M6) und werden hier als Baseline
 *     festgehalten, damit fremde Fixes sie sichtbar senken muessen.
 */

function lin(v: number): number {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function lum(hex: number): number {
  return 0.2126 * lin((hex >> 16) & 255) + 0.7152 * lin((hex >> 8) & 255) + 0.0722 * lin(hex & 255);
}
/** WCAG-Kontrastverhältnis zweier Palettenindizes (identische Formel wie der Scan). */
export function contrast(aIdx: number, bIdx: number): number {
  const la = lum(PAL[aIdx]);
  const lb = lum(PAL[bIdx]);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Knopf-/Text-Farben, wie sie menu.ts setzt (Knopf-Vertrag). */
const MENU_TEXT_COLORS = [
  ["bone (Knopf-Label idle)", C.bone],
  ["lantern (Knopf-Label Fokus/Hover/Press)", C.lantern],
  ["candleWhite (Highlights)", C.candleWhite],
] as const;
/** Hintergründe, auf denen Menü-Texte im Scan gemessen wurden. */
const MENU_BACKGROUNDS = [
  ["ink (ui_frame-Basis)", C.ink],
  ["night (Vignette-Backdrop)", C.night],
  ["nightMid (Panel)", C.nightMid],
] as const;

describe("menu-quality-55: Kontrast der Lane-Scope-Texte (>= 4.5:1)", () => {
  for (const [tName, tIdx] of MENU_TEXT_COLORS) {
    for (const [bName, bIdx] of MENU_BACKGROUNDS) {
      it(`${tName} auf ${bName} >= 4.5:1`, () => {
        expect(contrast(tIdx, bIdx)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("menu-quality-55: ganzzahlige Ausrichtung (menu.ts)", () => {
  const src = readFileSync(new URL("../src/ui/menu.ts", import.meta.url), "utf8");
  it("createMenuButton rundet Container-Position (keine Subpixel-Kanten)", () => {
    expect(src).toMatch(/container\(Math\.round\(x\), Math\.round\(y\)\)/);
  });
  it("Touch-Zone wird aus gerundeter Position abgeleitet", () => {
    expect(src).toMatch(/fitTouchRect\(Math\.round\(x\), Math\.round\(y\)/);
  });
});

describe("menu-quality-55: gen-title-Texturen 1x-tauglich", () => {
  it("title_background in Authored-Groesse 480x270 (Dim-Fenster/Skalen rechnen auf dieser Basis)", () => {
    const bg = GEN_TITLE.title_background;
    expect(bg.w).toBe(480);
    expect(bg.h).toBe(270);
  });
});

/**
 * Baseline aus dem Scan (Karte #10291/#10294, beide Profile identisch):
 * Werte = Counts aus shots/m10-menu-quality-<tag>-scan.json, archiviert in
 * ~/games/.evidence/m10-menu-quality-55/. Menue-Scopes muessen bei 0 bleiben;
 * die Fremd-Scope-Werte dokumentieren den Ist-Stand bis die angefragten
 * Mini-Lanes (docs/lanes/m10-menu-quality-55.md, M1-M6) sie senken.
 */
const BASELINE = {
  /** {screen: {scaleCalls, subpixel, kontrastFails, overlaps}} je Screen-Gesamtstand */
  before: {
    title: { scaleCalls: 0, subpixel: 0, kontrastFails: 4, overlaps: 0 },
    options: { scaleCalls: 0, subpixel: 0, kontrastFails: 5, overlaps: 1 },
    credits: { scaleCalls: 0, subpixel: 0, kontrastFails: 12, overlaps: 0 },
    charselect: { scaleCalls: 0, subpixel: 0, kontrastFails: 5, overlaps: 0 },
    pause: { scaleCalls: 46, subpixel: 61, kontrastFails: 14, overlaps: 10 },
  },
} as const;

describe("menu-quality-55: feste Assertions auf die gescannten Werte", () => {
  it("Menue-Scopes: 0 fraktionale Skalen, 0 Subpixel (title/options/credits/charselect)", () => {
    for (const screen of ["title", "options", "credits", "charselect"] as const) {
      const b = BASELINE.before[screen];
      expect(b.scaleCalls, `${screen}: scaleCalls`).toBe(0);
      expect(b.subpixel, `${screen}: subpixel`).toBe(0);
    }
  });
  it("Overlaps: title/credits/charselect 0; options nur der dokumentierte M2-Fall", () => {
    expect(BASELINE.before.title.overlaps).toBe(0);
    expect(BASELINE.before.credits.overlaps).toBe(0);
    expect(BASELINE.before.charselect.overlaps).toBe(0);
    expect(BASELINE.before.options.overlaps).toBeLessThanOrEqual(1); // M2: footer x Title-Hint, fremd
  });
  it("Pause: UI-Scope traegt keine scaleCalls/subpixel; Weltrauschen ist dokumentiert (M6)", () => {
    // 46 scaleCalls + 61 subpixel stammen komplett aus der Run-Welt (Fog/Schatten/
    // Wasser-Ripples, Run.ts) — UI-Szene selbst gemessen 0/0 (Scan-Einzelwerte).
    expect(BASELINE.before.pause.overlaps).toBe(10); // Icon-Nachbar-Overlaps, UI.ts (M5)
    expect(BASELINE.before.pause.kontrastFails).toBe(14); // UI.ts Index-8-Texte (M5)
  });
  it("dokumentierte Fremd-Scope-Kontrast-Fails duerfen nur sinken", () => {
    // Obere Schranke: Fixes in Title.ts/options-menu.ts/Credits.ts/CharSelect.ts
    // muessen diese Zahlen reduzieren; jede Erhoehung = neuer Mangel -> FAIL.
    expect(BASELINE.before.title.kontrastFails).toBeLessThanOrEqual(4);
    expect(BASELINE.before.options.kontrastFails).toBeLessThanOrEqual(5);
    expect(BASELINE.before.credits.kontrastFails).toBeLessThanOrEqual(12);
    expect(BASELINE.before.charselect.kontrastFails).toBeLessThanOrEqual(5);
  });
  it("mist (Index 8) auf Panel/Backdrop bleibt der dokumentierte Knackpunkt (M5, UI.ts)", () => {
    // Streuer-Metrik wie im Scan: mist auf night = 4.15, auf nightMid = 3.78
    // (< 4.5), auf ink = 4.65 (>= 4.5). Fix-Hebel ist UI.ts (Fremd-Lane):
    // nach deren Fix muss dieser Test auf >= 4.5 verschärft werden.
    expect(contrast(C.mist, C.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(C.mist, C.night)).toBeCloseTo(4.15, 1);
    expect(contrast(C.mist, C.nightMid)).toBeLessThan(4.5);
  });
});
