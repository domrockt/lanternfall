// m10-worldview-anchor-spawner (#12771, K3): Regression gegen die worldView-Leck-Klasse
// im Spawner-Sim-Pfad (Befund m10-boss-dur-determinism K2).
//
// Phaser setzt camera.worldView AUSSCHLIESSLICH in Camera.preRender (pro Render-Frame);
// der Sim läuft in festen SIM_MAX_STEP-Teilschritten. Der frame-abhängige Render-Stand
// machte Spawn-Platzierung/Offscreen-Entscheidung RNG-stochastisch. Der Fix anchor't
// outsideView an scroll + width/2 mit logischem Screen GAME_WIDTH x GAME_HEIGHT
// (Rezept m10-boss-dur-determinism K2 Punkt 4; Umsetzung siehe
// docs/lanes/m10-spawn-view-anchor.md K2 — im Basis-Stand gemergt).
//
// Diese Datei ergänzt tests/spawn-view-anchor.test.ts (Vorläufer-Lane) um die
// Sim-Walk-Sicht: Spawn-Marken müssen über verschiedene RENDER-FRAME-RHYTHMEN
// (Teilschritte je Render-Frame) bitgleich sein, während worldView an den
// Frame-Grenzen frame-abhängig divergiert.
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) },
  },
}));

import { GAME_HEIGHT, GAME_WIDTH } from "../src/config";

/** Szene-Stub (Technik wie tests/spawn-view-anchor.test.ts). */
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

function makePool() {
  return {
    spawn: (def: unknown, x: number, y: number) => ({ x, y, def }),
    despawn: () => {},
  };
}

/** Zaehl-RNG: deterministisch, verteilt ueber [0,1) (gleiche Technik wie Vorläufer-Test). */
function makeRng() {
  let i = 0;
  return { next: () => ((i += 1) * 0.618033988749895) % 1 };
}

type SpawnerLike = {
  spawnOne: (def: unknown, playerX: number, playerY: number, elite: boolean) => { x: number; y: number };
  outsideView: (x: number, y: number, margin?: number) => boolean;
};

const DEF = { id: "bog_rat", speed: 40 };

/**
 * Sim-Walk: `steps` SIM_MAX_STEP-Teilschritte; alle `rhythm` Teilschritte geschieht ein
 * Render-Frame und worldView wird frame-abhängig neu gesetzt (Phaser.preRender-Sicht).
 * scrollX/Y wird PRO Teilschritt aus der SIM-Position gesetzt (Run.simulate,
 * m10-run-determinism-fix). Je Teilschritt eine spawnOne-Marke (2 RNG-Züge).
 */
function walkSubsteps(rhythm: number, jitter: number, SpawnerCtor: new (scene: never, pool: never, rng: never) => unknown, steps = 48): Array<[number, number]> {
  let posX = 1000;
  let posY = 900;
  const scene = makeSceneStub(GAME_WIDTH, GAME_HEIGHT, posX - GAME_WIDTH / 2, posY - GAME_HEIGHT / 2);
  const spawner = new SpawnerCtor(scene as never, makePool() as never, makeRng() as never) as unknown as SpawnerLike;
  const cam = (scene as { camera: { width: number; height: number; scrollX: number; scrollY: number; worldView: { x: number; y: number; right: number; bottom: number } } }).camera;
  const marks: Array<[number, number]> = [];
  for (let step = 0; step < steps; step++) {
    posX += 3.1;
    posY += 1.7;
    cam.scrollX = posX - cam.width / 2;
    cam.scrollY = posY - cam.height / 2;
    const e = spawner.spawnOne(DEF, posX, posY, false);
    marks.push([e.x, e.y]);
    if ((step + 1) % rhythm === 0) {
      // Frame-abhängiger Render-Stand: bewusst groß divergierend (0..jitter px),
      // damit ein worldView-Leser im Sim-Pfad sichtbar kippen würde.
      cam.worldView = {
        x: cam.scrollX + jitter,
        y: cam.scrollY + jitter * 2,
        right: cam.scrollX + cam.width - jitter,
        bottom: cam.scrollY + cam.height - jitter * 3,
      };
    }
  }
  return marks;
}

describe("Spawner-Sim-Pfad ohne camera.worldView (m10-worldview-anchor-spawner)", () => {
  let Spawner: new (scene: never, pool: never, rng: never) => unknown;

  beforeEach(async () => {
    ({ Spawner } = (await import("../src/systems/Spawner")) as never);
  });

  it("Guard: keine camera.worldView-Lesung im Spawner-Code (Kommentare ausgenommen)", () => {
    const src = readFileSync(new URL("../src/systems/Spawner.ts", import.meta.url), "utf8");
    const codeLines = (src.split("\n") as string[])
      .map((l: string) => l.trim())
      .filter((l: string) => l && !l.startsWith("*") && !l.startsWith("/*") && !l.startsWith("//"));
    expect(codeLines.join("\n")).not.toMatch(/worldView/);
  });

  it("Spawn-Marken bitgleich über Render-Frame-Rhythmen 1/2/3/5/25 — trotz worldView-Jitter", () => {
    const reference = walkSubsteps(1, 0, Spawner);
    expect(reference.length).toBe(48);
    // 25 Teilschritte je Render-Frame = Worst Case bei timeScale 30 (SIM_MAX_STEP).
    for (const rhythm of [1, 2, 3, 5, 25]) {
      for (const jitter of [0, 7, 4321]) {
        expect(walkSubsteps(rhythm, jitter, Spawner)).toEqual(reference);
      }
    }
  });

  it("Offscreen-Entscheidung deterministisch: unabhängig vom frame-abhängigen worldView-Stand (Teiler 3)", () => {
    const s = 3;
    const midX = 1500;
    const midY = 770;
    const halfW = GAME_WIDTH / (2 * s);
    const halfH = GAME_HEIGHT / (2 * s);
    const scene = makeSceneStub(GAME_WIDTH / s, GAME_HEIGHT / s, midX - halfW, midY - halfH);
    const spawner = new Spawner(scene as never, makePool() as never, makeRng() as never) as unknown as SpawnerLike;
    const cam = (scene as { camera: { width: number; height: number; scrollX: number; scrollY: number; worldView: { x: number; y: number; right: number; bottom: number } } }).camera;

    const probePoints: Array<[number, number]> = [];
    for (let dx = -520; dx <= 520; dx += 40) {
      for (let dy = -300; dy <= 300; dy += 25) {
        probePoints.push([midX + dx, midY + dy]);
      }
    }
    const reference = probePoints.map(([x, y]) => spawner.outsideView(x, y));

    // Der frame-abhängige Render-Stand driftet vom Sim-Anker weg (Jitter wechselnd),
    // aber scrollX/Y (Sim-Anker, pro Teilschritt gesetzt) bleibt fixiert — die
    // Offscreen-Entscheidung darf vom worldView-Stand NICHT abhängen.
    for (const jitter of [0, -50, 120, 9999]) {
      cam.worldView = {
        x: midX - halfW + jitter,
        y: midY - halfH - jitter,
        right: midX - halfW + cam.width + jitter,
        bottom: midY - halfH + cam.height - jitter,
      };
      expect(probePoints.map(([x, y]) => spawner.outsideView(x, y))).toEqual(reference);
    }
  });
});
