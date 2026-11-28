/**
 * M10-scale-osc-guard: Pump-freier Hysterese-Regler.
 *
 * Befund K1 (shots/m10-scale-osc-before.json): alternierende Lastserien
 * liessen stepRenderScale zwischen Stufen pendeln (5-s-Epochen: 49 Wechsel/
 * 240 s). Der Guard (SCALE_MIN_STEP_MS + SCALE_RECOVER_MS) muss das
 * deterministic verhindern, ohne den 640er-Pfad (cap 1) oder den
 * ?rbscale-Override anzutasten.
 */
import { describe, expect, it } from "vitest";
import {
  RENDER_SCALE_MAX,
  RENDER_SCALE_MIN,
  SCALE_MIN_STEP_MS,
  SCALE_RECOVER_MS,
  applyRenderScaleOverride,
  chooseRenderScale,
  maxRenderScale,
  parseRenderScaleOverride,
  stepRenderScale,
  type RenderScaleState,
} from "../src/logic/scale";

const DT = 1000 / 60;
const FPS_HIGH = 62; // >= SCALE_HIGH_FPS
const FPS_LOW = 41.5; // < SCALE_LOW_FPS

interface Transition {
  tMs: number;
  from: number;
  to: number;
}

/** Spiegelt die config.ts-Verdrahtung: EWMA 0.9/0.1, ein step je Frame. */
function runSeries(
  epochs: Array<[number, number]>,
  cap = 3,
): { transitions: Transition[]; final: number; scales: number[] } {
  let state: RenderScaleState = { scale: 1, belowMs: 0, aboveMs: 0 };
  let ewma = 0;
  let t = 0;
  const transitions: Transition[] = [];
  const scales: number[] = [];
  for (const [seconds, fps] of epochs) {
    for (let i = 0; i < Math.round((seconds * 1000) / DT); i++) {
      ewma = ewma === 0 ? fps : ewma * 0.9 + fps * 0.1;
      const before = state.scale;
      state = stepRenderScale(state, ewma, DT, cap);
      if (state.scale !== before) transitions.push({ tMs: Math.round(t), from: before, to: state.scale });
      scales.push(state.scale);
      t += DT;
    }
  }
  return { transitions, final: state.scale, scales };
}

const alternating = (epochS: number, pairs: number): Array<[number, number]> =>
  Array.from({ length: pairs }, () => [
    [epochS, FPS_LOW],
    [epochS, FPS_HIGH],
  ]).flat() as Array<[number, number]>;

describe("M10-scale-osc-guard: alternierende Lastserie pumpt NICHT", () => {
  const SETTLE_MS = 30_000;

  it("5-s-Epochen (vorher 49 Wechsel/240 s): nach dem Einschwingen 0 Wechsel", () => {
    const r = runSeries(alternating(5, 24));
    // Einschwingen: hochstens 3 Wechsel (bis Stufe cap), danach Ruhe.
    expect(r.transitions.length).toBeLessThanOrEqual(3);
    const after = r.transitions.filter((t) => t.tMs > SETTLE_MS);
    expect(after).toEqual([]);
    // Stufen bleiben ganzzahlig und in [1, 3].
    for (const s of r.scales) {
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(RENDER_SCALE_MIN);
      expect(s).toBeLessThanOrEqual(RENDER_SCALE_MAX);
    }
  });

  it("3-s-Epochen: Heben nie moeglich (Epochen < SCALE_HIGH_MS), Senken max 2x, danach 0", () => {
    const r = runSeries(alternating(3, 40));
    const after = r.transitions.filter((t) => t.tMs > SETTLE_MS);
    expect(after).toEqual([]);
    expect(r.transitions.length).toBeLessThanOrEqual(2);
    for (const s of r.scales) expect(Number.isInteger(s)).toBe(true);
  });

  it("Determinismus: gleiche Serie -> gleiche Übergangsliste", () => {
    const a = runSeries(alternating(5, 24));
    const b = runSeries(alternating(5, 24));
    expect(b.transitions).toEqual(a.transitions);
    expect(b.final).toBe(a.final);
  });

  it("Spitzenmuster (30 s stabil + 4 s Last): seit K2 gar keine Wechsel mehr", () => {
    // K2 (RENDER_SCALE_MAX = 1): der Regler kann die Aufloesung nicht mehr
    // aendern — auch unter Lastspitzen bleibt der Buffer voll.
    const epochs: Array<[number, number]> = Array.from({ length: 3 }, () => [
      [30, FPS_HIGH],
      [4, FPS_LOW],
    ]).flat() as Array<[number, number]>;
    const r = runSeries(epochs);
    expect(r.transitions).toEqual([]);
    expect(r.final).toBe(1);
  });
});

