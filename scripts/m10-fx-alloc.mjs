#!/usr/bin/env node
// m10-fx-alloc-trim K1/K3: Per-Frame-Allokationen + rAF-CPU im Minute-25-Chaos.
//
// Vorlage: scripts/m10-run-cpu.mjs (Chaos-Setup identisch: Seed 1, skipTo(1500),
// 6 Evolutionen + 6 Passives St. 5, 500 Gegner gehalten, god/autoplay) plus
// Allokations-Telemetrie nach scripts/heap-alloc-profile.mjs (CDP Sampling-Heap-
// Profiler). Gemessen wird im Messfenster:
//
//   - jsFrameCpuMs p50/p95/p99/mean/max  (rAF-Callback, update+render JS-Anteil)
//   - worstFrame-Spitzen: Frames > SPIKE_MS (33–34-ms-Klasse, v10-Gerätekasten K3)
//   - sampledAllocBytesPerFrame          (Sampling-Heap-Profiler / Frames)
//   - fxAttribution: Allokation hinter src/systems/FxSystem.ts vs. Rest
//   - renderer                           (WEBGL_debug_renderer_info, Beleg-Pflicht)
//
// OHNE flock (kein FPS-/Echtzeit-Kriterium, CPU-ms + Allokation sind
// last-/GPU-unabhaengige Vergleichswerte, siehe Lane-Regeln common.md).
//
//   node scripts/m10-fx-alloc.mjs --tag=before --json=/home/ai/games/.evidence/m10-fx-alloc-trim/m10-fx-alloc-before.json
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const OUT = resolve(String(argOf("json", `shots/m10-fx-alloc-${TAG}.json`)));
const SECONDS = Number(argOf("seconds", "30"));
const TARGET = Number(argOf("target", "500"));
const vp = String(argOf("viewport", "640x360")).split("x").map(Number);
const VIEWPORT = { width: vp[0] || 640, height: vp[1] || 360 };
const SEED = String(argOf("seed", "1"));
/** v10-Gerätekasten K3: worstFrame 33–34 ms Klasse. */
const SPIKE_MS = Number(argOf("spike", "16"));

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

// Ohne Minify (Attribution lesbar, wie m10-run-cpu-budget K2): vor ensureBuild
// unminifiziert bauen; nach der Lane baut npm run build wieder normal.
const UNMINIFIED = String(argOf("minify", "true")) === "false";
if (UNMINIFIED) {
  console.log("[m10-fx-alloc] unminifizierter Build (Attribution) ...");
  execFileSync("npx", ["vite", "build", "--base", "./", "--minify", "false"], { stdio: "inherit" });
}
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// rAF-Callback-CPU-Messung INJIZIEREN, bevor Phaser laedt (wie m10-run-cpu.mjs).
await page.addInitScript(() => {
  const frames = [];
  let lastHeap = performance?.memory?.usedJSHeapSize ?? 0;
  let heapGrewFrames = 0;
  let heapGrewBytes = 0;
  const origRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb) {
    return origRaf.call(window, function (ts) {
      const t0 = performance.now();
      cb(ts);
      const cpuMs = performance.now() - t0;
      const heap = performance?.memory?.usedJSHeapSize ?? 0;
      if (heap > lastHeap) { heapGrewFrames++; heapGrewBytes += heap - lastHeap; }
      lastHeap = heap;
      frames.push(cpuMs);
    });
  };
  window.__cpuStats = {
    get frames() { return frames; },
    get heapGrewFrames() { return heapGrewFrames; },
    get heapGrewBytes() { return heapGrewBytes; },
  };
});

