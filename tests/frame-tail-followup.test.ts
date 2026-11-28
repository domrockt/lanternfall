// m10-frame-tail-followup (#12290): Guards für die Reviewer-Befunde der Lane
// m10-frame-tail-batching (docs/lanes/m10-frame-tail-batching.md, Abschnitt Review):
//   Befund 1 → Dawn-Drain (Run.startDawn + Substep-Drain während Morgendämmerung,
//              hier Modell-Ebene: drainDebugQueue-Verhalten, das der Dawn-Pfad nutzt).
//   Befund 2 → Cap-Doku je Sim-Substep (Konstante gepinnt).
//   Befund 3 → reine Positions-Funktion `debugRingPosition` + RNG-Identität:
//              queueEnemyWave erzeugt (gleicher Seed, stream-aligned) bitgleich
//              dieselben Spawns wie direkte spawnEnemy-Aufrufe.
import { describe, expect, it, vi } from "vitest";
// Spawner importiert Phaser (Math.Clamp, registry); Mock muss top-level stehen.
vi.mock("phaser", () => ({
  default: {
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) },
  },
}));
import {
  debugRingPosition,
  drainSpawnQueue,
  SPAWN_DEBUG_BATCH_PER_FRAME,
  Spawner,
} from "../src/systems/Spawner";
import { SeededRng } from "../src/logic/rng";

/** Historische Inline-Formel aus spawnEnemy/queueEnemyWave VOR der Extraktion
 *  (git-Stand 1c161482) — bitgleich referenziert, damit die reine Funktion den
 *  Wert nicht verschiebt (Reviewer-Befund 3). */
function legacyRingPosition(
  next: () => number,
  playerX: number,
  playerY: number,
): { x: number; y: number } {
  const angle = next() * Math.PI * 2;
  const radius = 90 + next() * 90;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  return {
    x: clamp(playerX + Math.cos(angle) * radius, 20, 4096 - 20),
    y: clamp(playerY + Math.sin(angle) * radius, 20, 4096 - 20),
  };
}

describe("debugRingPosition (reine Positions-Funktion, Befund 3)", () => {
  it("ist bitgleich zur historischen Inline-Formel (Winkel→Radius→Clamp)", () => {
    for (const seed of [1, 101, 0xdeadbeef]) {
      const rng = new SeededRng(seed);
      const legacy = mulberry32Of(seed);
      for (let i = 0; i < 200; i++) {
        const a = debugRingPosition(rng, 2048, 2048);
        const b = legacyRingPosition(legacy, 2048, 2048);
        expect(a.x).toBe(b.x);
        expect(a.y).toBe(b.y);
      }
    }
  });

  it("zieht exakt 2 Werte je Position (Winkel zuerst, kein versteckter Draw dazwischen)", () => {
    const rng = new SeededRng(7);
    const draws = [rng.next(), rng.next(), rng.next(), rng.next()];
    const replay = new SeededRng(7);
    const first = debugRingPosition(replay, 2048, 2048);
    // Position 0 nutzt Draws 0/1; Draw 2 gehört der NÄCHSTEN Position (Stream-
    // Vertrag für Verify-Skripte, die Positionen reproduzieren wollen).
    expect(first.x).toBe(
      Math.max(20, Math.min(4096 - 20, 2048 + Math.cos(draws[0] * Math.PI * 2) * (90 + draws[1] * 90))),
    );
    expect(first.y).toBe(
      Math.max(20, Math.min(4096 - 20, 2048 + Math.sin(draws[0] * Math.PI * 2) * (90 + draws[1] * 90))),
    );
    const second = debugRingPosition(replay, 2048, 2048);
    expect(second.x).toBe(
      Math.max(20, Math.min(4096 - 20, 2048 + Math.cos(draws[2] * Math.PI * 2) * (90 + draws[3] * 90))),
    );
  });
});

/** Spawn-Protokoll des Pool-Spy: (x, y, phase, options) je Spawn in Reihenfolge. */
interface SpawnRecord { x: number; y: number; phase: number; elite: boolean; hpScale: number | undefined }

function makeSpawner(seed: number, records: SpawnRecord[]) {
  const registryData = new Map<string, unknown>();
  registryData.set("lf-elapsed", 0);
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
  const pool = {
    count: 0,
    active: [],
    spawn: (def: { id: string }, x: number, y: number, _h: number, _d: number, phase: number, options: { elite?: boolean; hpScale?: number }) => {
      records.push({ x, y, phase, elite: !!options?.elite, hpScale: options?.hpScale });
      return { def, x, y };
    },
    despawn: () => {},
  };
  return new Spawner(scene as never, pool as never, new SeededRng(seed));
}

