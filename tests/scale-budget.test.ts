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

  it("M10-android-scale-floor-r2 (K2): Nie unter logische Aufloesung — auch bei 42,5 FPS bleibt Teiler 1", () => {
    expect(chooseRenderScale(3, 780, 360, 42.5, BUDGET)).toBe(1);
  });

  it("Starker Mangel (20 FPS) schrumpft NICHT: Renderpuffer nie unter 640x360 logisch", () => {
    expect(chooseRenderScale(3, 780, 360, 20, BUDGET)).toBe(1);
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

  it("budgetMs von 0/NaN faellt auf 16,67 ms zurueck — Teiler bleibt trotzdem 1 (K2)", () => {
    expect(chooseRenderScale(3, 780, 360, 42.5, 0)).toBe(1);
    expect(chooseRenderScale(3, 780, 360, 42.5, NaN)).toBe(1);
  });
});

describe("M10-android-scale-floor-r2 (K2): stepRenderScale kann den Teiler nie ueber 1 heben", () => {
  const S = (scale = 1) => ({ scale, belowMs: 0, aboveMs: 0 });

  it("unter 45 FPS beliebig lange: Teiler bleibt 1 (Renderpuffer voll)", () => {
    let s = S();
    for (let i = 0; i < 200; i++) s = stepRenderScale(s, 42, 200, 3);
    expect(s.scale).toBe(1);
  });

  it("historischer State mit Teiler 2 wird sofort auf 1 geklemmt", () => {
    let s: Parameters<typeof stepRenderScale>[0] = { scale: 2, belowMs: 0, aboveMs: 0 };
    s = stepRenderScale(s, 60, 16, 3);
    expect(s.scale).toBe(1);
  });

  it("Last-Jitter um 45 FPS aendert den Teiler nie", () => {
    let s = S();
    for (let i = 0; i < 20; i++) {
      s = stepRenderScale(s, i % 2 === 0 ? 42 : 50, 300, 2);
    }
    expect(s.scale).toBe(1);
  });

  it("Grenzen: Teiler bleibt in [1, RENDER_SCALE_MAX] (=1)", () => {
    let s = S(1);
    for (let i = 0; i < 100; i++) s = stepRenderScale(s, 10, 1000, 2);
    expect(s.scale).toBe(1);

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

  it("1 -> fester Teiler, ganzzahlig gerundet; 2/3 sind seit K2 kein gueltiger Override mehr", () => {
    expect(parseRenderScaleOverride("1")).toBe(1);
    expect(parseRenderScaleOverride("2")).toBeNull();
    expect(parseRenderScaleOverride("3")).toBeNull();
    expect(parseRenderScaleOverride("1.2")).toBe(1);
  });

  it("ausserhalb des Bereichs -> null (nicht clampsen, Messung soll auffallen)", () => {
    expect(parseRenderScaleOverride("4")).toBeNull();
    expect(parseRenderScaleOverride("-1")).toBeNull();
    expect(parseRenderScaleOverride("bananenbrot")).toBeNull();
  });
});

describe("M10-android-scale-floor-r2 (K2): renderBufferSize", () => {
  it("jede Stufe liefert die volle logische Groesse (Teiler hart 1)", () => {
    expect(renderBufferSize(780, 360, 1)).toEqual({ width: 780, height: 360 });
    expect(renderBufferSize(780, 360, 2)).toEqual({ width: 780, height: 360 });
    expect(renderBufferSize(780, 360, 3)).toEqual({ width: 780, height: 360 });
  });

  it("klemmt auf [1, 1] und rundet (0/2.6/4)", () => {
    expect(renderBufferSize(780, 360, 0)).toEqual({ width: 780, height: 360 });
    expect(renderBufferSize(780, 360, 2.6)).toEqual({ width: 780, height: 360 });
    expect(renderBufferSize(780, 360, 4)).toEqual({ width: 780, height: 360 });
  });

  it("nie kleiner als 1x1 (auch bei winzigen Views)", () => {
    expect(renderBufferSize(1, 1, 3)).toEqual({ width: 1, height: 1 });
  });
});
