#!/usr/bin/env node
// M10-Separation-Budget: misst den Separations-/Kollisions-Hot-Path im
// Minute-25-Chaos (500 Gegner, dicht am Spieler) rein rechnerisch, ohne
// Browser/Renderer — damit ist die Messung lastunabhängig und läuft OHNE flock.
//
// Zwei Messstrecken, beide deterministisch (mulberry32) und mit derselben
// Minute-25-Szene (Mischung wie scripts/m10-crowd-probe.mjs):
//
//   A "production" — exakt der produktive Pfad aus src/scenes/Run.ts (update):
//      hash.clear() + insert je Gegner, je Gegner im 460-px-Radius
//      queryCircle(radius+10), Summe der separationPush-Vektoren,
//      Integration speed*1.2*dt plus Chase Richtung Spieler.
//
//   B "budget" — der Mengen-Resolver resolveCrowdSeparation() pro Frame
//      (die API aus der m10-separation-crowd-Lane, die in Run.ts eingehängt
//      werden kann): misst ms/Frame inkl. SpatialHash-Rebuild, Paar-/Nachbar-
//      Deckel und min-Paarabstand als Trennqualität.
//
//   node scripts/m10-separation-budget.mjs --tag=before
//   node scripts/m10-separation-budget.mjs --tag=after --out=shots/m10-separation-budget-after.json
//   Faire A/B-Läufe: --src=<alternatives src-Verzeichnis>
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
// Quellordner (Default src): erlaubt faire A/B-Läufe gegen einen alten Stand,
// z. B. --src=$HOME/tmp/m10-separation-budget/before-src
const SRC = String(argOf("src", "src"));
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
const bundle = await rolldown({ input: resolve(SRC, "logic/separation.ts") });
await bundle.write({ file: BUNDLE, format: "esm" });
await bundle.close();
const bundleHash = await rolldown({ input: resolve(SRC, "systems/SpatialHash.ts") });
await bundleHash.write({ file: BUNDLE_HASH, format: "esm" });
await bundleHash.close();
const { separationPush, resolveCrowdSeparation } = await import(BUNDLE);
const { SpatialHash } = await import(BUNDLE_HASH);

// ── Szene: 500 Gegner dicht um den Spieler (Minute-25-Dranglage) ──────
const WORLD = 4096;
const PLAYER = { x: WORLD / 2, y: WORLD / 2 };
const QUERY_RADIUS = 460; // Run.ts: Separation nur im 460-px-Radius
const DT = 1 / 60;

function makeScene() {
  const rng = mulberry32(SEED);
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
  return enemies;
}

// ── Messlauf je Strecke ───────────────────────────────────────────────
// step(enemies, f) muss den einen Frame ausfuehren und { rebuildMs, separationMs,
// candidates, pairs, hits } liefern (nur fuer Statistik noetig).
function runLane(name, step) {
  const enemies = makeScene();
  const rebuildMs = [];
  const separationMs = [];
  const scratchSum = [];
  const pairSum = [];
  const hitSum = [];
  const minDistSeries = [];
  let minDistOverall = Infinity;
  let minDistStart = Infinity;

  const totalFrames = WARMUP + FRAMES;
  for (let f = 0; f < totalFrames; f++) {
    const m = step(enemies, f);
    if (f >= WARMUP) {
      rebuildMs.push(m.rebuildMs);
      separationMs.push(m.separationMs);
      scratchSum.push(m.candidates);
      pairSum.push(m.pairs);
      hitSum.push(m.hits);
    }
    if (f % SAMPLE_EVERY === 0) {
      const d = minPairDistance(enemies);
      if (f >= WARMUP) minDistSeries.push({ frame: f, minDist: Math.round(d * 100) / 100 });
      if (f === WARMUP) minDistStart = d;
      if (d < minDistOverall) minDistOverall = d;
    }
  }
  const finalMinDist = minPairDistance(enemies);
  if (finalMinDist < minDistOverall) minDistOverall = finalMinDist;

  return {
    name,
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
      candidatesPerFrameMean: mean(scratchSum, 1),
      pairChecksPerFrameMean: mean(pairSum, 1),
      hitsPerFrameMean: mean(hitSum, 1),
      maxCandidatesPerFrame: Math.max(...scratchSum),
    },
  };
}

