import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mulberry32 } from "../src/logic/rng";
import {
  AI_STAGGER,
  newAiState,
  stepEnemyAi,
  type AiParams,
  type AiRng,
  type AiState,
} from "../src/logic/enemy-ai";
import { ENEMY_LIST } from "../src/data/enemies";
import type { EnemyDef } from "../src/data/types";

/**
 * Verhaltens-Tests für das gestaffelte AI-Update (K3, Lane m10-ai-budget).
 *
 * Beweisziele:
 * 1. Spieler-nahe Gegner (< AI_STAGGER.nearDistance) steppen JEDEN Frame — ihr
 *    Verhalten ist bitidentisch zum ausgeschalteten Staggering (Intervall 1).
 * 2. Die Cluster-Signaturen aus tests/enemy-ai.test.ts brechen auch mit
 *    Staggering nicht (Toleranzen gegen die Referenz ohne Staffelung).
 * 3. Skip-Frames liefern die letzte Entscheidung ohne Aktionen und ohne
 *    RNG-Züge; Timer laufen realzeitlich weiter (Entscheidungskadenz bleibt).
 * 4. Die Step-Phase wird über die Gegner-UID verteilt.
 */

const DT = 1 / 60;
const SECONDS = 20;
const CONTACT = 10;
const SPLIT_RESPAWN = 120;
const EXPLODE_RESPAWN = 170;

function rngFor(seed: number): AiRng {
  const next = mulberry32(seed);
  return { next };
}

interface SimMetrics {
  meanDist: number;
  forwardShare: number;
  retreatShare: number;
  headingRate: number;
  splitEvents: number;
  summonEvents: number;
  blinkEvents: number;
  explodeEvents: number;
  shootEvents: number;
  /** Voller KI-Steps (Entscheidungsframes) — bei Staggering < Frames. */
  decisionFrames: number;
}

/**
 * Kompakte Simulation wie in tests/enemy-ai.test.ts (Bewegung anwenden,
 * Kontakt klemmen, Events zählen). `pinDist`: Gegner wird nach jedem Frame
 * auf diese Distanz zurückgesetzt — damit bleibt er garantiert in einem
 * Distanzring und der Vergleich on/off ist exakt.
 */
