import { describe, expect, it, vi } from "vitest";

// M10-shot-budget-cap: Tests fuer Concurrent-Cap, faire Zuteilung und
// Pool-Recycle. Der Pool laeuft mit echtem Atlas-Mock (makeImage zaehlt
// Allokationen), damit Recycle ohne Leak belegt ist — nicht nur konstanten
// Zaehler behaupten.

const atlas = vi.hoisted(() => {
  const calls = { makeImage: 0 };
  const makeImg = () => {
    const o: Record<string, unknown> = {};
    for (const m of [
      "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint", "clearTint",
      "setRotation", "setVisible", "setActive", "setPosition", "setTexture", "destroy",
    ]) o[m] = () => o;
    calls.makeImage += 1;
    return o;
  };
  return { calls, makeImg };
});

vi.mock("phaser", () => ({
  default: {
    BlendModes: { NORMAL: 0, ADD: 1 },
    Math: { Clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) },
  },
}));
vi.mock("../src/gfx/atlas", () => ({
  makeImage: () => atlas.makeImg(),
  applyTexture: () => undefined,
}));

import { EnemyProjectilePool, ENEMY_SHOT_ACTIVE_CAP, ENEMY_SHOT_LAUNCH_BUDGET_PER_FRAME } from "../src/systems/EnemyProjectiles";

interface FakeEnemy { x: number; y: number; alive: boolean }

const noopHit = () => undefined;

function fakeScene(view = { x: 0, y: 0, width: 640, height: 360 }) {
  const scene = {
    textures: { exists: () => true, addCanvas: vi.fn() },
    cameras: { main: { worldView: { ...view } } },
    tweens: { add: vi.fn() },
    enemies: { active: [] as FakeEnemy[] },
  };
  return scene as unknown as import("phaser").Scene & {
    cameras: { main: { worldView: { x: number; y: number; width: number; height: number } } };
    enemies: { active: FakeEnemy[] };
  };
}

/** n Schuetzen an fixen, verschiedenen Urspruengen (Alle im View). */
function shooters(n: number): Array<{ x: number; y: number }> {
  return Array.from({ length: n }, (_, i) => ({ x: 30 + (i % 20) * 30, y: 30 + Math.floor(i / 20) * 30 }));
}

describe("M10-shot-budget-cap — Pool-Recycle ohne Leak", () => {
  it("Recycle: nach dem Warmup werden freie Projektile sofort wiederverwendet (keine Allokation im Steady-State)", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    const spots = shooters(24);
    scene.enemies.active = spots.map((s) => ({ x: s.x, y: s.y, alive: true }));
    pool.setShotCaps({ activeCap: 12, launchBudgetPerFrame: 4 });

    // Warmup bis der Pool gefuellt ist (Cap 12 aktiv + Windup-Puffer).
    const spawnWave = () => {
      for (const s of spots) {
        pool.spawn({ x: s.x, y: s.y, vx: 40, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 0.5 });
      }
    };
    for (let f = 0; f < 40; f++) {
      spawnWave();
      pool.update(0.1, -9999, -9999, noopHit);
    }
    const afterWarmup = atlas.calls.makeImage;
    const totalAfterWarmup = (pool as unknown as { free: unknown[] }).free.length + pool.count;

    // Steady-State: 120 weitere Frames — keine neue Allokation, Objektzahl konstant.
    let maxConcurrent = 0;
    for (let f = 0; f < 120; f++) {
      spawnWave();
      pool.update(0.1, -9999, -9999, noopHit);
      maxConcurrent = Math.max(maxConcurrent, pool.count + (pool as unknown as { pending: unknown[] }).pending.length);
    }
    expect(atlas.calls.makeImage).toBe(afterWarmup);
    expect((pool as unknown as { free: unknown[] }).free.length + pool.count).toBe(totalAfterWarmup);
    expect(maxConcurrent).toBeLessThanOrEqual(12);
    // Und der Pool war auch wirklich gefuellt (Test ist nicht trivial).
    expect(afterWarmup).toBeGreaterThan(0);
  });

  it("Recycle: abgelaufene Projektile landen sofort wieder in der Free-Liste und werden wiederverwendet", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    const spot = { x: 100, y: 100 };
    scene.enemies.active = [{ x: spot.x, y: spot.y, alive: true }];

    pool.spawn({ x: spot.x, y: spot.y, vx: 0, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 0.5 });
    pool.update(0.4, -9999, -9999, noopHit); // Windup vorbei -> launch
    expect(pool.count).toBe(1);
    pool.update(0.2, -9999, -9999, noopHit); // life abgelaufen -> recycle
    expect(pool.count).toBe(0);
    const freeList = (pool as unknown as { free: unknown[] }).free;
    expect(freeList.length).toBe(1);

    const created = atlas.calls.makeImage;
    for (let i = 0; i < 5; i++) {
      pool.spawn({ x: spot.x, y: spot.y, vx: 0, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 0.5 });
      pool.update(0.4, -9999, -9999, noopHit);
      pool.update(0.2, -9999, -9999, noopHit);
    }
    // 5 weitere Launch/Expire-Zyklen: kein einziges neues Runtime-Objekt.
    expect(atlas.calls.makeImage).toBe(created);
    expect(freeList.length).toBe(1);
  });

  it("Defaults sind gesetzt und sinnvoll (Cap > Benchmark-Bedarf, Budget > 0)", () => {
    expect(ENEMY_SHOT_ACTIVE_CAP).toBeGreaterThanOrEqual(160);
    expect(ENEMY_SHOT_LAUNCH_BUDGET_PER_FRAME).toBeGreaterThan(0);
    expect(ENEMY_SHOT_LAUNCH_BUDGET_PER_FRAME).toBeLessThanOrEqual(ENEMY_SHOT_ACTIVE_CAP);
  });
});
