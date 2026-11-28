#!/usr/bin/env node
// Lane m10-gc-sawtooth-trim (K1/K4): Allokations-Profil im Minute-25-Burst.
//
// Methode (Rezept m10-heap-sawtooth, kompakt):
//   - Sim (AutoPlay, God, timeScale 30) läuft bis Minute 25 (Sim-Sekunde 1500,
//     Level 38 / Boss-Burst des Minute-25-Worst-Case).
//   - Im Burst-Fenster: timeScale 1, Allocation-Sampling (CDP HeapProfiler,
//     16 KB Granularität) + RAF-Frame-Zähler -> bytes/frame und Top-Alloc-Sites.
//   - GC-Trace-Events (Major/Minor) im Fenster + retained Heap nach erzwungenem
//     Voll-GC (performance.memory, --expose-gc).
//   - WebGL-Renderer-String ist Pflicht im Beleg (iGPU-Regel 2026-11-28).
//
// Aufruf:
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-gc-probe.mjs \
//        [--burstMinute=25] [--windowWallSeconds=12] [--seed=99] [--out=<pfad>]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const numArg = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return Number(inline.split("=")[1]);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const strArg = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.split("=")[1];
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const BURST_MINUTE = Math.max(2, Math.min(29, Math.floor(numArg("burstMinute", 25))));
const WINDOW_WALL_S = Math.max(5, Math.min(60, numArg("windowWallSeconds", 12)));
const SEED = Math.floor(numArg("seed", 99));
const FAST_TS = 30;
const OUT = strArg(
  "out",
  "/home/ai/games/.evidence/m10-gc-sawtooth-trim/shots/m10-gc-sawtooth-before.json",
);

