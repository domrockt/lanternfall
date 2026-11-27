#!/usr/bin/env node
// Lane m10-heap-sawtooth: per-Minute-Heap- und GC-Spike-Profil eines
// 30-min-Sim-Laufs (timeScale 30, AutoPlay, God).
//
// Misst je Sim-Minute:
//   - rawMB:    rohe performance.memory.usedJSHeapSize OHNE GC (Saegezahn)
//   - gcMB:     best-of-2 retained Heap nach erzwungenem Voll-GC (Gate-Metrik)
//   - Major/Minor-GC-Zaehler (V8-Trace-Events) und groesste GC-Spitze (MB before)
// Zusaetzlich Sampling-Heap-Profil (Top-Alloc-Sites) wahlweise ab Minute X.
//
// Aufruf:
//   node scripts/m10-heap-sawtooth.mjs [--minutes=30] [--seed=99] \
//        [--out=shots/m10-heap-sawtooth-before.json] [--allocFrom=20]
import { writeFileSync } from "node:fs";
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

const MINUTES = Math.max(2, Math.min(30, Math.floor(numArg("minutes", 30))));
const SEED = Math.floor(numArg("seed", 99));
const TIME_SCALE = Math.max(1, Math.min(60, numArg("timeScale", 30)));
const ALLOC_FROM = Math.floor(numArg("allocFrom", 20));
const OUT = strArg("out", "shots/m10-heap-sawtooth-before.json");
const RUN_SECONDS = MINUTES * 60;

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
await cdp.send("HeapProfiler.enable");

