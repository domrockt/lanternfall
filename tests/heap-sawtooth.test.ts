import { describe, expect, it, vi } from "vitest";

// M10-heap-sawtooth: Reuse-Invariante des EnemyPool — kein Allokationswachstum
// über N Sim-Frames mit Spawn-/Todeswellen, Objekt-Identität der gecachten
// Elite-Specs, Reihenfolge-erhaltendes compact ohne Array-Churn (splice).
// Szene/Atlas werden wie in enemy-pool-reuse.test.ts durch Stubs ersetzt;
// die Stubs zählen Neuanlagen und zeichnen Methodenaufrufe auf.
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));
vi.mock("../src/gfx/textures", () => ({ SPRITE_FRAMES: { enemy_bog_rat: ["frame0", "frame1"] } }));
vi.mock("../src/gfx/depth", () => ({
  DEPTH: { enemy: 1, boss: 2, death: 3, trail: 4, fxLow: 5, decal: 6 },
}));

const counts = vi.hoisted(() => ({ sprite: 0, image: 0 }));

vi.mock("../src/gfx/atlas", () => {
  const stub = () => {
    const o: Record<string, unknown> & { calls: Record<string, unknown[][]> } = {
      calls: {},
    };
    for (const k of [
      "setScale", "setVisible", "setActive", "setAlpha", "clearTint", "setDepth",
      "setPosition", "setOrigin", "setBlendMode", "setTexture", "setTint",
    ]) {
      o[k] = (...args: unknown[]) => {
        (o.calls[k] ??= []).push(args);
        return o;
      };
    }
    return o;
  };
  return {
    makeImage: () => {
      counts.image++;
      return stub();
    },
    applyTexture: () => {},
    currentFrame: () => "frame0",
  };
});

const { EnemyPool } = await import("../src/systems/EnemyPool");
const { eliteRimDef } = await import("../src/gfx/enemySprites");
import type { EnemyDef } from "../src/data/types";

// Echte Gegner-ID (Rim-Frameset existiert in ELITE_RIM_FRAMES).
const DEF = {
  id: "bog_rat", name: "Sumpfratte", hp: 10, damage: 2, radius: 6, speed: 20,
  archetype: "chaser", tier: 0, spriteKey: "enemy_bog_rat",
} as unknown as EnemyDef;

function fakeScene() {
  const stub = () => {
    const o: Record<string, unknown> = {};
    for (const k of [
      "setScale", "setVisible", "setActive", "setAlpha", "clearTint", "setDepth",
      "setPosition", "setOrigin", "setBlendMode", "setTexture", "setTint",
    ]) o[k] = () => o;
    return o;
  };
  return {
    add: {
      sprite: () => {
        counts.sprite++;
        return stub();
      },
      image: () => {
        counts.image++;
        return stub();
      },
    },
  };
}

function wave(pool: InstanceType<typeof EnemyPool>, n: number, eliteEvery = 10): void {
  for (let i = 0; i < n; i++) {
    pool.spawn(DEF, i * 3, i * 2, 1, 1, 0, { elite: i % eliteEvery === 0 });
  }
  for (const e of pool.active) e.alive = false;
  pool.compact();
}

