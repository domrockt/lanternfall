// M10-fps-cap-stackfix: Regression-Tests zur RangeError-Regression (Game-Loop-Tod).
//
// Befund (K1-Stack, ~/games/.evidence/m10-fps-cap-stackfix/k1-stack-vorher.json):
//   Spawner.drainDebugQueue repushte die nicht gedräinte Rest-Queue per
//   `this.debugQueue.push(...rest)` — Spread übergibt ALLE Einträge als
//   Funktionsargumente; ab ~100–150k Einträgen stirbt der Aufruf mit
//   "RangeError: Maximum call stack size exceeded" (keine JS-Frame-Rekursion:
//   der Stack wird von der Argumentliste verbraucht, deshalb zeigt der Stack
//   nur drainDebugQueue → update → Run.simulate → … ohne Wiederholung).
//   Der m25-Top-up (alle 50 ms auf 300 Gegner) übersteigt den Drain (30 je
//   Sim-Substep) unter Last, die Queue wächst unbeschränkt, der nächste Drain
//   crasht — am Gerät 9× je 10-min-Lauf (deckungsgleich 9 Frozen-Loops).
//
// Fix (K2): Front-Entnahme per slice+splice — konstante Argumentzahl,
// Spawn-Reihenfolge und Batchgrösse (30 je Drain) bitgleich.
import { describe, expect, it, vi } from "vitest";
// Spawner importiert Phaser (Math.Clamp, registry); Mock muss top-level stehen.
vi.mock("phaser", () => ({
  default: {
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) },
  },
}));
import { SPAWN_DEBUG_BATCH_PER_FRAME, Spawner } from "../src/systems/Spawner";
import { SeededRng } from "../src/logic/rng";

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
    spawn: (def: { id: string }, x: number, y: number, _h: number, _d: number, phase: number, options: { elite?: boolean; hpScale?: number }) => {
      records.push({ x, y, phase, elite: !!options?.elite, hpScale: options?.hpScale });
      return { def, x, y };
    },
    despawn: () => {},
  };
  return new Spawner(scene as never, pool as never, new SeededRng(seed));
}

describe("M10-fps-cap-stackfix: RangeError-Regression (Frozen-Loop unter Last)", () => {
  // Stackgrenze laut K1-Mikro-Messung: 100k Argumente noch ok, 150k nicht.
  // 200k ist mit Sicherheit jenseits der Grenze und bleibt im Test schnell.
  const N = 200_000;

  it("Gegenprobe Mechanismus: push(...rest) mit ~200k Einträgen wirft genau diesen RangeError", () => {
    const q: number[] = [];
    expect(() => q.push(...new Array(N).fill(1))).toThrow(RangeError);
  });

  it("Drain bei ~200k Queue-Einträgen wirft NICHT und materialisiert exakt 30 (Regression K2)", () => {
    const rec: SpawnRecord[] = [];
    const spawner = makeSpawner(11, rec);
    const queue = (spawner as unknown as { debugQueue: Array<{ def: { id: string }; x: number; y: number; elite: boolean; hpScale: number }> }).debugQueue;
    for (let i = 0; i < N; i++) queue.push({ def: { id: "bog_rat" }, x: 100 + i, y: 200, elite: false, hpScale: 1 });
    // Genau der Aufruf, der im K1-Stack crashte (drainDebugQueue ← Spawner.update):
    expect(() => spawner.drainDebugQueue()).not.toThrow();
    expect(rec).toHaveLength(SPAWN_DEBUG_BATCH_PER_FRAME);
    expect(rec[0].x).toBe(100); // ältester Eintrag zuerst — Reihenfolge erhalten
    expect(rec[SPAWN_DEBUG_BATCH_PER_FRAME - 1].x).toBe(100 + SPAWN_DEBUG_BATCH_PER_FRAME - 1);
    expect(queue).toHaveLength(N - SPAWN_DEBUG_BATCH_PER_FRAME);
  });

  it("weitere Drains folgen derselben Ordnung (Modell: drainSpawnQueue-Semantik, bitgleich zum Vorgängercode)", () => {
    const rec: SpawnRecord[] = [];
    const spawner = makeSpawner(12, rec);
    const queue = (spawner as unknown as { debugQueue: Array<{ def: { id: string }; x: number; y: number; elite: boolean; hpScale: number }> }).debugQueue;
    for (let i = 0; i < N; i++) queue.push({ def: { id: "bog_rat" }, x: 100 + i, y: 0, elite: false, hpScale: 1 });
    spawner.drainDebugQueue();
    spawner.drainDebugQueue();
    spawner.drainDebugQueue();
    expect(rec).toHaveLength(3 * SPAWN_DEBUG_BATCH_PER_FRAME);
    for (let i = 0; i < rec.length; i++) expect(rec[i].x).toBe(100 + i);
  });

  it("leere Queue: Drain ist No-op (Vertrag unverändert)", () => {
    const rec: SpawnRecord[] = [];
    const spawner = makeSpawner(13, rec);
    expect(() => spawner.drainDebugQueue()).not.toThrow();
    expect(rec).toHaveLength(0);
  });
});

describe("M10-fps-cap-stackfix: Desktop-Pfad (kein Cap) unberührt", () => {
  it("Drain-Verhalten ist plattformunabhängig — Batchgrösse und Reihenfolge wie im Vorgänger (Vergleich gegen reines Modell)", () => {
    // Reines Modell des Vorgängercodes (drainSpawnQueue + Rest-Repush) am
    // 80er-Bestand: identische Batches/Reihenfolge wie der Fix.
    const rec: SpawnRecord[] = [];
    const spawner = makeSpawner(14, rec);
    const n = 80;
    spawner.queueEnemyWave("bog_rat", n, 2048, 2048);
    spawner.drainDebugQueue();
    spawner.drainDebugQueue();
    spawner.drainDebugQueue();
    expect(rec).toHaveLength(n);
    // Referenzstream: queueEnemyWave legte je Position 2 Draws fest (Winkel,
    // Radius) — die Spawns müssen exakt diesem Stream folgen (Reihenfolge).
    const ref = new SeededRng(14);
    for (let i = 0; i < n; i++) {
      const angle = ref.next() * Math.PI * 2;
      const radius = 90 + ref.next() * 90;
      const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
      const x = clamp(2048 + Math.cos(angle) * radius, 20, 4096 - 20);
      const y = clamp(2048 + Math.sin(angle) * radius, 20, 4096 - 20);
      expect(rec[i].x).toBe(x);
      expect(rec[i].y).toBe(y);
    }
  });
});
