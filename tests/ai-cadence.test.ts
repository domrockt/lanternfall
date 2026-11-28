import { describe, expect, it, vi } from "vitest";

// m10-ai-stream-cadence-r2 K3: Die KI-Entscheidungskette eines Gegners hängt
// nur noch von (Seed, UID) ab — nicht mehr von der Frame-Kadenz. Vor dem Fix
// zogen alle Gegner aus EINEM gemeinsamen Stream (Run.attachAiRng); wie viele
// Ziehungen ein Gegner konsumiert, hängt von seiner AI-Stagger-Kadenz ab
// (volle Steps je Distanzring, in Frames gezählt) — jede Kadenzänderung
// verschob damit die Ziehungsfolge ALLER Gegner (Vorher-Probe K1: 40/120 UIDs
// divergent, ~/games/.evidence/m10-ai-stream-cadence-r2/).
//
// Diese Datei pinnt den Fix auf zwei Ebenen:
//  1. reine Stream-Adressierung (enemyStreamSeed/EnemyAiRng/rekey),
//  2. Kadenz-Unabhängigkeit der Entscheidungskette über stepEnemyAi
//     (dt 1/60 vs 1/30, gleiche Sim-Zeit) — plus Kontrolle, dass der ALTE
//     gemeinsame Stream weiterhin divergiert (Regressionssicherung).

import { newAiState, stepEnemyAi, type AiRng, type AiState } from "../src/logic/enemy-ai";
import { resetAiState, enemyStreamSeed, EnemyAiRng, attachEnemyAiStream } from "../src/logic/ai-state";
import { mulberry32 } from "../src/logic/rng";

/** Ziehungen protokollieren, ohne den zugrunde liegenden Stream zu ändern. */
function recorderFor(uid: number, underlying: AiRng, log: Map<number, number[]>): AiRng {
  return {
    next() {
      const v = underlying.next();
      let arr = log.get(uid);
      if (!arr) { arr = []; log.set(uid, arr); }
      arr.push(v);
      return v;
    },
  };
}

const WEIGHTS: ReadonlyArray<[string, number]> = [
  ["phaser", 0.18], ["orbiter", 0.18], ["swarm", 0.2], ["chaser", 0.14],
  ["tank", 0.08], ["ranged", 0.08], ["charger", 0.06], ["splitter", 0.04], ["exploder", 0.04],
];

function archetypeFor(i: number, seed: number): string {
  const r = mulberry32((seed + i * 15485863) >>> 0)();
  let acc = 0;
  for (const [a, w] of WEIGHTS) {
    acc += w;
    if (r < acc) return a;
  }
  return "chaser";
}

function layout(i: number, n: number, seed: number) {
  const distR = mulberry32((seed + i * 7919) >>> 0)();
  const bucket = i % 10;
  const dist = bucket < 5 ? 40 + distR * 180 : bucket < 8 ? 220 + distR * 200 : 420 + distR * 280;
  const ang = (i / n) * Math.PI * 2 + mulberry32((seed + i * 104729) >>> 0)() * 0.6;
  return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist };
}

/**
 * Ein Kontrolllauf über die reine Logik. streamMode "peruid" = Fix-Verdrahtung
 * (eigener Stream je (Seed, UID)), "shared" = Ist-Zustand VOR dem Fix
 * (ein gemeinsamer Stream für alle Gegner, wie Run.attachAiRng vorher).
 */