function mean(arr, digits) {
  return +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(digits);
}

function minPairDistance(list) {
  let min = Infinity;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < min) min = d;
    }
  }
  return min;
}

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    mean: +mean(arr, 4),
    median: +sorted[Math.floor(sorted.length / 2)].toFixed(4),
    p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(4),
    max: +sorted[sorted.length - 1].toFixed(4),
  };
}

/** Chase-Bewegung Richtung Spieler (Minute 25: Horde drängt auf den Spieler). */
function chase(e) {
  const ddx = e.x - PLAYER.x;
  const ddy = e.y - PLAYER.y;
  const dist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
  return { mx: (-ddx / dist) * e.speed, my: (-ddy / dist) * e.speed, ddx, ddy };
}

function clampWorld(e) {
  if (e.x < 10) e.x = 10; else if (e.x > WORLD - 10) e.x = WORLD - 10;
  if (e.y < 10) e.y = 10; else if (e.y > WORLD - 10) e.y = WORLD - 10;
}

// Strecke A: produktiver Run.ts-Pfad (Zellgroesse 32 wie new SpatialHash(32)).
const cellHash = new SpatialHash(32);
const scratch = [];
const laneA = runLane("production", (enemies, f) => {
  const t0 = performance.now();
  cellHash.clear();
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.alive) cellHash.insert(e);
  }
  const t1 = performance.now();

  let candidates = 0;
  let pairs = 0;
  let hits = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const c = chase(e);
    let sx = 0;
    let sy = 0;
    if (c.ddx * c.ddx + c.ddy * c.ddy < QUERY_RADIUS * QUERY_RADIUS) {
      cellHash.queryCircle(e.x, e.y, e.radius + 10, scratch);
      candidates += scratch.length;
      for (let k = 0; k < scratch.length; k++) {
        const n = scratch[k];
        if (n === e || !n.alive) continue;
        pairs++;
        const push = separationPush(e.x, e.y, e.radius, n.x, n.y, n.radius, e.uid);
        if (push) {
          sx += push.x;
          sy += push.y;
          hits++;
        }
      }
    }
    e.x += (c.mx + sx * e.speed * 1.2) * DT;
    e.y += (c.my + sy * e.speed * 1.2) * DT;
    clampWorld(e);
  }
  const t2 = performance.now();
  return { rebuildMs: t1 - t0, separationMs: t2 - t1, candidates, pairs, hits };
});

// Strecke B: Budget-Resolver pro Frame (API fuer den Run.ts-Einhaenge-Card).
const laneB = runLane("budget-resolver", (enemies) => {
  const t0 = performance.now();
  const res = resolveCrowdSeparation(enemies, { maxIterations: 3 });
  const t1 = performance.now();
  let pairs = res.pairChecks;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const c = chase(e);
    e.x += c.mx * DT;
    e.y += c.my * DT;
    clampWorld(e);
  }
  const t2 = performance.now();
  return { rebuildMs: 0, separationMs: t2 - t0, candidates: pairs, pairs, hits: 0 };
});

const result = {
  tag: TAG,
  timestamp: new Date().toISOString(),
  scenario: {
    enemies: ENEMIES,
    seed: SEED,
    warmupFrames: WARMUP,
    measuredFrames: FRAMES,
    cellSize: 32,
    queryRadiusPx: QUERY_RADIUS,
    mix: MIX.map(([id, radius, count]) => ({ id, radius, count })),
    note: "reiner Node-Bench ohne Browser — kein flock noetig. Strecke A = produktiver Run.ts-Pfad, Strecke B = Budget-Resolver (resolveCrowdSeparation) pro Frame inkl. SpatialHash-Rebuild.",
  },
  paths: { production: laneA, budgetResolver: laneB },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
for (const p of [laneA, laneB]) {
  console.log(`# ${TAG} [${p.name}]: total ${p.msPerFrame.total.mean} ms/Frame (median ${p.msPerFrame.total.median}), min-Paarabstand ${p.quality.minPairDistanceStart} -> ${p.quality.minPairDistanceFinal} (Overall ${p.quality.minPairDistanceOverall}), ${p.work.pairChecksPerFrameMean} Paare/Frame`);
}
console.log(`# -> ${OUT}`);