function simulate(
  def: EnemyDef,
  seed: number,
  startDist: number,
  opts: { chase?: boolean; pinDist?: number } = {},
): SimMetrics {
  const rng = rngFor(seed);
  let state: AiState = newAiState(rng);
  let x = startDist;
  let y = 0;
  let playerX = 0;
  let playerY = 0;
  let splitDepth = 0;

  let distSum = 0;
  let forwardSteps = 0;
  let retreatSteps = 0;
  let headingTurn = 0;
  let stepCount = 0;
  let decisionFrames = 0;
  let splitEvents = 0;
  let summonEvents = 0;
  let blinkEvents = 0;
  let explodeEvents = 0;
  let shootEvents = 0;
  let prevHeading: number | null = null;

  const steps = Math.round(SECONDS / DT);
  for (let i = 0; i < steps; i++) {
    if (opts.chase) {
      const pdx = x - playerX;
      const pdy = y - playerY;
      const pdist = Math.hypot(pdx, pdy);
      if (pdist > 0.0001) {
        playerX += (pdx / pdist) * 18 * DT;
        playerY += (pdy / pdist) * 18 * DT;
      }
    }
    const dx = playerX - x;
    const dy = playerY - y;

    const wasDue = state.aiStepIn === undefined || state.aiStepIn === 0;
    const params: AiParams = {
      archetype: def.archetype,
      tier: def.tier,
      x,
      y,
      playerX,
      playerY,
      speed: def.speed,
    };
    const step = stepEnemyAi(state, params, DT, rng, 1);
    state = step.state;
    if (wasDue) decisionFrames += 1;
    for (const action of step.actions) {
      switch (action.type) {
        case "summon":
          summonEvents += 1;
          break;
        case "blink":
          x = action.x;
          y = action.y;
          blinkEvents += 1;
          break;
        case "shoot":
          shootEvents += 1;
          break;
        case "explode": {
          explodeEvents += 1;
          const a = rng.next() * Math.PI * 2;
          x = Math.cos(a) * EXPLODE_RESPAWN;
          y = Math.sin(a) * EXPLODE_RESPAWN;
          break;
        }
        default:
          break;
      }
    }

    const beforeX = x;
    const beforeY = y;
    const speed = def.speed * step.speedMul;
    x += step.moveX * speed * DT;
    y += step.moveY * speed * DT;

    const afterDx = playerX - x;
    const afterDy = playerY - y;
    const afterDist = Math.hypot(afterDx, afterDy);
    if (afterDist < CONTACT) {
      if (afterDist > 0.0001) {
        x = playerX - (afterDx / afterDist) * CONTACT;
        y = playerY - (afterDy / afterDist) * CONTACT;
      } else {
        x = CONTACT;
        y = 0;
      }
    }

    if (def.archetype === "splitter" && afterDist <= CONTACT + 0.5 && splitDepth < 2) {
      splitDepth += 1;
      splitEvents += 1;
      const a = rng.next() * Math.PI * 2;
      x = Math.cos(a) * SPLIT_RESPAWN;
      y = Math.sin(a) * SPLIT_RESPAWN;
    }

    if (opts.pinDist !== undefined) {
      const len = Math.hypot(x - playerX, y - playerY) || 1;
      x = playerX + ((x - playerX) / len) * opts.pinDist;
      y = playerY + ((y - playerY) / len) * opts.pinDist;
    }

    const newDist = Math.hypot(playerX - x, playerY - y);
    const ndx = playerX - x;
    const ndy = playerY - y;
    const nlen = Math.hypot(ndx, ndy) || 1;
    const dot = step.moveX * (ndx / nlen) + step.moveY * (ndy / nlen);
    stepCount += 1;
    distSum += newDist;
    if (dot > 0.3) forwardSteps += 1;
    if (dot < -0.3) retreatSteps += 1;
    const movedX = x - beforeX;
    const movedY = y - beforeY;
    if (Math.hypot(movedX, movedY) > 0.01) {
      const heading = Math.atan2(movedY, movedX);
      if (prevHeading !== null) {
        let delta = heading - prevHeading;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        headingTurn += Math.abs(delta);
      }
      prevHeading = heading;
    }
  }

  return {
    meanDist: distSum / Math.max(1, stepCount),
    forwardShare: forwardSteps / Math.max(1, stepCount),
    retreatShare: retreatSteps / Math.max(1, stepCount),
    headingRate: (headingTurn * 180) / Math.PI / SECONDS,
    splitEvents,
    summonEvents,
    blinkEvents,
    explodeEvents,
    shootEvents,
    decisionFrames,
  };
}

/** Wie simulate, aber beide Startszenarien kombiniert (Anlauf + Druck). */
function simulateCombined(def: EnemyDef, seed: number): SimMetrics {
  const far = simulate(def, seed, 210);
  const near = simulate(def, seed, 55, { chase: true });
  return {
    meanDist: far.meanDist,
    forwardShare: far.forwardShare,
    retreatShare: near.retreatShare,
    headingRate: far.headingRate,
    splitEvents: far.splitEvents + near.splitEvents,
    summonEvents: far.summonEvents + near.summonEvents,
    blinkEvents: far.blinkEvents + near.blinkEvents,
    explodeEvents: far.explodeEvents + near.explodeEvents,
    shootEvents: far.shootEvents + near.shootEvents,
    decisionFrames: far.decisionFrames + near.decisionFrames,
  };
}

/** Staggering aus, Sim laufen lassen, vorherigen Zustand zurückgeben. */
let savedStagger: typeof AI_STAGGER;
beforeEach(() => {
  savedStagger = { ...AI_STAGGER };
});
afterEach(() => {
  Object.assign(AI_STAGGER, savedStagger);
});

