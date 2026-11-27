import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/logic/rng";
import {
  newAiState,
  shouldSplit,
  stepEnemyAi,
  type AiAction,
  type AiRng,
  type AiState,
} from "../src/logic/enemy-ai";
import { ENEMY_LIST } from "../src/data/enemies";
import type { AiParams } from "../src/logic/enemy-ai";
import type { EnemyDef } from "../src/data/types";

/**
 * Deterministische Verhaltensmatrix ohne Renderer.
 *
 * Simuliert `stepEnemyAi` je Gegnertyp 60 s bei festem dt (1/60 s) mit einem
 * Stub-RNG (Seeds 101/202). Der Spieler steht still im Ursprung; der Gegner
 * startet 210 px entfernt. Die Simulation wendet nur die von der KI gelieferte
 * Wunschrichtung/-geschwindigkeit an — exakt das, was `Run.ts` tut — und misst
 * daraus Archetyp-Signaturen (Abstand, Vorwärtsanteil, Richtungswechsel,
 * Telegraph, Events). Keine Sprites, keine Kamera, keine Zeitabhängigkeit.
 */

const DT = 1 / 60;
const SECONDS = 60;
const WARMUP_SECONDS = 5;
const PLAYER_X = 0;
const PLAYER_Y = 0;
const START_DIST = 210;
/** Kontaktabstand: darunter wird die Bewegung geklemmt (wie Kollision im Run). */
const CONTACT = 10;
/** Splitter-Kinder starten in der Matrix wieder in diesem Ring. */
const SPLIT_RESPAWN = 120;
const EXPLODE_RESPAWN = 170;

export interface MatrixMetrics {
  id: string;
  archetype: string;
  tier: number;
  /** Arithmetischer Mittelwert des Abstands zum Spieler (px). */
  meanDist: number;
  /** Standardabweichung des Abstands (px). */
  distStd: number;
  /** Anteil der Schritte mit Bewegung zum Spieler (dot > 0.3). */
  forwardShare: number;
  /** Anteil der Schritte mit Bewegung vom Spieler weg (dot < -0.3). */
  retreatShare: number;
  /** Richtungswechsel pro Sekunde (> 14° zwischen zwei Schritten). */
  turnRate: number;
  /** Anteil der Zeit mit aktivem Telegraph (windup/charge-Dauer). */
  telegraphShare: number;
  /** Anteil der Schritte mit Sprint-Multiplikator > 1.5. */
  burstShare: number;
  /** Ø Geschwindigkeits-Multiplikator. */
  meanSpeedMul: number;
  /** Anteil der Zeit in Kontakt mit dem Spieler. */
  contactShare: number;
  splitEvents: number;
  summonEvents: number;
  blinkEvents: number;
  explodeEvents: number;
  shootEvents: number;
}

interface SimOutput {
  metrics: MatrixMetrics;
  /** Alle ausgegebenen Aktionen (für Assertions/Diagnose). */
  actions: AiAction[];
}

function stubRng(seed: number): AiRng {
  const next = mulberry32(seed);
  return { next };
}

