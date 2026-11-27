import { describe, expect, it, vi } from "vitest";

// HazardSystem importiert Phaser + Atlas; fuer den Unit-Test genuegen Stubs.
vi.mock("phaser", () => ({
  default: { BlendModes: { NORMAL: 0, ADD: 1 } },
}));
vi.mock("../src/gfx/atlas", () => ({
  makeImage: () => {
    const img: Record<string, unknown> = {};
    for (const m of [
      "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint",
      "setRotation", "setVisible", "destroy",
    ]) img[m] = () => img;
    return img;
  },
}));

import {
  HazardSystem,
  MIN_RIM_ALPHA,
  MIN_WARN_S,
  effectiveWarn,
  rimPulseAlpha,
} from "../src/systems/Hazards";

const fakeScene = () => ({
  tweens: { add: vi.fn() },
}) as unknown as import("phaser").Scene;

describe("Hazard-Fairness: Mindest-Warnzeit", () => {
  it("hebt den Exploder (0.16 s) auf die faire Mindest-Warnzeit an", () => {
    expect(effectiveWarn(0.16, 0.7)).toBe(MIN_WARN_S);
    expect(MIN_WARN_S).toBeCloseTo(0.45, 10);
  });

  it("laesst ausreichend lange Boss-Warnungen exakt unveraendert", () => {
    for (const w of [0.6, 0.72, 0.8, 0.9, 0.95, 1.0, 1.05, 1.2]) {
      expect(effectiveWarn(w, 0.7)).toBe(w);
    }
  });

  it("faellt bei 0/NaN/negativ auf den Default zurueck und clamped dann", () => {
    expect(effectiveWarn(undefined, 0.9)).toBe(0.9);
    expect(effectiveWarn(Number.NaN, 0.2)).toBe(MIN_WARN_S);
    expect(effectiveWarn(-1, 0.7)).toBe(MIN_WARN_S);
    expect(effectiveWarn(0, 0.7)).toBe(MIN_WARN_S);
    expect(effectiveWarn(Number.POSITIVE_INFINITY, 0.7)).toBe(0.7);
  });
});

describe("Hazard-Fairness: Rim-Puls-Sichtbarkeit", () => {
  it("Rim-Alpha bleibt ueber die ganze Warnphase >= MIN_RIM_ALPHA", () => {
    expect(MIN_RIM_ALPHA).toBeGreaterThanOrEqual(0.3);
    for (let t = 0; t <= 2; t += 0.01) {
      const a = rimPulseAlpha(t);
      expect(a, `t=${t.toFixed(2)}`).toBeGreaterThanOrEqual(MIN_RIM_ALPHA - 1e-9);
      expect(a, `t=${t.toFixed(2)}`).toBeLessThanOrEqual(MIN_RIM_ALPHA + 0.35 + 1e-9);
    }
  });

  it("Rim-Puls erreicht innerhalb einer halben Sekunde sein Maximum", () => {
    let max = 0;
    let maxT = 0;
    for (let t = 0; t <= 0.5; t += 0.001) {
      const a = rimPulseAlpha(t);
      if (a > max) { max = a; maxT = t; }
    }
    expect(max).toBeGreaterThanOrEqual(MIN_RIM_ALPHA + 0.3);
    expect(maxT).toBeLessThanOrEqual(0.5);
  });
});

describe("Hazard-Fairness: Spawn-Pfade nutzen die Mindest-Warnzeit", () => {
  it("spawnCircle mit warn 0.16 hat warnMax >= MIN_WARN_S", () => {
    const hz = new HazardSystem(fakeScene());
    const h = hz.spawnCircle(40, 40, { warn: 0.16, damage: 1, radius: 48 });
    expect(h.warnMax).toBeGreaterThanOrEqual(MIN_WARN_S - 1e-9);
  });

  it("spawnBeam mit warn 0.16 hat warnMax >= MIN_WARN_S", () => {
    const hz = new HazardSystem(fakeScene());
    const h = hz.spawnBeam(0, 0, 200, 0, { warn: 0.16, damage: 1, radius: 16 });
    expect(h.warnMax).toBeGreaterThanOrEqual(MIN_WARN_S - 1e-9);
  });

  it("Treffer beim Exploder faellt erst nach der angehobenen Warnzeit", () => {
    const hz = new HazardSystem(fakeScene());
    hz.spawnCircle(40, 40, { warn: 0.16, damage: 1, radius: 48 });
    let hits = 0;
    let t = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 300 && hits === 0; i++) {
      hz.update(dt, 40, 40, () => hits++);
      t += dt;
    }
    expect(hits).toBe(1);
    expect(t).toBeGreaterThanOrEqual(MIN_WARN_S - dt - 1e-9);
  });
});
