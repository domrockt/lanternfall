#!/usr/bin/env node
// Heap-Sampling-Profil fuer einen 30-min-Sim-Lauf (timeScale 30, AutoPlay, God).
// Liefert die Top-Alloc-Sites (Sampling-Heap-Profiler) und Top-CPU-Funktionen.
// Aufruf: node ~/tmp/m10-heap-tail/alloc-profile.mjs [--minutes=30] [--out=shots/m10-heap-tail-alloc.json]
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
const OUT = strArg("out", "shots/m10-heap-tail-alloc.json");
const RUN_SECONDS = MINUTES * 60;

function aggProfile(profile, keySelf, keyTotal) {
  // Sampling-Heap-Profil ist ein Baum (head/children), CPU-Profil hat nodes.
  if (!profile.nodes && profile.head) {
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
          self: 0,
          total: 0,
        };
        e.self += self;
        map.set(k, e);
      }
      for (const c of n.children ?? []) walk(c);
    };
    walk(profile.head);
    return [...map.values()].sort((a, b) => b.self - a.self);
  }
  // Knoten -> (functionName|url|line) aggregieren.
  const byId = new Map();
  for (const n of profile.nodes) byId.set(n.id, n);
  const rows = [];
  for (const n of profile.nodes) {
    const cf = n.callFrame ?? {};
    const self = n[keySelf] ?? 0;
    const total = n[keyTotal] ?? 0;
    if ((self || 0) <= 0 && (total || 0) <= 0) continue;
    rows.push({
      fn: cf.functionName || "(anonymous)",
      url: (cf.url || "").replace(/^https?:\/\/127\.0\.0\.1:\d+\//, ""),
      line: (cf.lineNumber ?? -1) + 1,
      self: self || 0,
      total: total || 0,
    });
  }
  const map = new Map();
  for (const r of rows) {
    const k = `${r.fn}|${r.url}|${r.line}`;
    const e = map.get(k) ?? { fn: r.fn, url: r.url, line: r.line, self: 0, total: 0 };
    e.self += r.self;
    e.total += r.total;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => b.self - a.self);
}

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
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const cdp = await page.context().newCDPSession(page);
await cdp.send("HeapProfiler.enable");
await cdp.send("Profiler.enable");

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(60);
  });
  // Warmlauf bis Sim-Sekunde 60 wie perf-heap.mjs (Baseline-Vergleichbarkeit).
  while (true) {
    const s = await page.evaluate(() => window.__lf.stats ? window.__lf.stats() : window.__lf.getQuickStats?.());
    if ((s.time ?? 0) >= 60) break;
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => globalThis.gc?.());
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 32768, includeObjectsCollectedByMajorGC: false, includeObjectsCollectedByMinorGC: false });
  await cdp.send("Profiler.start", { profileOptions: { samplingInterval: 1000 } });

  const started = Date.now();
  let last = null;
  while (Date.now() - started < 600_000) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => window.__lf.getQuickStats?.() ?? window.__lf.stats?.());
    if (!s) continue;
    last = s;
    if (s.scene !== "run") break;
    if ((s.time ?? 0) >= RUN_SECONDS) break;
  }

  const cpu = await cdp.send("Profiler.stop");
  const heap = await cdp.send("HeapProfiler.stopSampling");

  const allocRows = aggProfile(heap.profile, "selfSize", "selfSize")
    .slice(0, 25)
    .map((r) => ({ fn: r.fn, url: r.url, line: r.line, bytes: r.self }));
  const cpuRows = aggProfile(cpu.profile, "hitCount", "hitCount")
    .slice(0, 25)
    .map((r) => ({ fn: r.fn, url: r.url, line: r.line, samples: r.self }));

  result = {
    tool: "alloc-profile.mjs",
    generatedAt: new Date().toISOString(),
    args: { minutes: MINUTES, seed: SEED },
    simMinutesReached: Math.round(((last?.time ?? 0) / 60) * 10) / 10,
    kills: last?.kills ?? 0,
    enemies: last?.enemies ?? 0,
    fps: last?.fps ?? null,
    jsErrors: errors,
    allocTop: allocRows,
    cpuTop: cpuRows,
    allocSampleCount: heap.profile.samples?.length ?? 0,
    allocTotalBytes: allocRows.reduce((a, b) => a + b.bytes, 0),
  };
} catch (err) {
  result = { tool: "alloc-profile.mjs", generatedAt: new Date().toISOString(), fatal: String(err), jsErrors: errors };
} finally {
  await browser.close();
  server.stop();
}
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ fatal: result.fatal, sim: result.simMinutesReached, kills: result.kills, enemies: result.enemies, allocSamples: result.allocSampleCount, jsErrors: result.jsErrors?.length, topAlloc: result.allocTop?.slice(0, 10), topCpu: result.cpuTop?.slice(0, 10) }, null, 2));
