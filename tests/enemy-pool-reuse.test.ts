import { describe, expect, it, vi } from "vitest";

// EnemyPool nutzt Phaser nur für BlendModes/GameObjects; im Node-Test werden
// Scene, Atlas-Helfer und Texturframes durch schlanke Stubs ersetzt.
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));
vi.mock("../src/gfx/textures", () => ({ SPRITE_FRAMES: { enemy_bog_rat: ["frame0", "frame1"] } }));
vi.mock("../src/gfx/depth", () => ({
  DEPTH: { enemy: 1, boss: 2, death: 3, trail: 4, fxLow: 5, decal: 6 },
}));
vi.mock("../src/gfx/atlas", () => {
  const makeSprite = () => {
    const o: Record<string, unknown> = {};
    for (const k of [
      "setScale", "setVisible", "setActive", "setAlpha", "clearTint", "setDepth",
      "setPosition", "setOrigin", "setBlendMode", "setTexture", "setTint",
    ]) o[k] = () => o;
    return o;
  };
  return {
    makeImage: makeSprite,
    applyTexture: () => {},
    currentFrame: () => "frame0",
  };
});

const { EnemyPool } = await import("../src/systems/EnemyPool");
import type { EnemyDef } from "../src/data/types";

const DEF = {
  id: "test_rat", name: "Testratte", hp: 10, damage: 1, radius: 5, speed: 20,
  archetype: "chaser", tier: 0, spriteKey: "enemy_bog_rat",
} as unknown as EnemyDef;

function fakeScene() {
  const makeSprite = () => {
    const o: Record<string, unknown> = {};
    for (const k of [
      "setScale", "setVisible", "setActive", "setAlpha", "clearTint", "setDepth",
      "setPosition", "setOrigin", "setBlendMode", "setTexture", "setTint",
    ]) o[k] = () => o;
    return o;
  };
  return { add: { sprite: makeSprite, image: makeSprite } };
}

describe("EnemyPool: Spawn-Recycling ohne neue KI-Objekte", () => {
  it("behält ai-Identität und RNG über despawn/compact/spawn hinweg", () => {
    const pool = new EnemyPool(fakeScene() as never);
    const a = pool.spawn(DEF, 10, 10, 1, 1, 0, { elite: true });
    const aiA = a.ai;
    const rngA = a.aiRng;
    expect(a.uid).toBe(1);
    a.alive = false;
    pool.compact();
    expect(pool.count).toBe(0);

    const b = pool.spawn(DEF, 20, 20);
    expect(b.uid).toBe(2);
    expect(b.ai).toBe(aiA);
    expect(b.aiRng).toBe(rngA);
    expect(b.elite).toBe(false);
    expect(b.splitDepth).toBe(0);
    expect(b.hp).toBe(10);
    expect(b.alive).toBe(true);
  });

  it("m10-heap-pool-fix: kein einziges neues Runtime-Objekt über 200 Spawn/Compact-Zyklen (createdTotal konstant)", () => {
    const pool = new EnemyPool(fakeScene() as never);
    const first = pool.spawn(DEF, 10, 10);
    const createdAfterFirst = pool.createdTotal;
    let last = first;
    for (let i = 0; i < 200; i++) {
      const freed = last;
      freed.alive = false;
      pool.compact();
      last = pool.spawn(DEF, i, i, 1, 1, 0, i % 2 === 0 ? { elite: true } : undefined);
      expect(pool.createdTotal).toBe(createdAfterFirst);
      // Der soeben freigegebene Runtime-Slot wird sofort wiederverwendet.
      expect(last).toBe(freed);
    }
    expect(last.alive).toBe(true);
    expect(pool.freeCount).toBe(0);
    expect(pool.count).toBe(1);
  });

  it("m10-heap-pool-fix: Spawn ohne Options alloziert kein Options-Objekt pro Aufruf (geteilte Default-Konstante)", () => {
    const pool = new EnemyPool(fakeScene() as never);
    // Zwei Spawns ohne Options-Objekt: beide müssen die Defaults anwenden
    // (radius/speed aus der Def, hpScale 1) — das neue Verhalten teilt sich
    // EIN eingefrorenes Default-Objekt statt `{}` pro Spawn.
    const a = pool.spawn(DEF, 1, 1);
    const b = pool.spawn(DEF, 2, 2);
    expect(a.radius).toBe(DEF.radius);
    expect(a.speed).toBe(DEF.speed);
    expect(a.hpScale).toBe(1);
    expect(b.radius).toBe(DEF.radius);
    expect(b.speed).toBe(DEF.speed);
    expect(b.hpScale).toBe(1);
  });
});
