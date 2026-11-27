import { describe, expect, it } from "vitest";
import {
  advanceSpawnBudget,
  SPAWN_FRAME_BUDGET,
  splitSpawnBurst,
} from "../src/logic/waves";

/** Deterministisches Dt-Modell: 60 fps mit realistischen Frame-Hitches. */
function dtModel(seed: number): number[] {
  // Meist 16,7 ms; alle ~150 Frames ein Hitch von 50-350 ms (wie er im
  // Endgame bzw. bei timeScale 30 gemessen wird).
  let a = seed >>> 0;
  let t = 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: number[] = [];
  for (let i = 0; i < 3600; i++) {
    const hitch = i % 150 === 0 ? 0.05 + rnd() * 0.3 : 0;
    out.push(hitch > 0 ? hitch : 1 / 60);
  }
  return out;
}

describe("splitSpawnBurst", () => {
  it("materialisiert nie mehr als die Frame-Allowance", () => {
    for (let granted = 0; granted <= 120; granted++) {
      for (const allow of [0, 1, SPAWN_FRAME_BUDGET, 64]) {
        const split = splitSpawnBurst(granted, allow);
        expect(split.now).toBeLessThanOrEqual(allow);
        expect(split.now).toBeLessThanOrEqual(granted);
      }
    }
  });

  it("erhaelt die Gesamtanzahl: now + deferred === granted", () => {
    for (let granted = 0; granted <= 120; granted++) {
      for (const allow of [0, 1, SPAWN_FRAME_BUDGET, 64]) {
        const split = splitSpawnBurst(granted, allow);
        expect(split.now + split.deferred).toBe(granted);
      }
    }
  });

  it("zieht Allowance korrekt ab und laesst sie nie negativ werden", () => {
    expect(splitSpawnBurst(3, SPAWN_FRAME_BUDGET)).toEqual({
      now: 3,
      deferred: 0,
      allowanceLeft: SPAWN_FRAME_BUDGET - 3,
    });
    expect(splitSpawnBurst(10, SPAWN_FRAME_BUDGET)).toEqual({
      now: SPAWN_FRAME_BUDGET,
      deferred: 10 - SPAWN_FRAME_BUDGET,
      allowanceLeft: 0,
    });
    expect(splitSpawnBurst(5, 0)).toEqual({ now: 0, deferred: 5, allowanceLeft: 0 });
  });

  it("Grenzfaelle 0/1 und Muellwerte (NaN/negativ/fractional)", () => {
    expect(splitSpawnBurst(0, SPAWN_FRAME_BUDGET)).toEqual({ now: 0, deferred: 0, allowanceLeft: SPAWN_FRAME_BUDGET });
    expect(splitSpawnBurst(1, 1)).toEqual({ now: 1, deferred: 0, allowanceLeft: 0 });
    expect(splitSpawnBurst(1, SPAWN_FRAME_BUDGET)).toEqual({ now: 1, deferred: 0, allowanceLeft: SPAWN_FRAME_BUDGET - 1 });
    expect(splitSpawnBurst(-5, 3)).toEqual({ now: 0, deferred: 0, allowanceLeft: 3 });
    expect(splitSpawnBurst(Number.NaN, 3)).toEqual({ now: 0, deferred: 0, allowanceLeft: 3 });
    expect(splitSpawnBurst(7, Number.NaN)).toEqual({ now: 0, deferred: 7, allowanceLeft: 0 });
    expect(splitSpawnBurst(7.9, 3.9)).toEqual({ now: 3, deferred: 4, allowanceLeft: 0 });
  });

  it("sehr viel: ein 500er-Burst wird auf >=63 Frames verteilt, Summe bleibt 500", () => {
    let allowance = SPAWN_FRAME_BUDGET;
    let remaining = 500;
    let frames = 0;
    let totalNow = 0;
    while (remaining > 0 && frames < 1000) {
      const split = splitSpawnBurst(remaining, allowance);
      totalNow += split.now;
      remaining -= split.now;
      allowance = SPAWN_FRAME_BUDGET; // neuer Frame
      frames++;
    }
    expect(totalNow).toBe(500);
    expect(frames).toBe(Math.ceil(500 / SPAWN_FRAME_BUDGET));
  });
});

