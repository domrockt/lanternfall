import { describe, expect, it, vi } from "vitest";

// Der Pool nutzt Phaser-Images und den Atlas. Für den Unit-Test genügen Stubs,
// damit Spawn-/Update-Pfad (Wind-up, Offscreen, Schützentod) echt durchlaufen.
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

import { ENEMIES } from "../src/data/enemies";
import { EnemyProjectilePool } from "../src/systems/EnemyProjectiles";
import {
  ENEMY_SHOT_VISUALS,
  ENEMY_SHOT_WINDUP_MIN_SECONDS,
  ENEMY_SHOT_WINDUP_SECONDS,
  canLaunchShot,
  isPointInView,
  shotTextureKeyFor,
  shotVisualsDistinct,
  type EnemyShotVisual,
} from "../src/logic/bosses";

const VIEW = { x: 100, y: 50, width: 640, height: 360 };

function visualOf(key: string): EnemyShotVisual {
  const v = ENEMY_SHOT_VISUALS[key];
  if (!v) throw new Error(`unbekannte Schuss-Optik: ${key}`);
  return v;
}

describe("M10 Gegnerschüsse fair — Vorwarnung", () => {
  it("jeder ranged-/summoner-Schuss feuert im Pool erst nach >= 0,3 s Vorwarnung", () => {
    const shooters = Object.values(ENEMIES).filter((e) => e.archetype === "ranged" || e.archetype === "summoner");
    expect(shooters.length).toBeGreaterThan(0);
    for (const e of shooters) {
      const scene = fakeScene();
      const pool = new EnemyProjectilePool(scene);
      const key = shotTextureKeyFor(e.archetype, e.tier);
      expect(ENEMY_SHOT_VISUALS[key]).toBeTruthy();
      pool.spawn({ x: 120, y: 60, vx: 80, vy: 0, damage: 2, texture: key });
      scene.enemies.active = [{ x: 120, y: 60, alive: true }];
      pool.update(0.29, 0, 0, noopHit);
      expect(pool.statSnapshot().fired, `vor 0,3 s gefeuert: ${e.id}`).toBe(0);
      pool.update(0.08, 0, 0, noopHit); // zusammen 0,37 s > 0,36 s
      expect(pool.statSnapshot().fired, `nach 0,36 s nicht gefeuert: ${e.id}`).toBe(1);
      expect(pool.statSnapshot().windupOk).toBe(1);
    }
  });

  it("Schuss entsteht erst nach Ablauf der Vorwarnung", () => {
    const gate = { shooterAlive: true, originInView: true, windupSeconds: ENEMY_SHOT_WINDUP_SECONDS };
    expect(canLaunchShot({ ...gate, windupElapsed: 0.1 })).toBe(false);
    expect(canLaunchShot({ ...gate, windupElapsed: ENEMY_SHOT_WINDUP_SECONDS - 0.01 })).toBe(false);
    expect(canLaunchShot({ ...gate, windupElapsed: ENEMY_SHOT_WINDUP_SECONDS })).toBe(true);
  });

  it("bricht ab, wenn der Schütze stirbt/recycelt wird", () => {
    const gate = {
      originInView: true,
      windupElapsed: ENEMY_SHOT_WINDUP_SECONDS,
      windupSeconds: ENEMY_SHOT_WINDUP_SECONDS,
    };
    expect(canLaunchShot({ ...gate, shooterAlive: false })).toBe(false);
    expect(canLaunchShot({ ...gate, shooterAlive: true })).toBe(true);
  });

  it("kein Spawn aus einer Offscreen-Position", () => {
    expect(isPointInView(120, 60, VIEW)).toBe(true);
    expect(isPointInView(99, 60, VIEW)).toBe(false);
    expect(isPointInView(300, 49, VIEW)).toBe(false);
    expect(isPointInView(741, 200, VIEW)).toBe(false);
    expect(isPointInView(300, 411, VIEW)).toBe(false);
    const gate = {
      shooterAlive: true,
      windupElapsed: ENEMY_SHOT_WINDUP_SECONDS,
      windupSeconds: ENEMY_SHOT_WINDUP_SECONDS,
    };
    expect(canLaunchShot({ ...gate, originInView: false })).toBe(false);
  });
});

