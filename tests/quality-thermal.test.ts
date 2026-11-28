/**
 * M10-quality-thermal-guard: thermischer Guard — Definition (K1),
 * Hysterese (K2), Test-Matrix (K3). Rein, ohne Phaser/Uhr.
 */
import { describe, expect, it } from "vitest";
import {
  QUALITY_LOW_FPS,
  THERMAL_BUDGET,
  THERMAL_FPS,
  THERMAL_HOLD_MS,
  THERMAL_RECOVERY_FPS,
  THERMAL_RECOVERY_MS,
  evaluateThermalStep,
  initialThermalState,
  qualityBudgetFor,
  type ThermalState,
} from "../src/logic/quality";

const DT = 1000; // 1-Sekunden-Samples
const crashSerie = (fps = THERMAL_FPS - 5): number[] => Array.from({ length: 8 }, () => fps);
const stableSerie = (fps = 55): number[] => Array.from({ length: 8 }, () => fps);

const atLow = (): ThermalState => ({ ...initialThermalState(), tier: "low" });

describe("K1: Definition — thermischer Absturz trotz LOW-Stufe", () => {
  it("Start ist inaktiv auf high ohne Timer", () => {
    expect(initialThermalState()).toEqual({ tier: "high", active: false, crashMs: 0, recoverMs: 0 });
  });

  it("Median dauerhaft unter THERMAL_FPS trotz low engages nach dem Haltefenster", () => {
    let s = atLow();
    for (let ms = 0; ms < THERMAL_HOLD_MS; ms += DT) s = evaluateThermalStep(crashSerie(), s, DT);
    expect(s.tier).toBe("thermal");
    expect(s.active).toBe(true);
  });

  it("gleiche Serie auf Basis-Stufe high/medium: Guard greift NICHT (stepQuality zustaendig)", () => {
    for (const base of ["high", "medium"] as const) {
      let s: ThermalState = { ...initialThermalState(), tier: base };
      for (let ms = 0; ms < THERMAL_HOLD_MS * 3; ms += DT) s = evaluateThermalStep(crashSerie(), s, DT);
      expect(s.active).toBe(false);
      expect(s.tier).toBe(base);
    }
  });

  it("ohne Signal (NaN/leere Serie) bleibt der Zustand unveraendert (Timer eingefroren)", () => {
    let s = { ...atLow(), crashMs: 4000 };
    s = evaluateThermalStep([], s, DT);
    expect(s.crashMs).toBe(4000);
    s = evaluateThermalStep([NaN, 0, -5], s, DT);
    expect(s.crashMs).toBe(4000);
    expect(s.active).toBe(false);
  });
});

describe("K1: Budget der Stufe thermal", () => {
  it("thermal streng unter low (Last senken statt Aufloesung)", () => {
    const low = qualityBudgetFor("low");
    expect(THERMAL_BUDGET.maxFxSprites).toBeLessThan(low.maxFxSprites);
    expect(THERMAL_BUDGET.maxAddArea).toBeLessThan(low.maxAddArea);
    expect(THERMAL_BUDGET.maxAddArea).toBeGreaterThan(0); // ADD-Deckel nie 0
    expect(THERMAL_BUDGET.particlesPerHit).toBeLessThan(low.particlesPerHit);
    expect(THERMAL_BUDGET.maxDamageLabels).toBeLessThan(low.maxDamageLabels);
    expect(THERMAL_BUDGET.glow).toBe(false);
    expect(qualityBudgetFor("thermal")).toBe(THERMAL_BUDGET);
  });

  it("Schwellen sind die dokumentierten Konstanten", () => {
    expect(THERMAL_FPS).toBe(30);
    expect(THERMAL_RECOVERY_FPS).toBe(QUALITY_LOW_FPS);
    expect(THERMAL_RECOVERY_MS).toBe(20000);
    expect(THERMAL_HOLD_MS).toBe(10000);
  });
});
