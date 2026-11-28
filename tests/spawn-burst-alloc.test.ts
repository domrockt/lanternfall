import { describe, expect, it, vi } from "vitest";
import { SeededRng } from "../src/logic/rng";
import { maxActiveEnemies } from "../src/logic/scaling";
import { Spawner } from "../src/systems/Spawner";

// Spawner nutzt Phaser nur fuer Math.Clamp — Mock muss top-level stehen
// (Hoisting); Scene/Kamera/Pool werden durch Stubs ersetzt (Technik wie
// tests/spawn-budget-dt.test.ts).
vi.mock("phaser", () => ({
  default: {
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) },
  },
}));

/**
 * m10-spawn-burst-alloc (#12092): friert die Hebel aus K2 ein —
 * (a) kein Mix-Neuaufbau (`Object.entries`/`Object.values`) je Spawn,
 * (b) wiederverwendete Spawn-Options (Identitaet statt Literal je Spawn),
 * (c) Spawn-Sequenz bitgleich ueber feste Seeds (golden, Distribution/Phasen).
 */

const DT = 0.5; // Sim-Dt bei timeScale 30 / 60 fps (Burst-Fenster)
const VIEW_W = 960;
const VIEW_H = 540;
const MINUTE_25 = 1500; // Sekunden (Endgame, Late-Game-Mix)
const BUDGET_BACKLOG = 32; // Rueckstau > Allowance (16) -> 16 Spawns je Tick