const result = {
  tool: "m10-heap-sawtooth.mjs",
  generatedAt: new Date().toISOString(),
  args: { minutes: MINUTES, seed: SEED, timeScale: TIME_SCALE, allocFromMinute: ALLOC_FROM },
  jsErrors: errors,
};

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);
  await page.evaluate(({ ts }) => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(ts);
  }, { ts: TIME_SCALE });

  // Warmlauf bis Sim-Sekunde 60 (Baseline-Vergleichbarkeit mit perf-heap/fullrun).
  while (true) {
    const s = await page.evaluate(() => window.__lf.stats());
    if ((s.time ?? 0) >= 60) break;
    await page.waitForTimeout(200);
  }

  const rawMB = () => page.evaluate(() =>
    Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10);
  const heapOnce = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    const mb = await page.evaluate(() => {
      if (typeof globalThis.gc === "function") globalThis.gc();
      return Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10;
    });
    return mb;
  };
  const gcStableMB = async () => {
    let best = await heapOnce();
    const second = await heapOnce();
    return Math.min(best, second);
  };

  // GC-Trace-Zaehlung mit Minuten-Attribution (Ankunfts-Bucket).
  const gcPerMinute = new Map(); // minute -> { major, minor, maxBeforeMB }
  cdp.on("Tracing.dataCollected", (ev) => {
    const minute = Math.max(1, Math.min(MINUTES, Math.floor((lastSimTime ?? 0) / 60)));
    const e = gcPerMinute.get(minute) ?? { major: 0, minor: 0, maxBeforeMB: 0 };
    for (const t of ev.value ?? []) {
      if (t.name === "MajorGC" || t.name === "MinorGC") {
        const before = t.args?.["usedHeapSizeBefore"] ?? t.args?.data?.usedHeapSizeBefore ?? 0;
        if (t.name === "MajorGC") e.major++; else e.minor++;
        const mb = Math.round((before / 1048576) * 10) / 10;
        if (mb > e.maxBeforeMB) e.maxBeforeMB = mb;
      }
    }
    gcPerMinute.set(minute, e);
  });

  await cdp.send("Tracing.start", { categories: "v8.gc,devtools.timeline", transferMode: "ReportEvents" });

  const perMinute = [];
  const rawCurve = []; // hochaufgeloeste Saegezahn-Kurve (ohne GC)
  let lastMinute = 1;
  let lastSimTime = 60;
  const started = Date.now();
  let allocStarted = false;
  let last = null;

  // Minute-1-Sample direkt nach dem Warmlauf (Baseline = Sim-Sekunde 60).
  {
    const s0 = await page.evaluate(() => window.__lf.stats());
    const gcMB0 = await gcStableMB();
    lastSimTime = s0.time ?? 60;
    perMinute.push({
      minute: 1,
      simSecond: Math.round(lastSimTime),
      rawMB: await rawMB(),
      gcMB: gcMB0,
      rawAfterGcMB: await rawMB(),
      enemies: s0.enemies ?? null,
      kills: s0.kills ?? null,
      fps: Number.isFinite(s0.fps) ? s0.fps : null,
    });
    console.log(`[m01] gc=${gcMB0} enemies=${s0.enemies} kills=${s0.kills}`);
  }

  while (Date.now() - started < (MINUTES + 4) * 60_000) {
    await page.waitForTimeout(250);
    const s = await page.evaluate(() => window.__lf.stats());
    if (!s) continue;
    last = s;
    lastSimTime = s.time ?? 0;
    if (s.scene !== "run") break;
    rawCurve.push({ t: Math.round(lastSimTime), mb: await rawMB() });

    const minute = Math.floor(lastSimTime / 60) + 1;
    if (minute > lastMinute && minute > 1 && minute <= MINUTES) {
      // Saegezahn-Hochpunkt vor dem GC mitloggen (Reihenfolge: raw zuerst).
      const beforeRaw = await rawMB();
      const gcMB = await gcStableMB();
      const afterRaw = await rawMB();
      perMinute.push({
        minute,
        simSecond: Math.round(lastSimTime),
        rawMB: beforeRaw,
        gcMB,
        rawAfterGcMB: afterRaw,
        enemies: s.enemies ?? null,
        kills: s.kills ?? null,
        fps: Number.isFinite(s.fps) ? s.fps : null,
      });
      console.log(`[m${String(minute).padStart(2)}] raw=${beforeRaw} gc=${gcMB} enemies=${s.enemies} kills=${s.kills}`);
      lastMinute = minute;
      if (minute >= ALLOC_FROM && !allocStarted) {
        allocStarted = true;
        await cdp.send("HeapProfiler.startSampling", {
          samplingInterval: 32768,
          includeObjectsCollectedByMajorGC: false,
          includeObjectsCollectedByMinorGC: false,
        });
      }
    }
    if (lastSimTime >= RUN_SECONDS) break;
  }

  if (allocStarted) {
    const heap = await cdp.send("HeapProfiler.stopSampling");
    const allocTop = aggHeapProfile(heap.profile).slice(0, 30);
    result.allocWindow = { fromMinute: ALLOC_FROM, toSimMinute: Math.round((lastSimTime / 60) * 10) / 10 };
    result.allocTop = allocTop;
    result.allocTotalBytes = allocTop.reduce((a, b) => a + b.bytes, 0);
  }
  const traceDone = new Promise((res) => cdp.once("Tracing.tracingComplete", res));
  await cdp.send("Tracing.end");
  await traceDone;

  const gcStableEnd = await gcStableMB();
  const rawEnd = await rawMB();

  const gcArr = [...gcPerMinute.entries()].map(([minute, v]) => ({ minute, ...v }))
    .sort((a, b) => a.minute - b.minute);

  const gcMBs = perMinute.map((p) => p.gcMB);
  const m1 = perMinute.find((p) => p.minute === 1);
  const m29 = perMinute.find((p) => p.minute === Math.min(29, MINUTES));
  const deltaVsMinute1Pct = m1 && m29 ? Math.round(((m29.gcMB - m1.gcMB) / m1.gcMB) * 1000) / 10 : null;

  result.summary = {
    completed: lastSimTime >= RUN_SECONDS,
    simMinutesReached: Math.round((lastSimTime / 60) * 10) / 10,
    kills: last?.kills ?? null,
    minute1GcMB: m1?.gcMB ?? null,
    minute29GcMB: m29?.gcMB ?? null,
    deltaVsMinute1Pct,
    endGcMB: gcStableEnd,
    endRawMB: rawEnd,
    gateTargetPct: 12,
    gatePass: deltaVsMinute1Pct !== null ? deltaVsMinute1Pct <= 12 : null,
  };
  result.perMinute = perMinute;
  result.rawCurve = rawCurve;
  result.gcPerMinute = gcArr;
  result.jsErrors = errors;
} catch (err) {
  result.fatal = String(err);
} finally {
  await browser.close();
  server.stop();
}
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ fatal: result.fatal, summary: result.summary, allocTop: result.allocTop?.slice(0, 12) }, null, 2));
