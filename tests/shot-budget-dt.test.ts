import { describe, expect, it, vi } from "vitest";

// M10-shot-budget-dt: Das Gegner-Schuss-Budget haengt an SIM-Zeit-Fenstern
// (ENEMY_SHOT_BUDGET_WINDOW_SECONDS = 1/60 s), nicht am Frame-Strom. Der Test
// Laufzeitlogik (echter Pool, Atlas-Mock) — nicht nur Konstanten:
//
//   (a) Budget gilt je Sim-Zeit-Fenster; ein update(dt > Fenster) dreht alle
//       abgelaufenen Fenster weiter.
//   (b) Leere Fenster rotieren nicht — die Rotation ist eine Funktion der
//       Versuche, nicht der Frame-Anzahl (sonst stuende das Dienst-Fenster
//       bei groben dt-Haeppchen still und dieselben Schuetzen gewaennen).
//   (c) Gleicher Seed + gleiche Versuche an gleichen Sim-Zeiten -> bitgleiche
//       Launch-/Telegraph-Marken bei dt=1/60 vs dt=1/30 (K1-Befund beseitigt).
//   (d) Fairness-Invarianten aus #7491 unveraendert: Telegraph-Cap, Budget-
//       Rueckgabe bei Telegraph-Mangel, Rotation gegen Starving.
//   (e) clear() setzt die Budget-Uhr vollstaendig zurueck (deterministisch
//       pro Szene).
//
// tests/enemy-shots-fair.test.ts bleibt unveraendert gruen (Fenster-Referenz:
// fester 16,67-ms-Frame = genau ein Sim-Zeit-Fenster -> bitgleich zu #7491).