describe("AI-Budget: Spieler-nahe Gegner steppen jeden Frame", () => {
  it("Verhalten mit Staggering ist bitidentisch zu Intervall 1, solange die Distanz unter nearDistance bleibt", () => {
    // Referenz: Staggering komplett aus.
    AI_STAGGER.enabled = false;
    const reference = simulate(ENEMY_LIST[0], 101, 150, { pinDist: 150 });
    AI_STAGGER.enabled = true;
    const staggered = simulate(ENEMY_LIST[0], 101, 150, { pinDist: 150 });
    expect(staggered).toEqual(reference);
    expect(staggered.decisionFrames).toBe(Math.round(SECONDS / DT));
  });

  it("gilt für jeden Archetyp im Nahbereich (gepinnt auf 150 px)", () => {
    AI_STAGGER.enabled = false;
    const refs = ENEMY_LIST.map((d) => simulate(d, 202, 150, { pinDist: 150 }));
    AI_STAGGER.enabled = true;
    for (let i = 0; i < ENEMY_LIST.length; i++) {
      const staggered = simulate(ENEMY_LIST[i], 202, 150, { pinDist: 150 });
      expect(staggered, `${ENEMY_LIST[i].id} weicht im Nahbereich ab`).toEqual(refs[i]);
    }
  });
});

