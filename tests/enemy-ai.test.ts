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
 * Simuliert `stepEnemyAi` je Gegnertyp 2 × 60 s bei festem dt (1/60 s) mit
 * Stub-RNG (Seeds 101/202). Zwei Startszenarien decken Annäherung UND
 * Bedrängung ab: Start 210 px (Anlauf) und Start 55 px (Druck/Rückzug).
 * Der Spieler steht im Ursprung. Die Simulation wendet nur die von der KI
 * gelieferte Wunschrichtung/-geschwindigkeit an — exakt das, was `Run.ts` tut —
 * und misst daraus Archetyp-Signaturen. Keine Sprites, keine Kamera, kein Frame.
 */

const DT = 1 / 60;
const SECONDS = 60;
const WARMUP_SECONDS = 5;
const PLAYER_X = 0;
const PLAYER_Y = 0;
const START_FAR = 210;
const START_NEAR = 55;
/** Kontaktabstand: darunter wird die Bewegung geklemmt (wie Kollision im Run). */
const CONTACT = 10;
/** Splitter-Kinder starten in der Matrix wieder in diesem Ring. */
const SPLIT_RESPAWN = 120;
const EXPLODE_RESPAWN = 170;

export interface MatrixMetrics {
  id: string;
  archetype: string;
  tier: number;
  /** Arithmetischer Mittelwert des Abstands zum Spieler (px, beide Starts). */
  meanDist: number;
  /** Standardabweichung des Abstands (px, beide Starts). */
  distStd: number;
  /** Anteil der Schritte mit Bewegung zum Spieler (dot > 0.3). */
  forwardShare: number;
  /** Anteil der Schritte mit Bewegung vom Spieler weg (dot < -0.3). */
  retreatShare: number;
  /** Scharfe Richtungswechsel pro Sekunde (Heading-Delta > 0.5 rad). */
  turnRate: number;
  /** Mittlere Heading-Änderung in Grad/s (Kursänderung, auch sanft). */
  headingRate: number;
  /** Anteil der Zeit mit aktivem Telegraph (windup/charge/fuse). */
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
  actions: AiAction[];
}

function stubRng(seed: number): AiRng {
  const next = mulberry32(seed);
  return { next };
}

