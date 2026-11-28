#!/usr/bin/env node
// M10-ground-chunk-budget: Vorher-/Nachher-Messung des GroundRenderer-Chunk-Tails
// (Hebel B, zweiter Teil aus docs/qa/v10-device-acceptance-2026-11-28.md, K3 FAIL).
//
// Fragestellung (K1): Korrelieren die wiederkehrenden worstFrame-Spikes (33–34 ms,
// ~alle ~11 s) mit Chunk-Ereignissen — Canvas-Erzeugung (textures.createCanvas je
// Chunk), GPU-Upload (texture.refresh), Worker-Installs — oder mit GC (Heap-Drops)?
//
// Methode: Minute-25-Worst-Case wie scripts/m10-frame-tail-batching.mjs
// (6 Evos Lv8, 6 Passives Lv5, skipTo(1490), Top-up auf 300 Gegner im 50-ms-Takt).
// Je Frame: dt, Top-up, Chunk-Texturanzahl, Heap und die DELTAS der
// GroundRenderer-Debug-Zaehler (chunkBuilds = Canvas-Erzeugung, readyInstalled =
// Install/Upload, workerReceived). Frame-Zeitmessung rAF; Upload-Kosten sind im
// rAF-dt nur teilweise sichtbar (Compositor-Stall), daher zusätzlich die
// Korrelation Install-frame vs. Nachbarframes.
//
//   node scripts/m10-ground-chunk.mjs --out <pfad.json> [--secs 40] [--target 300]
//
// Nur Messung: keine Aenderungen an src/**.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const outPath = arg("out", null);
const secs = Number(arg("secs", "40"));
const target = Number(arg("target", "300"));
// --walk 1: deterministischer Laufrad (ArrowRight halten, autoPlay aus), damit
// das Fenster garantiert Chunk-Grenzueberfahrten enthaelt (A/B-Vergleich).
const walk = arg("walk", "0") === "1";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding", "--enable-precise-memory-info",
    "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
await startRun(page);

// GPU-Renderer (Pflicht laut Mess-Sperre: Belege ohne Renderer-String sind ungueltig).
const renderer = await page.evaluate(() => {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return null;
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});

// Minute-25-Setup (identisch zum Frame-Tail-Lauf).
await page.evaluate(({ evolutions, passives }) => {
  window.__lf.god(true);
  window.__lf.setSuppressLevelUps(true);
  window.__lf.autoPlay(true);
  for (const id of evolutions) window.__lf.addWeapon(id, 8);
  for (const id of passives) window.__lf.addPassive(id, 5);
  window.__lf.skipTo(1490);
  window.__lf.setTimeScale(1);
}, { evolutions: EVOLUTIONS, passives: PASSIVES });
await page.waitForTimeout(6000);
if (walk) await page.keyboard.down("ArrowRight");
for (let i = 0; i < 40; i++) {
  if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
  await page.evaluate(() => window.__lf.pickLevelUp(0));
}

