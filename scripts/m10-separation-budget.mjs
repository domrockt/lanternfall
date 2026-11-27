#!/usr/bin/env node
// M10-Separation-Budget: misst den Separations-/Kollisions-Hot-Path im
// Minute-25-Chaos (500 Gegner, dicht am Spieler) rein rechnerisch, ohne
// Browser/Renderer — damit ist die Messung lastunabhängig und läuft OHNE flock.
//
// Reproduziert exakt den produktiven Pfad aus src/scenes/Run.ts (update):
//   1. hash.clear() + insert je lebendem Gegner   (Rebuild)
//   2. je Gegner im 460-px-Radius um den Spieler: queryCircle(radius+10),
//      Summe der separationPush-Vektoren, Integration  speed*1.2*dt
//   plus das Chase-Movement Richtung Spieler (Minute 25: Horde drängt auf
//   den Spieler), damit die Dichte über die ganze Messung erhalten bleibt.
//
// Gemessen wird pro Frame: ms fuer Rebuild, ms fuer Query+Push+Integration,
// dazu Kandidaten-/Paarzahl und der min-Paarabstand als Trennqualitaet.
//
//   node scripts/m10-separation-budget.mjs --tag=before
//   node scripts/m10-separation-budget.mjs --tag=after --out=shots/m10-separation-budget-after.json
//
// Ausgabe: shots/m10-separation-budget-<tag>.json
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { rolldown } from "rolldown";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline !== undefined) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = String(argOf("tag", "bench"));
const OUT = String(argOf("out", `shots/m10-separation-budget-${TAG}.json`));
const SEED = Number(argOf("seed", "20261127")) || 20261127;
const WARMUP = Number(argOf("warmup", "180")) || 180;
const FRAMES = Number(argOf("frames", "600")) || 600;
const ENEMIES = Number(argOf("enemies", "500")) || 500;
const SAMPLE_EVERY = Number(argOf("sampleEvery", "30")) || 30;

// Minute-25-Mischung wie scripts/m10-crowd-probe.mjs (Summe 500).
const MIX = [
  ["bog_rat", 6, 90],
  ["wisp", 6, 70],
  ["bogzombie", 8, 60],
  ["crow", 5, 70],
  ["skeleton", 7, 60],
  ["bat", 5, 60],
  ["ghoul", 8, 40],
  ["spider", 6, 50],
];

