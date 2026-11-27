import { describe, expect, it } from "vitest";
import {
  RENDER_SCALE_MAX,
  RENDER_SCALE_MIN,
  SCALE_HIGH_FPS,
  SCALE_HIGH_MS,
  SCALE_LOW_FPS,
  SCALE_LOW_MS,
  chooseRenderScale,
  maxRenderScale,
  parseRenderScaleOverride,
  stepRenderScale,
} from "../src/logic/scale";
import { renderBufferSize } from "../src/config";

const BUDGET = 1000 / 60; // 16,67 ms -> 60 FPS Ziel

describe("M10-dpr-budget-cap: chooseRenderScale", () => {
  it("Grenzen: unbekanntes/negatives FPS bleibt bei 1 (nie unter RENDER_SCALE_MIN)", () => {
    for (const fps of [NaN, 0, -5, Infinity]) {
      expect(chooseRenderScale(3, 780, 360, fps, BUDGET)).toBe(RENDER_SCALE_MIN);
    }
  });

  it("Im Budget (>= Ziel-FPS) wird nicht geschrumpft", () => {
    expect(chooseRenderScale(3, 780, 360, 60, BUDGET)).toBe(1);
    expect(chooseRenderScale(3, 780, 360, 100, BUDGET)).toBe(1);
  });

  it("M25-Fall 780x360 dpr3 bei ~42,5 FPS: ganzzahliger Teiler 2", () => {
    expect(chooseRenderScale(3, 780, 360, 42.5, BUDGET)).toBe(2);
  });

  it("Starker Mangel (20 FPS) waehlt den grossmoeglichen Teiler (dpr3, 780x360 -> 2)", () => {
    expect(chooseRenderScale(3, 780, 360, 20, BUDGET)).toBe(2);
  });

  it("dpr 1 schrumpft nie (kein Geraete-Pixel-Budget)", () => {
    expect(chooseRenderScale(1, 640, 360, 30, BUDGET)).toBe(1);
    expect(maxRenderScale(640, 360, 1)).toBe(1);
  });

  it("Ergebnis ist immer ganzzahlig und in [1, RENDER_SCALE_MAX]", () => {
    for (let fps = 1; fps <= 120; fps += 0.5) {
      const s = chooseRenderScale(3, 1920, 1080, fps, BUDGET);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(RENDER_SCALE_MIN);
      expect(s).toBeLessThanOrEqual(RENDER_SCALE_MAX);
    }
  });

  it("budgetMs von 0/NaN faellt auf 16,67 ms zurueck", () => {
    expect(chooseRenderScale(3, 780, 360, 42.5, 0)).toBe(2);
    expect(chooseRenderScale(3, 780, 360, 42.5, NaN)).toBe(2);
  });
});

