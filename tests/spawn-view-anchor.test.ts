// m10-spawn-view-anchor (#12529, K3): Regression gegen die K2-Leck-Klasse.
//
// Spawner.outsideView las camera.worldView (wird ausschliesslich in
// Camera.preRender gesetzt) — im SIM_MAX_STEP-Teilschritt-Loop sah der Spawner
// damit einen bis zu einen Render-Frame alten, frame-abhaengigen View:
// Spawn-Entscheidungen verschoben Kills/Spawns und den RNG-Ziehungsstrom ->
// stochastische Boss-Dauern (Ursachennachweis
// docs/lanes/m10-boss-dur-determinism.md K2). Der Fix anchor't outsideView an
// scrollX/Y + width/2 mit logischem Screen GAME_WIDTH x GAME_HEIGHT.
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) },
  },
}));

import { GAME_HEIGHT, GAME_WIDTH } from "../src/config";

/** Szene-Stub (Technik wie tests/spawn-burst.test.ts). */
function makeSceneStub(width: number, height: number, scrollX: number, scrollY: number) {
  const registryData = new Map<string, unknown>();
  const camera = {
    width,
    height,
    scrollX,
    scrollY,
    worldView: { x: scrollX, y: scrollY, right: scrollX + width, bottom: scrollY + height },
  };
  return {
    cameras: { main: camera },
    camera,
    registry: {
      set: (k: string, v: unknown) => registryData.set(k, v),
      get: (k: string) => registryData.get(k),
    },
    game: { loop: { frame: 1, delta: 16.7 } },
  };
}

/** Pool-Stub: gibt die Spawn-Position zurueck (wie pool.spawn sie setzt). */
function makePool() {
  return {
    spawn: (def: unknown, x: number, y: number) => ({ x, y, def }),
    despawn: () => {},
  };
}

/** Zaehl-RNG: deterministisch, verteilt ueber [0,1). */
function makeRng() {
  let i = 0;
  return { next: () => ((i += 1) * 0.618033988749895) % 1 };
}

type SpawnerLike = {
  spawnOne: (def: unknown, playerX: number, playerY: number, elite: boolean) => { x: number; y: number };
  outsideView: (x: number, y: number, margin?: number) => boolean;
};

const DEF = { id: "bog_rat", speed: 40 };

/** 24 spawnOne-Platzierungen (2 RNG-Zuege je Spawn) — Spawn-Komposition. */
function spawnBatch(spawner: SpawnerLike, playerX = 1000, playerY = 900): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < 24; i++) {
    const e = spawner.spawnOne(DEF, playerX, playerY, false);
    out.push([e.x, e.y]);
  }
  return out;
}

describe("Spawner.outsideView — Sim-Anker (m10-spawn-view-anchor)", () => {
  let Spawner: new (scene: never, pool: never, rng: never) => SpawnerLike;

  beforeEach(async () => {
    ({ Spawner } = (await import("../src/systems/Spawner")) as never);
  });

  it("Guard: keine camera.worldView-Lesung mehr im Spawner (K2-Leck-Klasse)", () => {
    const src = readFileSync(new URL("../src/systems/Spawner.ts", import.meta.url), "utf8");
    // Nur Code zählt — Kommentarzeilen duerfen die Ursache dokumentieren.
    const codeLines = (src.split("\n") as string[])
      .map((l: string) => l.trim())
      .filter((l: string) => l && !l.startsWith("*") && !l.startsWith("/*") && !l.startsWith("//"));
    expect(codeLines.join("\n")).not.toMatch(/worldView/);
  });

  it("Spawn-Platzierung bitgleich bei gleichem Seed — unabhängig von worldView-Mutationen", async () => {
    const base = makeSceneStub(GAME_WIDTH, GAME_HEIGHT, 812, 655);
    const a = new Spawner(base as never, makePool() as never, makeRng() as never);

    const reference = spawnBatch(a);

    // worldView "divergiert" heftig (frame-abhaengiger Render-Stand, wie im
    // K2-Befund): das Sim-Anker-Verhalten darf davon NICHT abhaengen.
    for (const mutated of [
      { x: -9999, y: -9999, right: -9000, bottom: -9000 },
      { x: 100000, y: 100000, right: 100640, bottom: 100360 },
      { x: 0, y: 0, right: 1, bottom: 1 },
    ]) {
      const shifted = makeSceneStub(GAME_WIDTH, GAME_HEIGHT, 812, 655);
      (shifted.camera as { worldView: unknown }).worldView = mutated;
      const b = new Spawner(shifted as never, makePool() as never, makeRng() as never);
      expect(spawnBatch(b)).toEqual(reference);
    }
  });

  it("Teiler-unabhaengig: outsideView-Entscheidung identisch bei Teiler 1/2/3 (Midpoint erhalten)", async () => {
    const midX = 1500;
    const midY = 770;
    const probePoints: Array<[number, number]> = [];
    for (let dx = -450; dx <= 450; dx += 50) {
      for (let dy = -260; dy <= 260; dy += 40) {
        probePoints.push([midX + dx, midY + dy]);
      }
    }
    const results: boolean[][] = [];
    for (const s of [1, 2, 3]) {
      const scene = makeSceneStub(GAME_WIDTH / s, GAME_HEIGHT / s, midX - GAME_WIDTH / (2 * s), midY - GAME_HEIGHT / (2 * s));
      const spawner = new Spawner(scene as never, makePool() as never, makeRng() as never);
      results.push(probePoints.map(([x, y]) => spawner.outsideView(x, y)));
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toEqual(results[2]);
  });

  it("1x-Verhalten unveraendert: Anker-View == [scroll, scroll + logischer Screen] (bis auf Phasers Floor-Rundung, hier exakt)", async () => {
    const scrollX = 812;
    const scrollY = 655;
    const scene = makeSceneStub(GAME_WIDTH, GAME_HEIGHT, scrollX, scrollY);
    const spawner = new Spawner(scene as never, makePool() as never, makeRng() as never);
    for (let x = scrollX - 60; x <= scrollX + GAME_WIDTH + 60; x += 7) {
      for (let y = scrollY - 60; y <= scrollY + GAME_HEIGHT + 60; y += 5) {
        const expected =
          x < scrollX - 16 || x > scrollX + GAME_WIDTH + 16 ||
          y < scrollY - 16 || y > scrollY + GAME_HEIGHT + 16;
        // Probeh Punkte >= 1 px von der Grenze: Phasers Integer-Rundung der
        // worldView bewegt Grenzen um <= 0,5 px — 1 px Abstand ist sicher.
        const nearEdge =
          Math.abs(x - (scrollX - 16)) <= 1 || Math.abs(x - (scrollX + GAME_WIDTH + 16)) <= 1 ||
          Math.abs(y - (scrollY - 16)) <= 1 || Math.abs(y - (scrollY + GAME_HEIGHT + 16)) <= 1;
        if (nearEdge) continue;
        expect(spawner.outsideView(x, y)).toBe(expected);
      }
    }
  });
});