describe("M10 Gegnerschüsse fair — Optiken unterscheidbar", () => {
  it("die vier Texture-Keys sind paarweise verschieden", () => {
    const keys = [
      shotTextureKeyFor("ranged", 0),
      shotTextureKeyFor("ranged", 1),
      shotTextureKeyFor("ranged", 3),
      shotTextureKeyFor("chaser", 2),
    ];
    expect(new Set(keys).size).toBe(4);
    for (const key of keys) expect(ENEMY_SHOT_VISUALS[key]).toBeTruthy();
  });

  it("jede Optik hat eigene Form und Kernfarbe", () => {
    expect(shotVisualsDistinct()).toBe(true);
    const visuals = Object.values(ENEMY_SHOT_VISUALS);
    expect(new Set(visuals.map((v) => v.shape)).size).toBe(4);
    expect(new Set(visuals.map((v) => v.core)).size).toBe(4);
    expect(new Set(visuals.map((v) => v.rim)).size).toBe(4);
  });

  it("alle 30 Gegner mappen auf eine der vier Optiken", () => {
    expect(Object.keys(ENEMIES)).toHaveLength(30);
    const known = new Set(Object.keys(ENEMY_SHOT_VISUALS));
    for (const e of Object.values(ENEMIES)) {
      expect(known.has(shotTextureKeyFor(e.archetype, e.tier))).toBe(true);
    }
    // summoner ist immer die Schatten-Optik.
    expect(visualOf(shotTextureKeyFor("summoner", 4)).family).toBe("shadow");
  });
});

// ---------------------------------------------------------------------------
// Pool-Pfad: der Test misst die echte Laufzeitlogik (spawn/update), nicht nur
// Konstanten. Nur so ist belegt, dass die Szene die Fairness-Regeln anwendet.
// ---------------------------------------------------------------------------

interface FakeEnemy { x: number; y: number; alive: boolean }

function fakeScene(view = { x: 0, y: 0, width: 640, height: 360 }) {
  const img = () => {
    const o: Record<string, unknown> = {};
    for (const m of [
      "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint", "clearTint",
      "setRotation", "setVisible", "setActive", "setPosition", "setTexture", "destroy",
    ]) o[m] = () => o;
    return o;
  };
  const scene = {
    textures: { exists: () => true, addCanvas: vi.fn() },
    add: { image: () => img() },
    cameras: { main: { worldView: { ...view } } },
    tweens: { add: vi.fn() },
    enemies: { active: [] as FakeEnemy[] },
  };
  return scene as unknown as import("phaser").Scene & {
    cameras: { main: { worldView: { x: number; y: number; width: number; height: number } } };
    enemies: { active: FakeEnemy[] };
  };
}

const noopHit = () => undefined;