const clearLevelUps = async () => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    window.__lf.setSuppressLevelUps(true);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
  });
  await page.evaluate(({ evolutions, passives }) => {
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1500);
    window.__lf.setTimeScale(1);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });
  await page.waitForTimeout(6000);
  await clearLevelUps();

  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2") ??
      document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      webglRenderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl?.getParameter(gl.RENDERER) ?? ""),
      webglVendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl?.getParameter(gl.VENDOR) ?? ""),
    };
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  // Feines Intervall: FxSystem-Allokationen sind kleine, kurzlebige Objekte,
  // die bei 32768 ungesampelt bleiben (Befund Baseline-Lauf).
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 512 });

  // Messfenster: Gegner bei 500 halten, Frames + CPU-ms sammeln.
  const run = await page.evaluate(async ({ seconds, target }) => {
    const startFrame = window.__game.loop.frame;
    const start = performance.now();
    const f0 = window.__cpuStats.frames.length;
    await new Promise((resolve) => {
      const spawnTimer = setInterval(() => {
        const active = window.__lf.stats().enemies;
        if (active < target) window.__lf.spawnEnemy("bog_rat", target - active);
        if (performance.now() - start >= 4000) window.__lf.god(true); // God erneuern
      }, 50);
      setTimeout(() => { clearInterval(spawnTimer); resolve(); }, seconds * 1000);
    });
    const elapsed = performance.now() - start;
    const f1 = window.__cpuStats.frames.length;
    return {
      framesMeasured: f1 - f0,
      frameWindowStart: f0,
      frameWindowEnd: f1,
      elapsedMs: Math.round(elapsed),
      avgEnemies: window.__lf.stats().enemies,
      kills: window.__lf.stats().kills,
      scene: window.__lf.state().scene,
    };
  }, { seconds: SECONDS, target: TARGET });

  const { profile: heapProfile } = await cdp.send("HeapProfiler.stopSampling");
  const frameData = await page.evaluate(({ from, to }) => ({
    cpuMs: window.__cpuStats.frames.slice(from, to),
    heapGrewFrames: window.__cpuStats.heapGrewFrames,
    heapGrewBytes: window.__cpuStats.heapGrewBytes,
  }), { from: run.frameWindowStart, to: run.frameWindowEnd });

  // Top-Allokations-Sites; FX-Attribution: Sites in src/systems/FxSystem.ts
  // (Bundle: "FxSystem") vs. gesamt.
  const allocMap = new Map();
  const walkHeap = (n) => {
    const cf = n.callFrame ?? {};
    const self = n.selfSize ?? 0;
    if (self > 0) {
      const url = String(cf.url || "").replace(/^https?:\/\/[^/]+\//, "");
      const key = `${cf.functionName || "(anonymous)"} @ ${url}:${(cf.lineNumber ?? 0) + 1}`;
      allocMap.set(key, (allocMap.get(key) ?? 0) + self);
    }
    for (const c of n.children ?? []) walkHeap(c);
  };
  walkHeap(heapProfile.head);
  const totalAllocBytes = [...allocMap.values()].reduce((a, b) => a + b, 0);
  const topAllocSites = [...allocMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([site, bytes]) => ({
      site,
      bytes: Math.round(bytes),
      bytesPerFrame: Math.round(bytes / Math.max(1, run.framesMeasured)),
      percent: Math.round((bytes / Math.max(1, totalAllocBytes)) * 1000) / 10,
    }));
  // FX-Attribution: Zeilen-Spanne von "class FxSystem" bis "class ParticleSystem"
  // im unminifizierten Run-Chunk (FxSystem landet dort beim Vite-Chunking).
  let fxLines = null;
  try {
    const { readdirSync, readFileSync } = await import("node:fs");
    const assetDir = "dist/assets";
    const runChunk = readdirSync(assetDir).find((f) => /^Run-.*\.js$/.test(f));
    if (runChunk) {
      const text = readFileSync(`${assetDir}/${runChunk}`, "utf8");
      // esbuild lowered: "var FxSystem = class { ... }".
      const start = text.indexOf("var FxSystem = class");
      const end = text.indexOf("var ParticleSystem = class");
      if (start >= 0 && end > start) {
        fxLines = {
          file: runChunk,
          from: text.slice(0, start).split("\n").length,
          to: text.slice(0, end).split("\n").length,
        };
      }
    }
  } catch { /* Attribution optional */ }
  let fxAllocBytes = 0;
  let harnessAllocBytes = 0;
  let phaserAllocBytes = 0;
  for (const [site, bytes] of allocMap) {
    const [fn, rest] = site.split(" @ ");
    const url = rest ?? "";
    if (fxLines && url.startsWith(fxLines.file)) {
      const line = Number(site.split(":").pop());
      if (line >= fxLines.from && line < fxLines.to) { fxAllocBytes += bytes; continue; }
    }
    if (/queueEnemyWave|spawnEnemy/.test(fn)) harnessAllocBytes += bytes;
    else if (/phaser/i.test(url)) phaserAllocBytes += bytes;
  }

  const xs = [...frameData.cpuMs].sort((a, b) => a - b);
  const q = (p) => {
    if (!xs.length) return 0;
    return Math.round(xs[Math.min(xs.length - 1, Math.floor(xs.length * p))] * 100) / 100;
  };
  const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const max = xs.length ? Math.round(xs[xs.length - 1] * 100) / 100 : 0;

  result = {
    tag: TAG,
    date: new Date().toISOString(),
    seed: SEED,
    viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
    windowSeconds: SECONDS,
    spikeThresholdMs: SPIKE_MS,
    renderer,
    framesMeasured: run.framesMeasured,
    elapsedMs: run.elapsedMs,
    fps: Math.round((run.framesMeasured / (run.elapsedMs / 1000)) * 10) / 10,
    avgEnemies: run.avgEnemies,
    kills: run.kills,
    scene: run.scene,
    jsFrameCpuMs: {
      p50: q(0.5), p95: q(0.95), p99: q(0.99), mean: Math.round(mean * 100) / 100, max,
    },
    worstFrame: {
      max,
      spikesOverThreshold: xs.filter((v) => v > SPIKE_MS).length,
      spikesOver33: xs.filter((v) => v > 33).length,
    },
    alloc: {
      totalSampledBytes: Math.round(totalAllocBytes),
      bytesPerFrame: Math.round(totalAllocBytes / Math.max(1, run.framesMeasured)),
      heapGrewFrames: frameData.heapGrewFrames,
      heapGrewBytes: frameData.heapGrewBytes,
      fxLines,
      fxAttributionBytes: Math.round(fxAllocBytes),
      fxAttributionBytesPerFrame: Math.round(fxAllocBytes / Math.max(1, run.framesMeasured)),
      fxAttributionPercent: Math.round((fxAllocBytes / Math.max(1, totalAllocBytes)) * 1000) / 10,
      harnessAllocBytesPerFrame: Math.round(harnessAllocBytes / Math.max(1, run.framesMeasured)),
      phaserAttributionBytesPerFrame: Math.round(phaserAllocBytes / Math.max(1, run.framesMeasured)),
    },
    topAllocSites,
    jsErrors: errors,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`[m10-fx-alloc] ${TAG}: p95=${result.jsFrameCpuMs.p95}ms max=${max}ms spikes>${SPIKE_MS}=${result.worstFrame.spikesOverThreshold} alloc=${result.alloc.bytesPerFrame}B/frame fx=${result.alloc.fxAttributionPercent}% -> ${OUT}`);
} finally {
  await browser.close();
  await server.stop();
}
