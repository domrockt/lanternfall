#!/usr/bin/env node
// Heap-Messwerkzeug: CDP-Heap-Snapshots zu Beginn und am Ende eines
// beschleunigten Laufs (timeScale, AutoPlay, God). Liefert Delta in Prozent,
// die Top-Konstruktoren nach Wachstum (Knoten und Bytes) und die GC-Zahl
// (Major/Major aus V8-Trace-Events) als JSON.
//
// Aufruf:
//   node scripts/perf-heap.mjs [--minutes=30] [--seed=99] [--runs=2]
//   node scripts/perf-heap.mjs --minutes=2 --runs=1   (Smoke-Test)
//
// Das Spiel hat keinen `?autoplay=`-Parameter; gesteuert wird über die
// Debug-API (`__lf.autoPlay(true)`, `setTimeScale(30)`), wie bei
// realtime-run.mjs. `?seed=` wird direkt aus der URL gelesen.
//
// Baseline: standardmäßig bei Sim-Sekunde 60 (wie die Abnahme Minute 1 vs. 29),
// damit der Warmlauf (Pools, Texturen, Audio) nicht als Wachstum zählt.
// `--baseline=N` überschreibt das.
import { mkdirSync, writeFileSync } from "node:fs";
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

const MINUTES = Math.max(1, Math.min(30, Math.floor(numArg("minutes", 30))));
const SEED = Math.floor(numArg("seed", 99));
const RUNS = Math.max(1, Math.min(5, Math.floor(numArg("runs", 1))));
const TIME_SCALE = Math.max(1, Math.min(60, numArg("timeScale", 30)));
const OUT = strArg("out", "shots/perf-heap.json");
const RUN_SECONDS = MINUTES * 60;
const BASELINE_AT_S = Math.max(1, Math.min(RUN_SECONDS - 10, Math.floor(numArg("baseline", Math.min(60, RUN_SECONDS / 2)))));
const POLL_MS = 500;
// Nur echte JS-Objekte/Collections fuer die Konstruktor-Rangliste; V8-interne
// Knoten (heap number, code, hidden) sind Rauschen.
const COUNTED_TYPES = new Set(["object", "closure", "array", "string", "concatenated string", "sliced string"]);

ensureBuild();
mkdirSync("shots", { recursive: true });
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

/** Zerlegt einen CDP-Heap-Snapshot und aggregiert Knoten pro Typ+Konstruktor. */
function parseSnapshot(raw) {
  const snap = JSON.parse(raw);
  const meta = snap.snapshot.meta;
  const nf = meta.node_fields;
  const stride = nf.length;
  const iType = nf.indexOf("type");
  const iName = nf.indexOf("name");
  const iSelf = nf.indexOf("self_size");
  const typeNames = meta.node_types[iType];
  const strings = snap.strings;
  const nodes = snap.nodes;
  const byTypeName = new Map();
  let objects = 0;
  let bytes = 0;
  for (let i = 0; i < nodes.length; i += stride) {
    const type = typeNames[nodes[i + iType]];
    const name = strings[nodes[i + iName]] || `(anonymous ${type})`;
    const size = nodes[i + iSelf];
    objects++;
    bytes += size;
    if (!COUNTED_TYPES.has(type)) continue;
    const key = `${type}|${name}`;
    const e = byTypeName.get(key) ?? { type, name, count: 0, bytes: 0 };
    e.count++;
    e.bytes += size;
    byTypeName.set(key, e);
  }
  return { nodeCount: objects, totalBytes: bytes, byTypeName, rawBytes: raw.length };
}