function makeSceneStub() {
  const registryData = new Map<string, unknown>();
  const camera = {
    width: VIEW_W,
    height: VIEW_H,
    scrollX: 0,
    scrollY: 0,
    worldView: { x: 0, y: 0, right: VIEW_W, bottom: VIEW_H },
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

interface SpawnRecord {
  def: { id: string };
  elite: boolean;
  x: number;
  y: number;
}

/** Stub-Pool mit Free-List (wie der echte Pool im Reuse-Fall) und
 *  Options-Referenz-Aufzeichnung fuer den Identitaet-Hebel. */
function makePool() {
  const free: SpawnRecord[] = [];
  const active: SpawnRecord[] = [];
  const optionsSeen: Array<{ options: unknown; elite: boolean }> = [];
  const pool = {
    active,
    get count() {
      return active.length;
    },
    spawn(
      def: { id: string },
      x: number,
      y: number,
      _hp: number,
      _dmg: number,
      _phase: number,
      options: { elite?: boolean } | undefined,
    ): SpawnRecord {
      const e = free.pop() ?? ({ def: { id: "" }, elite: false, x: 0, y: 0 } as SpawnRecord);
      e.def = def;
      e.x = x;
      e.y = y;
      e.elite = Boolean(options?.elite);
      optionsSeen.push({ options, elite: e.elite });
      active.push(e);
      return e;
    },
    despawn(e: SpawnRecord) {
      const i = active.indexOf(e);
      if (i >= 0) active.splice(i, 1);
      free.push(e);
    },
    optionsSeen,
  };
  return pool;
}

/** Burst-Szenario (Minute 25, Pool am Cap minus Burst-Raum, Rueckstau 32):
 *  liefert die Spawn-Marken je Tick. Kill-Churn haelt den Pool im
 *  Steady State (exakt die frisch gespawnten kehren in die Free-List). */
function runBurst(seed: number, ticks: number) {
  const { scene, registry } = makeSceneStub();
  const pool = makePool();
  const spawner = new Spawner(scene as never, pool as never, new SeededRng(seed));
  const cap = maxActiveEnemies(MINUTE_25, VIEW_W, VIEW_H);
  for (let i = 0; i < cap - 16; i++) {
    pool.active.push({ def: { id: "filler" }, elite: false, x: 0, y: 0 });
  }
  const ticksSpawned: SpawnRecord[][] = [];
  for (let t = 0; t < ticks; t++) {
    const elapsed = MINUTE_25 + t * DT;
    registry.set("lf-elapsed", elapsed);
    scene.game.loop.frame = t + 1;
    spawner.budget = BUDGET_BACKLOG;
    const spawned = spawner.update(elapsed, DT, VIEW_W / 2, VIEW_H / 2) as SpawnRecord[];
    ticksSpawned.push(spawned);
    for (let k = 0; k < spawned.length; k++) pool.despawn(pool.active[pool.active.length - 1]);
  }
  return { pool, spawner, ticksSpawned, cap };
}

function fnv1a(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const sequenceHash = (ticksSpawned: SpawnRecord[][]): number =>
  ticksSpawned.reduce(
    (h, tick) =>
      fnv1a(
        tick.map((e) => `${e.def.id}|${Math.round(e.x)}|${Math.round(e.y)}|${e.elite ? 1 : 0};`).join(""),
        h,
      ),
    0x811c9dc5,
  );

describe("m10-spawn-burst-alloc: Hebel eingefroren", () => {
  it("(a) Burst-Tick baut die Mix-Tabelle NICHT neu auf (0 Object.entries/values)", () => {
    const { scene, registry } = makeSceneStub();
    const pool = makePool();
    const spawner = new Spawner(scene as never, pool as never, new SeededRng(1));
    const cap = maxActiveEnemies(MINUTE_25, VIEW_W, VIEW_H);
    for (let i = 0; i < cap - 16; i++) {
      pool.active.push({ def: { id: "filler" }, elite: false, x: 0, y: 0 });
    }
    registry.set("lf-elapsed", MINUTE_25);
    scene.game.loop.frame = 1;
    spawner.budget = BUDGET_BACKLOG;
    spawner.update(MINUTE_25, DT, VIEW_W / 2, VIEW_H / 2); // erster Tick (Minute-Grenze)

    let entriesCalls = 0;
    let valuesCalls = 0;
    const origEntries = Object.entries;
    const origValues = Object.values;
    Object.entries = (...args: Parameters<typeof Object.entries>) => {
      entriesCalls++;
      return origEntries(...args);
    };
    Object.values = (...args: Parameters<typeof Object.values>) => {
      valuesCalls++;
      return origValues(...args);
    };
    try {
      // 10 weitere Burst-Ticks mit je 16 Spawns (kein Minutenwechsel mehr).
      for (let t = 1; t <= 10; t++) {
        registry.set("lf-elapsed", MINUTE_25 + t * DT);
        scene.game.loop.frame = t + 1;
        spawner.budget = BUDGET_BACKLOG;
        spawner.update(MINUTE_25 + t * DT, DT, VIEW_W / 2, VIEW_H / 2);
        for (let k = 0; k < 16; k++) pool.despawn(pool.active[pool.active.length - 1]);
      }
    } finally {
      Object.entries = origEntries;
      Object.values = origValues;
    }
    expect([entriesCalls, valuesCalls]).toEqual([0, 0]);
  });

  it("(b) pool.spawn erhaelt im Burstfall DIESELBE Options-Referenz (Scratch statt Literal)", () => {
    const { ticksSpawned, pool } = runBurst(1, 3);
    expect(ticksSpawned.every((t) => t.length === 16)).toBe(true);
    const nonElite = pool.optionsSeen.filter((o) => !o.elite);
    const elite = pool.optionsSeen.filter((o) => o.elite);
    expect(nonElite.length).toBeGreaterThan(0);
    const nonEliteRefs = new Set(nonElite.map((o) => o.options));
    expect(nonEliteRefs.size).toBe(1); // ein Scratch statt 48 Literale
    if (elite.length > 0) {
      expect(new Set(elite.map((o) => o.options)).size).toBe(1);
    }
  });

  it("(c) Spawn-Sequenz ist bitgleich ueber feste Seeds (golden + Reproduktion)", () => {
    const run1 = runBurst(1, 200);
    const run2 = runBurst(1, 200);
    // Golden-Checksum (Seed 1, 200 Ticks): friert Phasen + Tier-Verteilung ein.
    expect(sequenceHash(run1.ticksSpawned)).toBe(3879981957);
    // Gleicher Seed -> bitgleich dieselbe Sequenz.
    expect(sequenceHash(run2.ticksSpawned)).toBe(sequenceHash(run1.ticksSpawned));
    // Unterschiedliche Seeds -> unterschiedliche Sequenzen (kein Konstant-Wert).
    const run3 = runBurst(2, 200);
    expect(sequenceHash(run3.ticksSpawned)).not.toBe(sequenceHash(run1.ticksSpawned));
  });
});
