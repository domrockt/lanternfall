/**
 * m10-worldview-anchor-pools: Guard-Tests für den deterministischen
 * Sim-Anker der Schuss-Pfade.
 *
 * Bedarf: m10-boss-dur-determinism K2 — camera.worldView wird nur in
 * Camera.preRender gesetzt (pro Render-Frame); der Sim läuft in festen
 * SIM_MAX_STEP-Teilschritten. worldView-Leser im Teilschritt-Loop sind
 * frame-abhängig → RNG-Divergenz (Beleg
 * ~/games/.evidence/m10-worldview-anchor-pools/m10-worldview-anchor-before.json,
 * erste Divergenz exakt im `culled`-Zähler bei s=42/52/50).
 */
import { describe, expect, it, vi } from "vitest";

// Phaser/atlas werden gestubbt (Unit-Test ohne Fenster); die Pool-Pfade
// (spawn/compact/refreshView) laufen echt — wie tests/enemy-shots-fair.
vi.mock("phaser", () => ({
  default: { BlendModes: { NORMAL: 0, ADD: 1 }, Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) } },
}));
vi.mock("../src/gfx/atlas", () => ({
  makeImage: () => {
    const img: Record<string, unknown> = {};
    for (const m of [
      "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint", "clearTint",
      "setRotation", "setVisible", "setActive", "setPosition", "setTexture", "destroy",
    ]) img[m] = () => img;
    return img;
  },
  applyTexture: () => undefined,
}));

type ViewBox = { x: number; y: number; width: number; height: number };

interface CameraStub {
  /** Lesezugriff schlägt ALARM — der Sim-Pfad darf worldView nie berühren. */
  get worldView(): ViewBox;
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
}

interface LeakScene {
  cameras: { main: CameraStub };
  game: { loop: { frame: number } };
  registry: { get: (k: string) => number };
  tweens: { add: ReturnType<typeof vi.fn> };
  enemies: { active: Array<{ x: number; y: number; alive: boolean }> };
  textures: { exists: () => boolean; addCanvas: () => void };
  add: { image: () => Record<string, unknown> };
}

const { GAME_WIDTH, GAME_HEIGHT, setGameView } = await import("../src/config");
const { ProjectilePool, simAnchorView } = await import("../src/systems/ProjectilePool");
const { EnemyProjectilePool } = await import("../src/systems/EnemyProjectiles");

function leakCamera(view: ViewBox): CameraStub {
  return {
    get worldView(): ViewBox {
      throw new Error("worldView-Lesezugriff im Sim-Pfad (m10-worldview-anchor-pools Leck)");
    },
    scrollX: view.x,
    scrollY: view.y,
    width: view.width,
    height: view.height,
  };
}

function leakScene(view: ViewBox): LeakScene {
  const img = () => {
    const o: Record<string, unknown> = {};
    for (const m of [
      "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint", "clearTint",
      "setRotation", "setVisible", "setActive", "setPosition", "setTexture", "destroy",
    ]) o[m] = () => o;
    return o;
  };
  return {
    cameras: { main: leakCamera(view) },
    game: { loop: { frame: 1 } },
    registry: { get: () => 1 },
    tweens: { add: vi.fn() },
    enemies: { active: [] },
    textures: { exists: () => true, addCanvas: vi.fn() },
    add: { image: () => img() },
  };
}

const spawnOpts = {
  x: 10, y: 10, vx: 40, vy: 0, damage: 2, pierce: 0, knockback: 0,
  texture: "projectile_ember",
};

const noopHit = () => undefined;

describe("simAnchorView (reine Anker-Funktion)", () => {
  it("Teiler 1: identisch zur worldView-Geometrie (scroll ± (W/2, H/2))", () => {
    // Bei Teiler 1 ist camera.width = GAME_WIDTH; Phaser setzt worldView auf
    // scroll ± (width/2, height/2). Der Anker muss exakt dasselbe liefern.
    const r = simAnchorView(1000, 2000, GAME_WIDTH, GAME_HEIGHT);
    expect(r).toEqual({ x: 1000, y: 2000, width: GAME_WIDTH, height: GAME_HEIGHT });
  });

  it("Teiler 2: Weite/Höhe = logischer Screen, Mitte = scroll + cameraWidth/2 (worldView bei zoom=1/2)", () => {
    // camera.width = GAME_WIDTH/2 bei zoom = 1/2; worldView.width = camera.width/zoom
    // = GAME_WIDTH, worldView-Mitte = scroll + camera.width/2. Anker = dieselbe
    // Geometrie bis auf Phasers Floor-Rundung (~0,5 px).
    const r = simAnchorView(500, 300, GAME_WIDTH / 2, GAME_HEIGHT / 2);
    expect(r.width).toBe(GAME_WIDTH);
    expect(r.height).toBe(GAME_HEIGHT);
    expect(r.x + r.width / 2).toBe(500 + GAME_WIDTH / 4);
    expect(r.y + r.height / 2).toBe(300 + GAME_HEIGHT / 4);
  });

  it("rein: gleiche Eingaben, bitgleiches Ergebnis — kein worldView-Einfluss", () => {
    const a = simAnchorView(123.5, -77.25, 320, 180);
    const b = simAnchorView(123.5, -77.25, 320, 180);
    expect(a).toEqual(b);
    expect(a.width).toBe(GAME_WIDTH);
    expect(a.height).toBe(GAME_HEIGHT);
  });

  it("Out-Param: schreibt in-place (identische Instanz zurück), kein Objekt je Aufruf", () => {
    const scratch = { x: -1, y: -1, width: -1, height: -1 };
    const r = simAnchorView(100, 200, 640, 360, scratch);
    expect(r).toBe(scratch); // Identität erhalten — 0 Allokationen im Frame-Pfad
    expect(r).toEqual({ x: 100, y: 200, width: GAME_WIDTH, height: GAME_HEIGHT });
    // Zweiter Aufruf überschreibt in-place:
    const r2 = simAnchorView(500, 600, 320, 180, scratch);
    expect(r2).toBe(scratch);
    expect(r2).toEqual({ x: 500 + 160 - GAME_WIDTH / 2, y: 600 + 90 - GAME_HEIGHT / 2, width: GAME_WIDTH, height: GAME_HEIGHT });
  });

  it("Mitte folgt nur scroll + cameraWidth/2, auch wenn sich der logische Screen ändert (#4658)", () => {
    const before = simAnchorView(800, 400, 390, 180);
    try {
      setGameView(780, 360, 1);
      const after = simAnchorView(800, 400, 390, 180);
      // Mitte unverändert (Anker am Kamera-Zentrum), Weite/Höhe folgen dem Screen:
      expect(after.x + after.width / 2).toBe(before.x + before.width / 2);
      expect(after.y + after.height / 2).toBe(before.y + before.height / 2);
      expect(after.width).toBe(780);
      expect(after.height).toBe(360);
    } finally {
      setGameView(640, 360, 1);
    }
  });
});