async function takeSnapshot(cdp, page, label) {
  // Voll-GC erzwingen, damit der Snapshot nur gehaltene Objekte zählt.
  await cdp.send("HeapProfiler.collectGarbage");
  await page.evaluate(() => {
    if (typeof globalThis.gc === "function") globalThis.gc();
  });
  const chunks = [];
  const onChunk = (ev) => chunks.push(ev.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  try {
    await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: true });
  } finally {
    cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  }
  const raw = chunks.join("");
  const parsed = parseSnapshot(raw);
  console.log(`[heap] ${label}: ${parsed.nodeCount} Knoten, ${(parsed.totalBytes / 1048576).toFixed(1)} MB, Snapshot ${(parsed.rawBytes / 1048576).toFixed(1)} MB`);
  return parsed;
}

async function metrics(cdp) {
  const res = await cdp.send("Performance.getMetrics");
  const out = {};
  for (const m of res.metrics) out[m.name] = m.value;
  return out;
}

function growthList(base, end) {
  const rows = [];
  for (const [key, e] of end.byTypeName) {
    const b = base.byTypeName.get(key) ?? { count: 0, bytes: 0 };
    const dc = e.count - b.count;
    const db = e.bytes - b.bytes;
    if (dc > 0 || db > 0) {
      rows.push({
        constructor: e.name,
        type: e.type,
        startCount: b.count,
        endCount: e.count,
        deltaCount: dc,
        startBytes: b.bytes,
        endBytes: e.bytes,
        deltaBytes: db,
      });
    }
  }
  return rows;
}

async function oneRun(runIndex) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("Performance.enable");

  const summary = {
    run: runIndex + 1,
    seed: SEED,
    timeScale: TIME_SCALE,
    targetSimMinutes: MINUTES,
    baselineAtSimSecond: BASELINE_AT_S,
    errors,
  };
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
    await startRun(page);
    await page.evaluate(({ ts }) => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
      window.__lf.setTimeScale(ts);
    }, { ts: TIME_SCALE });

    // Bis zum Baseline-Zeitpunkt laufen lassen (Pools/Texturen/Audio warm).
    while (true) {
      const s = await page.evaluate(() => window.__lf.stats());
      if ((s.time ?? 0) >= BASELINE_AT_S) break;
      await page.waitForTimeout(POLL_MS);
    }
    const mStart = await metrics(cdp);
    const base = await takeSnapshot(cdp, page, `Lauf ${runIndex + 1} Start`);

    // GC-Zaehlung ueber V8-Trace-Events (dieser Chromium-Build liefert
    // MajorGC/MinorGC nicht ueber Performance.getMetrics).
    const gcCount = { major: 0, minor: 0 };
    const onTrace = (ev) => {
      for (const e of ev.value) {
        if (e.name === "MajorGC") gcCount.major++;
        else if (e.name === "MinorGC") gcCount.minor++;
      }
    };
    cdp.on("Tracing.dataCollected", onTrace);
    await cdp.send("Tracing.start", { categories: "v8.gc,devtools.timeline", transferMode: "ReportEvents" });

    const fpsSamples = [];
    let last = null;
    const wallLimitMs = 600_000;
    const started = Date.now();
    while (Date.now() - started < wallLimitMs) {
      await page.waitForTimeout(POLL_MS);
      const s = await page.evaluate(() => window.__lf.stats());
      if (!s) continue;
      last = s;
      if (s.scene !== "run") break;
      if (Number.isFinite(s.fps)) fpsSamples.push(s.fps);
      if ((s.time ?? 0) >= RUN_SECONDS) break;
    }

    const traceDone = new Promise((res) => cdp.once("Tracing.tracingComplete", res));
    await cdp.send("Tracing.end");
    await traceDone;
    cdp.off("Tracing.dataCollected", onTrace);

    const mEnd = await metrics(cdp);
    const end = await takeSnapshot(cdp, page, `Lauf ${runIndex + 1} Ende`);

    const deltaNodes = end.nodeCount - base.nodeCount;
    const deltaBytes = end.totalBytes - base.totalBytes;
    const deltaPct = base.totalBytes > 0
      ? Math.round((deltaBytes / base.totalBytes) * 1000) / 10
      : null;

    const growth = growthList(base, end);
    const topByCount = [...growth].sort((a, b) => b.deltaCount - a.deltaCount || b.deltaBytes - a.deltaBytes).slice(0, 5);
    const topByBytes = [...growth].sort((a, b) => b.deltaBytes - a.deltaBytes || b.deltaCount - a.deltaCount).slice(0, 5);

    const sortedFps = [...fpsSamples].sort((a, b) => a - b);
    const fpsMin = sortedFps.length ? Math.round(sortedFps[0] * 10) / 10 : null;
    const fpsMedian = sortedFps.length ? Math.round(sortedFps[Math.floor(sortedFps.length / 2)] * 10) / 10 : null;

    Object.assign(summary, {
      simSecondsReached: Math.round((last?.time ?? 0) * 10) / 10,
      simMinutesReached: Math.round(((last?.time ?? 0) / 60) * 10) / 10,
      scene: last?.scene ?? null,
      kills: last?.kills ?? 0,
      level: last?.level ?? 0,
      enemies: last?.enemies ?? 0,
      heap: {
        start: {
          nodes: base.nodeCount,
          bytes: base.totalBytes,
          mb: Math.round((base.totalBytes / 1048576) * 10) / 10,
        },
        end: {
          nodes: end.nodeCount,
          bytes: end.totalBytes,
          mb: Math.round((end.totalBytes / 1048576) * 10) / 10,
        },
        deltaNodes,
        deltaBytes,
        deltaPct,
        top5GrowthByCount: topByCount,
        top5GrowthByBytes: topByBytes,
      },
      gc: {
        major: gcCount.major,
        minor: gcCount.minor,
        source: "cdp-trace:v8.gc",
        usedJSHeapStartMB: Math.round(((mStart.JSHeapUsedSize ?? 0) / 1048576) * 10) / 10,
        usedJSHeapEndMB: Math.round(((mEnd.JSHeapUsedSize ?? 0) / 1048576) * 10) / 10,
      },
      fps: {
        min: fpsMin,
        median: fpsMedian,
        samples: fpsSamples.length,
      },
      jsErrors: errors,
    });
  } catch (err) {
    summary.fatal = String(err);
  } finally {
    await page.close();
  }
  return summary;
}

