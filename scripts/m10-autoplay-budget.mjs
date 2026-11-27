#!/usr/bin/env node
// m10-autoplay-budget K1/K5: Deterministischer CPU-Bench fuer den AutoPlay-Bot.
//
// Misst ms/Frame fuer botDirection (500 Gegner + Projektile + Warnflaechen +
// Gems) und chooseBestOffer (3 Angebote, Level-up-Kontext). Rein logisch —
// kein Renderer, kein Server, daher OHNE flock. JSON geht nach
// shots/m10-autoplay-<tag>.json.
//
//   node --experimental-strip-types scripts/m10-autoplay-budget.mjs --tag=before
//   node --experimental-strip-types scripts/m10-autoplay-budget.mjs --tag=after
//
// Aequivalenz: ueber alle gemessenen Frames wird ein bit-exakter
// Entscheidungs-Hash (FNV-1a ueber den IEEE-754-Bits von Richtung und
// Offer-Index) gefuehrt. Gleicher Seed + identische Logik => identischer Hash.
// Vorher/Nachher-Vergleich in K5 belegt Entscheidungsgleichheit.
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { rolldown } from "rolldown";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = String(argOf("tag", "before"));
const OUT = String(argOf("json", `shots/m10-autoplay-${TAG}.json`));
// Quellordner (Default src): erlaubt faire A/B-Laeufe gegen einen alten Stand,
// z. B. --src=$HOME/tmp/m10-autoplay-budget/before-src
const SRC = String(argOf("src", "src"));
const ENEMIES = Number(argOf("enemies", "500"));
const PROJECTILES = Number(argOf("projectiles", "48"));
const HAZARDS = Number(argOf("hazards", "8"));
const GEMS = Number(argOf("gems", "220"));
const FRAMES = Number(argOf("frames", "300"));
const PASSES = Number(argOf("passes", "11"));
const WORLD = 960;
const SEED = 20261127;

// ── TS-Logik buendeln (rolldown ist Vite-8-Dependency) ────────────────
const BUNDLE = join(tmpdir(), "m10-autoplay-budget", `autoplay-bundle-${TAG}.mjs`);
mkdirSync(dirname(BUNDLE), { recursive: true });
const bundle = await rolldown({ input: resolve(SRC, "logic/autoplay.ts") });
await bundle.write({ file: BUNDLE, format: "esm" });
await bundle.close();
const { botDirection, chooseBestOffer } = await import(BUNDLE);
const { mulberry32 } = await import(new URL("../src/logic/rng.ts", import.meta.url));

const rngFor = (seed) => {
  const next = mulberry32(seed);
  return { next };
};

// Entfernungsringe wie im Endgame (Minute 25, Deckel 500): der Grossteil
// draengt nah heran, der Rest verteilt sich auf Sichtbereich + Spawn-Wolke.
function ringDistance(i) {
  const bucket = i % 10;
  const r = rngFor(SEED + i * 7919).next();
  if (bucket < 5) return 40 + r * 180; // 40..220
  if (bucket < 8) return 220 + r * 200; // 220..420
  return 420 + r * 280; // 420..700
}

const ringAngle = (i) =>
  (i / ENEMIES) * Math.PI * 2 + rngFor(SEED + i * 104729).next() * 0.6;

function buildEnemies() {
  const enemies = [];
  for (let i = 0; i < ENEMIES; i++) {
    const dist = ringDistance(i);
    const ang = ringAngle(i);
    enemies.push({
      x: WORLD / 2 + Math.cos(ang) * dist,
      y: WORLD / 2 + Math.sin(ang) * dist,
      radius: 5 + (i % 4),
      threat: 1.0,
    });
  }
  return enemies;
}

