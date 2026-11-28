import { describe, expect, it, vi } from "vitest";
import { advanceSpawnBudget, SPAWN_FRAME_BUDGET, spawnRateForMinute } from "../src/logic/waves";
import { spawnRateFactor } from "../src/logic/scaling";
import { SeededRng } from "../src/logic/rng";
import {
  accrueSpawnAllowance,
  SPAWN_ALLOWANCE_MAX,
  SPAWN_ALLOWANCE_PER_SECOND,
  Spawner,
} from "../src/systems/Spawner";

// Spawner nutzt Phaser nur fuer Math.Clamp — Mock muss top-level stehen
// (Hoisting); Scene/Kamera/Pool werden durch Stubs ersetzt (Technik wie
// tests/spawn-burst.test.ts).
vi.mock("phaser", () => ({
  default: {
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) },
  },
}));

const TS = 30; // timeScale wie im autoPlay-/Messlauf
const SIM_MAX_STEP = 1 / 20;
const SIM_END = 170;
// Sim-alignierte Hitches (60 Sim-s): erzeugen einen Budget-Rueckstau, dessen
// Abtrag im ALTEN Verhalten an der Echtzeit-FPS hing.
const HITCHES = [
  { at: 30, len: 60 },
  { at: 90, len: 60 },
];

function makeSceneStub() {
  const registryData = new Map<string, unknown>();
  const camera = {
    width: 640,
    height: 360,
    scrollX: 2048 - 320,
    scrollY: 2048 - 180,
    worldView: { x: 2048 - 320, y: 2048 - 180, right: 2048 + 320, bottom: 2048 + 180 },
  };
  const scene = {
    cameras: { main: camera },
    registry: {
      set: (k: string, v: unknown) => registryData.set(k, v),
      get: (k: string) => registryData.get(k),
    },
    game: { loop: { frame: 0, delta: 16.7 } },
  };
  return { scene, registry: registryData };
}

const POOL = { count: 0, active: [], spawn: (def: { id: string }, _x: number, _y: number, _h: number, _d: number, _p: number, options: { elite?: boolean }) => ({ def, elite: !!options?.elite }), despawn: () => {} };

interface Mark { t: number; id: string; elite: boolean }

/**
 * Simuliert die Run.update-Teilschritt-Fuehrung als ganzzahlige
 * Substep-Rationen a SIM_MAX_STEP (Modell der geplanten Run-Quantifizierung):
 * sim = steps * SIM_MAX_STEP ohne Akkumulations-Drift, alle Szenarien bleiben
 * auf dem 0,05-s-Grid. Variiert wird NUR die Ration je ECHTEM Frame
 * (60 fps -> 10 Rationen, 30 fps -> 20, Jitter -> 5..25) — genau die
 * Frame-Anzahl-Abhaengigkeit, die der Fix entfernen soll. Der Float-Drift
 * der variablen Run-Akkumulation ist Gegenstand von m10-run-determinism-fix.
 */
function simulate(pattern: (frame: number) => number, seed: number, noHitch = false) {
  const { scene, registry } = makeSceneStub();
  const spawner = new Spawner(scene as never, POOL as never, new SeededRng(seed));
  const marks: Mark[] = [];
  const STEP = SIM_MAX_STEP;
  let steps = 0;
  let frame = 0;
  const hitchesLeft = noHitch ? [] : HITCHES.map((h) => ({ ...h }));
  while (steps * STEP < SIM_END - 1e-9) {
    frame += 1;
    scene.game.loop.frame = frame;
    const normal = pattern(frame);
    const next = hitchesLeft[0];
    let substeps = normal;
    if (next) {
      const atStep = Math.round(next.at / STEP);
      if (steps < atStep && steps + normal >= atStep) substeps = atStep - steps;
      else if (steps >= atStep) {
        substeps = Math.round(next.len / STEP);
        hitchesLeft.shift();
      }
    }
    scene.game.loop.delta = ((substeps * STEP) / TS) * 1000;
    for (let i = 0; i < substeps && steps * STEP < SIM_END - 1e-9; i++) {
      steps += 1;
      const sim = steps * STEP;
      registry.set("lf-elapsed", sim);
      for (const e of spawner.update(sim, STEP, 2048, 2048)) {
        marks.push({ t: sim, id: (e as { def: { id: string } }).def.id, elite: !!(e as { elite?: boolean }).elite });
      }
    }
  }
  return { marks, spawner, frames: frame, steps };
}

const PATTERNS: Array<[string, (frame: number) => number]> = [
  ["60fps", () => 10],
  ["30fps", () => 20],
  ["jitter", (frame) => [5, 10, 15, 20, 25][(frame * 7) % 5]],
];