describe("M10-dpr-budget-cap: stepRenderScale (Hysterese)", () => {
  const S = (scale = 1) => ({ scale, belowMs: 0, aboveMs: 0 });

  it("senkt NICHT sofort: unter 45 FPS fuer < 2 s bleibt Teiler 1", () => {
    let s = S();
    for (let i = 0; i < 10; i++) s = stepRenderScale(s, 42, 199, 2); // 1990 ms
    expect(s.scale).toBe(1);
    s = stepRenderScale(s, 42, 10, 2); // 2000 ms ueberschritten
    expect(s.scale).toBe(2);
    expect(s.belowMs).toBe(0);
  });

  it("hebt erst ab 57 FPS nach 4 s: 57 FPS fuer < 4 s haelt Teiler 2", () => {
    let s = S(2);
    for (let i = 0; i < 30; i++) s = stepRenderScale(s, 58, 133, 2); // 3990 ms
    expect(s.scale).toBe(2);
    s = stepRenderScale(s, 58, 10, 2); // 4000 ms
    expect(s.scale).toBe(1);
  });

  it("totale Zone 45..57 FPS friert beide Timer ein (Fortschritt bleibt bei Last-Jitter)", () => {
    let s = S();
    s = stepRenderScale(s, 42, 1900, 2);
    expect(s.belowMs).toBe(1900);
    s = stepRenderScale(s, 50, 100, 2);
    expect(s.belowMs).toBe(1900);
    expect(s.aboveMs).toBe(0);
    expect(s.scale).toBe(1);
  });

  it("Last-Jitter um 45 FPS (42/50 abwechselnd) erreicht den 2-s-Timer und senkt", () => {
    // Beleg 2026-11-27: unter Parallel-Last pendelt der EWMA 41,6-53 FPS.
    // Mit Reset in der Totzone lief belowMs nie ueber ~500 ms (Regler blieb
    // bei Teiler 1, ~40-44 FPS < Ziel 50). Mit Einfrieren addiert sich die
    // unter-45-Zeit und der Regler greift.
    let s = S();
    for (let i = 0; i < 20; i++) {
      s = stepRenderScale(s, i % 2 === 0 ? 42 : 50, 300, 2); // je 150 ms unter 45
    }
    expect(s.scale).toBe(2); // 10 x 300 ms = 3000 ms kumulativ unter 45 FPS
  });

  it("Grenzen: Teiler steigt nie ueber cap und faellt nie unter RENDER_SCALE_MIN", () => {
    let s = S(1);
    for (let i = 0; i < 100; i++) s = stepRenderScale(s, 10, 1000, 2);
    expect(s.scale).toBe(2);

    let up = S(1);
    for (let i = 0; i < 100; i++) up = stepRenderScale(up, 10, 1000, RENDER_SCALE_MAX);
    expect(up.scale).toBe(RENDER_SCALE_MAX);

    let down = S(1);
    for (let i = 0; i < 100; i++) down = stepRenderScale(down, 60, 5000, 1);
    expect(down.scale).toBe(RENDER_SCALE_MIN);
  });

  it("Ergebnis ist immer ganzzahlig", () => {
    let s = S();
    for (let i = 0; i < 50; i++) {
      s = stepRenderScale(s, 30 + (i % 40), 137, 3);
      expect(Number.isInteger(s.scale)).toBe(true);
    }
  });

  it("Schwellen sind die dokumentierten Konstanten (45/57, 2 s/4 s)", () => {
    expect(SCALE_LOW_FPS).toBe(45);
    expect(SCALE_HIGH_FPS).toBe(57);
    expect(SCALE_LOW_MS).toBe(2000);
    expect(SCALE_HIGH_MS).toBe(4000);
  });
});

describe("M10-dpr-budget-cap: parseRenderScaleOverride", () => {
  it("fehlender/leerer Parameter -> null (Regler aktiv)", () => {
    expect(parseRenderScaleOverride(null)).toBeNull();
    expect(parseRenderScaleOverride("")).toBeNull();
  });

  it("0 -> 0 (Regler aus, Voller Buffer) — Achtung Number(null) ist 0", () => {
    expect(parseRenderScaleOverride("0")).toBe(0);
  });

  it("1..3 -> fester Teiler, ganzzahlig gerundet", () => {
    expect(parseRenderScaleOverride("1")).toBe(1);
    expect(parseRenderScaleOverride("2")).toBe(2);
    expect(parseRenderScaleOverride("3")).toBe(3);
    expect(parseRenderScaleOverride("2.6")).toBe(3);
    expect(parseRenderScaleOverride("1.2")).toBe(1);
  });

  it("ausserhalb des Bereichs -> null (nicht clampsen, Messung soll auffallen)", () => {
    expect(parseRenderScaleOverride("4")).toBeNull();
    expect(parseRenderScaleOverride("-1")).toBeNull();
    expect(parseRenderScaleOverride("bananenbrot")).toBeNull();
  });
});

describe("M10-dpr-budget-cap: renderBufferSize", () => {
  it("Stufe 1 = volle logische Groesse, Stufe 2/3 = ganzzahlige Teilung", () => {
    expect(renderBufferSize(780, 360, 1)).toEqual({ width: 780, height: 360 });
    expect(renderBufferSize(780, 360, 2)).toEqual({ width: 390, height: 180 });
    expect(renderBufferSize(780, 360, 3)).toEqual({ width: 260, height: 120 });
  });

  it("klemmt auf [1, 3] und rundet (0/2.6/4)", () => {
    expect(renderBufferSize(780, 360, 0)).toEqual({ width: 780, height: 360 });
    expect(renderBufferSize(780, 360, 2.6)).toEqual({ width: 260, height: 120 });
    expect(renderBufferSize(780, 360, 4)).toEqual({ width: 260, height: 120 });
  });

  it("nie kleiner als 1x1 (auch bei winzigen Views)", () => {
    expect(renderBufferSize(1, 1, 3)).toEqual({ width: 1, height: 1 });
  });
});