function buildProjectiles() {
  const projectiles = [];
  for (let i = 0; i < PROJECTILES; i++) {
    const ang = rngFor(SEED + i * 6700417).next() * Math.PI * 2;
    const dist = 60 + rngFor(SEED + i * 17).next() * 420;
    projectiles.push({
      x: WORLD / 2 + Math.cos(ang) * dist,
      y: WORLD / 2 + Math.sin(ang) * dist,
      vx: Math.cos(ang + 1.2) * 140,
      vy: Math.sin(ang + 1.2) * 140,
      radius: 4,
      threat: 2.2,
    });
  }
  return projectiles;
}

function buildHazards() {
  const hazards = [];
  for (let i = 0; i < HAZARDS; i++) {
    const ang = rngFor(SEED + i * 31337).next() * Math.PI * 2;
    const dist = 80 + rngFor(SEED + i * 97).next() * 300;
    hazards.push({
      x: WORLD / 2 + Math.cos(ang) * dist,
      y: WORLD / 2 + Math.sin(ang) * dist,
      radius: 28 + rngFor(SEED + i * 41).next() * 20,
      threat: 3.0,
    });
  }
  return hazards;
}

function buildGems() {
  const gems = [];
  for (let i = 0; i < GEMS; i++) {
    const ang = rngFor(SEED + i * 15485863).next() * Math.PI * 2;
    const dist = 20 + rngFor(SEED + i * 23).next() * 240;
    gems.push({
      x: WORLD / 2 + Math.cos(ang) * dist,
      y: WORLD / 2 + Math.sin(ang) * dist,
    });
  }
  return gems;
}

const enemies = buildEnemies();
const projectiles = buildProjectiles();
const hazards = buildHazards();
const gems = buildGems();
const chests = [
  { x: WORLD / 2 + 300, y: WORLD / 2 - 200 },
  { x: WORLD / 2 - 260, y: WORLD / 2 + 180 },
];

// Level-up-Kontext: typischer Mid-Game-Build (Fokus frosch -> eternal_winter).
const OFFERS = [
  { kind: "weapon", id: "frost", name: "Frost", description: "", level: 6, isNew: false, iconColor: 0 },
  { kind: "passive", id: "heart", name: "Herz", description: "", level: 3, isNew: false, iconColor: 0 },
  { kind: "passive", id: "boots", name: "Stiefel", description: "", level: 2, isNew: true, iconColor: 0 },
];
const BUILD = {
  weapons: [
    { id: "frost", level: 6 },
    { id: "lantern", level: 3 },
  ],
  passives: [
    { id: "heart", level: 3 },
    { id: "boots", level: 2 },
    { id: "tome", level: 4 },
  ],
  startingWeapon: "frost",
};

/** FNV-1a ueber IEEE-754-Bits: bit-exakter Entscheidungs-Hash. */
function hashValue(h, value) {
  let bits;
  if (typeof value === "number" && Number.isFinite(value)) {
    const f = new Float64Array(1);
    f[0] = value;
    bits = new Uint32Array(f.buffer);
  } else {
    bits = new Uint32Array([value | 0]);
  }
  for (let b = 0; b < bits.length; b++) {
    h ^= bits[b];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Ein Pass: 30 Warmup-Frames, dann FRAMES gemessen (botDirection und
 *  chooseBestOffer je separat). Spieler kreist, Projektile fliegen weiter
 *  (lead), sodass sich die Eingaben pro Frame aendern. */
function runPass() {
  const melee = false;
  let dirHash = 0x811c9dc5;
  let offerHash = 0x811c9dc5;
  const dirSum = { x: 0, y: 0 };

  const frameInput = (f) => {
    const t = f * 0.05;
    const px = WORLD / 2 + Math.cos(t) * 120;
    const py = WORLD / 2 + Math.sin(t) * 90;
    // Projektil-Bewegung deterministisch auf die Basisposition aufaddieren
    // (keine Mutation der Basisobjekte — identische Eingaben je Pass).
    const projs = new Array(PROJECTILES);
    for (let i = 0; i < PROJECTILES; i++) {
      const p = projectiles[i];
      const lead = t * 0.28;
      projs[i] = { x: p.x + p.vx * lead, y: p.y + p.vy * lead, vx: p.vx, vy: p.vy, radius: p.radius, threat: p.threat };
    }
    return {
      playerX: px,
      playerY: py,
      worldSize: WORLD,
      enemies,
      projectiles: projs,
      hazards,
      gems,
      melee,
      boss: { x: WORLD / 2 + Math.cos(t * 0.3) * 180, y: WORLD / 2 + Math.sin(t * 0.3) * 180, radius: 24 },
      chests,
    };
  };

  // Eingaben VOR der Messung bauen (Harness-Allokationen zaehlen nicht mit).
  const inputs = [];
  for (let f = 0; f < 30 + FRAMES; f++) inputs.push(frameInput(f));

  for (let f = 0; f < 30; f++) {
    botDirection(inputs[f]);
    chooseBestOffer(OFFERS, BUILD);
  }

  let t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    const dir = botDirection(inputs[30 + f]);
    dirHash = hashValue(dirHash, dir.x);
    dirHash = hashValue(dirHash, dir.y);
    dirSum.x += dir.x;
    dirSum.y += dir.y;
  }
  const botMsPerFrame = (performance.now() - t0) / FRAMES;

  t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    offerHash = hashValue(offerHash, chooseBestOffer(OFFERS, BUILD));
  }
  const offerMsPerFrame = (performance.now() - t0) / FRAMES;
  return { botMsPerFrame, offerMsPerFrame, dirHash, offerHash, dirSumX: dirSum.x, dirSumY: dirSum.y };
}