describe("M10 Gegnerschüsse fair — Pool-Pfad (spawn/update)", () => {
  it("verwirft Schüsse aus Offscreen-Positionen vollständig", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    const shot = pool.spawn({ x: -20, y: 60, vx: 100, vy: 0, damage: 3, texture: "enemy_shot_spit" });
    expect(shot).toBeNull();
    const stats = pool.statSnapshot();
    expect(stats.attempted).toBe(1);
    expect(stats.offscreenAttempts).toBe(1);
    expect(stats.cancelledOffscreen).toBe(1);
    expect(stats.fired).toBe(0);
    expect(stats.pending).toBe(0);
  });

  it("feuert erst nach 0,36 s Vorwarnung, nicht vorher", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    pool.spawn({ x: 120, y: 60, vx: 100, vy: 0, damage: 3, texture: "enemy_shot_bone" });
    scene.enemies.active = [{ x: 120, y: 60, alive: true }];
    expect(pool.statSnapshot().fired).toBe(0);
    pool.update(0.35, 0, 0, noopHit);
    expect(pool.statSnapshot().fired).toBe(0);
    expect(pool.statSnapshot().pending).toBe(1);
    pool.update(0.02, 0, 0, noopHit);
    const stats = pool.statSnapshot();
    expect(stats.fired).toBe(1);
    expect(stats.windupOk).toBe(1);
    expect(pool.active).toHaveLength(1);
  });

  it("bricht ab, wenn der Schütze in der Vorwarnzeit stirbt", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    pool.spawn({ x: 120, y: 60, vx: 100, vy: 0, damage: 3, texture: "enemy_shot_fire" });
    scene.enemies.active = [];
    pool.update(0.4, 0, 0, noopHit);
    const stats = pool.statSnapshot();
    expect(stats.fired).toBe(0);
    expect(stats.cancelledShooterDeath).toBe(1);
    expect(stats.pending).toBe(0);
  });

  it("bricht ab, wenn der Ursprung vor dem Abflug aus dem View wandert", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    pool.spawn({ x: 120, y: 60, vx: 100, vy: 0, damage: 3, texture: "enemy_shot_shadow" });
    scene.enemies.active = [{ x: 120, y: 60, alive: true }];
    Object.assign(scene.cameras.main.worldView, { x: 500, y: 0, width: 640, height: 360 });
    pool.update(0.4, 0, 0, noopHit);
    const stats = pool.statSnapshot();
    expect(stats.fired).toBe(0);
    expect(stats.cancelledOffscreen).toBe(1);
  });

  it("zählt einen Offscreen-Ursprung nie als Offscreen-Treffer (Gate vor dem Schuss)", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    pool.spawn({ x: 5000, y: 5000, vx: 0, vy: 0, damage: 3, texture: "enemy_shot_spit" });
    scene.enemies.active = [{ x: 5000, y: 5000, alive: true }];
    pool.update(0.5, 0, 0, noopHit);
    const stats = pool.statSnapshot();
    expect(stats.offscreenHits).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.fired).toBe(0);
  });
});

describe("M10 Gegnerschüsse fair — Telegraph-Pool + Aufräumen", () => {
  it("verwirft Schüsse, wenn der Telegraph-Pool erschöpft ist (nie stumm feuern)", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    // M10-shot-budget-cap: der Test prueft das Telegraph-Cap, nicht das neue
    // Frame-Budget — dafuer Budget fuer alle 96 Spawns + den Pruef-Spawn
    // freigeben (Anfrage in .dispatch/requests.md, Intention unveraendert).
    pool.setShotCaps({ launchBudgetPerFrame: 200 });
    scene.enemies.active = [{ x: 320, y: 180, alive: true }];
    for (let i = 0; i < 96; i++) {
      pool.spawn({ x: 20 + (i % 300), y: 20 + ((i * 7) % 300), vx: 10, vy: 0, damage: 1, texture: "enemy_shot_spit" });
    }
    expect(pool.statSnapshot().pending).toBe(96);
    const extra = pool.spawn({ x: 330, y: 190, vx: 10, vy: 0, damage: 1, texture: "enemy_shot_spit" });
    expect(extra).toBeNull();
    const stats = pool.statSnapshot();
    expect(stats.cancelledNoTelegraph).toBe(1);
    expect(stats.fired).toBe(0);
    // Schützen an allen Ursprüngen lebend halten, dann laufen alle 96 nach der Vorwarnung los.
    scene.enemies.active = Array.from({ length: 96 }, (_, i) => ({
      x: 20 + (i % 300), y: 20 + ((i * 7) % 300), alive: true,
    }));
    pool.update(0.4, 0, 0, noopHit);
    expect(pool.statSnapshot().fired).toBe(96);
  });

  it("clear() räumt pending, Telegraphs und den Debug-Hook ab", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    scene.enemies.active = [{ x: 120, y: 60, alive: true }];
    pool.spawn({ x: 120, y: 60, vx: 100, vy: 0, damage: 3, texture: "enemy_shot_bone" });
    expect(pool.statSnapshot().pending).toBe(1);
    pool.clear();
    expect(pool.statSnapshot().pending).toBe(0);
    expect((globalThis as unknown as Record<string, unknown>).__lfEnemyShots).toBeUndefined();
  });
});
