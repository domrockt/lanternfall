import { describe, expect, it } from "vitest";
import {
  AMBIENT_FOG_MAX, AMBIENT_GLOW_MAX, ambientBatchCount, ambientBudgetFor,
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