const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

const passes = [];
for (let p = 0; p < PASSES; p++) passes.push(runPass());
const botSorted = passes.map((p) => p.botMsPerFrame).sort((a, b) => a - b);
const offerSorted = passes.map((p) => p.offerMsPerFrame).sort((a, b) => a - b);

// Hashes ueber alle Passes identisch? (Warmup + Frame-Folge sind pass-genau gleich.)
const dirHashes = new Set(passes.map((p) => p.dirHash));
const offerHashes = new Set(passes.map((p) => p.offerHash));

mkdirSync("shots", { recursive: true });
const report = {
  tag: TAG,
  date: new Date().toISOString(),
  config: {
    enemies: ENEMIES,
    projectiles: PROJECTILES,
    hazards: HAZARDS,
    gems: GEMS,
    worldSize: WORLD,
    framesPerPass: FRAMES,
    passes: PASSES,
    warmupFrames: 30,
    seed: SEED,
    offersPerCall: OFFERS.length,
  },
  results: {
    botDirectionMsPerFrame: round(botSorted[0]),
    botDirectionMedianMsPerFrame: round(botSorted[Math.floor(botSorted.length / 2)]),
    chooseBestOfferMsPerFrame: round(offerSorted[0]),
    chooseBestOfferMedianMsPerFrame: round(offerSorted[Math.floor(offerSorted.length / 2)]),
    botDirectionPassMsPerFrame: passes.map((p) => round(p.botMsPerFrame)),
    decisionHash: {
      direction: `0x${passes[0].dirHash.toString(16)}`,
      offerIndex: `0x${passes[0].offerHash.toString(16)}`,
      directionStableAcrossPasses: dirHashes.size === 1,
      offerIndexStableAcrossPasses: offerHashes.size === 1,
      dirSumX: round(passes[0].dirSumX, 9),
      dirSumY: round(passes[0].dirSumY, 9),
    },
  },
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(
  `botDirection @ ${ENEMIES} Gegner: ${report.results.botDirectionMsPerFrame} ms/Frame ` +
    `(median ${report.results.botDirectionMedianMsPerFrame}) -> ${OUT}`,
);
console.log(
  `chooseBestOffer (3 Offers): ${report.results.chooseBestOfferMsPerFrame} ms/Call ` +
    `(median ${report.results.chooseBestOfferMedianMsPerFrame})`,
);
console.log(
  `decisionHash: dir=${report.results.decisionHash.direction} offer=${report.results.decisionHash.offerIndex}`,
);