describe("AI-Budget: Cluster-Metriken brechen nicht", () => {
  it("jeder Archetyp bleibt innerhalb Toleranz gegen die Referenz ohne Staggering", () => {
    AI_STAGGER.enabled = false;
    const refs = ENEMY_LIST.map((d) => simulateCombined(d, 101));
    AI_STAGGER.enabled = true;
    const results = ENEMY_LIST.map((d) => simulateCombined(d, 101));
    for (let i = 0; i < ENEMY_LIST.length; i++) {
      const r = results[i];
      const ref = refs[i];
      const id = ENEMY_LIST[i].id;
      expect(Math.abs(r.meanDist - ref.meanDist), `${id} meanDist`).toBeLessThanOrEqual(8);
      expect(Math.abs(r.forwardShare - ref.forwardShare), `${id} forward`).toBeLessThanOrEqual(0.06);
      expect(Math.abs(r.retreatShare - ref.retreatShare), `${id} retreat`).toBeLessThanOrEqual(0.06);
      expect(Math.abs(r.headingRate - ref.headingRate), `${id} heading`).toBeLessThanOrEqual(25);
      for (const key of [
        "splitEvents",
        "summonEvents",
        "blinkEvents",
        "explodeEvents",
        "shootEvents",
      ] as const) {
        // Events entstehen im Fernring seltener (sichtbarer Bereich zählt),
        // aber nicht um mehr als 25 % gegenüber der Referenz.
        expect(r[key], `${id} ${key}`).toBeGreaterThanOrEqual(Math.floor(ref[key] * 0.75));
      }
    }
  });

  it("ferne Gegner steppen seltener, nahe jeden Frame (Entscheidungsbudget sinkt)", () => {
    AI_STAGGER.enabled = true;
    const nearSteps = simulate(ENEMY_LIST[0], 101, 150, { pinDist: 150 }).decisionFrames;
    const farSteps = simulate(ENEMY_LIST[0], 101, 600, { pinDist: 600 }).decisionFrames;
    expect(nearSteps).toBe(Math.round(SECONDS / DT));
    expect(farSteps).toBeLessThanOrEqual(Math.ceil(Math.round(SECONDS / DT) / AI_STAGGER.farInterval) + 2);
    expect(farSteps).toBeGreaterThan(0);
  });

  it("Cluster-Signaturen (wie tests/enemy-ai.test.ts) halten mit Staggering", () => {
    AI_STAGGER.enabled = true;
    const rows = ENEMY_LIST.map((d) => ({ def: d, m: simulateCombined(d, 101) }));
    for (const { def, m } of rows.filter((r) => r.def.archetype === "swarm")) {
      expect(m.forwardShare, `${def.id} vorwärts`).toBeGreaterThan(0.75);
    }
    for (const { def, m } of rows.filter((r) => r.def.archetype === "chaser" || r.def.archetype === "tank")) {
      expect(m.forwardShare, `${def.id} vorwärts`).toBeGreaterThan(0.9);
    }
    for (const { def, m } of rows.filter((r) => r.def.archetype === "ranged")) {
      expect(m.shootEvents, `${def.id} Schüsse`).toBeGreaterThan(8);
      expect(m.retreatShare, `${def.id} Rückzug`).toBeGreaterThan(0.03);
    }
    for (const { def, m } of rows.filter((r) => r.def.archetype === "summoner")) {
      expect(m.summonEvents, `${def.id} Rufe`).toBeGreaterThan(5);
    }
    for (const { def, m } of rows.filter((r) => r.def.archetype === "phaser")) {
      expect(m.blinkEvents, `${def.id} Blinks`).toBeGreaterThan(5);
    }
    for (const { def, m } of rows.filter((r) => r.def.archetype === "exploder")) {
      expect(m.explodeEvents, `${def.id} Explosionen`).toBeGreaterThanOrEqual(8);
    }
    for (const { def, m } of rows.filter((r) => r.def.archetype === "splitter")) {
      expect(m.splitEvents, `${def.id} Splits`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("AI-Budget: Skip-Mechanik", () => {
  it("Skip-Frames liefern dieselbe Richtung, gefroren-leere Aktionen und ziehen keinen RNG", () => {
    AI_STAGGER.enabled = true;
    const rng = rngFor(7);
    let draws = 0;
    const countingRng: AiRng = {
      next: () => {
        draws += 1;
        return rng.next();
      },
    };
    let state: AiState = newAiState(countingRng);
    const params = (x: number): AiParams => ({
      archetype: "chaser",
      tier: 1,
      x,
      y: 0,
      playerX: 0,
      playerY: 0,
      speed: 70,
    });
    // Erster Frame (fern): voller Step mit RNG-Zug (newAiState zieht nicht, aber
    // der Step selbst kann). Danach Skip-Frames: keine weiteren RNG-Züge.
    const first = stepEnemyAi(state, params(600), DT, countingRng, 3);
    state = first.state;
    expect(first.actions).toHaveLength(0);
    const drawsAfterFirst = draws;
    const skip = stepEnemyAi(state, params(600), DT, countingRng, 3);
    state = skip.state;
    expect(draws).toBe(drawsAfterFirst); // kein RNG-Zug im Skip-Frame
    expect(skip.actions).toHaveLength(0);
    expect(skip.actions).toBe(stepEnemyAi(state, params(600), DT, countingRng, 3).actions);
    expect(Object.isFrozen(skip.actions)).toBe(true);
    expect(skip.moveX).toBeCloseTo(first.moveX, 6);
    expect(skip.moveY).toBeCloseTo(first.moveY, 6);
    expect(skip.speedMul).toBe(first.speedMul);
  });

  it("Timer laufen realzeitlich: phaser blinkt trotz Fernring mit gleicher Kadenz", () => {
    AI_STAGGER.enabled = true;
    const def = ENEMY_LIST.find((d) => d.archetype === "phaser")!;
    const m = simulate(def, 303, 600, { pinDist: 600 });
    AI_STAGGER.enabled = false;
    const ref = simulate(def, 303, 600, { pinDist: 600 });
    // Blink-Kadenz bleibt realzeitlich: mit Fernring-Staggering mindestens
    // 75 % der Blink-Events der Jeden-Frame-Referenz (Cooldown ~1.2-2.7 s).
    expect(m.blinkEvents).toBeGreaterThanOrEqual(Math.floor(ref.blinkEvents * 0.75));
    expect(m.blinkEvents).toBeGreaterThan(3);
    expect(m.decisionFrames).toBeLessThan(Math.round(SECONDS / DT));
  });

  it("Step-Phase ist über die Gegner-UID verteilt (nicht alle im selben Frame)", () => {
    AI_STAGGER.enabled = true;
    const build = (uid: number) => {
      const rng = rngFor(11);
      const state = newAiState(rng);
      stepEnemyAi(state, {
        archetype: "chaser",
        tier: 1,
        x: 600,
        y: 0,
        playerX: 0,
        playerY: 0,
        speed: 70,
      }, DT, rng, uid);
      return state.aiStepIn;
    };
    const a = build(1);
    const b = build(2);
    const c = build(3);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).toBe(1 % AI_STAGGER.farInterval);
  });
});