function simulate(def: EnemyDef, seed: number, startDist: number, chase: boolean): SimOutput {
  const rng = stubRng(seed);
  let state: AiState = newAiState(rng);
  let x = startDist;
  let y = 0;
  let splitDepth = 0;
  // Druck-Szenario: der Spieler läuft dem Gegner nach (18 px/s), damit
  // Distanzhalter ihr Rückzugsverhalten tatsächlich zeigen können.
  let playerX = PLAYER_X;
  let playerY = PLAYER_Y;
  const PLAYER_CHASE_SPEED = 18;

  let distSum = 0;
  let distSqSum = 0;
  let distSamples = 0;
  let forwardSteps = 0;
  let retreatSteps = 0;
  let turnCount = 0;
  let headingTurn = 0;
  let stepCount = 0;
  let telegraphSteps = 0;
  let burstSteps = 0;
  let speedMulSum = 0;
  let contactSteps = 0;
  let splitEvents = 0;
  let summonEvents = 0;
  let blinkEvents = 0;
  let explodeEvents = 0;
  let shootEvents = 0;

  let prevHeading: number | null = null;
  const actions: AiAction[] = [];

  const steps = Math.round(SECONDS / DT);
  const warmupSteps = Math.round(WARMUP_SECONDS / DT);

  for (let i = 0; i < steps; i++) {
    if (chase) {
      const pdx = x - playerX;
      const pdy = y - playerY;
      const pdist = Math.hypot(pdx, pdy);
      if (pdist > 0.0001) {
        playerX += (pdx / pdist) * PLAYER_CHASE_SPEED * DT;
        playerY += (pdy / pdist) * PLAYER_CHASE_SPEED * DT;
      }
    }
    const dx = playerX - x;
    const dy = playerY - y;
    const dist = Math.hypot(dx, dy);

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
    for (const action of step.actions) {
      actions.push(action);
      switch (action.type) {
        case "windup":
        case "charge":
          telegraphSteps += Math.round(action.duration / DT);
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
          {
            const a = rng.next() * Math.PI * 2;
            x = Math.cos(a) * EXPLODE_RESPAWN;
            y = Math.sin(a) * EXPLODE_RESPAWN;
          }
          break;
      }
    }

    const beforeX = x;
    const beforeY = y;
    // Bewegung anwenden (nur Richtung × Basisgeschwindigkeit × speedMul × dt).
    const speed = def.speed * step.speedMul;
    x += step.moveX * speed * DT;
    y += step.moveY * speed * DT;

    // Kontakt klemmen: kein Durchlaufen des Spielers, keine Nullrichtung.
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
    const newDist = Math.hypot(playerX - x, playerY - y);
    const ndx = playerX - x;
    const ndy = playerY - y;
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
      if (state.fuse > 0) telegraphSteps += 1;

      const movedX = x - beforeX;
      const movedY = y - beforeY;
      if (Math.hypot(movedX, movedY) > 0.01) {
        const heading = Math.atan2(movedY, movedX);
        if (prevHeading !== null) {
          let delta = heading - prevHeading;
          if (delta > Math.PI) delta -= Math.PI * 2;
          if (delta < -Math.PI) delta += Math.PI * 2;
          headingTurn += Math.abs(delta);
          if (Math.abs(delta) > 0.5) turnCount += 1;
        }
        prevHeading = heading;
      }
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
      headingRate: round((headingTurn * 180) / Math.PI / SECONDS, 1),
      telegraphShare: round(telegraphSteps / Math.round(SECONDS / DT), 3),
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

/**
 * Beide Startszenarien je Seed. Distanz-/Bewegungs-Metriken stammen aus dem
 * Anlauf-Szenario (210 px, statischer Spieler) und bleiben so mit #K1
 * vergleichbar; der Rückzugsanteil kommt aus dem Druck-Szenario (55 px,
 * nachlaufender Spieler), weil Distanzhalter sonst nie zurückweichen müssen.
 * Events werden über beide Szenarien summiert.
 */
function simulateCombined(def: EnemyDef, seed: number): MatrixMetrics {
  const far = simulate(def, seed, START_FAR, false).metrics;
  const near = simulate(def, seed, START_NEAR, true).metrics;
  return {
    id: def.id,
    archetype: def.archetype,
    tier: def.tier,
    meanDist: far.meanDist,
    distStd: far.distStd,
    forwardShare: far.forwardShare,
    retreatShare: near.retreatShare,
    turnRate: far.turnRate,
    headingRate: far.headingRate,
    telegraphShare: far.telegraphShare,
    burstShare: far.burstShare,
    meanSpeedMul: far.meanSpeedMul,
    contactShare: far.contactShare,
    splitEvents: far.splitEvents + near.splitEvents,
    summonEvents: far.summonEvents + near.summonEvents,
    blinkEvents: far.blinkEvents + near.blinkEvents,
    explodeEvents: far.explodeEvents + near.explodeEvents,
    shootEvents: far.shootEvents + near.shootEvents,
  };
}

function matrixFor(seed: number): MatrixMetrics[] {
  return ENEMY_LIST.map((def) => simulateCombined(def, seed));
}

function markdownTable(rowsBySeed: Record<number, MatrixMetrics[]>): string {
  const seeds = Object.keys(rowsBySeed).map(Number);
  const first = rowsBySeed[seeds[0]];
  const header = [
    "Gegner", "Archetyp", "Tier",
    ...seeds.flatMap((s) => [
      `ØDist ${s}`, `σDist ${s}`, `Vorw ${s}`, `Rück ${s}`,
      `Dreh/s ${s}`, `Lenk°/s ${s}`, `Tel ${s}`, `Burst ${s}`, `Kontakt ${s}`,
    ]),
    ...seeds.map((s) => `Split ${s}`),
    ...seeds.map((s) => `Summon ${s}`),
    ...seeds.map((s) => `Blink ${s}`),
    ...seeds.map((s) => `Explode ${s}`),
    ...seeds.map((s) => `Shoot ${s}`),
  ];
  const lines = [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`];
  for (let i = 0; i < first.length; i++) {
    const cells = [first[i].id, first[i].archetype, String(first[i].tier)];
    for (const s of seeds) {
      const r = rowsBySeed[s][i];
      cells.push(
        String(r.meanDist), String(r.distStd), String(r.forwardShare), String(r.retreatShare),
        String(r.turnRate), String(r.headingRate), String(r.telegraphShare),
        String(r.burstShare), String(r.contactShare),
      );
    }
    for (const s of seeds) cells.push(String(rowsBySeed[s][i].splitEvents));
    for (const s of seeds) cells.push(String(rowsBySeed[s][i].summonEvents));
    for (const s of seeds) cells.push(String(rowsBySeed[s][i].blinkEvents));
    for (const s of seeds) cells.push(String(rowsBySeed[s][i].explodeEvents));
    for (const s of seeds) cells.push(String(rowsBySeed[s][i].shootEvents));
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

const rows101 = matrixFor(101);
const rows202 = matrixFor(202);

describe("Enemy-KI Verhaltensmatrix (deterministisch)", () => {

  it("simuliert je Gegnertyp 2 × 60 s mit Seeds 101 und 202", () => {
    expect(rows101).toHaveLength(ENEMY_LIST.length);
    expect(rows202).toHaveLength(ENEMY_LIST.length);

    // Determinismus: derselbe Seed liefert exakt dieselbe Matrix.
    expect(matrixFor(101)).toEqual(rows101);
    expect(matrixFor(202)).toEqual(rows202);

    // Alle Messwerte sind endlich (keine NaN durch degenerate Richtungen).
    for (const r of [...rows101, ...rows202]) {
      for (const [key, value] of Object.entries(r)) {
        if (key === "id" || key === "archetype") continue;
        expect(Number.isFinite(Number(value)), `${r.id}.${key}`).toBe(true);
      }
    }

    // Maschinenlesbarer Beleg (wird in shots/ committet).
    console.log("MATRIX-JSON:" + JSON.stringify({
      seeds: [101, 202],
      seconds: SECONDS,
      startDistances: [START_FAR, START_NEAR],
      dt: DT,
      rows: { "101": rows101, "202": rows202 },
    }));

    const table = markdownTable({ 101: rows101, "202": rows202 });
    console.log(`\n<!-- ENEMY-AI-MATRIX\n${table}\n-->\n`);
  });
});

/** Nachschlagen der Matrixzeile per Gegner-ID (deterministisch, Seed 101). */
function rowOf(id: string, rows: MatrixMetrics[]): MatrixMetrics {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`Matrixzeile für ${id} fehlt`);
  return row;
}

/** Archetyp-Cluster: messbare Signatur, unabhängig von Sprite/Sichtbarkeit. */
export const CLUSTERS = {
  /** Nahkämpfer: rennen auf den Spieler zu, kaum Ausweichen. */
  assault: ["swarm", "chaser", "tank"],
  /** Stürmer: Sprint-Fenster + Telegraph. */
  charger: ["charger"],
  /** Distanzhalter: Abstandsband und Rückzug unter Druck. */
  kite: ["ranged"],
  /** Rufer: bleibt weit hinten, ruft Events. */
  summoner: ["summoner"],
  /** Flanker: kreist mit hoher Kursänderung in fester Bahn. */
  flanker: ["orbiter"],
  /** Spezialisten: zählen eigene Ereignisse (Split/Blink/Explode). */
  specialist: ["splitter", "exploder", "phaser"],
} as const;

describe("Abdeckung der Verhaltensmatrix", () => {
  it("30 Typen, 10 Archetypen, jeder Archetyp genau einem Cluster zugeordnet", () => {
    expect(ENEMY_LIST.length).toBe(30);
    expect(new Set(ENEMY_LIST.map((d) => d.id)).size).toBe(30);
    const archetypes = [...new Set(ENEMY_LIST.map((d) => d.archetype))].sort();
    expect(archetypes).toEqual([
      "charger", "chaser", "exploder", "orbiter", "phaser",
      "ranged", "splitter", "summoner", "swarm", "tank",
    ]);
    expect(rows101).toHaveLength(30);
    // CLUSTERS muss jeden Archetyp genau einmal enthalten — sonst wäre die
    // Cluster-Doku nicht durch die Matrix gedeckt.
    const clustered = Object.values(CLUSTERS).flat().sort();
    expect(clustered).toEqual(archetypes);
    for (const [cluster, list] of Object.entries(CLUSTERS)) {
      for (const archetype of list) {
        expect(
          rows101.some((r) => r.archetype === archetype),
          `${cluster}: ${archetype} fehlt in der Matrix`,
        ).toBe(true);
      }
    }
  });

  it("Events entstehen nur beim zuständigen Archetyp", () => {
    for (const r of rows101) {
      expect(r.blinkEvents > 0, `${r.id}: Blink nur Phaser`).toBe(r.archetype === "phaser");
      expect(r.summonEvents > 0, `${r.id}: Summon nur Summoner`).toBe(r.archetype === "summoner");
      expect(r.explodeEvents > 0, `${r.id}: Explode nur Exploder`).toBe(r.archetype === "exploder");
      expect(r.splitEvents > 0, `${r.id}: Split nur Splitter`).toBe(r.archetype === "splitter");
      expect(r.shootEvents > 0, `${r.id}: Schuss nur Ranged`).toBe(r.archetype === "ranged");
    }
  });
});

describe("Verhaltenscluster (mindestens 4 klar verschieden)", () => {
  it("assault: hoher Vorwärtsanteil, Chaser/Tank ohne Kursflattern", () => {
    for (const r of rows101.filter((x) => x.archetype === "swarm")) {
      expect(r.forwardShare, `${r.id} vorwärts`).toBeGreaterThan(0.75);
      // Schwarm webt sichtbar: deutlich mehr Kursänderung als gerade Verfolger.
      expect(r.headingRate, `${r.id} Weben`).toBeGreaterThan(60);
      expect(r.turnRate, `${r.id} Weben`).toBeGreaterThan(0.3);
    }
    for (const r of rows101.filter((x) => x.archetype === "chaser" || x.archetype === "tank")) {
      expect(r.forwardShare, `${r.id} vorwärts`).toBeGreaterThan(0.9);
      expect(r.headingRate, `${r.id} gerade`).toBeLessThan(20);
    }
    // Tank ist die langsamste Walze (Stemm-Phase), Chaser stoßen vor.
    const meanSpeed = (archetype: string) =>
      rows101.filter((r) => r.archetype === archetype).reduce((a, r) => a + r.meanSpeedMul, 0) /
      rows101.filter((r) => r.archetype === archetype).length;
    expect(meanSpeed("tank")).toBeLessThan(meanSpeed("chaser"));
    expect(rowOf("treant", rows101).meanSpeedMul).toBeLessThan(0.9);
    expect(rowOf("skeleton", rows101).burstShare).toBeGreaterThan(0.05);
  });

  it("charger: Sprint-Anteil und Telegraph vorhanden", () => {
    for (const r of rows101.filter((x) => x.archetype === "charger")) {
      expect(r.burstShare, `${r.id} Sprint`).toBeGreaterThan(0.05);
      expect(r.telegraphShare, `${r.id} Telegraph`).toBeGreaterThan(0.08);
    }
    expect(rowOf("centipede", rows101).burstShare).toBeGreaterThan(rowOf("ghoul", rows101).burstShare);
  });

  it("kite: Ranged hält Abstand und zieht sich unter Druck zurück", () => {
    for (const r of rows101.filter((x) => x.archetype === "ranged")) {
      expect(r.meanDist, `${r.id} Abstand`).toBeGreaterThan(80);
      expect(r.retreatShare, `${r.id} Rückzug`).toBeGreaterThan(0.03);
      expect(r.shootEvents, `${r.id} Schüsse`).toBeGreaterThan(8);
      expect(r.headingRate, `${r.id} Kurs`).toBeLessThan(60);
    }
    // Höhere Ranged-Tiere halten größeren Abstand als toad.
    expect(rowOf("horror", rows101).meanDist).toBeGreaterThan(rowOf("toad", rows101).meanDist);
  });

  it("summoner: bleibt weit hinten und ruft Minions", () => {
    for (const r of rows101.filter((x) => x.archetype === "summoner")) {
      expect(r.meanDist, `${r.id} Abstand`).toBeGreaterThan(120);
      expect(r.summonEvents, `${r.id} Rufe`).toBeGreaterThan(5);
      expect(r.forwardShare, `${r.id} Vorwärts`).toBeLessThan(0.6);
    }
    // Höherer Summoner ruft häufiger.
    expect(rowOf("voidcaller", rows101).summonEvents).toBeGreaterThan(rowOf("cultist", rows101).summonEvents);
  });

  it("flanker: umkreist mit hoher Kursänderung in fester Bahn", () => {
    for (const r of rows101.filter((x) => x.archetype === "orbiter")) {
      expect(r.headingRate, `${r.id} Kurs`).toBeGreaterThan(30);
      expect(r.distStd, `${r.id} Streuung`).toBeLessThan(30);
      expect(r.meanDist, `${r.id} Bahnradius`).toBeGreaterThan(60);
      expect(r.meanDist, `${r.id} Bahnradius`).toBeLessThan(115);
    }
  });

  it("specialist: Split-, Blink- und Explode-Events sind messbar", () => {
    // Untere Schwellen orientieren sich an der dokumentierten Matrix
    // (4 Splits, 46–48 Blinks, 39–49 Explosionen), nicht nur an > 0.
    for (const r of rows101.filter((x) => x.archetype === "splitter")) {
      expect(r.splitEvents, `${r.id} Splits`).toBeGreaterThanOrEqual(2);
      expect(r.splitEvents + r.summonEvents + r.blinkEvents + r.explodeEvents,
        `${r.id} fremde Events`).toBe(r.splitEvents);
    }
    for (const r of rows101.filter((x) => x.archetype === "phaser")) {
      expect(r.blinkEvents, `${r.id} Blinks`).toBeGreaterThanOrEqual(40);
      expect(r.splitEvents + r.summonEvents + r.blinkEvents + r.explodeEvents,
        `${r.id} fremde Events`).toBe(r.blinkEvents);
    }
    for (const r of rows101.filter((x) => x.archetype === "exploder")) {
      expect(r.explodeEvents, `${r.id} Explosionen`).toBeGreaterThanOrEqual(20);
      expect(r.splitEvents + r.summonEvents + r.blinkEvents + r.explodeEvents,
        `${r.id} fremde Events`).toBe(r.explodeEvents);
    }
  });

  it("die Cluster-Kriterien sind trennscharf (Flanker vs. Kiter)", () => {
    // Flanker und Kiter teilen sich hohe Distanz, trennen sich aber über die
    // Kursänderung (Orbiter kreist stark, Ranged kreuzt nur leicht) und über
    // den Rückzug (nur Ranged weicht unter Druck aktiv aus).
    for (const r of rows101.filter((x) => x.archetype === "orbiter")) {
      expect(r.headingRate, `${r.id} Umkreisung`).toBeGreaterThan(30);
    }
    for (const r of rows101.filter((x) => x.archetype === "ranged")) {
      expect(r.retreatShare, `${r.id} Rückzug`).toBeGreaterThan(0.03);
      expect(r.headingRate, `${r.id} Kreuzen`).toBeLessThan(60);
    }
    // Nahkampf-Cluster (assault + charger + splitter) liegt unter 60 px
    // Ø-Abstand, Kiter/Summoner/Flanker darüber — messbar getrennt.
    const melee = rows101.filter((r) => ["swarm", "chaser", "tank", "charger", "splitter"].includes(r.archetype));
    const rangedGroups = rows101.filter((r) => ["ranged", "summoner", "orbiter"].includes(r.archetype));
    for (const r of melee) expect(r.meanDist, `${r.id} nah`).toBeLessThan(60);
    for (const r of rangedGroups) expect(r.meanDist, `${r.id} fern`).toBeGreaterThan(60);
  });
});
