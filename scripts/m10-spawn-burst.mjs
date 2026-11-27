#!/usr/bin/env node
// M10-Spawn-Burst: misst je echtem Frame, wie viele Gegner-Spawns der
// Director materialisiert und wie lange der Frame dauert. Grundlage fuer die
// Burst-Glaettung in src/systems/Spawner.ts (Karte m10-spawn-burst-budget).
//
// Setup wie scripts/fullrun.mjs (god + autoplay + Max-Out + timeScale 30),
// damit die Messung das volle 30-Minuten-Endgame inkl. dt-Spitzen sieht:
// ein Frame-Hitch bei timeScale 30 verarbeitet den entstandenem
// Spawn-Rueckstau in einem Frame (Bursts von 40+ Spawns).
//
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-spawn-burst.mjs --tag=before
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-spawn-burst.mjs --tag=after
//   Optionen: --seconds=<Realzeit-Sekunden> --viewport=960x540 --dpr=1 --seed=99
//
// Ausgabe: shots/m10-spawn-burst-<tag>.json
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline !== undefined) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = String(argOf("tag", "bench"));
const OUT = String(argOf("out", `shots/m10-spawn-burst-${TAG}.json`));
const REALTIME_SECONDS = Number(argOf("seconds", "80")) || 80;
const viewportArg = String(argOf("viewport", "960x540")).split("x").map(Number);
const VIEWPORT = { width: viewportArg[0] || 960, height: viewportArg[1] || 540 };
const DPR = Number(argOf("dpr", "1")) || 1;
const SEED = String(argOf("seed", "99"));

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let samples = [];
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);
  await page.evaluate(({ evolutions, passives }) => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setSuppressLevelUps(true);
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.setTimeScale(30);
    // Recorder: je echtem Frame (postrender) Spawn-Gesamtzahl + Frame-ms lesen.
    const game = window.__game;
    const samples = [];
    let lastTotal = -1;
    let lastFrame = -1;
    game.events.on("postrender", () => {
      const spawner = game.registry.get("lf-spawner");
      if (!spawner) return;
      const counts = spawner.spawnCounts ?? {};
      let total = 0;
      for (const k in counts) total += counts[k] ?? 0;
      const frame = game.loop.frame;
      if (frame === lastFrame) return; // derselbe Frame nochmal (Setup-Phase)
      lastFrame = frame;
      samples.push({
        frame,
        // game.loop.delta ist die geplante fps-nahe Tickdauer; rawDelta die
        // reale Zeit seit dem letzten Tick — fuer Frame-Zeit-Spitzen zählt rawDelta.
        rawDelta: Math.round((game.loop.rawDelta ?? 0) * 1000) / 1000,
        delta: Math.round((game.loop.delta ?? 0) * 1000) / 1000,
        elapsed: Math.round((game.registry.get("lf-elapsed") ?? 0) * 100) / 100,
        totalSpawns: total,
        spawnDelta: lastTotal < 0 ? 0 : total - lastTotal,
      });
      lastTotal = total;
      if (samples.length > 200000) samples.splice(0, 100000);
    });
    window.__lfSpawnSamples = samples;
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });

  const t0 = Date.now();
  while (Date.now() - t0 < REALTIME_SECONDS * 1000) {
    await page.waitForTimeout(1000);
    const scene = await page.evaluate(() => window.__lf.state().scene);
    if (scene === "results") break;
  }

  samples = await page.evaluate(() => window.__lfSpawnSamples ?? []);
} finally {
  await browser.close().catch(() => {});
  await server.stop().catch(() => {});
}

// ── Auswertung ────────────────────────────────────────────────────────
const frames = samples.filter((s) => s.spawnDelta >= 0);
const spawnFrames = frames.filter((s) => s.spawnDelta > 0);
const bursts = [...frames].sort((a, b) => b.spawnDelta - a.spawnDelta || b.rawDelta - a.rawDelta);
const top5Bursts = bursts.slice(0, 5).map((s) => ({
  frame: s.frame,
  spawns: s.spawnDelta,
  rawDeltaMs: s.rawDelta,
  elapsedSec: s.elapsed,
}));
const slowest = [...frames].sort((a, b) => b.rawDelta - a.rawDelta).slice(0, 5).map((s) => ({
  frame: s.frame,
  spawns: s.spawnDelta,
  rawDeltaMs: s.rawDelta,
  elapsedSec: s.elapsed,
}));
const rawDeltas = frames.map((s) => s.rawDelta).sort((a, b) => a - b);
const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0);
const totalSpawns = frames.length ? frames[frames.length - 1].totalSpawns : 0;
// Spawn-Frame-Zeit: rawDelta der Frames mit Spawns, gewichtet nach Spawndelta.
const burstFrames = frames.filter((s) => s.spawnDelta >= 20);
const maxSpawnFrameRawMs = burstFrames.length ? Math.max(...burstFrames.map((s) => s.rawDelta)) : 0;

const result = {
  tag: TAG,
  seed: SEED,
  viewport: `${VIEWPORT.width}x${VIEWPORT.height}@${DPR}`,
  realtimeSeconds: REALTIME_SECONDS,
  framesRecorded: frames.length,
  spawnFrames: spawnFrames.length,
  totalSpawns,
  spawnStats: {
    maxSpawnsInFrame: bursts[0]?.spawnDelta ?? 0,
    p95SpawnsInFrame: pct(frames.map((s) => s.spawnDelta).sort((a, b) => a - b), 0.95),
    burstFramesOver20: burstFrames.length,
    burstFramesOver40: frames.filter((s) => s.spawnDelta > 40).length,
  },
  frameTimeMs: {
    max: rawDeltas.length ? rawDeltas[rawDeltas.length - 1] : 0,
    p50: pct(rawDeltas, 0.5),
    p95: pct(rawDeltas, 0.95),
    p99: pct(rawDeltas, 0.99),
    // ms-Summe nur der Frames mit >=20 Spawns (Burst-Kosten):
    maxSpawnFrameRawMs,
    avgSpawnFrameRawMs: burstFrames.length
      ? Math.round((burstFrames.reduce((acc, s) => acc + s.rawDelta, 0) / burstFrames.length) * 100) / 100
      : 0,
  },
  top5BurstFrames: top5Bursts,
  top5SlowestFrames: slowest,
  jsErrors: errors,
};
writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ out: OUT, totalSpawns, maxSpawnsInFrame: result.spawnStats.maxSpawnsInFrame, burstFramesOver40: result.spawnStats.burstFramesOver40, frameTimeMs: result.frameTimeMs, top5BurstFrames: top5Bursts, jsErrors: errors.length }, null, 2));
if (errors.length) process.exitCode = 1;