function controlRun(
  dt: number,
  seconds: number,
  n: number,
  seed: number,
  streamMode: "peruid" | "shared",
): Map<number, number[]> {
  const log = new Map<number, number[]>();
  const shared = { next: mulberry32(((seed ^ 0x9e3779b9) >>> 0) + 0x6d2b79f5) };
  const perUid = new Map<number, EnemyAiRng>();
  const streamFor = (uid: number): AiRng => {
    if (streamMode === "shared") return shared;
    let s = perUid.get(uid);
    if (!s) {
      s = new EnemyAiRng();
      s.rekey(seed, uid);
      perUid.set(uid, s);
    }
    return s;
  };

  const enemies: { uid: number; archetype: string; tier: number; x: number; y: number; speed: number; state: AiState }[] = [];
  for (let i = 0; i < n; i++) {
    const uid = i + 1;
    const { x, y } = layout(i, n, seed);
    enemies.push({
      uid, archetype: archetypeFor(i, seed), tier: i % 6, x, y, speed: 70,
      state: newAiState(recorderFor(uid, streamFor(uid), log)),
    });
  }
  const frames = Math.round(seconds / dt);
  for (let f = 0; f < frames; f++) {
    const t = f * dt;
    const px = Math.cos(t * 0.7) * 60;
    const py = Math.sin(t * 0.7) * 60;
    for (const e of enemies) {
      e.state = stepEnemyAi(
        e.state,
        { archetype: e.archetype as never, tier: e.tier, x: e.x, y: e.y, playerX: px, playerY: py, speed: e.speed },
        dt, recorderFor(e.uid, streamFor(e.uid), log), e.uid,
      ).state;
      e.x += (e.state.aiMoveX ?? 0) * e.speed * dt;
      e.y += (e.state.aiMoveY ?? 0) * e.speed * dt;
    }
  }
  return log;
}

/** Divergenz = UIDs, deren gemeinsamer Präfix der Ziehungsfolge abweicht. */
function divergentUids(a: Map<number, number[]>, b: Map<number, number[]>, n: number): number[] {
  const div: number[] = [];
  for (let i = 0; i < n; i++) {
    const uid = i + 1;
    const sa = a.get(uid) ?? [];
    const sb = b.get(uid) ?? [];
    const len = Math.min(sa.length, sb.length);
    for (let k = 0; k < len; k++) {
      if (sa[k] !== sb[k]) { div.push(uid); break; }
    }
  }
  return div;
}

const SEED = 20261128;
const N = 40;
const SECONDS = 20;

describe("KI-Stream-Adressierung pro Gegner (m10-ai-stream-cadence-r2)", () => {
  it("enemyStreamSeed ist deterministisch in (Seed, UID) und sensitiv in beiden", () => {
    expect(enemyStreamSeed(20261128, 7)).toBe(enemyStreamSeed(20261128, 7));
    expect(enemyStreamSeed(20261128, 7)).not.toBe(enemyStreamSeed(20261128, 8));
    expect(enemyStreamSeed(20261128, 7)).not.toBe(enemyStreamSeed(20261127, 7));
  });

  it("EnemyAiRng.rekey setzt die Stream-Position auf 0 zurück (Recycle-Vertrag)", () => {
    const rng = new EnemyAiRng();
    rng.rekey(SEED, 11);
    const first = [rng.next(), rng.next(), rng.next(), rng.next(), rng.next()];
    // Weiterziehen verschiebt die Position…
    const later = rng.next();
    // …dasselbe (Seed, UID) setzt auf Position 0 zurück (neue Inkarnation).
    rng.rekey(SEED, 11);
    expect([rng.next(), rng.next(), rng.next(), rng.next(), rng.next()]).toEqual(first);
    expect(later).not.toBe(first[0]);
    // Andere UID → anderer Stream.
    rng.rekey(SEED, 12);
    expect(rng.next()).not.toBe(first[0]);
  });

  it("attachEnemyAiStream hält die Objekt-Identität (Pooling, kein Churn) und sä't in-place um", () => {
    const target: { aiRng: AiRng } = { aiRng: new EnemyAiRng() };
    const a = attachEnemyAiStream(target, SEED, 1);
    expect(target.aiRng).toBe(a);
    const b = attachEnemyAiStream(target, SEED, 2);
    expect(b).toBe(a);
    // Fremdes AiRng (Stub) wird durch einen eigenen Stream ersetzt.
    const stub: AiRng = { next: () => 0.5 };
    const t2: { aiRng: AiRng } = { aiRng: stub };
    const c = attachEnemyAiStream(t2, SEED, 3);
    expect(c).not.toBe(stub);
    expect(t2.aiRng).toBe(c);
    expect(c.next()).not.toBe(0.5);
  });

  it(`Entscheidungskette ist kadenzunabhängig: dt 1/60 vs 1/30, ${N} Gegner, 0 divergente UIDs`, () => {
    const a = controlRun(1 / 60, SECONDS, N, SEED, "peruid");
    const b = controlRun(1 / 30, SECONDS, N, SEED, "peruid");
    // Es muss überhaupt gezogen haben (phaser/orbiter ziehen im KI-Zug).
    const drawers = [...a.values()].filter((v) => v.length > 3).length;
    expect(drawers).toBeGreaterThan(5);
    expect(divergentUids(a, b, N)).toEqual([]);
  });

  it("Kontrolle (alter Defekt): gemeinsamer Stream divergiert weiterhin über Kadenzen", () => {
    const a = controlRun(1 / 60, SECONDS, N, SEED, "shared");
    const b = controlRun(1 / 30, SECONDS, N, SEED, "shared");
    const div = divergentUids(a, b, N);
    expect(div.length).toBeGreaterThan(0);
  });

  it("resetAiState baut den Initialzustand rein aus (Seed, UID) — zwei Gegner mit gleichem (Seed, UID) sind bitgleich", () => {
    const mk = () => {
      const rng = new EnemyAiRng();
      rng.rekey(SEED, 21);
      const state = newAiState({ next: () => 0 });
      resetAiState(state, rng);
      return state;
    };
    const s1 = mk();
    const s2 = mk();
    expect(s1.timer).toBe(s2.timer);
    expect(s1.cooldown).toBe(s2.cooldown);
    expect(s1.orbitDir).toBe(s2.orbitDir);
    expect(s1.mode).toBe(s2.mode);
  });
});

