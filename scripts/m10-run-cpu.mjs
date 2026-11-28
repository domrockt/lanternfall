#!/usr/bin/env node
// m10-run-cpu-budget K1/K4: JS-Frame-CPU-Budget des echten Run-Szenen-Loops.
//
// Deterministischer Chaos-Lauf (M25-Dichte, 6 Evolutionen, 500 Gegner) im
// echten Browser. Gemessen wird JE Frame die CPU-Zeit des rAF-Callbacks
// (JS update+render, ohne GPU-Wartezeit) plus Allokations-Telemetrie:
//
//   - jsFrameMs p50/p95/p99/mean/max  (Hauptkriterium, Android-Blocker)
//   - heapUsedDelta/gc-Anteil         (in-page performance.memory)
//   - sampledAllocBytesPerFrame       (CDP Sampling-Heap-Profiler, vergleichbar)
//   - topAllocSites / topCpuFunctions (Attribution K2)
//   - renderer                        (WEBGL_debug_renderer_info, Beleg-Pflicht)
//
// Kein FPS-Kriterium (Container) — nur CPU-ms als Vergleichswert. OHNE flock
// (CPU-ms je Frame via rAF-Timing ist GPU-/Thermik-unabhaengig genug und das
// Skript ist kein Echtzeit-FPS-Lauf).
//
//   node scripts/m10-run-cpu.mjs --tag=before
//   node scripts/m10-run-cpu.mjs --tag=after
import { writeFileSync, mkdirSync } from "node:fs";
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
const OUT = String(argOf("json", `shots/m10-run-cpu-${TAG}.json`));
const SECONDS = Number(argOf("seconds", "20"));
const TARGET = Number(argOf("target", "500"));
const vp = String(argOf("viewport", "640x360")).split("x").map(Number);
const VIEWPORT = { width: vp[0] || 640, height: vp[1] || 360 };
const SEED = String(argOf("seed", "1"));

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

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

// rAF-Callback-CPU-Messung INJIZIEREN, bevor Phaser laedt: jede Frame-CPU-ms
// = performance.now() um den eigentlichen Callback (Phaser TimeStep.step:
// update + render, JS-Anteil ohne GPU-Queue-Wartezeit). Heap-Delta je Frame
// aus performance.memory (Chrome-only, als Korrelat fuer Allokationen).
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
      if (heap > lastHeap) {
        heapGrewFrames++;
        heapGrewBytes += heap - lastHeap;
      }
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
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
      window.__lf.addWeapon(id, 8);
    }
  });
  // Chaos-Fenster: Minute 25 + 6 Evolutionen + alle Passives + 500 Gegner.
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
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
  await cdp.send("Profiler.start");
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 32768 });

  // Messfenster: Gegner bei 500 halten, Frames + CPU-ms sammeln.
  const run = await page.evaluate(async ({ seconds, target }) => {
    const startFrame = window.__game.loop.frame;
    const start = performance.now();
    const f0 = window.__cpuStats.frames.length;    await new Promise((resolve) => {
      const spawnTimer = setInterval(() => {
        const active = window.__lf.stats().enemies;
        if (active < target) window.__lf.spawnEnemy("bog_rat", target - active);
        if (performance.now() - start >= 4000) window.__lf.god(true); // God erneuern
      }, 50);
      setTimeout(() => {
        clearInterval(spawnTimer);
        resolve();
      }, seconds * 1000);
    });
    const elapsed = performance.now() - start;
    const f1 = window.__cpuStats.frames.length;
    return {
      fps: Math.round(((f1 - f0) / (elapsed / 1000)) * 10) / 10,
      framesMeasured: f1 - f0,
      frameWindowStart: f0,
      frameWindowEnd: f1,
      elapsedMs: Math.round(elapsed),
      avgEnemies: window.__lf.stats().enemies,
      kills: window.__lf.stats().kills,
      scene: window.__lf.state().scene,
    };
  }, { seconds: SECONDS, target: TARGET });

  const { profile } = await cdp.send("Profiler.stop");
  const { profile: heapProfile } = await cdp.send("HeapProfiler.stopSampling");

  // Nur die Frames des Messfensters statistisch werten (Setup/SkipTo raus).
  const frameData = await page.evaluate(({ from, to }) => {
    const frames = window.__cpuStats.frames.slice(from, to);
    return {
      cpuMs: frames,
      heapGrewFrames: window.__cpuStats.heapGrewFrames,
      heapGrewBytes: window.__cpuStats.heapGrewBytes,
    };
  }, { from: run.frameWindowStart, to: run.frameWindowEnd });

  // Top-CPU-Funktionen (Self-Time) aus dem Sampling-Profil.
  const nodeById = new Map(profile.nodes.map((n) => [n.id, n]));
  const selfUs = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    const dt = profile.timeDeltas[i] ?? 0;
    selfUs.set(id, (selfUs.get(id) ?? 0) + dt);
  }
  const byFn = new Map();
  let idleUs = 0;
  let gcUs = 0;
  for (const [id, us] of selfUs) {
    const node = nodeById.get(id);
    const cf = node?.callFrame ?? {};
    const fn = cf.functionName || "(anonymous)";
    if (fn === "(idle)") { idleUs += us; continue; }
    if (fn === "(garbage collector)") { gcUs += us; continue; }
    const url = String(cf.url || "").replace(/^https?:\/\/[^/]+\//, "");
    const key = `${fn} @ ${url}:${(cf.lineNumber ?? 0) + 1}`;
    byFn.set(key, (byFn.get(key) ?? 0) + us);
  }
  const totalUs = profile.endTime - profile.startTime;
  const topCpu = [...byFn.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([fn, us]) => ({
      fn,
      selfMs: Math.round(us / 100) / 10,
      percent: Math.round((us / totalUs) * 1000) / 10,
    }));

  // Top-Allokations-Sites aus dem Sampling-Heap-Profil.
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
  const topAllocSites = [...allocMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([site, bytes]) => ({
      site,
      bytes: Math.round(bytes),
      bytesPerFrame: Math.round(bytes / Math.max(1, run.framesMeasured)),
      percent: Math.round((bytes / Math.max(1, totalAllocBytes)) * 1000) / 10,
    }));

  // Frame-Statistik (CPU-ms).
  const xs = [...frameData.cpuMs].sort((a, b) => a - b);
  const q = (p) => {
    if (!xs.length) return 0;
    const idx = Math.min(xs.length - 1, Math.floor(xs.length * p));
    return Math.round(xs[idx] * 100) / 100;
  };
  const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  result = {
    generatedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    seed: SEED,
    tag: TAG,
    renderer,
    run,
    jsFrameCpuMs: {
      frames: xs.length,
      p50: q(0.5),
      p95: q(0.95),
      p99: q(0.99),
      mean: Math.round(mean * 100) / 100,
      max: xs.length ? Math.round(xs[xs.length - 1] * 100) / 100 : 0,
    },
    heap: {
      grewFrames: frameData.heapGrewFrames,
      grewBytes: frameData.heapGrewBytes,
      grewBytesPerFrame: Math.round(frameData.heapGrewBytes / Math.max(1, run.framesMeasured)),
      sampledAllocBytesTotal: totalAllocBytes,
      sampledAllocBytesPerFrame: Math.round(totalAllocBytes / Math.max(1, run.framesMeasured)),
    },
    topCpu,
    topAllocSites,
    jsErrors: errors,
  };
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

mkdirSync("shots", { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(`[m10-run-cpu] JSON: ${OUT}`);