const runs = [];
try {
  for (let i = 0; i < RUNS; i++) runs.push(await oneRun(i));
} finally {
  await browser.close();
  server.stop();
}

const deltas = runs.map((r) => r.heap?.deltaPct).filter((v) => Number.isFinite(v));
let spreadPp = null;
let spreadPct = null;
if (deltas.length >= 2) {
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const min = Math.min(...deltas);
  const max = Math.max(...deltas);
  // Abweichung in Prozentpunkten (max-min) und relativ zum Mittelwert.
  spreadPp = Math.round((max - min) * 10) / 10;
  spreadPct = mean !== 0 ? Math.round(((max - min) / Math.abs(mean)) * 1000) / 10 : null;
}
const median = deltas.length
  ? [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)] : null;

const result = {
  tool: "scripts/perf-heap.mjs",
  mode: "cdp-heap-snapshot",
  generatedAt: new Date().toISOString(),
  args: { minutes: MINUTES, seed: SEED, runs: RUNS, timeScale: TIME_SCALE, baseline: BASELINE_AT_S },
  runs,
  summary: {
    deltasPct: deltas,
    medianDeltaPct: median,
    spreadPp,
    spreadPct,
    // Abnahmekriterium "Delta-Abweichung unter 10 %" als Prozentpunkte.
    spreadUnder10Pct: spreadPp !== null ? spreadPp < 10 : null,
    jsErrors: runs.reduce((n, r) => n + (r.jsErrors?.length ?? 0), 0),
  },
};
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.summary, null, 2));
process.exit(result.summary.jsErrors === 0 && runs.every((r) => !r.fatal) ? 0 : 1);
