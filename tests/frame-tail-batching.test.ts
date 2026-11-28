// M10-frame-tail-batching (#11990): reine Helfer des Frame-Tail-Fixes.
// (a) drainSpawnQueue — Debug-Spawn-Pfad wird über Frames verteilt
//     (Spawner.queueEnemyWave/drainDebugQueue), Reihenfolge und Cap.
// (b) chunkInstallDue — Chunk-Installs/Texture-Uploads werden bei Rückstau
//     geglättet (GroundRenderer.finalizeReady), Steady-State bleibt sofort.
import { describe, expect, it, vi } from "vitest";
// Spawner/GroundRenderer importieren Phaser; die getesteten Helfer sind rein.
vi.mock("phaser", () => ({ default: {} }));
import { drainSpawnQueue, SPAWN_DEBUG_BATCH_PER_FRAME } from "../src/systems/Spawner";
import { CHUNK_INSTALL_MIN_INTERVAL_MS, chunkInstallDue } from "../src/gfx/GroundRenderer";

describe("drainSpawnQueue (Debug-Spawn-Batching)", () => {
  it("entnimmt bis zu cap Einträge in der ursprünglichen Reihenfolge", () => {
    const queue = [1, 2, 3, 4, 5, 6, 7];
    const { now, rest } = drainSpawnQueue(queue, 3);
    expect(now).toEqual([1, 2, 3]);
    expect(rest).toEqual([4, 5, 6, 7]);
  });

  it("leert die Queue komplett, wenn cap >= Länge", () => {
    const { now, rest } = drainSpawnQueue(["a", "b"], 10);
    expect(now).toEqual(["a", "b"]);
    expect(rest).toEqual([]);
  });

  it("cap 0 entnimmt nichts (aber der Aufrufer muss rest zurückstellen)", () => {
    const { now, rest } = drainSpawnQueue([9], 0);
    expect(now).toEqual([]);
    expect(rest).toEqual([9]);
  });

  it("leere Queue liefert leere Teilmengen", () => {
    const { now, rest } = drainSpawnQueue<number>([], 30);
    expect(now).toEqual([]);
    expect(rest).toEqual([]);
  });

  it("Summe über Frames erhält jede Spawn-Position exakt einmal (Reihenfolge)", () => {
    const all = Array.from({ length: 300 }, (_, i) => i);
    let rest = all;
    const drained: number[] = [];
    for (let frame = 0; frame < 20 && rest.length > 0; frame++) {
      const { now, rest: tail } = drainSpawnQueue(rest, SPAWN_DEBUG_BATCH_PER_FRAME);
      drained.push(...now);
      rest = tail;
    }
    expect(drained).toEqual(all);
    expect(drained.length).toBe(300);
    expect(rest).toEqual([]);
  });

  it("Obergrenze ist 30 je Frame (300er-Top-up = 10 Frames, kein 1-Frame-Burst)", () => {
    expect(SPAWN_DEBUG_BATCH_PER_FRAME).toBe(30);
  });
});

describe("chunkInstallDue (Chunk-Upload-Glättung)", () => {
  it("kein fertiger Chunk → kein Install", () => {
    expect(chunkInstallDue(0, 1000)).toBe(false);
  });

  it("genau 1 fertiger Chunk (Steady-State) → sofort, unabhängig vom Interval", () => {
    expect(chunkInstallDue(1, 0)).toBe(true);
    expect(chunkInstallDue(1, 1000)).toBe(true);
  });

  it("Rückstau: innerhalb des Mindestabstands kein weiterer Upload", () => {
    expect(chunkInstallDue(3, 0)).toBe(false);
    expect(chunkInstallDue(3, CHUNK_INSTALL_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(chunkInstallDue(3, CHUNK_INSTALL_MIN_INTERVAL_MS)).toBe(true);
  });

  it("Mindestabstand ist klein (12 ms), damit Sichtlücken nicht wachsen", () => {
    expect(CHUNK_INSTALL_MIN_INTERVAL_MS).toBe(12);
    expect(CHUNK_INSTALL_MIN_INTERVAL_MS).toBeLessThan(16.7);
  });

  it("Interval lässt sich für Tests überschreiben", () => {
    expect(chunkInstallDue(2, 5, 5)).toBe(true);
    expect(chunkInstallDue(2, 4, 5)).toBe(false);
  });
});