function aggHeapProfile(profile) {
  const map = new Map();
  const walk = (n) => {
    const cf = n.callFrame ?? {};
    const self = n.selfSize ?? 0;
    if (self > 0) {
      const k = `${cf.functionName || "(anonymous)"}|${(cf.url || "").replace(/^https?:\/\/127\.0\.0\.1:\d+\//, "")}|${(cf.lineNumber ?? -1) + 1}`;
      const e = map.get(k) ?? {
        fn: cf.functionName || "(anonymous)",
        url: (cf.url || "").replace(/^https?:\/\/127\.0\.0\.1:\d+\//, ""),
        line: (cf.lineNumber ?? -1) + 1,
        bytes: 0,
      };
      e.bytes += self;
      map.set(k, e);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(profile.head);
  return [...map.values()].sort((a, b) => b.bytes - a.bytes);
}

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--enable-precise-memory-info",
    "--js-flags=--expose-gc",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const cdp = await page.context().newCDPSession(page);

const result = {
  tool: "scripts/m10-gc-probe.mjs",
  generatedAt: new Date().toISOString(),
  args: { burstMinute: BURST_MINUTE, windowWallSeconds: WINDOW_WALL_S, seed: SEED, fastTimeScale: FAST_TS },
  jsErrors: errors,
};

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);
  await page.evaluate(({ ts }) => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(ts);
  }, { ts: FAST_TS });

  const stats = () => page.evaluate(() => window.__lf.stats());
  const rawMB = () => page.evaluate(() =>
    Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10);

  // Warmlauf bis Sim-Sekunde 60 (Baseline-Konvention perf-heap/fullrun).
  while (((await stats()).time ?? 0) < 60) await page.waitForTimeout(200);

  // Renderer-String (Pflicht im Beleg, iGPU-Regel 28.11.).
  result.renderer = await page.evaluate(() => {
    const viaLf = window.__lf?.rendererInfo?.();
    if (viaLf?.glRenderer) return viaLf.glRenderer;
    const gl = (window.__lf?.game ?? window.game)?.renderer?.gl;
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      return String(gl.getParameter(dbg?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ?? "");
    }
    const c = document.createElement("canvas");
    const g = c.getContext("webgl");
    const dbg = g?.getExtension("WEBGL_debug_renderer_info");
    return String(g?.getParameter(dbg?.UNMASKED_RENDERER_WEBGL ?? g?.RENDERER) ?? "");
  });

  // Vollauf bis zum Burst-Fenster.
  const burstAt = BURST_MINUTE * 60;
  while (true) {
    const s = await stats();
    if (!s || s.scene !== "run") throw new Error(`Szene verlassen bei t=${s?.time}`);
    if ((s.time ?? 0) >= burstAt) break;
    await page.waitForTimeout(200);
  }

  // ── Burst-Fenster: timeScale 1, Frames zählen, Allokationen samplen ──
  const beforeRawMB = await rawMB();
  await cdp.send("Tracing.start", { categories: "v8.gc,devtools.timeline", transferMode: "ReportEvents" });
  let major = 0, minor = 0, maxGcBeforeMB = 0;
  cdp.on("Tracing.dataCollected", (ev) => {
    for (const t of ev.value ?? []) {
      if (t.name === "MajorGC" || t.name === "MinorGC") {
        const before = t.args?.["usedHeapSizeBefore"] ?? t.args?.data?.usedHeapSizeBefore ?? 0;
        const mb = Math.round((before / 1048576) * 10) / 10;
        if (mb > maxGcBeforeMB) maxGcBeforeMB = mb;
        if (t.name === "MajorGC") major++; else minor++;
      }
    }
  });

  await page.evaluate(() => {
    window.__gcFrames = [];
    const f = (t) => { window.__gcFrames.push(t); requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  await page.evaluate(() => { window.__lf.setTimeScale(1); });
  const simAtBurst = (await stats()).time;
  await cdp.send("HeapProfiler.startSampling", {
    samplingInterval: 16384,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  await page.waitForTimeout(WINDOW_WALL_S * 1000);
  const heap = await cdp.send("HeapProfiler.stopSampling");
  const afterRawMB = await rawMB();
  const traceDone = new Promise((res) => cdp.once("Tracing.tracingComplete", res));
  await cdp.send("Tracing.end");
  await traceDone;

  const frames = await page.evaluate(() => {
    const arr = window.__gcFrames ?? [];
    const dts = [];
    for (let i = 1; i < arr.length; i++) dts.push(arr[i] - arr[i - 1]);
    dts.sort((a, b) => a - b);
    const q = (p) => (dts.length ? dts[Math.min(dts.length - 1, Math.floor(p * dts.length))] : null);
    return {
      count: arr.length,
      frameMsAvg: dts.length ? Math.round((dts.reduce((a, b) => a + b, 0) / dts.length) * 100) / 100 : null,
      frameMsP50: q(0.5), frameMsP95: q(0.95), frameMsP99: q(0.99), frameMsMax: dts.at(-1) ?? null,
    };
  });

  const allocTop = aggHeapProfile(heap.profile).slice(0, 40);
  const allocTotalBytes = aggHeapProfile(heap.profile).reduce((a, b) => a + b.bytes, 0);

  // Retained Heap im Burst (nach erzwungenem Voll-GC, best of 2).
  const heapOnce = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    const mb = await page.evaluate(() => {
      if (typeof globalThis.gc === "function") globalThis.gc();
      return Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10;
    });
    return mb;
  };
  const burstGcMB = Math.min(await heapOnce(), await heapOnce());
  const burstStats = await stats();

  result.burstWindow = {
    burstMinute: BURST_MINUTE,
    simSecondAtStart: Math.round(simAtBurst),
    simSecondAtEnd: Math.round(burstStats.time ?? simAtBurst),
    wallSeconds: WINDOW_WALL_S,
    timeScale: 1,
    frameCount: frames.count,
    allocTotalBytes,
    allocBytesPerFrame: frames.count > 0 ? Math.round(allocTotalBytes / frames.count) : null,
    rawMBBefore: beforeRawMB,
    rawMBAfter: afterRawMB,
    retainedGcMB: burstGcMB,
    gcEvents: { major, minor, maxBeforeMB: maxGcBeforeMB },
    enemies: burstStats.enemies ?? null,
    kills: burstStats.kills ?? null,
    frameMs: {
      avg: frames.frameMsAvg, p50: frames.frameMsP50, p95: frames.frameMsP95,
      p99: frames.frameMsP99, max: frames.frameMsMax,
    },
  };
  result.allocTop = allocTop;
  result.allocTotalBytes = allocTotalBytes;
  result.jsErrors = errors;
  if (!result.renderer) throw new Error("Renderer-String konnte nicht gelesen werden (Pflicht im Beleg)");
} catch (err) {
  result.fatal = String(err);
} finally {
  await browser.close();
  server.stop();
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  fatal: result.fatal,
  renderer: result.renderer,
  burstWindow: result.burstWindow,
  allocTop: result.allocTop?.slice(0, 15),
  out: OUT,
}, null, 2));
