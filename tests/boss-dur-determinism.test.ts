import { describe, expect, it, vi } from "vitest";
// BossSystem importiert Phaser fuer die Szene; Unit-Test ohne DOM (Muster
// tests/boss-spawn-composition.test.ts). spawn() nutzt Phaser.Math.Clamp —
// im Mock mit derselben Semantik nachgebaut.
vi.mock("phaser", () => ({
  default: {
    Math: { Clamp: (v: number, min: number, max: number) => Math.max(min, Math.min(max, v)) },
  },
}));
import { simViewRect, type ViewRect } from "../src/logic/bosses";
import { BossSystem } from "../src/systems/BossSystem";
import { SeededRng } from "../src/logic/rng";

/**
 * m10-boss-dur-determinism (K4): Regression gegen die K2-Leck-Klasse im
 * Boss-Bereich — der Sim-Pfad darf NICHT von render-synchronisiertem
 * Kamera-Zustand abhaengen (camera.worldView wird nur im preRender gesetzt,
 * camera.zoom ist waehrend des Intro-Pulses ein Echtzeit-Tween).
 * End-to-End-Beweis (3 Seeds x 2 Laeufe bitgleich) siehe
 * docs/lanes/m10-boss-dur-determinism.md (Laufzeit-Patch, external Fix offen).
 */

interface StubCamera {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  zoom: number;
  worldView: { x: number; y: number; width: number; height: number };
  shake: () => void;
}

function stubScene(cam: Partial<StubCamera> & { width: number; height: number }) {
  const camera: StubCamera = {
    scrollX: 1000,
    scrollY: 500,
    width: cam.width,
    height: cam.height,
    zoom: cam.zoom ?? 1,
    worldView: cam.worldView ?? { x: 0, y: 0, width: 0, height: 0 },
    shake: () => {},
  };
  const scene = {
    cameras: { main: camera },
    events: { emit: () => {} },
    tweens: { add: () => {} },
    game: { scale: { height: cam.height } },
  };
  return { scene: scene as unknown as Phaser.Scene, camera };
}

function stubSystem(scene: Phaser.Scene) {
  const spawned: Array<{ x: number; y: number }> = [];
  const enemyStub = {
    uid: 7,
    sprite: { setDepth: () => {} },
    aura: { setVisible: () => {} },
  };
  const pool = {
    spawn: (_def: unknown, _x: number, y: number, _a: number, _b: number, _c: number, _o: unknown, _r: unknown) => {
      spawned.push({ x: _x, y });
      return enemyStub;
    },
  };
  const sys = new BossSystem(
    scene,
    pool as unknown as never,
    {} as never,
    {} as never,
    {} as never,
    new SeededRng(1234),
  );
  return { sys, spawned };
}

describe("simViewRect (m10-boss-dur-determinism)", () => {
  it("Teiler 1: Sim-Anker-Rect = logischer View um das Kamera-Zentrum", () => {
    const r = simViewRect(1000, 500, 640, 360, 1);
    expect(r).toEqual<ViewRect>({ x: 1000, y: 500, width: 640, height: 360 });
  });

  it("Teiler 2 und 3: Weite/Hoehe = Viewport x Teiler (enforceCameraProjection)", () => {
    // scale.height 720, camera.height 180 => s = 2; worldView bei zoom 1/2 waere 640x360... 
    // Nein: camera.width = scale.width/s => worldView.width = camera.width * s.
    expect(simViewRect(1000, 500, 320, 180, 2)).toEqual({ x: 840, y: 410, width: 640, height: 360 });
    expect(simViewRect(1000, 500, 213, 120, 3)).toEqual({
      x: 1000 + 106.5 - 319.5,
      y: 500 + 60 - 180,
      width: 639,
      height: 360,
    });
  });

  it("rein deterministisch: gleiche Eingaben -> bitgleiches Rect (kein Weltzustand)", () => {
    const a = simViewRect(4096.5, 2000.25, 480, 270, 2);
    const b = simViewRect(4096.5, 2000.25, 480, 270, 2);
    expect(a).toEqual(b);
  });
});

describe("BossSystem ohne Render-Zustand im Sim-Pfad (m10-boss-dur-determinism)", () => {
  it("viewRect ignoriert camera.worldView (K2-Leck-Klasse)", () => {
    const { scene, camera } = stubScene({ width: 640, height: 360 });
    const { sys } = stubSystem(scene);
    const expected = simViewRect(camera.scrollX, camera.scrollY, camera.width, camera.height, 1);
    const before = (sys as unknown as { viewRect: () => ViewRect }).viewRect();
    expect(before).toEqual(expected);
    // worldView "divergiert" (frame-abhaengiger Render-Stand) — das Sim-Gate darf
    // davon NICHT abhaengen.
    camera.worldView = { x: -9999, y: -9999, width: 1, height: 1 };
    const after = (sys as unknown as { viewRect: () => ViewRect }).viewRect();
    expect(after).toEqual(expected);
  });

  it("Teiler-Ableitung aus game.scale.height / camera.height (2x/3x-Buffer)", () => {
    const { scene: s2, camera: c2 } = stubScene({ width: 320, height: 180 });
    (s2 as unknown as { game: { scale: { height: number } } }).game.scale.height = 360;
    const { sys: sys2 } = stubSystem(s2);
    expect((sys2 as unknown as { viewRect: () => ViewRect }).viewRect())
      .toEqual({ x: 840, y: 410, width: 640, height: 360 });

    const { scene: s3, camera: c3 } = stubScene({ width: 213, height: 120 });
    (s3 as unknown as { game: { scale: { height: number } } }).game.scale.height = 360;
    const { sys: sys3 } = stubSystem(s3);
    const r3 = (sys3 as unknown as { viewRect: () => ViewRect }).viewRect();
    expect(r3.width).toBe(639);
    expect(r3.height).toBe(360);
    void c3;
  });

  it("Fallback: ohne game.scale (Headless/Tests) Teiler 1 aus GAME_HEIGHT/camera.height", () => {
    const { scene } = stubScene({ width: 640, height: 360 });
    // Scale-Info entfernen -> renderDivisor()-Fallback-Pfad (BossSystem.ts:421-424).
    delete (scene as unknown as { game?: unknown }).game;
    const { sys } = stubSystem(scene);
    expect((sys as unknown as { viewRect: () => ViewRect }).viewRect())
      .toEqual({ x: 1000, y: 500, width: 640, height: 360 });
  });

  it("spawn-Komposition bitgleich unabhaengig von camera.zoom (Intro-Puls ist Echtzeit)", () => {
    const positions: Array<{ x: number; y: number }> = [];
    for (const zoom of [0.5, 1, 1.14]) {
      const { scene } = stubScene({ width: 640, height: 360, zoom });
      const { sys, spawned } = stubSystem(scene);
      sys.spawn(0, 2048, 1024);
      expect(spawned.length).toBe(1);
      positions.push(spawned[0]);
    }
    expect(positions[0]).toEqual(positions[1]);
    expect(positions[1]).toEqual(positions[2]);
  });
});