// ── Pool-Ebene: Fallback sä't pro UID (Verträge aus enemy-ai-rng.test.ts unangetastet) ──

vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));
vi.mock("../src/gfx/textures", () => ({ SPRITE_FRAMES: { enemy_bog_rat: ["frame0", "frame1"] } }));
vi.mock("../src/gfx/depth", () => ({ DEPTH: { enemy: 1, boss: 2, death: 3, trail: 4, fxLow: 5, decal: 6 } }));
vi.mock("../src/gfx/atlas", () => {
  const makeSprite = () => {
    const o: Record<string, unknown> = {};
    for (const k of [
      "setScale", "setVisible", "setActive", "setAlpha", "clearTint", "setDepth",
      "setPosition", "setOrigin", "setBlendMode", "setTexture", "setTint",
    ]) o[k] = () => o;
    return o;
  };
  return { makeImage: makeSprite, applyTexture: () => {}, currentFrame: () => "frame0" };
});

describe("EnemyPool-Fallback: Stream-Adressierung pro UID", () => {
  it("zwei Pools mit gleichem Seed liefern je UID bitgleiche Initial-KI-Zustände", async () => {
    const { EnemyPool } = await import("../src/systems/EnemyPool");
    const fakeScene = () => {
      const makeSprite = () => {
        const o: Record<string, unknown> = {};
        for (const k of [
          "setScale", "setVisible", "setActive", "setAlpha", "clearTint", "setDepth",
          "setPosition", "setOrigin", "setBlendMode", "setTexture", "setTint",
        ]) o[k] = () => o;
        return o;
      };
      return { add: { sprite: makeSprite, image: makeSprite } };
    };
    const spawnInitials = () => {
      const pool = new EnemyPool(fakeScene() as never, SEED);
      const def = {
        id: "test_rat", name: "Testratte", hp: 10, damage: 1, radius: 5, speed: 20,
        archetype: "chaser", tier: 0, spriteKey: "enemy_bog_rat",
      } as never;
      return Array.from({ length: 12 }, (_, i) => {
        const e = pool.spawn(def, 10 + i, 10 + i);
        return { uid: e.uid, timer: e.ai.timer, cooldown: e.ai.cooldown, orbitDir: e.ai.orbitDir };
      });
    };
    expect(spawnInitials()).toEqual(spawnInitials());
  });
});