describe("RNG-Identität queueEnemyWave vs. spawnEnemy (Befund 3)", () => {
  it("gleicher Seed, stream-aligned: beide Pfade erzeugen bitgleich dieselben Spawns", () => {
    // Stream-Alignment: beide Pfade berechnen die Position je Spawn aus 2
    // Ziehungen (Winkel, Radius). Bei n=1 sind die Streams der Pfade identisch
    // (Pos-Draws 0/1, Phase-Draw 2) — die Assertion pinnt genau die
    // draw-order-Identität, die der Reviewer per Code-Lesung verifiziert hat.
    const recA: SpawnRecord[] = [];
    const recB: SpawnRecord[] = [];
    const a = makeSpawner(101, recA);
    const b = makeSpawner(101, recB);
    a.spawnEnemy("bog_rat", 1, 2048, 2048);
    b.queueEnemyWave("bog_rat", 1, 2048, 2048);
    b.drainDebugQueue();
    expect(recA).toHaveLength(1);
    expect(recB).toHaveLength(1);
    expect(recB[0].x).toBe(recA[0].x);
    expect(recB[0].y).toBe(recA[0].y);
    expect(recB[0].phase).toBe(recA[0].phase);
    expect(recB[0].elite).toBe(recA[0].elite);
    expect(recB[0].hpScale).toBe(recA[0].hpScale);
  });

  it("queueEnemyWave legt die Positionen sofort fest — bitgleich zur reinen Funktion mit gleichem Seed", () => {
    const recB: SpawnRecord[] = [];
    const b = makeSpawner(202, recB);
    const n = 300;
    const queuedCount = b.queueEnemyWave("skeleton", n, 2048, 2048, true);
    expect(queuedCount).toBe(n);
    // Referenzstream: gleicher Seed, nur 2n Positions-Draws (Winkel, Radius).
    const ref = new SeededRng(202);
    const expected: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < n; i++) expected.push(debugRingPosition(ref, 2048, 2048));
    // Queue (privat, aber TS-private ist zur Laufzeit lesbar) enthält genau
    // diese Positionen in Reihenfolge — bitgleich (kein Rundungsschritt).
    const queue = (b as unknown as { debugQueue: Array<{ x: number; y: number; elite: boolean }> }).debugQueue;
    expect(queue).toHaveLength(n);
    for (let i = 0; i < n; i++) {
      expect(queue[i].x).toBe(expected[i].x);
      expect(queue[i].y).toBe(expected[i].y);
      expect(queue[i].elite).toBe(true);
    }
    // Materialisierung über drainDebugQueue erhält Reihenfolge + Werte exakt.
    b.drainDebugQueue();
    expect(recB).toHaveLength(SPAWN_DEBUG_BATCH_PER_FRAME);
    for (let i = 0; i < SPAWN_DEBUG_BATCH_PER_FRAME; i++) {
      expect(recB[i].x).toBe(expected[i].x);
      expect(recB[i].y).toBe(expected[i].y);
    }
  });
});

describe("Dawn-Drain (Befund 1, Modell-Ebene des Run-Drain-Pfads)", () => {
  it("drainDebugQueue ist extern aufrufbar (Run.startDawn/Substep-Drain nutzen sie)", () => {
    const spawner = makeSpawner(1, []);
    expect(typeof spawner.drainDebugQueue).toBe("function");
  });

  it("ein Drain beim Dawn-Start materialisiert Cap-30, der Substep-Drain den Rest — Summe exakt, Reihenfolge erhalten", () => {
    const rec: SpawnRecord[] = [];
    const spawner = makeSpawner(404, rec);
    const n = 80;
    spawner.queueEnemyWave("bog_rat", n, 2048, 2048);
    // Dawn-Start: ein Drain (Run.startDawn).
    spawner.drainDebugQueue();
    expect(rec).toHaveLength(SPAWN_DEBUG_BATCH_PER_FRAME);
    // Dawn läuft: Spawner.update() wird nicht aufgerufen — der Run dräniiert
    // je Sim-Substep weiter, bis die Queue leer ist (kein Leak mehr).
    let steps = 0;
    while ((spawner as unknown as { debugQueue: unknown[] }).debugQueue.length > 0 && steps < 10) {
      spawner.drainDebugQueue();
      steps += 1;
    }
    expect(rec).toHaveLength(n);
    expect((spawner as unknown as { debugQueue: unknown[] }).debugQueue).toHaveLength(0);
    // Reihenfolge exakt die der Queue (Positionen wurden bei queueEnemyWave fest).
    const ref = new SeededRng(404);
    for (let i = 0; i < n; i++) {
      const pos = debugRingPosition(ref, 2048, 2048);
      expect(rec[i].x).toBe(pos.x);
      expect(rec[i].y).toBe(pos.y);
    }
  });

  it("drainSpawnQueue verliert nie einen Eintrag (Substep-Drain-Vertrag)", () => {
    for (const cap of [1, SPAWN_DEBUG_BATCH_PER_FRAME, 100]) {
      const queue = Array.from({ length: 95 }, (_, i) => i);
      let rest = queue;
      const drained: number[] = [];
      let guard = 0;
      while (rest.length > 0 && guard < 200) {
        const { now, rest: tail } = drainSpawnQueue(rest, cap);
        drained.push(...now);
        rest = tail;
        guard += 1;
      }
      expect(drained).toEqual(queue);
    }
  });
});

/** mulberry32 (Referenzimplementierung für den Legacy-Vergleich). */
function mulberry32Of(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
