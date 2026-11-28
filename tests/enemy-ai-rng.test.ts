import { describe, expect, it, vi } from "vitest";

// m10-ai-rng-seed K2: Die KI-RNG im EnemyPool ist gesät (Muster Run-SeededRng),
// Math.random ist im Pool verboten. Zwei Pools mit gleichem Seed liefern bei
// gleicher Spawn-/Step-Folge bitgleiche KI-Marken.
//
// EnemyPool nutzt Phaser nur für BlendModes/GameObjects; im Node-Test werden
// Scene, Atlas-Helfer und Texturframes durch schlanke Stubs ersetzt
// (Muster: tests/enemy-pool-reuse.test.ts).
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
const { stepEnemyAi, newAiState } = await import("../src/logic/enemy-ai");
import type { EnemyDef } from "../src/data/types";
import type { AiRng } from "../src/logic/enemy-ai";

const DEF = {
  id: "test_rat", name: "Testratte", hp: 10, damage: 1, radius: 5, speed: 20,
  archetype: "chaser", tier: 0, spriteKey: "enemy_bog_rat",
} as unknown as EnemyDef;

const BLINK_DEF = {
  id: "test_phaser", name: "Testphaser", hp: 10, damage: 1, radius: 5, speed: 20,
  archetype: "phaser", tier: 1, spriteKey: "enemy_bog_rat",
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

const DT = 1 / 60;
const FRAMES = 240;
const N = 24;

interface MarkAi {
  mode: string;
  blinks: number;
  attacks: number;
  orbitDir: number;
  timer: number;
  cooldown: number;
}

interface MarkEnemy {
  x: number;
  y: number;
  uid: number;
  ai: MarkAi;
}

/** FNV-1a über allen KI-Entscheidungen (bitgleicher Vergleich). */
function mark(pool: { active: MarkEnemy[] }): string {
  let h = 2166136261 >>> 0;
  const push = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x7c;
    h = Math.imul(h, 16777619) >>> 0;
  };
  for (const e of pool.active) {
    push(
      `${e.uid}|${e.ai.mode}|${e.ai.blinks}|${e.ai.attacks}|${e.ai.orbitDir}|`
      + `${Math.round(e.x * 10)}|${Math.round(e.y * 10)}|`
      + `${Math.round(e.ai.timer * 1000)}|${Math.round(e.ai.cooldown * 1000)}`,
    );
  }
  return h.toString(16).padStart(8, "0");
}

/** Spawn N gemischte Gegner OHNE explizite rng (Fallback-Pfad) und steppe FRAMES. */
function simulate(aiSeed: number, mathRandomThrows: boolean): string {
  const spy = vi.spyOn(Math, "random").mockImplementation(() => {
    throw new Error("Math.random im EnemyPool-Pfad verboten (m10-ai-rng-seed)");
  });
  try {
    const pool = new EnemyPool(fakeScene() as never, aiSeed);
    for (let i = 0; i < N; i++) {
      pool.spawn(i % 3 === 0 ? BLINK_DEF : DEF, 20 + i * 7, 30 + (i % 5) * 11);
    }
    for (let f = 0; f < FRAMES; f++) {
      const px = Math.cos(f * DT * 0.7) * 60;
      const py = Math.sin(f * DT * 0.7) * 60;
      for (const e of pool.active) {
        e.ai = stepEnemyAi(
          e.ai,
          {
            archetype: e.def.archetype, tier: e.def.tier, x: e.x, y: e.y,
            playerX: px, playerY: py, speed: e.speed,
          },
          DT,
          e.aiRng as AiRng,
          e.uid,
        ).state;
        e.x += (e.ai.aiMoveX ?? 0) * e.speed * DT;
        e.y += (e.ai.aiMoveY ?? 0) * e.speed * DT;
      }
    }
    return mark(pool);
  } finally {
    spy.mockRestore();
  }
}

describe("EnemyPool: gesäte KI-RNG (m10-ai-rng-seed)", () => {
  it("zwei Pools mit gleichem Seed → bitgleiche KI-Marken, ohne Math.random", () => {
    const a = simulate(20261127, true);
    const b = simulate(20261127, true);
    expect(a).toBe(b);
  });

  it("verschiedene Seeds → verschiedene KI-Marken (Fallback speist aus dem Run-Seed)", () => {
    const a = simulate(1, true);
    const b = simulate(2, true);
    expect(a).not.toBe(b);
  });

  it("Recycle: aiRng-Identität bleibt, Stagger-Felder werden neutralisiert", () => {
    const pool = new EnemyPool(fakeScene() as never, 42);
    const first = pool.spawn(DEF, 10, 10);
    const rngObj = first.aiRng;
    // Stagger-State des Vorgängers künstlich setzen — darf nicht vererbt werden.
    first.ai.aiStepIn = 3;
    first.ai.aiMoveX = -1;
    first.ai.aiMoveY = 0.5;
    first.ai.aiSpeedMul = 3;
    first.alive = false;
    pool.compact();

    const second = pool.spawn(DEF, 99, 99);
    expect(second.aiRng).toBe(rngObj); // pool-eigener Fallback, Identität erhalten
    expect(second.ai.aiStepIn).toBeUndefined();
    expect(second.ai.aiMoveX).toBeUndefined();
    expect(second.ai.aiMoveY).toBeUndefined();
    expect(second.ai.aiSpeedMul).toBeUndefined();
    // aiSkip darf als wiederverwendetes Objekt bleiben: sein Inhalt wird im
    // Skip-Pfad von stepEnemyAi vor jeder Nutzung neu überschrieben.
  });

  it("Spawn mit expliziter rng nutzt diese weiterhin (Run-SeededRng unangetastet)", () => {
    const pool = new EnemyPool(fakeScene() as never, 42);
    const draws: number[] = [];
    const run: AiRng = { next: () => (draws.push(1), draws.length / 1000) };
    const e = pool.spawn(DEF, 0, 0, 1, 1, 0, {}, run);
    expect(e.aiRng).toBe(run);
    // ensureAiState hat beim Spawn aus der Run-RNG gezogen (Reset).
    expect(draws.length).toBeGreaterThan(0);
  });
});
