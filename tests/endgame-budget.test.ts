import { describe, expect, it } from "vitest";
import {
  FRAME_BUDGET_MIN_ACTIVE,
  createFrameBudget, frameBudgetTarget, maxActiveEnemies, stepFrameBudget,
  type FrameBudgetState,
} from "../src/logic/scaling";

const DT = 1 / 60;

/** Deterministische Frame-Serie: `frames` Frames mit konstanter Frame-Zeit. */
function series(state: FrameBudgetState, frames: number, frameMs: number, ceiling?: number): FrameBudgetState {
  let s = state;
  for (let i = 0; i < frames; i++) s = stepFrameBudget(s, frameMs, DT, ceiling);
  return s;
}

describe("M10 Frame-Budget-Regler (pure, deterministisch)", () => {
  it("Default-Verhalten ohne Ueberlast bleibt unveraendert (780x360@3, Ziel 500)", () => {
    const s = createFrameBudget(500, true);
    const after = series(s, 60 * 10, 16.6);
    expect(after.ratio).toBe(1);
    expect(frameBudgetTarget(after)).toBe(500);
    expect(after.overSeconds).toBe(0);
    expect(after.underSeconds).toBe(0);

    // Der bestehende Deckel bleibt ebenfalls unveraendert.
    expect(maxActiveEnemies(1490, 780, 360)).toBe(439);
    expect(maxActiveEnemies(1490, 640, 360)).toBe(360);
  });

  it("disabled ist ein No-Op, auch bei Dauer-Ueberlast", () => {
    const s = createFrameBudget(500, false);
    const after = series(s, 60 * 30, 40);
    expect(frameBudgetTarget(after)).toBe(500);
  });

  it("kurze Spitze unter 1 s senkt nicht (Hysterese)", () => {
    const s = createFrameBudget(500, true);
    const after = series(s, 30, 30); // 0,5 s Spitze
    expect(frameBudgetTarget(after)).toBe(500);
    expect(after.overSeconds).toBeGreaterThan(0.4);
  });

  it("Dauer-Ueberlast > 19,2 ms senkt um max. 10 %/s, nicht unter 320", () => {
    const s = createFrameBudget(500, true);
    const afterHold = series(s, 59, 30); // knapp unter 1 s: nur Timer, keine Senkung
    expect(frameBudgetTarget(afterHold)).toBe(500);

    const twoSeconds = series(afterHold, 60 * 2, 30);
    expect(frameBudgetTarget(twoSeconds)).toBeLessThan(460);
    expect(frameBudgetTarget(twoSeconds)).toBeGreaterThan(FRAME_BUDGET_MIN_ACTIVE);

    const after = series(afterHold, 60 * 30, 30); // 30 s weitere Ueberlast
    expect(frameBudgetTarget(after)).toBe(FRAME_BUDGET_MIN_ACTIVE);
  });

  it("Zwischenband 15..19,2 ms friert die Timer ein und aendert nichts", () => {
    const s = createFrameBudget(500, true);
    const after = series(s, 60 * 20, 17);
    expect(frameBudgetTarget(after)).toBe(500);
    expect(after.overSeconds).toBe(0);
    expect(after.underSeconds).toBe(0);
  });

  it("unter 15 ms erholt sich das Ziel mit 1-s-Hysterese bis zum Deckel", () => {
    const start = series(createFrameBudget(500, true), 60 * 30, 30);
    expect(frameBudgetTarget(start)).toBe(FRAME_BUDGET_MIN_ACTIVE);

    const underHalf = series(start, 59, 12); // < 1 s Erholung
    expect(frameBudgetTarget(underHalf)).toBe(frameBudgetTarget(start));

    const recovered = series(start, 60 * 20, 12);
    expect(frameBudgetTarget(recovered)).toBe(500);
  });

  it("Deckel-Absenkung wird sofort uebernommen, Erholung nie ueber den Deckel", () => {
    const s = createFrameBudget(500, true);
    const lowerCeiling = stepFrameBudget(s, 16, DT, 360);
    expect(frameBudgetTarget(lowerCeiling)).toBe(360);
    expect(lowerCeiling.ceiling).toBe(360);

    const recovered = series(lowerCeiling, 60 * 20, 12, 360);
    expect(frameBudgetTarget(recovered)).toBe(360);
  });

  it("sehr lange Einzelframes werden nur mit maximal 0,1 s gezaehlt", () => {
    let st = createFrameBudget(500, true);
    for (let i = 0; i < 12; i++) st = stepFrameBudget(st, 300, 5);
    // 12 x 0,1 s = 1,2 s -> erste Senkung nach 1 s, aber nur ~2 Frames Wirkung.
    expect(st.overSeconds).toBeCloseTo(1.2, 5);
    expect(frameBudgetTarget(st)).toBeLessThan(500);
    expect(frameBudgetTarget(st)).toBeGreaterThanOrEqual(490);
  });
});