describe("accrueSpawnAllowance (dt-Akkumulator)", () => {
  it("waechst mit Sim-dt mit Referenz 480 Spawns/Sim-s (8 je 60-Hz-Frame)", () => {
    expect(SPAWN_ALLOWANCE_PER_SECOND).toBe(SPAWN_FRAME_BUDGET * 60);
    expect(accrueSpawnAllowance(0, 1 / 60)).toBeCloseTo(SPAWN_FRAME_BUDGET, 9);
    expect(accrueSpawnAllowance(0, 1 / 30)).toBeCloseTo(SPAWN_FRAME_BUDGET * 2, 9);
  });

  it("decktelt den Akkumulator (kein unbegrenzter Burst nach Kap-Druck/Hitch)", () => {
    expect(accrueSpawnAllowance(0, 1000)).toBe(SPAWN_ALLOWANCE_MAX);
    expect(accrueSpawnAllowance(SPAWN_ALLOWANCE_MAX, 5)).toBe(SPAWN_ALLOWANCE_MAX);
  });

  it("ignoriert negative dt und NaN-Reststaende", () => {
    expect(accrueSpawnAllowance(3, -1)).toBe(3);
    expect(accrueSpawnAllowance(Number.NaN, 1)).toBe(SPAWN_ALLOWANCE_MAX);
  });

  it("ganzzahliger Abgriff: gezeichnete Allowance + Rest == Zuwachs (kein Verlust)", () => {
    let acc = 0;
    let drawn = 0;
    for (const dt of [0.007, 0.003, 0.011]) {
      acc = accrueSpawnAllowance(acc, dt);
      const whole = Math.floor(acc);
      acc -= whole;
      drawn += whole;
    }
    expect(drawn + acc).toBeCloseTo(SPAWN_ALLOWANCE_PER_SECOND * 0.021, 9);
  });
});

describe("Determinismus: Spawn-Marken unabhaengig von der Frame-Folge", () => {
  it("gleicher Seed + gleiche Sim-Zeit -> bitgleiche Marken/Counts/Budget (60fps vs 30fps vs jitter, mit Hitches)", () => {
    const runs = PATTERNS.map(([name, pattern]) => ({ name, ...simulate(pattern, 20261128) }));
    const reference = runs[0];
    expect(reference.marks.length).toBeGreaterThan(50);
    for (const run of runs.slice(1)) {
      expect(run.marks, `Marken ${run.name} vs ${reference.name}`).toEqual(reference.marks);
      expect(run.spawner.spawnCounts, `spawnCounts ${run.name}`).toEqual(reference.spawner.spawnCounts);
      expect(run.spawner.budget, `Budget-Rest ${run.name}`).toBeCloseTo(reference.spawner.budget, 9);
    }
  });

  it("auch ohne Hitches bitgleich (Basisfall ohne Rueckstau)", () => {
    const a = simulate(PATTERNS[0][1], 20261128, true);
    const b = simulate(PATTERNS[1][1], 20261128, true);
    expect(b.marks).toEqual(a.marks);
  });
});

describe("Gesamt-Spawn-Zahl je Welle unveraendert", () => {
  /** Ungeglaettete Referenz: Budget akkumuliert rate*dt, ganzzahliger
   *  Abgriff, Rest bleibt — genau die Basis, die die Glaettung nicht
   *  veraendern darf. Wellengrenze wie im Spiel ueber elapsed NACH dem
   *  Teilschritt (Run.ts: this.elapsed += dt; spawner.update(this.elapsed...)). */
  function reference(steps: number) {
    const factor = spawnRateFactor(640, 360);
    let budget = 0;
    let integral = 0;
    const perMinute: Record<number, number> = {};
    for (let s = 1; s <= steps; s++) {
      const minute = Math.floor((s * SIM_MAX_STEP) / 60);
      const rate = spawnRateForMinute(minute) * factor;
      integral += rate * SIM_MAX_STEP;
      const scaled = advanceSpawnBudget(budget, rate, SIM_MAX_STEP);
      budget = scaled.budget;
      perMinute[minute] = (perMinute[minute] ?? 0) + scaled.count;
    }
    return { budget, integral, perMinute };
  }

  it("materialisiert + Budget-Rest == integral(rate) ueber die tatsaechlichen Substeps", () => {
    const { marks, spawner, steps } = simulate(PATTERNS[0][1], 20261128);
    const ref = reference(steps);
    expect(marks.length + spawner.budget).toBeCloseTo(ref.integral, 6);
  });

  it("Verteilung je Welle == ungeglaettete Referenz (advanceSpawnBudget ohne Allowance)", () => {
    for (const [name, pattern] of PATTERNS) {
      const { marks, steps } = simulate(pattern, 20261128);
      const ref = reference(steps);
      const gotPerMinute: Record<number, number> = {};
      for (const m of marks) {
        const minute = Math.floor(m.t / 60);
        gotPerMinute[minute] = (gotPerMinute[minute] ?? 0) + 1;
      }
      expect(gotPerMinute, `Pattern ${name}`).toEqual(ref.perMinute);
    }
  });

  it("kein Substep materialisiert mehr als SPAWN_ALLOWANCE_MAX Spawns (Burst-Deckel bleibt)", () => {
    const { scene, registry } = makeSceneStub();
    const spawner = new Spawner(scene as never, POOL as never, new SeededRng(5));
    spawner.budget = 500; // grosser Rueckstau (Kap-Druck/Hitch)
    let maxPerStep = 0;
    for (let i = 0; i < 40; i++) {
      scene.game.loop.frame = i + 1;
      maxPerStep = Math.max(maxPerStep, spawner.update(i / 60, SIM_MAX_STEP, 2048, 2048).length);
    }
    expect(maxPerStep).toBeLessThanOrEqual(SPAWN_ALLOWANCE_MAX);
    expect(spawner.budget).toBeLessThan(SPAWN_ALLOWANCE_MAX); // Rueckstau wird abgetragen
  });
});
