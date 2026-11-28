#!/usr/bin/env node
// M10-frame-tail-batching: lokale Vorher-/Nachher-Messung des Frame-Zeit-Schwanzes
// (Hebel B aus docs/lanes/m10-v10-device-acceptance.md, Befund 2).
//
// Methode: Minute-25-Worst-Case wie scripts/m10-v10-device-gfxinfo.mjs / perf.mjs
// (6 Evos Lv8, 6 Passives Lv5, skipTo(1490), Top-up auf 300 Gegner im 50-ms-Takt).
// Je Frame wird {dt, Heap, Chunk-Texturanzahl, Top-up-Gruppe} gesammelt, damit
// Worst-Frames mit Ereignissen (Spawn-Top-up, Chunk-Install, Heap-Schwund = GC)
// korreliert werden koennen.
//
//   node scripts/m10-frame-tail-batching.mjs --out <pfad.json> [--secs 10] [--target 300] [--mode local|device]
//
// --mode device: verbindet ueber die device-bridge/CDP mit dem Redmi Pad Pro
// (gleicher Pfad wie scripts/m10-v10-device-gfxinfo.mjs, EINE CDP-Verbindung,
// kein App-Relaunch) und sammelt dort dieselben Je-Frame-Zeilen.
//
// Nur Messung: keine Aenderungen an src/**.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const BRIDGE = "http://172.17.0.1:5181";
const CDP = "http://172.17.0.1:9333";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const outPath = arg("out", null);
const secs = Number(arg("secs", "10"));
const target = Number(arg("target", "300"));
const mode = String(arg("mode", "local"));

let browser;
let server = null;
if (mode === "device") {
  // Auf die Game-Page warten, DANN erst CDP verbinden (kein App-Relaunch).
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json();
      ready = Array.isArray(list) && list.some((p) => (p.url || "").includes("index.html"));
    } catch { /* CDP noch nicht bereit */ }
    if (!ready) {
      await fetch(`${BRIDGE}/launch?q=debug=1`, { method: "POST" }).catch(() => {});
      await sleep(2000);
    }
  }
  if (!ready) throw new Error("CDP: keine Game-Page nach ~120 s");
  const { chromium } = await loadPlaywright();
  browser = await chromium.connectOverCDP(CDP);
  var page = browser.contexts()[0].pages()[0];
} else {
  ensureBuild();
  const { chromium } = await loadPlaywright();
  server = await startServer();
  browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--autoplay-policy=no-user-gesture-required"] });
  page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
}
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

if (mode === "device") {
  const scene = await page.evaluate(() => window.__lf?.state?.()?.scene ?? "unknown");
  if (scene !== "run") {
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000 });
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__lf.state().scene === "run", null, { timeout: 10000 });
  }
} else {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
}

// GPU-Renderer (Pflicht laut Mess-Sperre: Belege ohne Renderer-String sind ungueltig).
const renderer = await page.evaluate(() => {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return null;
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});

// Minute-25-Setup (identisch zum Geraete-Lauf).
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
for (let i = 0; i < 40; i++) {
  if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
  await page.evaluate(() => window.__lf.pickLevelUp(0));
}

const minute25 = await page.evaluate(async ({ target, seconds }) => {
  const start = performance.now();
  let frames = 0;
  let last = start;
  let lastSpawn = start;
  let lastChunks = -1;
  const rows = [];
  await new Promise((resolve) => {
    const tick = (now) => {
      const dt = now - last;
      let topup = 0;
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
        const chunks = window.__game.textures.getTextureKeys().filter((k) => k.startsWith("chunk_")).length;
        const heap = performance.memory ? performance.memory.usedJSHeapSize : -1;
        rows.push({ dt: Math.round(dt * 100) / 100, topup, chunks, heap, chunksChanged: lastChunks >= 0 ? chunks - lastChunks : 0 });
        lastChunks = chunks;
      }
      last = now;
      frames++;
      if (now - start >= seconds * 1000) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return { frames, rows, start, lastSpawn };
}, { target: target, seconds: secs });

// Auswertung: Perzentile + Worst-Frame-Ereigniskorrelation.
const dts = minute25.rows.map((r) => r.dt).sort((a, b) => a - b);
const pct = (p) => dts[Math.min(dts.length - 1, Math.ceil(p * dts.length) - 1)] ?? null;
const worstRows = minute25.rows
  .map((r, i) => ({ i, ...r }))
  .filter((r) => r.dt >= 20)
  .sort((a, b) => b.dt - a.dt)
  .slice(0, 12)
  .map((r) => ({ frame: r.i, dtMs: r.dt, topupSpawned: r.topup, chunksNow: r.chunks, chunksChanged: r.chunksChanged, heapMB: r.heap >= 0 ? Math.round(r.heap / 1048576) : null }));

const spawnFrames = minute25.rows.filter((r) => r.topup > 0);
const spawnCorr = {
  topupTicks: spawnFrames.length,
  maxTopup: spawnFrames.reduce((m, r) => Math.max(m, r.topup), 0),
  dtAfterTopupMaxMs: Math.max(0, ...spawnFrames.map((r) => minute25.rows[minute25.rows.indexOf(r) + 1]?.dt ?? 0)),
};

const out = {
  gate: "K1/K3 lokal: Frame-Zeit-Schwanz Minute-25-Worst-Case (Hebel B)",
  mode: "local",
  renderer,
  window: { seconds: secs, targetEnemies: target },
  frames: minute25.frames,
  percentiles: { p50: pct(0.5), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99) },
  worstFrameMs: dts[dts.length - 1],
  jankyPctLocal: Math.round((dts.filter((d) => d > 16.9).length / dts.length) * 10000) / 100,
  worstFrameEvents: worstRows,
  topupCorrelation: spawnCorr,
  heapStartMB: minute25.rows[0]?.heap ? Math.round(minute25.rows[0].heap / 1048576) : null,
  heapEndMB: minute25.rows[minute25.rows.length - 1]?.heap ? Math.round(minute25.rows[minute25.rows.length - 1].heap / 1048576) : null,
  jsErrors: errors,
};
console.log(JSON.stringify({ renderer, frames: out.frames, p50: out.percentiles.p50, p90: out.percentiles.p90, p95: out.percentiles.p95, p99: out.percentiles.p99, worst: out.worstFrameMs, jankyPctLocal: out.jankyPctLocal }));
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ ...out, rows: minute25.rows }, null, 1));
  console.log("JSON ->", outPath);
}
await browser.close();
process.exit(0);