describe("EnemyPool: Reuse-Invariante bei Spawn-/Todeswellen (m10-heap-sawtooth)", () => {
  it("erzeugt nach dem Aufwärmen keine Sprites/Images mehr (3 Wellen à 120)", () => {
    counts.sprite = 0;
    counts.image = 0;
    const pool = new EnemyPool(fakeScene() as never);
    wave(pool, 120);
    const afterWarmup = { sprite: counts.sprite, image: counts.image };
    expect(afterWarmup.sprite).toBe(120); // ein Sprite je Runtime, nie mehr
    expect(afterWarmup.image).toBe(120); // eine Aura je Runtime

    wave(pool, 120);
    wave(pool, 120);
    expect(counts.sprite).toBe(afterWarmup.sprite); // kein Wachstum über Wellen
    expect(counts.image).toBe(afterWarmup.image);
    expect(pool.count).toBe(0);
  });

  it("30 Sim-Frames mit Kill-Wellen: Bestand konstant, KI-Zustände werden recycelt", () => {
    counts.sprite = 0;
    counts.image = 0;
    const pool = new EnemyPool(fakeScene() as never);
    const aiIdentities = new Set<unknown>();
    let firstAi: unknown = null;
    for (let frame = 0; frame < 30; frame++) {
      for (let i = 0; i < 10; i++) {
        const e = pool.spawn(DEF, i, i, 1, 1, 0, { elite: i === 0 });
        aiIdentities.add(e.ai);
        if (frame === 0 && i === 0) firstAi = e.ai;
        // Werte werden vollständig gesetzt (bitgleich über Recycles):
        expect(e.hp).toBe(10);
        expect(e.maxHp).toBe(10);
        expect(e.damage).toBe(2);
        expect(e.alive).toBe(true);
      }
      for (const e of pool.active) e.alive = false;
      pool.compact();
    }
    expect(pool.count).toBe(0);
    // 30 Frames × 10 Spawns = 300 Runs, aber nur 10 Runtime-Objekte/KI-Zustände.
    expect(aiIdentities.size).toBe(10);
    expect(firstAi).not.toBeNull();
    expect(counts.sprite).toBe(10);
    expect(counts.image).toBe(10);
  });

  it("Elite-Spawn wiederverwendet Rim-Def und Marker-Spec (Objekt-Identität, Werte bitgleich)", () => {
    const pool = new EnemyPool(fakeScene() as never);
    const a = pool.spawn(DEF, 0, 0, 1, 1, 0, { elite: true, radius: 6 });
    const rimA = a.def;
    expect(rimA.id).toBe("bog_rat_rim");
    a.alive = false;
    pool.compact();

    const b = pool.spawn(DEF, 5, 5, 1, 1, 0, { elite: true, radius: 6 });
    expect(b.def).toBe(rimA); // gecachte Rim-Def, kein {...def}-Objekt pro Spawn
    expect(b.def).toEqual(eliteRimDef(DEF)); // Werte unverändert (bitgleich)
    expect(b.hp).toBe(10);
    expect(b.damage).toBe(2);

    // Marker-Spec: gleicher Radius → identische Aura-Parameter (Cache-Treffer),
    // anderer (gerundeter) Radius → andere Skalierung.
    const scaleA = ((b.aura as unknown as { calls: Record<string, unknown[][]> }).calls.setScale ?? []).at(-1);
    b.alive = false;
    pool.compact();
    const c = pool.spawn(DEF, 9, 9, 1, 1, 0, { elite: true, radius: 6.4 });
    const scaleC = ((c.aura as unknown as { calls: Record<string, unknown[][]> }).calls.setScale ?? []).at(-1);
    expect(scaleC).toEqual(scaleA); // 6.4 wird wie 6 gerundet → identische Spec
  });

  it("compact entfernt in-place ohne Array.splice und erhält die Reihenfolge", () => {
    const pool = new EnemyPool(fakeScene() as never);
    for (let i = 0; i < 5; i++) pool.spawn(DEF, i, 0);
    expect(pool.count).toBe(5);
    pool.active[1].alive = false;
    pool.active[3].alive = false;

    let spliceCalls = 0;
    const origSplice = Array.prototype.splice;
    Array.prototype.splice = function (...args: unknown[]) {
      spliceCalls++;
      return origSplice.apply(this, args as never);
    };
    try {
      pool.compact();
    } finally {
      Array.prototype.splice = origSplice;
    }
    expect(spliceCalls).toBe(0); // kein Array-Churn pro Tod (Todeswellen)
    expect(pool.count).toBe(3);
    expect(pool.active.map((e) => e.uid)).toEqual([1, 3, 5]); // Reihenfolge erhalten
  });
});