describe("ProjectilePool.view(): Sim-Anker statt worldView", () => {
  it("compact() liest den Anker — worldView wird im Teilschritt-Pfad nie berührt", () => {
    const pool = new ProjectilePool(leakScene({ x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT }) as never);
    pool.spawn({ ...spawnOpts, x: 1000, y: 10 }); // weit offscreen (cull-Marge)
    pool.spawn({ ...spawnOpts, x: 10, y: 10 }); // im View
    expect(() => pool.compact()).not.toThrow();
    expect(pool.stats.culled).toBe(1);
    expect(pool.active.length).toBe(1);
    expect(pool.active[0].x).toBe(10);
  });

  it("Anker-Rect: cull-Entscheidung entspricht der worldView bei Teiler 1", () => {
    // worldView bei Teiler 1 wäre { x: 960, y: 540, width: GAME_WIDTH, ... }:
    const pool = new ProjectilePool(
      leakScene({ x: 960, y: 540, width: GAME_WIDTH, height: GAME_HEIGHT }) as never,
    );
    pool.spawn({ ...spawnOpts, x: 960 + GAME_WIDTH + 100, y: 540, vx: 40, vy: 0 }); // im Cull-Margin
    pool.spawn({ ...spawnOpts, x: 960 + GAME_WIDTH + 400, y: 540, vx: 40, vy: 0 }); // weit draußen
    pool.compact();
    expect(pool.stats.culled).toBe(1); // nur das weit draußen liegende
    expect(pool.active[0].x).toBe(960 + GAME_WIDTH + 100);
  });
});

describe("EnemyProjectilePool.refreshView(): Sim-Anker statt worldView", () => {
  it("spawn() liest den Anker — worldView wird im Teilschritt-Pfad nie berührt", () => {
    const scene = leakScene({ x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT });
    const pool = new EnemyProjectilePool(scene as never);
    // Ursprung weit offscreen: Gate greift, kein Schuss.
    const shot = pool.spawn({ x: GAME_WIDTH + 500, y: 60, vx: 100, vy: 0, damage: 3, texture: "enemy_shot_shadow" });
    expect(shot).toBeNull();
    const stats = pool.statSnapshot();
    expect(stats.fired).toBe(0);
    expect(stats.cancelledOffscreen).toBe(1);
  });

  it("Gate folgt dem Sim-Scroll deterministisch: gleicher Ursprung im View geht durch", () => {
    const scene = leakScene({ x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT });
    const pool = new EnemyProjectilePool(scene as never);
    const origin = { x: 100, y: 60 };
    scene.enemies.active = [{ x: origin.x, y: origin.y, alive: true }];
    const shot = pool.spawn({ ...origin, vx: 100, vy: 0, damage: 3, texture: "enemy_shot_shadow" });
    // Spawn legt eine Pending-Shot an (Wind-up); Erfolg = Gate hat durchgelassen.
    let stats = pool.statSnapshot();
    expect(stats.offscreenAttempts).toBe(0);
    expect(stats.pending).toBe(1);
    void shot;
    // Kamera wandert (Sim-Scroll): derselbe Ursprung ist jetzt offscreen.
    scene.cameras.main.scrollX = 10_000;
    const shot2 = pool.spawn({ ...origin, vx: 100, vy: 0, damage: 3, texture: "enemy_shot_shadow" });
    expect(shot2).toBeNull();
    stats = pool.statSnapshot();
    expect(stats.offscreenAttempts).toBe(1);
    expect(stats.pending).toBe(1); // kein zweites Pending
  });
});