/** mulberry32 — deterministischer PRNG wie in tests/separation-crowd.test.ts. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── TS-Logik bündeln (rolldown ist Vite-8-Dependency) ─────────────────
const BUNDLE = join(tmpdir(), "m10-separation-budget", `separation-bundle-${TAG}.mjs`);
const BUNDLE_HASH = join(tmpdir(), "m10-separation-budget", `hash-bundle-${TAG}.mjs`);
mkdirSync(dirname(BUNDLE), { recursive: true });
const bundle = await rolldown({ input: resolve("src/logic/separation.ts") });
await bundle.write({ file: BUNDLE, format: "esm" });
await bundle.close();
const bundleHash = await rolldown({ input: resolve("src/systems/SpatialHash.ts") });
await bundleHash.write({ file: BUNDLE_HASH, format: "esm" });
await bundleHash.close();
const { separationPush } = await import(BUNDLE);
const { SpatialHash } = await import(BUNDLE_HASH);

// ── Szene: 500 Gegner dicht um den Spieler (Minute-25-Dranglage) ──────
const rng = mulberry32(SEED);
const WORLD = 4096;
const PLAYER = { x: WORLD / 2, y: WORLD / 2 };
const QUERY_RADIUS = 460; // Run.ts: Separation nur im 460-px-Radius
const DT = 1 / 60;

const enemies = [];
let uid = 1;
outer: for (const [id, radius, count] of MIX) {
  for (let i = 0; i < count; i++) {
    if (enemies.length >= ENEMIES) break outer;
    // 70 % im dichten Kern (<=150 px), 30 % verstreut (150..460 px) —
    // beides im Separations-Radius, wie im echten Chaos um den Spieler.
    const core = enemies.length < ENEMIES * 0.7;
    const angle = rng() * Math.PI * 2;
    const dist = core ? Math.sqrt(rng()) * 150 : 150 + rng() * 310;
    enemies.push({
      id,
      uid: uid++,
      alive: true,
      x: PLAYER.x + Math.cos(angle) * dist,
      y: PLAYER.y + Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      radius,
      speed: 48,
    });
  }
}

// Run.ts nutzt Zellgroesse 32 (new SpatialHash<EnemyRuntime>(32)).
const cellHash = new SpatialHash(32);
const scratch = [];

// ── Messlauf ──────────────────────────────────────────────────────────
const rebuildMs = [];
const separationMs = [];
const scratchSum = [];
const pairSum = [];
const minDistSeries = [];
let minDistOverall = Infinity;
let minDistStart = Infinity;

function minPairDistance() {
  let min = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < min) min = d;
    }
  }
  return min;
}

const totalFrames = WARMUP + FRAMES;
for (let f = 0; f < totalFrames; f++) {
  // 1) Rebuild (wie Run.ts update: clear + insert je lebendem Gegner)
  let t0 = performance.now();
  cellHash.clear();
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.alive) cellHash.insert(e);
  }
  let t1 = performance.now();

  // 2) Separation + Movement (wie Run.ts update)
  let scratchCount = 0;
  let pairCount = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const ddx = e.x - PLAYER.x;
    const ddy = e.y - PLAYER.y;
    // Chase: Horde laeuft auf den Spieler (Minute-25-Dranglage haelt an).
    const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
    const mx = (-ddx / dist) * e.speed;
    const my = (-ddy / dist) * e.speed;

    let sx = 0;
    let sy = 0;
    if (ddx * ddx + ddy * ddy < QUERY_RADIUS * QUERY_RADIUS) {
      cellHash.queryCircle(e.x, e.y, e.radius + 10, scratch);
      scratchCount += scratch.length;
      for (let k = 0; k < scratch.length; k++) {
        const n = scratch[k];
        if (n === e || !n.alive) continue;
        pairCount++;
        const push = separationPush(e.x, e.y, e.radius, n.x, n.y, n.radius, e.uid);
        if (push) {
          sx += push.x;
          sy += push.y;
        }
      }
    }
    e.x += (mx + sx * e.speed * 1.2) * DT;
    e.y += (my + sy * e.speed * 1.2) * DT;
    if (e.x < 10) e.x = 10; else if (e.x > WORLD - 10) e.x = WORLD - 10;
    if (e.y < 10) e.y = 10; else if (e.y > WORLD - 10) e.y = WORLD - 10;
  }
  let t2 = performance.now();

  if (f >= WARMUP) {
    rebuildMs.push(t1 - t0);
    separationMs.push(t2 - t1);
    scratchSum.push(scratchCount);
    pairSum.push(pairCount);
  }
  if (f % SAMPLE_EVERY === 0) {
    const d = minPairDistance();
    if (f >= WARMUP) minDistSeries.push({ frame: f, minDist: Math.round(d * 100) / 100 });
    if (f === WARMUP) minDistStart = d;
    if (d < minDistOverall) minDistOverall = d;
  }
}

const finalMinDist = minPairDistance();
if (finalMinDist < minDistOverall) minDistOverall = finalMinDist;

// ── Statistik ─────────────────────────────────────────────────────────
function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = arr.reduce((s, v) => s + v, 0);
  return {
    mean: +(sum / arr.length).toFixed(4),
    median: +sorted[Math.floor(sorted.length / 2)].toFixed(4),
    p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(4),
    max: +sorted[sorted.length - 1].toFixed(4),
  };
}

const result = {
  tag: TAG,
  timestamp: new Date().toISOString(),
  scenario: {
    enemies: enemies.length,
    seed: SEED,
    warmupFrames: WARMUP,
    measuredFrames: FRAMES,
    cellSize: 32,
    queryRadiusPx: QUERY_RADIUS,
    mix: MIX.map(([id, radius, count]) => ({ id, radius, count })),
    note: "reiner Node-Bench des Run.ts-Hot-Pfads (clear+insert, queryCircle+separationPush), ohne Browser — kein flock noetig",
  },
  msPerFrame: {
    rebuild: stats(rebuildMs),
    separation: stats(separationMs),
    total: stats(rebuildMs.map((v, i) => v + separationMs[i])),
  },
  quality: {
    minPairDistanceStart: +minDistStart.toFixed(3),
    minPairDistanceFinal: +finalMinDist.toFixed(3),
    minPairDistanceOverall: +minDistOverall.toFixed(3),
    series: minDistSeries,
  },
  work: {
    candidatesPerFrameMean: +Math.round(scratchSum.reduce((s, v) => s + v, 0) / scratchSum.length).toFixed(1),
    pairChecksPerFrameMean: +Math.round(pairSum.reduce((s, v) => s + v, 0) / pairSum.length).toFixed(1),
    maxCandidatesPerFrame: Math.max(...scratchSum),
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
console.log(`# ${TAG}: rebuild ${result.msPerFrame.rebuild.mean} ms, separation ${result.msPerFrame.separation.mean} ms, total ${result.msPerFrame.total.mean} ms/Frame (median ${result.msPerFrame.total.median})`);
console.log(`# Qualitaet: min-Paarabstand Start ${result.quality.minPairDistanceStart} -> Final ${result.quality.minPairDistanceFinal} (Overall ${result.quality.minPairDistanceOverall})`);
console.log(`# Arbeit: ${result.work.candidatesPerFrameMean} Kandidaten/${result.work.pairChecksPerFrameMean} Paare pro Frame (max ${result.work.maxCandidatesPerFrame})`);
console.log(`# -> ${OUT}`);