function simulate(def: EnemyDef, seed: number): SimOutput {
  const rng = stubRng(seed);
  let state: AiState = newAiState(rng);
  let x = START_DIST;
  let y = 0;
  let splitDepth = 0;

  let distSum = 0;
  let distSqSum = 0;
  let distSamples = 0;
  let forwardSteps = 0;
  let retreatSteps = 0;
  let turnCount = 0;
  let stepCount = 0;
  let telegraphTime = 0;
  let burstSteps = 0;
  let speedMulSum = 0;
  let contactSteps = 0;
  let splitEvents = 0;
  let summonEvents = 0;
  let blinkEvents = 0;
  let explodeEvents = 0;
  let shootEvents = 0;

  let prevMx = 0;
  let prevMy = 0;
  const actions: AiAction[] = [];

  const steps = Math.round(SECONDS / DT);
  const warmupSteps = Math.round(WARMUP_SECONDS / DT);

  for (let i = 0; i < steps; i++) {
    const dx = PLAYER_X - x;
    const dy = PLAYER_Y - y;
    const dist = Math.hypot(dx, dy);
    const inv = dist > 0.0001 ? 1 / dist : 0;

    const params: AiParams = {
      archetype: def.archetype,
      tier: def.tier,
      x,
      y,
      playerX: PLAYER_X,
      playerY: PLAYER_Y,
      speed: def.speed,
    };

    const step = stepEnemyAi(state, params, DT, rng, 1);
    state = step.state;
    for (const action of step.actions) {
      actions.push(action);
      switch (action.type) {
        case "windup":
        case "charge":
          telegraphTime += action.duration;
          break;
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
        case "explode":
          explodeEvents += 1;
          // Im Spiel stirbt der Exploder; für die Matrix wird er neu gesetzt,
          // damit die 60-s-Messung nicht nach dem ersten Treffer endet.
          {
            const a = rng.next() * Math.PI * 2;
            x = Math.cos(a) * EXPLODE_RESPAWN;
            y = Math.sin(a) * EXPLODE_RESPAWN;
          }
          break;
      }
    }

    // Bewegung anwenden (nur Richtung × Basisgeschwindigkeit × speedMul × dt).
    const speed = def.speed * step.speedMul;
    x += step.moveX * speed * DT;
    y += step.moveY * speed * DT;

    // Kontakt klemmen: kein Durchlaufen des Spielers, keine Nullrichtung.
    const afterDx = PLAYER_X - x;
    const afterDy = PLAYER_Y - y;
    const afterDist = Math.hypot(afterDx, afterDy);
    if (afterDist < CONTACT) {
      if (afterDist > 0.0001) {
        x = PLAYER_X - (afterDx / afterDist) * CONTACT;
        y = PLAYER_Y - (afterDy / afterDist) * CONTACT;
      } else {
        x = CONTACT;
        y = 0;
      }
    }
    const newDist = Math.hypot(PLAYER_X - x, PLAYER_Y - y);
    const ndx = PLAYER_X - x;
    const ndy = PLAYER_Y - y;
    const nlen = Math.hypot(ndx, ndy) || 1;
    const dot = step.moveX * (ndx / nlen) + step.moveY * (ndy / nlen);

    // Splitter: im Spiel teilt er beim Tod (Run.ts, shouldSplit). Die Matrix
    // modelliert den Kontakt als Todeszeitpunkt und zählt echte Splits.
    if (def.archetype === "splitter" && newDist <= CONTACT + 0.5 && shouldSplit(splitDepth)) {
      splitDepth += 1;
      splitEvents += 1;
      const a = rng.next() * Math.PI * 2;
      x = Math.cos(a) * SPLIT_RESPAWN;
      y = Math.sin(a) * SPLIT_RESPAWN;
    }

    if (i >= warmupSteps) {
      stepCount += 1;
      distSum += newDist;
      distSqSum += newDist * newDist;
      distSamples += 1;
      speedMulSum += step.speedMul;
      if (dot > 0.3) forwardSteps += 1;
      if (dot < -0.3) retreatSteps += 1;
      if (step.speedMul > 1.5) burstSteps += 1;
      if (newDist <= CONTACT + 0.5) contactSteps += 1;
      if (prevMx !== 0 || prevMy !== 0) {
        const angle = Math.acos(Math.max(-1, Math.min(1, step.moveX * prevMx + step.moveY * prevMy)));
        if (angle > 0.25) turnCount += 1;
      }
      prevMx = step.moveX;
      prevMy = step.moveY;
    }
  }

  const meanDist = distSamples > 0 ? distSum / distSamples : 0;
  const variance = distSamples > 0 ? Math.max(0, distSqSum / distSamples - meanDist * meanDist) : 0;
  return {
    metrics: {
      id: def.id,
      archetype: def.archetype,
      tier: def.tier,
      meanDist: round(meanDist, 1),
      distStd: round(Math.sqrt(variance), 1),
      forwardShare: round(forwardSteps / Math.max(1, stepCount), 3),
      retreatShare: round(retreatSteps / Math.max(1, stepCount), 3),
      turnRate: round(turnCount / SECONDS, 2),
      telegraphShare: round(telegraphTime / SECONDS, 3),
      burstShare: round(burstSteps / Math.max(1, stepCount), 3),
      meanSpeedMul: round(speedMulSum / Math.max(1, stepCount), 2),
      contactShare: round(contactSteps / Math.max(1, stepCount), 3),
      splitEvents,
      summonEvents,
      blinkEvents,
      explodeEvents,
      shootEvents,
    },
    actions,
  };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function matrixFor(seed: number): MatrixMetrics[] {
  return ENEMY_LIST.map((def) => simulate(def, seed).metrics);
}

function meanMetric(rows: MatrixMetrics[], key: keyof MatrixMetrics): number {
  const values = rows.map((r) => Number(r[key]));
  return round(values.reduce((a, b) => a + b, 0) / values.length, 2);
}

function markdownTable(rowsBySeed: Record<number, MatrixMetrics[]>): string {
  const seeds = Object.keys(rowsBySeed).map(Number);
  const first = rowsBySeed[seeds[0]];
  const header = [
    "Gegner", "Archetyp", "Tier",
    ...seeds.flatMap((s) => [`ØDist ${s}`, `Vorw ${s}`, `Dreh/s ${s}`, `Tel ${s}`, `Burst ${s}`]),
    ...seeds.map((s) => `Split ${s}`),
    ...seeds.map((s) => `Summon ${s}`),
    ...seeds.map((s) => `Blink ${s}`),
    ...seeds.map((s) => `Shoot ${s}`),
  ];
  const lines = [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`];
  for (let i = 0; i < first.length; i++) {
    const cells = [first[i].id, first[i].archetype, String(first[i].tier)];
    for (const s of seeds) {
      const r = rowsBySeed[s][i];
      cells.push(String(r.meanDist), String(r.forwardShare), String(r.turnRate), String(r.telegraphShare), String(r.burstShare));
    }
    for (const s of seeds) cells.push(String(rowsBySeed[s][i].splitEvents));
    for (const s of seeds) cells.push(String(rowsBySeed[s][i].summonEvents));
    for (const s of seeds) cells.push(String(rowsBySeed[s][i].blinkEvents));
    for (const s of seeds) cells.push(String(rowsBySeed[s][i].shootEvents));
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

describe("Enemy-KI Verhaltensmatrix (deterministisch)", () => {
  it("simuliert 60 s je Gegnertyp mit Seeds 101 und 202", () => {
    const rows101 = matrixFor(101);
    const rows202 = matrixFor(202);
    expect(rows101).toHaveLength(ENEMY_LIST.length);
    expect(rows202).toHaveLength(ENEMY_LIST.length);

    // Determinismus: derselbe Seed liefert exakt dieselbe Matrix.
    expect(matrixFor(101)).toEqual(rows101);
    expect(matrixFor(202)).toEqual(rows202);

    // Alle Werte sind endlich (keine NaN durch degenerate Richtungen).
    for (const r of [...rows101, ...rows202]) {
      console.log("BAD:", r.id, Object.entries(r).filter(([, v]) => !Number.isFinite(Number(v))));
      for (const value of Object.values(r)) {
        expect(Number.isFinite(Number(value))).toBe(true);
      }
    }

    // Maschinenlesbarer Beleg (wird in shots/ committet): eine Zeile pro Seed.
    console.log("MATRIX-JSON:" + JSON.stringify({
      seeds: [101, 202],
      seconds: SECONDS,
      dt: DT,
      rows: { "101": rows101, "202": rows202 },
    }));

    const table = markdownTable({ 101: rows101, "202": rows202 });
    console.log(`\n<!-- ENEMY-AI-MATRIX\n${table}\n-->\n`);
    console.log("MATRIX-ARCHETYPEN:", meanMetric(rows101, "meanDist"));
  });
});
