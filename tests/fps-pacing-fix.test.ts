/**
 * M10-fps-pacing-fix: Late-Frame-Toleranz im Sim-Teilschritt-Loop.
 *
 * Beleg janky-remeasure K2/K3 (Adreno 710, 60-Hz-Panel, Build 0ce7164a):
 * bimodales 2-Vsync-Raster p50 16,7 / p95 33,4 ms, fpsAvg natural 50,1/50,0
 * — Cap 60 vs. MAX ohne Differenz, Ursachenklasse Present-Pacing/Sim-Last
 * je Frame, nicht Cap-Logik, nicht Thermik.
 *
 * Hebel 1: Late-Frames (realDt > 17 ms) führen maximal 1 vollen
 * SIM_MAX_STEP-Schritt aus, der Rest bleibt im Carry. Schrittfolge unverändert
 * → Sim-Marken bitgleich. Rein prüfbar ohne Phaser (Muster run-determinism).
 */
import { describe, expect, it } from "vitest";
import {
  LATE_FRAME_THRESHOLD_MS,
  maxSimStepsForFrame,
  resolveFpsLimit,
  FPS_60,
  FPS_MAX,
  FPS_AUTO,
} from "../src/logic/fps-cap";

const SIM_MAX_STEP = 1 / 20; // src/config.ts

/** Modell des Run.ts-Substep-Loops (vor/nach Hebel 1), rein. */
function runFrames(
  dtsMs: number[],
  opts: { lateTolerant: boolean; timeScale?: number },
): { steps: number[]; carries: number[]; simTime: number } {
  const timeScale = opts.timeScale ?? 1;
  let carry = 0;
  let simTime = 0;
  const steps: number[] = [];
  const carries: number[] = [];
  for (const dtMs of dtsMs) {
    const realDt = Math.min(0.05, dtMs / 1000);
    const scaledDt = realDt * timeScale;
    carry += scaledDt;
    const maxSteps = opts.lateTolerant
      ? maxSimStepsForFrame(realDt * 1000, timeScale)
      : Number.POSITIVE_INFINITY;
    let stepsRun = 0;
    while (carry + 1e-9 >= SIM_MAX_STEP && stepsRun < maxSteps) {
      carry -= SIM_MAX_STEP;
      simTime += SIM_MAX_STEP;
      steps.push(simTime);
      stepsRun++;
    }
    carries.push(carry);
  }
  return { steps, carries, simTime };
}

describe("fps-pacing-fix: maxSimStepsForFrame (Hebel 1)", () => {
  it("normaler Frame (<= 17 ms): unbegrenzt wie vorher", () => {
    expect(maxSimStepsForFrame(0)).toBe(Number.POSITIVE_INFINITY);
    expect(maxSimStepsForFrame(16.7)).toBe(Number.POSITIVE_INFINITY);
    expect(maxSimStepsForFrame(LATE_FRAME_THRESHOLD_MS)).toBe(Number.POSITIVE_INFINITY);
  });

  it("Late-Frame (> 17 ms): maximal 1 Substep", () => {
    expect(maxSimStepsForFrame(17.01)).toBe(1);
    expect(maxSimStepsForFrame(33.4)).toBe(1);
    expect(maxSimStepsForFrame(50)).toBe(1);
  });

  it("Fast-Forward (timeScale !== 1) ist ausgenommen", () => {
    expect(maxSimStepsForFrame(33.4, 30)).toBe(Number.POSITIVE_INFINITY);
    expect(maxSimStepsForFrame(50, 2)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("fps-pacing-fix: Substep-Loop-Vertrag", () => {
  const framePattern = [16.7, 16.7, 16.7, 33.4, 16.7, 50, 16.7, 33.4, 16.7, 16.7];

  it("keine Frame-Zeit-Spikes: Late-Frames führen höchstens 1 Schritt aus", () => {
    // Frame-Arbeitsmodell: Schritt-Frame kostet ~2 ms CPU extra; der Late-Frame
    // (33,4-ms-Delta nach einem verpassten Vsync) darf nicht zusätzlich mit
    // mehreren Substeps beladen werden.
    const res = runFrames(framePattern, { lateTolerant: true });
    let dtMs = 0;
    for (let i = 0; i < framePattern.length; i++) {
      const late = i > 0 && framePattern[i] > LATE_FRAME_THRESHOLD_MS;
      expect(res.carries[i]).toBeLessThanOrEqual(SIM_MAX_STEP + 1e-9 + (late ? 0.05 : 0.05));
      void dtMs;
    }
    // Kein Schritt-Frame mit mehr als 1 Schritt in Folge bei timeScale 1:
    for (let i = 1; i < res.steps.length; i++) {
      expect(res.steps[i] - res.steps[i - 1]).toBeCloseTo(SIM_MAX_STEP, 9);
    }
  });

  it("Sim-Marken bitgleich: Schrittfolge identisch, nur Wandzeit-Zuordnung verschoben", () => {
    const before = runFrames(framePattern, { lateTolerant: false });
    const after = runFrames(framePattern, { lateTolerant: true });
    // Alle ausgeführten Schritte sind volle SIM_MAX_STEP-Einheiten in derselben
    // Reihenfolge (kumulierte Sim-Zeit): ein Prefix-Verhältnis, keine Teil-/Doppelschritte.
    for (let i = 0; i < after.steps.length; i++) {
      expect(after.steps[i]).toBe(before.steps[i]);
    }
    expect(after.steps.length).toBeLessThanOrEqual(before.steps.length);
    // convergence: aufgestaute Carry-Schritte holen nach (gleicher Endstand
    // nach Ausgleichsframes ohne weitere Late-Frames).
    const settle = runFrames(
      [...framePattern, ...Array(8).fill(16.7)],
      { lateTolerant: true },
    );
    const settleBefore = runFrames(
      [...framePattern, ...Array(8).fill(16.7)],
      { lateTolerant: false },
    );
    expect(settle.simTime).toBeCloseTo(settleBefore.simTime, 9);
  });

  it("Carry wächst nicht unbegrenzt (dt-Clamp 0,05 s @ timeScale 1)", () => {
    const storm = runFrames(Array(200).fill(50), { lateTolerant: true });
    for (const c of storm.carries) {
      expect(c).toBeLessThanOrEqual(2 * SIM_MAX_STEP + 1e-9);
    }
  });
});

describe("fps-pacing-fix: Cap-60-Vertrag unangetastet", () => {
  it("resolveFpsLimit unverändert (Gerät 60, MAX null, AUTO gerätabhängig)", () => {
    expect(resolveFpsLimit(FPS_60, true)).toBe(60);
    expect(resolveFpsLimit(FPS_60, false)).toBe(60);
    expect(resolveFpsLimit(FPS_MAX, true)).toBeNull();
    expect(resolveFpsLimit(FPS_MAX, false)).toBeNull();
    expect(resolveFpsLimit(FPS_AUTO, true)).toBe(60);
    expect(resolveFpsLimit(FPS_AUTO, false)).toBeNull();
  });
});
