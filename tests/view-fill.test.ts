import { describe, expect, it } from "vitest";
import {
  BASE_HEIGHT, computeView, isIntegerPixelPerfect, viewKey,
} from "../src/logic/view";

/**
 * M10-view-fill: Das Spielfeld fuellt das Fenster — Spielfeld-Rect ==
 * Canvas-Rect, keine Balken. Formate laut Abnahme: 640x360, 960x540,
 * 1280x720, 2560x1440 (dpr 1), nur 16:9.
 */
const FORMATS = [
  { w: 640, h: 360, scale: 1, integer: true },
  { w: 960, h: 540, scale: 1.5, integer: false },
  { w: 1280, h: 720, scale: 2, integer: true },
  { w: 2560, h: 1440, scale: 4, integer: true },
];

describe("M10-view-fill: Spielfeld fuellt 16:9-Fenster ohne Balken", () => {
  for (const f of FORMATS) {
    it(`${f.w}x${f.h}: Spielfeld-Rect == Canvas-Rect (kein Balken)`, () => {
      const v = computeView({ width: f.w, height: f.h, dpr: 1 });
      // Interne View deckt das Fenster in Geraetepixeln exakt ab:
      expect(v.width * v.scale).toBe(f.w); // rechte/linke Kante: kein Streifen
      expect(v.height * v.scale).toBe(f.h); // obere/untere Kante
      // CSS-Canvas == Viewport (Spielfeld-Rect == Canvas-Rect == Fenster-Rect):
      expect(v.cssWidth).toBe(f.w);
      expect(v.cssHeight).toBe(f.h);
      expect(v.portrait).toBe(false);
    });

    it(`${f.w}x${f.h}: Skalierung ${f.scale} (${f.integer ? "ganzzahlig" : "gebrochen, dokumentiert"})`, () => {
      const v = computeView({ width: f.w, height: f.h, dpr: 1 });
      expect(v.scale).toBe(f.scale);
      if (f.integer) expect(Number.isInteger(v.scale)).toBe(true);
      else expect(Number.isInteger(v.scale)).toBe(false);
    });
  }

  it("ganzzahlige Formate sind pixelperfekt; Fill-Faelle bilden exakt ab (M10-view-fill-refit)", () => {
    expect(isIntegerPixelPerfect(computeView({ width: 1280, height: 720, dpr: 1 }))).toBe(true);
    expect(isIntegerPixelPerfect(computeView({ width: 2560, height: 1440, dpr: 1 }))).toBe(true);
    // M10-view-fill-refit: isIntegerPixelPerfect prueft die exakte, gleich-
    // maessige Abbildung (Canvas-Geraetepixel == intern x scale), nicht den
    // Pfad. Fill-Views bilden exakt ab (Pixel-Scan: 0 Balken in 7 Formaten,
    // shots/m10-viewrefit-before.json) — auch mit gebrochener, dokumentierter
    // Stufe (960x540 -> 1.5x, 800x450 -> 1.25x).
    expect(isIntegerPixelPerfect(computeView({ width: 640, height: 360, dpr: 1 }))).toBe(true);
    expect(isIntegerPixelPerfect(computeView({ width: 960, height: 540, dpr: 1 }))).toBe(true);
  });

  it("sehr schmales Fenster faellt auf die 4:3-Fit-View zurueck (kein Overflow)", () => {
    const v = computeView({ width: 500, height: 720, dpr: 1 });
    expect(v.fit).toBe(true);
    expect(v.width).toBe(480);
    expect(v.cssWidth).toBeLessThanOrEqual(500);
    expect(v.cssHeight).toBeLessThanOrEqual(720);
  });

  it("der Fill aendert den viewKey gegenueber dem alten 480-Fit", () => {
    const fill = computeView({ width: 960, height: 540, dpr: 1 });
    expect(viewKey(fill)).not.toContain("480x360");
    expect(viewKey(fill)).toBe(viewKey(computeView({ width: 960, height: 540, dpr: 1 })));
  });

  it("kaputte Masse crashen nicht (Fuell-Pfad inklusive)", () => {
    const v = computeView({ width: Number.NaN, height: -10, dpr: 0 });
    expect(Number.isFinite(v.width)).toBe(true);
    expect(v.height).toBe(BASE_HEIGHT);
    expect(v.cssWidth).toBeGreaterThan(0);
    expect(v.cssHeight).toBeGreaterThan(0);
  });
});
