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

describe("M10-shot-budget-cap — Concurrent-Cap", () => {
  it("haelt: active+pending ueberschreitet das Cap nie, Ueberschuss wird verworfen", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    const spots = shooters(30);
    scene.enemies.active = spots.map((s) => ({ x: s.x, y: s.y, alive: true }));
    pool.setShotCaps({ activeCap: 10, launchBudgetPerFrame: 30 }); // Budget soll nicht binden

    let maxConcurrent = 0;
    for (let f = 0; f < 120; f++) {
      for (const s of spots) {
        pool.spawn({ x: s.x, y: s.y, vx: 20, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 0.5 });
      }
      pool.update(0.1, -9999, -9999, noopHit);
      maxConcurrent = Math.max(
        maxConcurrent,
        pool.count + (pool as unknown as { pending: unknown[] }).pending.length,
      );
    }
    expect(maxConcurrent).toBeLessThanOrEqual(10);
    // Der Pool ist am Cap (Test nicht trivial) und Ablehnungen wurden gezaehlt.
    expect(pool.count + (pool as unknown as { pending: unknown[] }).pending.length).toBe(10);
    expect(pool.budgetSnapshot().cancelledBudgetCap).toBeGreaterThan(0);
  });

  it("pro Budget-Fenster werden maximal N neue Schuesse zugelassen (Ueberschuss wird nicht gefeuert)", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    const spots = shooters(50);
    scene.enemies.active = spots.map((s) => ({ x: s.x, y: s.y, alive: true }));
    pool.setShotCaps({ activeCap: 500, launchBudgetPerFrame: 3 });

    // 50 Versuche in EINEM Budget-Fenster (kein update dazwischen).
    for (const s of spots) {
      pool.spawn({ x: s.x, y: s.y, vx: 10, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 2 });
    }
    const pending = (pool as unknown as { pending: unknown[] }).pending;
    expect(pending.length).toBe(3);
    const budget = pool.budgetSnapshot();
    expect(budget.cancelledBudgetRotation).toBe(47);
    expect(budget.cancelledBudgetCap).toBe(0);

    // Nach der Vorwarnung feuern nur die zugelassenen 3 — der Ueberschuss
    // existiert nicht (kein Queueing, Cooldown des Schuetzen blieb unangetastet).
    pool.update(0.4, -9999, -9999, noopHit);
    expect(pool.statSnapshot().fired).toBe(3);
    expect(pool.count).toBe(3);
  });

  it("Offscreen-Gate bleibt vor dem Budget: kein Slot-Verbrauch, cancelledOffscreen gezaehlt", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    scene.enemies.active = [];
    pool.setShotCaps({ activeCap: 2, launchBudgetPerFrame: 1 });

    // Ausserhalb des 640x360-Views um (0,0).
    pool.spawn({ x: 2000, y: 2000, vx: 10, vy: 0, damage: 1, texture: "enemy_shot_spit" });
    pool.spawn({ x: 2000, y: 2000, vx: 10, vy: 0, damage: 1, texture: "enemy_shot_spit" });
    const stats = pool.statSnapshot();
    expect(stats.cancelledOffscreen).toBe(2);
    expect(pool.budgetSnapshot().cancelledBudgetRotation).toBe(0);
    // Budget unangetastet: der naechste In-View-Schuss wird zugelassen.
    pool.spawn({ x: 100, y: 100, vx: 10, vy: 0, damage: 1, texture: "enemy_shot_spit" });
    expect((pool as unknown as { pending: unknown[] }).pending.length).toBe(1);
  });
});

describe("M10-shot-budget-cap — faire Zuteilung (kein Starving)", () => {
  it("alle Schuetzen kommen dran und die Wartezeit ist beschraenkt (Rotation ueber Versuch-Positionen)", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    const N = 12;
    const spots = shooters(N);
    scene.enemies.active = spots.map((s) => ({ x: s.x, y: s.y, alive: true }));
    pool.setShotCaps({ activeCap: 500, launchBudgetPerFrame: 3 });

    // Jeder Schuetze versucht JEDES Fenster zu schiessen; das Budget laesst nur
    // 3 je Fenster zu. Bei stabiler Reihenfolge rotiert das Dienst-Fenster:
    // jeder Schuetze ist alle ceil(12/3) = 4 Fenster mindestens einmal dran.
    // Stehende Schuesse: shot.x bleibt der Ursprung -> Schuetze eindeutig.
    const seenX = new Set<number>();
    const launchCounts = new Map<number, number>();
    let firstFullCoverage = -1;
    for (let f = 0; f < 90; f++) {
      for (const s of spots) {
        pool.spawn({ x: s.x, y: s.y, vx: 0, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 0.5 });
      }
      pool.update(0.1, -9999, -9999, noopHit);
      for (const shot of pool.active) {
        if (!seenX.has(shot.x)) {
          seenX.add(shot.x);
          if (seenX.size === N && firstFullCoverage < 0) firstFullCoverage = f;
        }
        launchCounts.set(shot.x, (launchCounts.get(shot.x) ?? 0) + 1);
      }
    }
    // Alle 12 Schuetzen haben gefeuert, und zwar frueh (Windup + max. 4 Fenster).
    expect(seenX.size).toBe(N);
    expect(firstFullCoverage).toBeGreaterThanOrEqual(0);
    expect(firstFullCoverage).toBeLessThanOrEqual(30);
    // Und gleichmaessig: jeder Schuetze erhaelt seinen fairen Anteil (keiner
    // dauerhaft unterversorgt).
    for (const s of spots) {
      expect(launchCounts.get(s.x) ?? 0).toBeGreaterThanOrEqual(10);
    }
  });

  it("weniger Versuche als Budget: alle feuern, kein Verwerfen durch Rotation", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    const spots = shooters(3);
    scene.enemies.active = spots.map((s) => ({ x: s.x, y: s.y, alive: true }));
    pool.setShotCaps({ activeCap: 500, launchBudgetPerFrame: 8 });

    for (let f = 0; f < 10; f++) {
      for (const s of spots) {
        pool.spawn({ x: s.x, y: s.y, vx: 0, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 2 });
      }
      pool.update(0.1, -9999, -9999, noopHit);
    }
    const budget = pool.budgetSnapshot();
    expect(budget.cancelledBudgetRotation).toBe(0);
    expect(budget.cancelledBudgetCap).toBe(0);
    // 3 Schuesse je Fenster, 10 Fenster; die letzten 3 pending-Vorwarnungen
    // (Fenster 8-10) sind bei dt=0.1 nach 0.36 s Windup noch nicht abgelaufen
    // -> 7 Fenster sind gefeuert (Windup-Gates unveraendert).
    expect(pool.statSnapshot().fired).toBe(21);
  });
});