const minute25 = await page.evaluate(async ({ target, seconds, walk }) => {
  if (walk) window.__lf.autoPlay(false);
  const g = window.__game.scene.getScene("run").ground;
  g.debugEnableCounters();
  const start = performance.now();
  let frames = 0;
  let last = start;
  let lastSpawn = start;
  let lastChunks = -1;
  let prev = null;
  const rows = [];
  await new Promise((resolve) => {
    const tick = (now) => {
      const dt = now - last;
      let topup = 0;
      const s = g.debugStats();
      const chunks = window.__game.textures.getTextureKeys().filter((k) => k.startsWith("chunk_")).length;
      const heap = performance.memory ? performance.memory.usedJSHeapSize : -1;
      if (frames > 0) {
        if (now - lastSpawn >= 50) {
          lastSpawn = now;
          const active = window.__lf.stats().enemies;
          const deficit = target - active;
          if (deficit > 0) {
            window.__lf.spawnEnemy("bog_rat", deficit);
            topup = deficit;
          }
        }
        rows.push({
          dt: Math.round(dt * 100) / 100,
          topup,
          chunks,
          heap,
          installs: prev ? s.readyInstalled - prev.readyInstalled : 0,
          builds: prev ? s.chunkBuilds - prev.chunkBuilds : 0,
          workerRecv: prev ? s.workerReceived - prev.workerReceived : 0,
          heapDrop: prev && prev.heap >= 0 && heap < prev.heap - 512 * 1024 ? 1 : 0,
        });
        lastChunks = chunks;
      }
      prev = { readyInstalled: s.readyInstalled, chunkBuilds: s.chunkBuilds, workerReceived: s.workerReceived, heap };
      last = now;
      frames++;
      if (now - start >= seconds * 1000) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const total = g.debugStats();
  return { frames, rows, total };
}, { target, seconds: secs, walk });

if (walk) await page.keyboard.up("ArrowRight");

// Auswertung: Perzentile + Korrelation worstFrame <-> Chunk-Ereignisse.
const dts = minute25.rows.map((r) => r.dt).sort((a, b) => a - b);
const pct = (p) => dts[Math.min(dts.length - 1, Math.ceil(p * dts.length) - 1)] ?? null;

const rows = minute25.rows;
const worstRows = rows
  .map((r, i) => ({ i, ...r }))
  .filter((r) => r.dt >= 20)
  .sort((a, b) => b.dt - a.dt)
  .slice(0, 16)
  .map((r) => ({
    frame: r.i, dtMs: r.dt, topupSpawned: r.topup,
    installs: r.installs, builds: r.builds, workerRecv: r.workerRecv,
    installsNext: rows[r.i + 1]?.installs ?? null, dtNext: rows[r.i + 1]?.dt ?? null,
    heapMB: r.heap >= 0 ? Math.round(r.heap / 1048576) : null, heapDrop: r.heapDrop,
    chunks: r.chunks,
  }));

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const installFrames = rows.filter((r) => r.installs > 0);
const buildFrames = rows.filter((r) => r.builds > 0);
const corr = {
  totalInstalls: minute25.total.readyInstalled,
  totalBuilds: minute25.total.chunkBuilds,
  totalWorkerRecv: minute25.total.workerReceived,
  framesWithInstall: installFrames.length,
  framesWithBuild: buildFrames.length,
  dtMeanWithInstall: installFrames.length ? Math.round(sum(installFrames.map((r) => r.dt)) / installFrames.length * 100) / 100 : null,
  dtMeanWithoutInstall: Math.round(sum(rows.filter((r) => r.installs === 0).map((r) => r.dt)) / Math.max(1, rows.filter((r) => r.installs === 0).length) * 100) / 100,
  dtMeanWithBuild: buildFrames.length ? Math.round(sum(buildFrames.map((r) => r.dt)) / buildFrames.length * 100) / 100 : null,
  dtAfterBuildMax: Math.max(0, ...buildFrames.map((r) => rows[rows.indexOf(r) + 1]?.dt ?? 0)),
  heapDrops: rows.filter((r) => r.heapDrop === 1).length,
  dtAfterHeapDropMax: Math.max(0, ...rows.filter((r) => r.heapDrop === 1).map((r) => rows[rows.indexOf(r) + 1]?.dt ?? 0)),
  topupFrames: rows.filter((r) => r.topup > 0).length,
  dtAfterTopupMax: Math.max(0, ...rows.filter((r) => r.topup > 0).map((r) => rows[rows.indexOf(r) + 1]?.dt ?? 0)),
};

const out = {
  gate: "K1/K4 m10-ground-chunk-budget: Chunk-Ereignisse vs worstFrame (Minute-25-Worst-Case)",
  mode: "local",
  renderer,
  window: { seconds: secs, targetEnemies: target },
  frames: minute25.frames,
  percentiles: { p50: pct(0.5), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99) },
  worstFrameMs: dts[dts.length - 1],
  jankyPctLocal: Math.round((dts.filter((d) => d > 16.9).length / dts.length) * 10000) / 100,
  worstFrameEvents: worstRows,
  chunkCorrelation: corr,
  jsErrors: errors,
};
console.log(JSON.stringify({
  renderer, frames: out.frames,
  p50: out.percentiles.p50, p95: out.percentiles.p95, p99: out.percentiles.p99,
  worst: out.worstFrameMs, jankyPctLocal: out.jankyPctLocal,
  installs: corr.totalInstalls, builds: corr.totalBuilds,
  dtMeanWithInstall: corr.dtMeanWithInstall, dtMeanWithoutInstall: corr.dtMeanWithoutInstall,
  dtAfterBuildMax: corr.dtAfterBuildMax, heapDrops: corr.heapDrops, dtAfterHeapDropMax: corr.dtAfterHeapDropMax,
}));
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ ...out, rows }, null, 1));
  console.log("JSON ->", outPath);
}
await browser.close();
process.exit(0);
