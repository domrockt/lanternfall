#!/usr/bin/env node
// M10-ai-budget K1/K4: Deterministischer CPU-Bench fuer stepEnemyAi mit 500 Gegnern.
//
// Misst ms/Frame fuer stepEnemyAi gesamt (gemischter Crowd-Spawn) und je Archetyp
// (500 Gegner desselben Archetyps). Rein logisch — kein Renderer, kein Server,
// daher OHNE flock. JSON geht nach shots/m10-ai-budget-<tag>.json.
//
//   node --experimental-strip-types scripts/m10-ai-budget.mjs --tag=baseline
//   node --experimental-strip-types scripts/m10-ai-budget.mjs --tag=after
//
// Distanzringe spiegeln das Endgame (Minute 25, Deckel 500): die Horde drängt
// an den Spieler heran — die Mehrheit steht nahe (< 220 px), der Rest verteilt
// sich auf Mittel- und Fernbereich (Gegner ausserhalb des 640x360-Sichtbereichs
// haben bis zu 367 px halbe Bildschirmdiagonale, Fernring = Spawn-Wolke/LOD).
import { writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = String(argOf("tag", "baseline"));
const OUT = String(argOf("json", `shots/m10-ai-budget-${TAG}.json`));
const ENEMIES = Number(argOf("enemies", "500"));
const FRAMES = Number(argOf("frames", "300"));
const PASSES = Number(argOf("passes", "11"));
const DT = 1 / 60;
const SEED = 20261127;

const { stepEnemyAi, newAiState, aiProfileFor, ARCHETYPES } = await import(
  new URL("../src/logic/enemy-ai.ts", import.meta.url)
);
const { mulberry32 } = await import(new URL("../src/logic/rng.ts", import.meta.url));

/** Mulberry32 als AiRng-Stub (wie in tests/enemy-ai.test.ts). */
function rngFor(seed) {
  const next = mulberry32(seed);
  return { next };
}

// Ring-Verteilung: 50% nah (<220), 30% mittel (220-420), 20% fern (>420).
function ringDistance(i) {
  const bucket = i % 10;
  const r = rngFor(SEED + i * 7919).next();
  if (bucket < 5) return 40 + r * 180; // 40..220
  if (bucket < 8) return 220 + r * 200; // 220..420
  return 420 + r * 280; // 420..700
}

function ringAngle(i) {
  // Gleichmaessige Winkelverteilung + Goldener-Winkel-Jitter (deterministisch).
  return (i / ENEMIES) * Math.PI * 2 + rngFor(SEED + i * 104729).next() * 0.6;
}

/** Archetyp-Mix wie im Endgame-Crowd: viele kleine Verfolger, wenige Spezialisten. */
const ARCHETYPE_WEIGHTS = {
  swarm: 0.3,
  chaser: 0.22,
  tank: 0.08,
  ranged: 0.1,
  charger: 0.07,
  splitter: 0.07,
  exploder: 0.05,
  phaser: 0.04,
  orbiter: 0.04,
  summoner: 0.03,
};

function archetypeFor(i) {
  const r = rngFor(SEED + i * 15485863).next();
  let acc = 0;
  for (const [a, w] of Object.entries(ARCHETYPE_WEIGHTS)) {
    acc += w;
    if (r < acc) return a;
  }
  return "chaser";
}

/** Ein Crowd-Setup: Position/RNG/State fest verdrahtet, ueber alle Passes identisch. */
function buildCrowd(archetypeFilter) {
  const enemies = [];
  for (let i = 0; i < ENEMIES; i++) {
    const archetype = archetypeFilter ?? archetypeFor(i);
    const tier = i % 6;
    const dist = ringDistance(i);
    const ang = ringAngle(i);
    // aiProfileFor waermt die Profil-Tabelle (erster Zugriff baut lazy nichts,
    // die Tabelle ist beim Import fertig — Zugriff hier nur als Sanity-Check).
    aiProfileFor(archetype, tier);
    enemies.push({
      archetype,
      tier,
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist,
      playerX: 0,
      playerY: 0,
      speed: 70,
      rng: rngFor(SEED + i * 31),
      state: newAiState(rngFor(SEED + i * 101)),
      uid: i + 1,
    });
  }
  return enemies;
}

function makeParams(e) {
  return {
    archetype: e.archetype,
    tier: e.tier,
    x: e.x,
    y: e.y,
    playerX: e.playerX,
    playerY: e.playerY,
    speed: e.speed,
  };
}

/** Ein Pass: 60 Warmup-Frames (erste volle Steps, Cache fuellt sich), dann FRAMES gemessen. */
function runPassMs(enemies) {
  for (let f = 0; f < 60; f++) {
    for (const e of enemies) e.state = stepEnemyAi(e.state, makeParams(e), DT, e.rng, e.uid).state;
  }
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    for (const e of enemies) {
      e.state = stepEnemyAi(e.state, makeParams(e), DT, e.rng, e.uid).state;
    }
  }
  return (performance.now() - t0) / FRAMES;
}

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

// ── Gesamtmessung: gemischte Crowd ──
// Kopfzahl = Minimum ueber die Passes (Micro-Benchmark-Standard: der schnellste
// Pass liegt am naechsten an den echten CPU-Kosten; Median steht daneben im JSON).
const crowd = buildCrowd(null);
const passMs = [];
for (let p = 0; p < PASSES; p++) passMs.push(runPassMs(crowd));
passMs.sort((a, b) => a - b);
const totalMsPerFrame = passMs[0];

// ── Je Archetyp: reiner Block von 500 Gegnern desselben Typs ──
const perArchetypePure = {};
for (const a of ARCHETYPES) {
  const block = buildCrowd(a);
  const ms = [];
  for (let p = 0; p < PASSES; p++) ms.push(runPassMs(block));
  ms.sort((x, y) => x - y);
  perArchetypePure[a] = round(ms[0]);
}

mkdirSync("shots", { recursive: true });
const report = {
  tag: TAG,
  date: new Date().toISOString(),
  config: {
    enemies: ENEMIES,
    framesPerPass: FRAMES,
    passes: PASSES,
    warmupFrames: 60,
    dt: DT,
    seed: SEED,
    distanceRings: { near: "40-220 px (50%)", mid: "220-420 px (30%)", far: "420-700 px (20%)" },
    archetypeWeights: ARCHETYPE_WEIGHTS,
  },
  results: {
    totalMsPerFrame: round(totalMsPerFrame),
    passMsPerFrame: passMs.map((m) => round(m)),
    perArchetypePureMsPerFrame: perArchetypePure,
  },
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(
  `stepEnemyAi @ ${ENEMIES} Gegner: ${report.results.totalMsPerFrame} ms/Frame (min ueber ${PASSES} Passes) -> ${OUT}`,
);
