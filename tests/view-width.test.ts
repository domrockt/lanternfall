import { describe, expect, it } from "vitest";
import {
  MAX_WIDTH,
  computeView, isIntegerPixelPerfect, viewKey,
} from "../src/logic/view";

/**
 * M10-perf-cap-rollback (2026-11-27): der M10-Crowd-Deckel (interne Breite 640
 * ab 300 Gegnern, Hysterese 260) ist rueckgebaut — auf iGPU (Mesa Intel RPL-S)
 * haelt M25 780x360@3 mit UND ohne Deckel vsync-60 (Median 60,0 >= 55,
 * shots/m10-perf-cap-rollback-m25-cap-{on,off}-*.json). Diese Tests sichern das
 * M8-Verhalten ohne Deckel: 780 bleibt 780, 1080 wird nur durch MAX_WIDTH 860
 * begrenzt, ganzzahlige n-Skalierung bleibt pixelgenau.
 */

const view = (width: number, height: number, dpr = 1) => computeView({ width, height, dpr });

describe("M8-View ohne Crowd-Deckel (Rueckbau m10-perf-cap-rollback)", () => {
  it("780x360@3 bleibt in jedem Fall 780 breit (keine Klemme mehr)", () => {
    const spec = view(780, 360, 3);
    expect(spec.width).toBe(780);
    expect(spec.scale).toBe(3);
    expect(spec.fit).toBe(false);
    expect(isIntegerPixelPerfect(spec)).toBe(true);
    expect(spec.cssWidth).toBe(780);
  });

  it("1080x360@3 wird nur durch MAX_WIDTH auf 860 begrenzt, pixelgenau", () => {
    const spec = view(1080, 360, 3);
    expect(spec.width).toBe(MAX_WIDTH);
    expect(spec.scale).toBe(3);
    expect(isIntegerPixelPerfect(spec)).toBe(true);
    expect(spec.cssWidth * spec.dpr).toBeCloseTo(spec.width * spec.scale, 5);
  });

  it("schmale Views (Fuell-Fit, intern 640) bleiben unveraendert — Klemme rueckgebaut", () => {
    const small = view(640, 360, 1);
    // M10-view-fill: 640x360 fuellt jetzt komplett (intern 640, statt 480+Balken).
    // M10-perf-cap-rollback: die Crowd-Klemme (frueher 4. Parameter) existiert nicht mehr.
    expect(small.width).toBe(640);
    expect(small.fit).toBe(true);
  });

  it("SKALIERUNG-Override bleibt wirksam; gleiche Eingaben -> gleicher viewKey", () => {
    const forced = computeView({ width: 780, height: 360, dpr: 3, setting: 6 });
    expect(forced.width).toBe(780);
    // maxFitN = floor(1080/360) = 3 begrenzt den Override auf die Stufe 3.
    expect(forced.scale).toBe(3);
    expect(isIntegerPixelPerfect(forced)).toBe(true);
    expect(viewKey(forced)).toBe(viewKey(view(780, 360, 3)));
  });

  it("M10-view-fill-refit: alle 7 Abnahme-Formate halten height*scale == Geraetehoehe (kein Hoehen-Balken)", () => {
    // Ergänzt die Breiten-Invariante aus tests/view.test.ts um die Höhenseite
    // und die Fill-Formate (n < 2): Höhe skaliert immer exakt mit.
    for (const [w, h, dpr, setting] of [
      [640, 360, 1, 0], [960, 540, 1, 0], [1280, 720, 1, 0],
      [1920, 1080, 1, 0], [2560, 1440, 1, 0], [3840, 2160, 1, 0], [780, 360, 3, 3],
    ] as Array<[number, number, number, number]>) {
      const v = computeView({ width: w, height: h, dpr, setting });
      expect(v.height * v.scale).toBe(h * dpr);
      expect(isIntegerPixelPerfect(v)).toBe(true);
    }
  });
});
