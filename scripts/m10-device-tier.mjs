#!/usr/bin/env node
// M10-device-tier-schedule: Frame-Zeit-Schwanz im M25-Szenario (Vorher/Nachher
// der Tier-Scheduling-Aenderung in src/logic/quality.ts).
//
// Methode identisch zu scripts/m10-frame-tail-batching.mjs / perf.mjs:
// 6 Evos Lv8, 6 Passives Lv5, skipTo(1490), Top-up auf 300 Gegner im
// 50-ms-Takt, 10 s Fenster. Viewport/DPRL waehlbar (Lane-Tor: 780x360@3).
// Misst p50/p90/p95/p99 der Frame-Deltas, worst, janky-Anteil gegen die
// 16,7-ms-Kante (Chrome-Frame-Deadline-Histogramm, siehe
// docs/qa/v10-device-acceptance-2026-11-28.md K3) und den GPU-Renderer
// (Pflicht: Belege ohne Renderer-String sind ungueltig; SwiftShader zaehlt
// nicht). Nur Messung: keine Aenderungen an src/**.
//
//   node scripts/m10-device-tier.mjs --out <pfad.json> [--secs 10]
//        [--target 300] [--viewport 780x360] [--dpr 3]
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
/** janky-Kante des Chrome-Frame-Deadline-Histogramms (ms), siehe K3-Befund. */
const JANKY_EDGE_MS = 16.7;

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const outPath = arg("out", null);
const secs = Number(arg("secs", "10"));
const target = Number(arg("target", "300"));
const [vw, vh] = String(arg("viewport", "780x360")).split("x").map(Number);
const dpr = Number(arg("dpr", "3"));

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--enable-precise-memory-info",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
await startRun(page);

// GPU-Renderer (Pflicht laut Mess-Sperre: Belege ohne Renderer-String ungueltig).
const renderer = await page.evaluate(() => {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return null;
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
const qualityTier = await page.evaluate(() => {
  const dbg = window.__rbDbg;
  return dbg ? String(dbg.quality ?? "n/a") : "no-dbg";
});

// Minute-25-Setup (identisch zum Geraete-Lauf in m10-v10-device-m25.mjs).
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
  const dts = [];
  await new Promise((resolve) => {
    const tick = (now) => {
      const dt = now - last;
      if (frames > 0) dts.push(dt);
      last = now;
      frames++;
      if (now - lastSpawn >= 50) {
        lastSpawn = now;
        const active = window.__lf.stats().enemies;
        const deficit = target - active;
        if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
      }
      if (now - start >= seconds * 1000) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return { frames, dts };
}, { target, seconds: secs });

await browser.close();
if (server?.proc) server.proc.kill();
if (server?.close) await server.close().catch(() => {});

const xs = minute25.dts.map((d) => Math.round(d * 100) / 100).sort((a, b) => a - b);
const pct = (q) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(q * xs.length))] : null);
const janky = xs.filter((d) => d > JANKY_EDGE_MS).length;
const avg = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const result = {
  lane: "m10-device-tier-schedule",
  at: new Date().toISOString(),
  renderer,
  qualityTier,
  viewport: { width: vw, height: vh, dpr },
  targetEnemies: target,
  secs,
  frames: minute25.frames,
  fpsAvg: avg ? Math.round((1000 / avg) * 10) / 10 : null,
  frameMs: {
    p50: pct(0.5), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99),
    worst: xs.length ? xs[xs.length - 1] : null,
  },
  jankyPct: xs.length ? Math.round((janky / xs.length) * 10000) / 100 : null,
  jankyEdgeMs: JANKY_EDGE_MS,
  jsErrors: errors,
  passed: errors.length === 0,
};
console.log(JSON.stringify({
  renderer, qualityTier, frames: result.frames, fpsAvg: result.fpsAvg,
  p95: result.frameMs.p95, p99: result.frameMs.p99, worst: result.frameMs.worst,
  jankyPct: result.jankyPct, jsErrors: errors.length,
}));
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 1));
}
process.exit(errors.length > 0 ? 1 : 0);
