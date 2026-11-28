import { describe, expect, it } from "vitest";
import {
  AMBIENT_FOG_MAX, AMBIENT_GLOW_MAX, ambientBatchCount, ambientBudgetFor,
  ambientBudgetWithHysteresis, ambientShownStep,
} from "../src/logic/lod";

describe("M10 Ambient-Budget (Glühwürmchen/Nebel)", () => {
  it("volle Ambient-Dichte bei wenig Gegnern: 24 Glows, 3 Nebel, 60 Hz", () => {
    for (const n of [0, 50, 249]) {
      const b = ambientBudgetFor(n);
      expect(b.glow).toBe(AMBIENT_GLOW_MAX);
      expect(b.glow).toBe(24);
      expect(b.fog).toBe(AMBIENT_FOG_MAX);
      expect(b.fog).toBe(3);
      expect(b.updateHz).toBe(60);
    }
  });

  it("ab 250 Gegnern: Glows aus, nur 1 Nebelband, 30 Hz (weniger Draw-Calls)", () => {
    for (const n of [250, 300, 359]) {
      const b = ambientBudgetFor(n);
      expect(b.glow).toBe(0);
      expect(b.fog).toBe(1);
      expect(b.updateHz).toBe(30);
    }
  });

  it("ab 360 Gegnern (Endgame): Glows aus, 1 Nebelband, 15 Hz", () => {
    for (const n of [360, 500, 1200]) {
      const b = ambientBudgetFor(n);
      expect(b.glow).toBe(0);
      expect(b.fog).toBe(1);
      expect(b.updateHz).toBe(15);
    }
  });

  it("Blend-Batches sinken mit der Last von 2 auf 1", () => {
    // Fog (NORMAL) + Glow (ADD) = 2 Batches, sobald Glows sichtbar sind.
    expect(ambientBatchCount(ambientBudgetFor(10))).toBe(2);
    // Im Endgame bleibt nur Fog (NORMAL) = 1 Batch.
    expect(ambientBatchCount(ambientBudgetFor(300))).toBe(1);
    expect(ambientBatchCount(ambientBudgetFor(500))).toBe(1);
  });

  it("negative/kaputte Gegnerzahl fällt auf volle Dichte zurück", () => {
    const b = ambientBudgetFor(Number.NaN as unknown as number);
    expect(b.glow).toBe(AMBIENT_GLOW_MAX);
  });
});

describe("m10-props-always-visible K3: Ambient-Hysterese + weiche Überblendung", () => {
  const FULL = { glow: 24, fog: 3, updateHz: 60 };

  it("Abstieg sofort, Rückkehr erst unter dem Hysterese-Band (kein Flapping)", () => {
    // Pendeln um die 250er-Schwelle: bei 249 -> volle Stufe bleibt (erst
    // Abstieg ab 250), bei 250 -> Stufe, bei 245 -> RÜCKKEHR auf voll.
    expect(ambientBudgetWithHysteresis(FULL, 249).updateHz).toBe(60);
    expect(ambientBudgetWithHysteresis(FULL, 250).updateHz).toBe(30);
    const stepped = ambientBudgetWithHysteresis(FULL, 300);
    expect(stepped.updateHz).toBe(30);
    // Auf der Stufe pendelt die Gegnerzahl um 250: Rückkehr erst < 210.
    expect(ambientBudgetWithHysteresis(stepped, 245).updateHz).toBe(30);
    expect(ambientBudgetWithHysteresis(stepped, 210).updateHz).toBe(30);
    expect(ambientBudgetWithHysteresis(stepped, 209).updateHz).toBe(60);
  });

  it("zweite Stufe (15 Hz) erst ab 360, Rückkehr erst < 320", () => {
    expect(ambientBudgetWithHysteresis(FULL, 360).updateHz).toBe(15);
    const deep = ambientBudgetWithHysteresis(FULL, 400);
    expect(deep.updateHz).toBe(15);
    // Pendeln um 360 lässt die 15-Hz-Stufe nicht los: Rückkehr erst < 320.
    expect(ambientBudgetWithHysteresis(deep, 355).updateHz).toBe(15);
    expect(ambientBudgetWithHysteresis(deep, 320).updateHz).toBe(15);
    // Von 15 Hz direkt zurück auf voll (unter die on-Schwelle).
    expect(ambientBudgetWithHysteresis(deep, 319).updateHz).toBe(60);
    expect(ambientBudgetWithHysteresis(deep, 209).updateHz).toBe(60);
  });

  it("weiche Überblendung: Zähler läuft mit begrenzter Rate, kein Sprung", () => {
    // 24 -> 0 bei Rate 10/s und dt 0,1 s: exakt 1 pro Schritt, kein Sprung.
    let shown = 24;
    for (let i = 0; i < 23; i++) shown = ambientShownStep(shown, 0, 10, 0.1);
    expect(shown).toBeCloseTo(1, 5);
    expect(ambientShownStep(shown, 0, 10, 0.1)).toBe(0);
    // Überschießen ist ausgeschlossen: Ziel wird exakt erreicht.
    expect(ambientShownStep(0.05, 0, 10, 1)).toBe(0);
    expect(ambientShownStep(23.95, 24, 10, 1)).toBe(24);
    // Negative/kaputte Eingaben verändern nichts Unerwartetes.
    expect(ambientShownStep(5, 0, -10, 1)).toBe(5);
    expect(ambientShownStep(Number.NaN, 7, 10, 1)).toBe(7);
  });
});