const atlas = vi.hoisted(() => {
  const makeImg = () => {
    const o: Record<string, unknown> = {};
    for (const m of [
      "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint", "clearTint",
      "setRotation", "setVisible", "setActive", "setPosition", "setTexture", "destroy",
    ]) o[m] = () => o;
    return o;
  };
  return { makeImg };
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

import { EnemyProjectilePool } from "../src/systems/EnemyProjectiles";
import { mulberry32 } from "../src/logic/rng";

interface FakeEnemy { x: number; y: number; alive: boolean }

const noopHit = () => undefined;
const EPS = 1e-9;

function fakeScene(view = { x: 0, y: 0, width: 640, height: 360 }) {
  const scene = {
    textures: { exists: () => true, addCanvas: vi.fn() },
    add: { image: () => atlas.makeImg() },
    cameras: { main: { scrollX: view.x, scrollY: view.y, width: view.width, height: view.height } },
    tweens: { add: vi.fn() },
    enemies: { active: [] as FakeEnemy[] },
  };
  return scene as unknown as import("phaser").Scene & {
    cameras: { main: { worldView: { x: number; y: number; width: number; height: number } } };
    enemies: { active: FakeEnemy[] };
  };
}

function spots(n: number): Array<{ x: number; y: number }> {
  return Array.from({ length: n }, (_, i) => ({ x: 30 + (i % 8) * 60, y: 30 + Math.floor(i / 8) * 50 }));
}

const TEXTURES = ["enemy_shot_spit", "enemy_shot_bone", "enemy_shot_shadow", "enemy_shot_fire"];

interface Mark { t: number; n: number; ids?: number[] }

/**
 * Deterministischer Minilauf (wie scripts/m10-shot-budget-dt.mjs): Versuche
 * werden an festen SIM-ZEITEN (1/30-Raster) erzeugt, nicht je Frame; alle
 * Versuche stationaer (vx=vy=0) -> Ursprung = Platz-Index = Identitaet.
 */
function runSequence(opts: {
  dt: number; seconds: number; attemptStep: number;
  attemptsPerStep: number; spotCount: number; seed: number;
}): { telegraphMarks: Mark[]; launchMarks: Mark[]; stats: ReturnType<EnemyProjectilePool["statSnapshot"]> } {
  const { dt, seconds, attemptStep, attemptsPerStep, spotCount, seed } = opts;
  const scene = fakeScene();
  const pool = new EnemyProjectilePool(scene);
  const pts = spots(spotCount);
  scene.enemies.active = pts.map((s) => ({ x: s.x, y: s.y, alive: true }));
  const rng = mulberry32(seed);
  const telegraphMarks: Mark[] = [];
  const launchMarks: Mark[] = [];
  const r60 = (t: number) => Math.round(t * 60) / 60;
  let simTime = 0;
  let nextAttempt = 0;
  let prevFired = 0;
  let activeIds = new Map<number, number>();

  const drain = (t: number) => {
    const before = pool.statSnapshot().pending;
    for (let k = 0; k < attemptsPerStep; k++) {
      const s = pts[Math.floor(rng() * spotCount) % spotCount];
      pool.spawn({
        x: s.x, y: s.y, vx: 0, vy: 0, damage: 1,
        texture: TEXTURES[Math.floor(rng() * TEXTURES.length) % TEXTURES.length],
        life: 0.5,
      });
    }
    telegraphMarks.push({ t: r60(t), n: pool.statSnapshot().pending - before });
  };

  const frames = Math.round(seconds / dt);
  for (let f = 0; f < frames; f++) {
    while (nextAttempt <= simTime + EPS && nextAttempt <= seconds + EPS) {
      drain(nextAttempt);
      nextAttempt += attemptStep;
    }
    pool.update(dt, -9999, -9999, noopHit);
    simTime += dt;
    const fired = pool.statSnapshot().fired;
    if (fired !== prevFired) {
      const now = new Map<number, number>();
      for (const shot of pool.active) {
        const idx = pts.findIndex((s) => s.x === shot.x && s.y === shot.y);
        now.set(idx, (now.get(idx) ?? 0) + 1);
      }
      const ids: number[] = [];
      for (const [idx, c] of now) {
        for (let k = 0; k < c - (activeIds.get(idx) ?? 0); k++) ids.push(idx);
      }
      ids.sort((a, b) => a - b);
      launchMarks.push({ t: r60(simTime), n: fired - prevFired, ids });
      activeIds = now;
      prevFired = fired;
    }
  }
  return { telegraphMarks, launchMarks, stats: pool.statSnapshot() };
}

describe("M10-shot-budget-dt — Budget-Fenster an Sim-Zeit", () => {
  it("(a) Budget gilt je Sim-Zeit-Fenster: 24 Versuche im ersten Fenster -> genau 8 pending", () => {
    const pool = new EnemyProjectilePool(fakeScene());
    pool.setShotCaps({ activeCap: 500, launchBudgetPerFrame: 8 });
    // Versuche ohne update() dazwischen: alle im Fenster 0.
    for (const s of spots(24)) {
      pool.spawn({ x: s.x, y: s.y, vx: 0, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 2 });
    }
    const snap = pool.statSnapshot();
    expect(snap.pending).toBe(8);
    expect(pool.budgetSnapshot().cancelledBudgetRotation).toBe(16);
    expect(pool.budgetSnapshot().cancelledBudgetCap).toBe(0);
  });

  it("(a) ein update(dt > Fenster) dreht alle abgelaufenen Fenster weiter: Budget danach wieder offen", () => {
    const pool = new EnemyProjectilePool(fakeScene());
    pool.setShotCaps({ activeCap: 500, launchBudgetPerFrame: 8 });
    for (const s of spots(24)) {
      pool.spawn({ x: s.x, y: s.y, vx: 0, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 2 });
    }
    expect(pool.statSnapshot().pending).toBe(8);
    // dt=0.1 schliesst 6 Fenster von 1/60 s — das Budget ist danach wieder
    // offen: von 24 neuen Versuchen werden genau 8 zugelassen (dienst-
    // fenstergesteuert, Start steht bei 8 -> Positionen 16..23 sind dran).
    pool.update(0.1, -9999, -9999, noopHit);
    for (const s of spots(24)) {
      pool.spawn({ x: s.x, y: s.y, vx: 0, vy: 0, damage: 1, texture: "enemy_shot_bone", life: 2 });
    }
    expect(pool.statSnapshot().pending).toBe(16);
  });

  it("(b) leere Fenster rotieren nicht: bei dt=0.1 (6 Fenster je update) kommen alle 12 Schuetzen dran", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    const pts = spots(12);
    scene.enemies.active = pts.map((s) => ({ x: s.x, y: s.y, alive: true }));
    pool.setShotCaps({ activeCap: 500, launchBudgetPerFrame: 3 });

    const launchCounts = new Map<number, number>();
    for (let f = 0; f < 60; f++) {
      for (const s of pts) {
        pool.spawn({ x: s.x, y: s.y, vx: 0, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 0.5 });
      }
      pool.update(0.1, -9999, -9999, noopHit);
      for (const shot of pool.active) {
        launchCounts.set(shot.x, (launchCounts.get(shot.x) ?? 0) + 1);
      }
    }
    // Wuerden die 5 leeren Fenster je update rotieren (Start auf 0 zurueck-
    // gesetzt), gewaenne immer dieselbe Dreiergruppe — 9 Plaetze blieben leer.
    for (const s of pts) {
      expect(launchCounts.get(s.x) ?? 0, `Platz ${s.x} verhungert`).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("M10-shot-budget-dt — dt-Determinismus", () => {
  it("(c) gleicher Seed + Versuche an gleichen Sim-Zeiten: dt=1/60 und dt=1/30 geben bitgleiche Marken", () => {
    const base = {
      seconds: 2.5, attemptStep: 1 / 30, attemptsPerStep: 9, spotCount: 24, seed: 7505,
    };
    const seq60 = runSequence({ ...base, dt: 1 / 60 });
    const seq30 = runSequence({ ...base, dt: 1 / 30 });
    expect(seq60.launchMarks.length).toBeGreaterThan(10);
    expect(seq60.launchMarks).toEqual(seq30.launchMarks);
    expect(seq60.telegraphMarks).toEqual(seq30.telegraphMarks);
    expect(seq60.stats.fired).toBe(seq30.stats.fired);
    expect(seq60.stats.cancelledShooterDeath).toBe(seq30.stats.cancelledShooterDeath);
  });

  it("(e) clear() setzt die Budget-Uhr zurueck: nach clear() ist das Budget voll erneut offen", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    pool.setShotCaps({ activeCap: 500, launchBudgetPerFrame: 8 });
    for (const s of spots(24)) {
      pool.spawn({ x: s.x, y: s.y, vx: 0, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 2 });
    }
    expect(pool.statSnapshot().pending).toBe(8);
    pool.update(0.37, -9999, -9999, noopHit); // viele Fenster gedreht
    pool.clear();
    for (const s of spots(24)) {
      pool.spawn({ x: s.x, y: s.y, vx: 0, vy: 0, damage: 1, texture: "enemy_shot_bone", life: 2 });
    }
    expect(pool.statSnapshot().pending).toBe(8);
  });
});

describe("M10-shot-budget-dt — Fairness-Invarianten aus #7491 unveraendert", () => {
  it("(d) Budget-Rueckgabe bei Telegraph-Mangel: abgelehnte Versuche kosten keinen Slot", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    // Budget 97 > Telegraph-Cap 96: der 97. In-View-Versuch wird vom Budget
    // zugelassen, scheitert aber am Telegraph-Pool — der Slot MUSS zurueck-
    // gegeben werden, damit der 98. Versuch wieder zugelassen wird.
    pool.setShotCaps({ activeCap: 500, launchBudgetPerFrame: 97 });
    scene.enemies.active = [{ x: 320, y: 180, alive: true }];
    for (let i = 0; i < 96; i++) {
      pool.spawn({ x: 20 + (i % 300), y: 20 + ((i * 7) % 300), vx: 10, vy: 0, damage: 1, texture: "enemy_shot_spit" });
    }
    expect(pool.statSnapshot().pending).toBe(96);
    pool.spawn({ x: 330, y: 190, vx: 10, vy: 0, damage: 1, texture: "enemy_shot_spit" });
    pool.spawn({ x: 340, y: 200, vx: 10, vy: 0, damage: 1, texture: "enemy_shot_spit" });
    const stats = pool.statSnapshot();
    expect(stats.cancelledNoTelegraph).toBe(2);
    expect(pool.budgetSnapshot().cancelledBudgetRotation).toBe(0);
    expect(stats.fired).toBe(0);
  });

  it("(d) Rotation gegen Starving gilt weiter: alle 12 Schuetzen bekommen bei Budget 3 ihren Anteil", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    const pts = spots(12);
    scene.enemies.active = pts.map((s) => ({ x: s.x, y: s.y, alive: true }));
    pool.setShotCaps({ activeCap: 500, launchBudgetPerFrame: 3 });
    const launchCounts = new Map<number, number>();
    for (let f = 0; f < 90; f++) {
      for (const s of pts) {
        pool.spawn({ x: s.x, y: s.y, vx: 0, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 0.5 });
      }
      pool.update(1 / 60, -9999, -9999, noopHit);
      for (const shot of pool.active) {
        launchCounts.set(shot.x, (launchCounts.get(shot.x) ?? 0) + 1);
      }
    }
    for (const s of pts) {
      expect(launchCounts.get(s.x) ?? 0, `Platz ${s.x} verhungert`).toBeGreaterThanOrEqual(10);
    }
  });

  it("(d) festes 1/60-dt: genau ein Fenster je Frame — je Frame genau 8 neue Zuteilungen", () => {
    const scene = fakeScene();
    const pool = new EnemyProjectilePool(scene);
    pool.setShotCaps({ activeCap: 500, launchBudgetPerFrame: 8 });
    for (let f = 1; f <= 10; f++) {
      for (const s of spots(24)) {
        pool.spawn({ x: s.x, y: s.y, vx: 0, vy: 0, damage: 1, texture: "enemy_shot_spit", life: 2 });
      }
      pool.update(1 / 60, -9999, -9999, noopHit);
      // Windup ist 0,36 s: bis Frame 10 launcht nichts — pending zaehlt also
      // exakt die Zuteilungen. Je Frame genau 8 (Budget oeffnet sich neu,
      // nichts sammelt sich ueber Frames an, nichts wird doppelt vergeben).
      expect(pool.statSnapshot().pending).toBe(8 * f);
    }
    expect(pool.budgetSnapshot().cancelledBudgetCap).toBe(0);
  });
});