describe("M10-android-scale-floor-r2 (K2): Guard-Regeln unter hartem Teiler-1-Deckel", () => {
  it("Konstanten sind dokumentiert (Deckel history)", () => {
    expect(SCALE_MIN_STEP_MS).toBe(8000);
    expect(SCALE_RECOVER_MS).toBe(12000);
  });

  it("kein Wechsel, auch bei dauerhaft 41,5 FPS mit cap 3", () => {
    let s: RenderScaleState = { scale: 1, belowMs: 0, aboveMs: 0 };
    for (let i = 0; i < 600; i++) s = stepRenderScale(s, FPS_LOW, 2000, 3);
    expect(s.scale).toBe(1);
  });

  it("historischer State mit Teiler 2/3 wird sofort auf 1 geklemmt", () => {
    let s: RenderScaleState = { scale: 3, belowMs: 0, aboveMs: 0 };
    s = stepRenderScale(s, FPS_HIGH, 16, 3);
    expect(s.scale).toBe(1);
  });
});

describe("M10-android-scale-floor-r2 (K2): ?rbscale-Override als Debug auf max 1 geklemmt", () => {
  it("applyRenderScaleOverride: 0/1 kommen durch, 2/3 werden auf 1 geklemmt (Text kann nicht zerstoert werden)", () => {
    for (const controller of [1, 2, 3]) {
      expect(applyRenderScaleOverride(0, controller)).toBe(0);
      expect(applyRenderScaleOverride(1, controller)).toBe(1);
      expect(applyRenderScaleOverride(2, controller)).toBe(1);
      expect(applyRenderScaleOverride(3, controller)).toBe(1);
    }
  });

  it("null -> Regler gilt (geklemmt auf [1,1], ganzzahlig)", () => {
    expect(applyRenderScaleOverride(null, 2)).toBe(1);
    expect(applyRenderScaleOverride(null, 99)).toBe(RENDER_SCALE_MAX);
    expect(applyRenderScaleOverride(null, 0.4)).toBe(1);
  });

  it("parseRenderScaleOverride liefert nur gueltige Override-Werte (K2: max 1)", () => {
    expect(parseRenderScaleOverride(null)).toBeNull();
    expect(parseRenderScaleOverride("0")).toBe(0);
    expect(parseRenderScaleOverride("1")).toBe(1);
    expect(parseRenderScaleOverride("3")).toBeNull();
    expect(parseRenderScaleOverride("4")).toBeNull();
    expect(parseRenderScaleOverride("bananenbrot")).toBeNull();
  });
});

describe("M10-scale-osc-guard: 640er-Pfad unverändert", () => {
  it("dpr1/640x360: cap 1 — alternierende Serie wechselt NIE", () => {
    expect(maxRenderScale(640, 360, 1)).toBe(1);
    expect(chooseRenderScale(1, 640, 360, 30, 1000 / 60)).toBe(1);
    const r = runSeries(alternating(5, 24), 1);
    expect(r.transitions).toEqual([]);
    expect(r.final).toBe(1);
    for (const s of r.scales) expect(s).toBe(1);
  });

  it("cap 1 mit historischem State (sinceChangeMs) wechselt ebenfalls nie", () => {
    let s: RenderScaleState = { scale: 1, belowMs: 0, aboveMs: 0, sinceChangeMs: 99999 };
    for (let i = 0; i < 200; i++) s = stepRenderScale(s, i % 2 ? FPS_LOW : FPS_HIGH, DT, 1);
    expect(s.scale).toBe(1);
  });
});
