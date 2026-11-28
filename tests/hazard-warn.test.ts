import { describe, expect, it, vi } from "vitest";

// HazardSystem importiert Phaser + Atlas; fuer den Unit-Test genuegen Stubs.
vi.mock("phaser", () => ({
  default: { BlendModes: { NORMAL: 0, ADD: 1 } },
}));

// makeImage-Stub, der alle setAlpha-Werte pro Sprite aufzeichnet.
vi.mock("../src/gfx/atlas", () => {
  type Stub = {
    calls: [string, unknown?][];
  } & Record<string, (...args: unknown[]) => Stub>;
  const makeImage = (): Stub => {
    const img: Record<string, unknown> = { calls: [] as [string, unknown?][] };
    const stub = img as unknown as Stub;
    for (const m of [
      "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint",
      "setRotation", "setVisible", "destroy",
    ]) {
      img[m] = (...args: unknown[]) => {
        (img.calls as [string, unknown?][]).push([m, args[0]]);
        return stub;
      };
    }
    return stub;
  };
  return { makeImage };
});

import {
  HazardSystem,
  MIN_RIM_ALPHA,
  MIN_WARN_S,
  effectiveWarn,
  rimPulseAlpha,
  warnDiscAlpha,
} from "../src/systems/Hazards";

const fakeScene = () => ({
  tweens: { add: vi.fn() },
}) as unknown as import("phaser").Scene;

describe("M10-Hazard-Warn-Fix: reine Puls-Funktionen", () => {
  it("warnDiscAlpha atmet in [0.65, 0.95] — der Disc versinkt nie im Schwarm", () => {
    for (let t = 0; t <= 3; t += 0.005) {
      const a = warnDiscAlpha(t);
      expect(a, `t=${t.toFixed(3)}`).toBeGreaterThanOrEqual(0.65 - 1e-9);
      expect(a, `t=${t.toFixed(3)}`).toBeLessThanOrEqual(0.95 + 1e-9);
    }
  });

  it("warnDiscAlpha pulsiert weiterhin sichtbar (Amplitude > 0.1)", () => {
    let min = 1;
    let max = 0;
    for (let t = 0; t <= 1; t += 0.001) {
      const a = warnDiscAlpha(t);
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
    expect(max - min).toBeGreaterThan(0.1);
  });

  it("rimPulseAlpha bleibt >= MIN_RIM_ALPHA (angehoben auf 0.35)", () => {
    expect(MIN_RIM_ALPHA).toBeGreaterThanOrEqual(0.35);
    for (let t = 0; t <= 3; t += 0.005) {
      expect(rimPulseAlpha(t), `t=${t.toFixed(3)}`).toBeGreaterThanOrEqual(MIN_RIM_ALPHA - 1e-9);
      expect(rimPulseAlpha(t), `t=${t.toFixed(3)}`).toBeLessThanOrEqual(MIN_RIM_ALPHA + 0.35 + 1e-9);
    }
  });

  it("effectiveWarn hebt kurze Warnzeiten an und laesst lange unveraendert (Regression)", () => {
    expect(effectiveWarn(0.16, 0.7)).toBe(MIN_WARN_S);
    expect(effectiveWarn(0.95, 0.7)).toBe(0.95);
    expect(effectiveWarn(Number.NaN, 0.2)).toBe(MIN_WARN_S);
  });
});

describe("M10-Hazard-Warn-Fix: HazardSystem setzt die Boeden durch", () => {
  it("spawnCircle: Disc- und Rim-Alpha bleiben ueber 2 s ueber den Minima", () => {
    const hz = new HazardSystem(fakeScene());
    hz.spawnCircle(40, 40, { warn: 0.95, damage: 1, radius: 74 });
    const h = hz.active[0];
    const discCalls: number[] = [];
    const rimCalls: number[] = [];
    const disc = h.warnSprite as unknown as { calls: [string, unknown?][] };
    const rim = h.rimSprite as unknown as { calls: [string, unknown?][] };
    const dt = 1 / 60;
    for (let i = 0; i < 120; i++) {
      hz.update(dt, 1000, 1000, () => {});
      const d = disc.calls.filter(([m]) => m === "setAlpha").at(-1)?.[1] as number;
      const r = rim.calls.filter(([m]) => m === "setAlpha").at(-1)?.[1] as number;
      if (d !== undefined) discCalls.push(d);
      if (r !== undefined) rimCalls.push(r);
    }
    expect(discCalls.length).toBe(120);
    expect(Math.min(...discCalls)).toBeGreaterThanOrEqual(0.65 - 1e-9);
    expect(Math.min(...rimCalls)).toBeGreaterThanOrEqual(MIN_RIM_ALPHA - 1e-9);
    expect(Math.max(...discCalls)).toBeLessThanOrEqual(0.95 + 1e-9);
    expect(Math.max(...rimCalls)).toBeLessThanOrEqual(MIN_RIM_ALPHA + 0.35 + 1e-9);
  });

  it("spawnBeam: Rim-Alpha bleibt ueber der Warnphase >= MIN_RIM_ALPHA", () => {
    const hz = new HazardSystem(fakeScene());
    hz.spawnBeam(0, 0, 200, 0, { warn: 0.6, damage: 1, radius: 16 });
    const rim = hz.active[0].rimSprite as unknown as { calls: [string, unknown?][] };
    const rimCalls: number[] = [];
    const dt = 1 / 60;
    for (let i = 0; i < 36; i++) {
      hz.update(dt, 1000, 1000, () => {});
      const r = rim.calls.filter(([m]) => m === "setAlpha").at(-1)?.[1] as number;
      if (r !== undefined) rimCalls.push(r);
    }
    expect(rimCalls.length).toBe(36);
    expect(Math.min(...rimCalls)).toBeGreaterThanOrEqual(MIN_RIM_ALPHA - 1e-9);
  });

  it("Trefferfaellung unveraendert: genau ein Treffer nach der vollen Warnzeit", () => {
    const hz = new HazardSystem(fakeScene());
    hz.spawnCircle(40, 40, { warn: 0.45, damage: 1, radius: 48 });
    let hits = 0;
    let t = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 120 && hits === 0; i++) {
      hz.update(dt, 40, 40, () => hits++);
      t += dt;
    }
    expect(hits).toBe(1);
    expect(t).toBeGreaterThanOrEqual(MIN_WARN_S - dt - 1e-9);
  });
});