describe("Spawn-Summe mit und ohne Burst-Glättung (30-min-Simulation)", () => {
  /**
   * Simuliert die Director-Semantik aus Spawner.update(): Budget sammelt
   * rate*dt, fällige Spawns werden pro echtem Frame auf
   * SPAWN_FRAME_BUDGET begrenzt und ins Restbudget zurückgestellt.
   * Kap-Druck (room) ist ausgeschlossen — genau die Basis, auf der die
   * Glättung die Spawn-Summe unverändert lassen muss.
   */
  function simulate(smoothed: boolean, dts: number[], rate: number, frameBudget = SPAWN_FRAME_BUDGET): number {
    let budget = 0;
    let allowance = frameBudget;
    let total = 0;
    let frame = 0;
    for (const dt of dts) {
      frame++;
      allowance = frameBudget; // Allowance gilt pro echtem Frame
      // Ein Frame kann mehrere Substeps haben (SIM_MAX_STEP = 1/20):
      let remaining = dt;
      while (remaining > 0.0001) {
        const step = Math.min(1 / 20, remaining);
        remaining -= step;
        const scaled = advanceSpawnBudget(budget, rate, step);
        budget = scaled.budget;
        let count = scaled.count;
        if (smoothed) {
          const split = splitSpawnBurst(count, allowance);
          allowance = split.allowanceLeft;
          if (split.deferred > 0) budget += split.deferred;
          count = split.now;
        }
        total += count;
      }
    }
    // Rückstau am Ende muss abgebaut sein, sonst verschwinden Spawns nicht,
    // sondern nur unendlich spät: Budget < 1 heißt, nichts Wesentliches hängt.
    return total;
  }

  it("Summe identisch zur ungeglaetteten Simulation (Hitch-Dt-Modell)", () => {
    const dts = dtModel(7);
    const rate = 2.3; // maximale Spawnrate (Minute 29)
    const before = simulate(false, dts, rate);
    const after = simulate(true, dts, rate);
    expect(after).toBe(before);
  });

  it("kein Frame materialisiert mehr als SPAWN_FRAME_BUDGET Spawns", () => {
    const dts = dtModel(11);
    const rate = 2.3;
    let budget = 0;
    let allowance = SPAWN_FRAME_BUDGET;
    let maxPerFrame = 0;
    for (const dt of dts) {
      allowance = SPAWN_FRAME_BUDGET;
      let frameSpawns = 0;
      let remaining = dt;
      while (remaining > 0.0001) {
        const step = Math.min(1 / 20, remaining);
        remaining -= step;
        const scaled = advanceSpawnBudget(budget, rate, step);
        budget = scaled.budget;
        const split = splitSpawnBurst(scaled.count, allowance);
        allowance = split.allowanceLeft;
        if (split.deferred > 0) budget += split.deferred;
        frameSpawns += split.now;
      }
      maxPerFrame = Math.max(maxPerFrame, frameSpawns);
    }
    expect(maxPerFrame).toBeLessThanOrEqual(SPAWN_FRAME_BUDGET);
  });

  it("Rückstau nach einem großen Hitch wird abgebaut (endet mit budget < 1)", () => {
    // 10 s Pause (Hitch) bei Maximalrate, danach normale Frames:
    const dts = [10, ...Array(120).fill(1 / 60)];
    let budget = 0;
    let allowance = SPAWN_FRAME_BUDGET;
    for (const dt of dts) {
      allowance = SPAWN_FRAME_BUDGET;
      let remaining = dt;
      while (remaining > 0.0001) {
        const step = Math.min(1 / 20, remaining);
        remaining -= step;
        const scaled = advanceSpawnBudget(budget, 2.3, step);
        budget = scaled.budget;
        const split = splitSpawnBurst(scaled.count, allowance);
        allowance = split.allowanceLeft;
        if (split.deferred > 0) budget += split.deferred;
      }
    }
    expect(budget).toBeLessThan(1);
  });
});
