import { describe, expect, it } from "vitest";
import {
  MAX_WIDTH, MIN_WIDTH, computeView, isIntegerPixelPerfect,
} from "../src/logic/view";

/**
 * M10-view-4k: Guard fuer die 4K/Ultrawide-Profile aus der Lane m10-view-4k
 * (Pixel-Scan /home/ai/games/.evidence/m10-view-4k/m10-view-4k-{before,after}.json,
 * Renderer Mesa Intel RPL-S). Gleiche Invarianten wie der Pixel-Scan, hier auf
 * der reinen View-Rechnung (computeView):
 *  - ganzzahliger Render-Scale (n = deviceHeight/360),
 *  - kein Overflow/Crop (Canvas-Geraetepixel width*n <= deviceWidth),
 *  - kein Balken (width*n == deviceWidth) bzw. das dokumentierte Restspalten-
 *    Defizit < n fuer nicht teilbare Breiten (2560x1080@1: Defizit 1).
 * Die 7 Bestandsprofile aus m10-view-fill-refit bleiben unverändert (Tabelle
 * docs/lanes/m10-view-fill-refit.md).
 */

/** Neue Profile der Lane (Format, dpr) -> erwartet intern/Scale/Defizit. */
const NEW_PROFILES = [
  { cssW: 3840, cssH: 2160, dpr: 1, width: 640, scale: 6, deficit: 0 },
  { cssW: 3840, cssH: 2160, dpr: 2, width: 640, scale: 12, deficit: 0 },
  { cssW: 3840, cssH: 2160, dpr: 3, width: 640, scale: 18, deficit: 0 },
  // Nicht teilbar: 2560 = 3*853 + 1 -> 1 Geraetepx Restspalte, dokumentiert
  // (docs/lanes/m10-view-4k.md, K2): ganzzahliger Scale und "0 Balken UND
  // 0 Crop" schliessen sich hier mathematisch aus; computeView waehlt Defizit
  // statt Crop.
  { cssW: 2560, cssH: 1080, dpr: 1, width: 853, scale: 3, deficit: 1 },
  { cssW: 3440, cssH: 1440, dpr: 1, width: 860, scale: 4, deficit: 0 },
] as const;

/** Bestandsprofile aus m10-view-fill-refit (müssen unveraendert bleiben). */
const REFIT_PROFILES = [
  { cssW: 640, cssH: 360, dpr: 1, setting: 0, width: 640, scale: 1 },
  { cssW: 960, cssH: 540, dpr: 1, setting: 0, width: 640, scale: 1.5 },
  { cssW: 1280, cssH: 720, dpr: 1, setting: 0, width: 640, scale: 2 },
  { cssW: 1920, cssH: 1080, dpr: 1, setting: 0, width: 640, scale: 3 },
  { cssW: 2560, cssH: 1440, dpr: 1, setting: 0, width: 640, scale: 4 },
  { cssW: 3840, cssH: 2160, dpr: 1, setting: 0, width: 640, scale: 6 },
  { cssW: 780, cssH: 360, dpr: 3, setting: 3, width: 780, scale: 3 },
] as const;

describe("M10-view-4k: 4K/Ultrawide-Profiles ganzzahlig, 0 Crop, Balken-Schranke", () => {
  for (const p of NEW_PROFILES) {
    const name = `${p.cssW}x${p.cssH}@${p.dpr}`;
    it(`${name}: intern ${p.width}x360, Scale ${p.scale}, ganzzahlig`, () => {
      const v = computeView({ width: p.cssW, height: p.cssH, dpr: p.dpr });
      expect(v.width).toBe(p.width);
      expect(v.height).toBe(360);
      expect(v.scale).toBe(p.scale);
      expect(Number.isInteger(v.scale)).toBe(true);
    });

    it(`${name}: kein Overflow/Crop, Defizit ${p.deficit} Geraetepx (< n)`, () => {
      const v = computeView({ width: p.cssW, height: p.cssH, dpr: p.dpr });
      const deviceW = Math.round(p.cssW * p.dpr);
      const deviceH = Math.round(p.cssH * p.dpr);
      const canvasW = v.width * v.scale;
      const canvasH = v.height * v.scale;
      expect(canvasW).toBeLessThanOrEqual(deviceW); // kein Crop/Overflow
      expect(canvasH).toBe(deviceH); // vertikal exakt (0 Balken oben/unten)
      expect(deviceW - canvasW).toBe(p.deficit); // Balken-Schranke
      expect(deviceW - canvasW).toBeLessThan(v.scale);
      expect(v.width).toBeGreaterThanOrEqual(MIN_WIDTH);
      expect(v.width).toBeLessThanOrEqual(MAX_WIDTH);
    });

    it(`${name}: exakte, gleichmaessige Abbildung`, () => {
      const v = computeView({ width: p.cssW, height: p.cssH, dpr: p.dpr });
      expect(isIntegerPixelPerfect(v)).toBe(true);
    });
  }

  it("2560x1080@1: Restspalte ist unvermeidbar (2560 % 3 != 0) und wird dokumentiert", () => {
    // Beweis der Einschraenkung: keine ganzzahlige Breite erfuellt
    // width*3 == 2560; floor waehlt Defizit 1, ceil/rund wuerde Crop 2 erzeugen.
    expect(2560 % 3).not.toBe(0);
    expect(Math.floor(2560 / 3) * 3).toBe(2559);
    expect(Math.ceil(2560 / 3) * 3).toBe(2562);
    const v = computeView({ width: 2560, height: 1080, dpr: 1 });
    expect(v.width * v.scale).toBe(2559); // Defizit statt Crop
  });
});

describe("M10-view-4k: Bestandsprofile aus view-fill-refit unveraendert", () => {
  for (const p of REFIT_PROFILES) {
    it(`${p.cssW}x${p.cssH}@${p.dpr} (setting ${p.setting}): ${p.width}x360 @ ${p.scale}x`, () => {
      const v = computeView({
        width: p.cssW, height: p.cssH, dpr: p.dpr, setting: p.setting,
      });
      expect(v.width).toBe(p.width);
      expect(v.height).toBe(360);
      expect(v.scale).toBe(p.scale);
      expect(isIntegerPixelPerfect(v)).toBe(true);
    });
  }
});
