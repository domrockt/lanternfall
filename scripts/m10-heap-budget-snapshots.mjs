#!/usr/bin/env node
// Fall-B-Diagnose (Lane m10-heap-budget, Karte #6239): Echtzeit-Lauf
// (timeScale 1, AutoPlay, God) mit CDP-Heap-Snapshots bei Sim-Minute 5 und
// Sim-Minute 29 (jeweils nach erzwungenem GC), Diff nach Konstruktor.
// Roh-Snapshots nach ~/tmp (Werkzeug, kein Deliverable); Aggregat nach shots/.
//
// Aufruf:
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-heap-budget-snapshots.mjs \
//     --out shots/m10-heap-budget-fallb.json
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const strArg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const RAW_DIR = `${process.env.HOME}/tmp/m10-heap-budget/snapshots`;
const OUT = strArg("out", "shots/m10-heap-budget-fallb.json");
const MINUTES = 30;
const RUN_SECONDS = MINUTES * 60;
const SNAP_MINUTES = [5, 29]; // Fall-B-Vorgabe: Diff Minute 5 vs Minute 29
const POLL_MS = 500;
// Nur echte JS-Objekte/Collections fuer die Konstruktor-Rangliste (wie perf-heap).
const COUNTED_TYPES = new Set(["object", "closure", "array", "string", "concatenated string", "sliced string"]);

const gitSha = (() => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "unknown"; }
})();

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const userDataDir = `${process.env.HOME}/tmp/m10-heap-budget/chrome-snap-${process.pid}-${Date.now()}`;
mkdirSync(userDataDir, { recursive: true });
const browser = await chromium.launchPersistentContext(userDataDir, {
  args: ["--disable-dev-shm-usage", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--enable-precise-memory-info", "--js-flags=--expose-gc",
    "--autoplay-policy=no-user-gesture-required"],
  viewport: { width: 960, height: 540 },
});
const page = browser.pages()[0] ?? await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const cdp = await page.context().newCDPSession(page);
await cdp.send("HeapProfiler.enable");

await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=99`);
const renderer = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") ?? c.getContext("webgl");
  if (!gl) return { renderer: "none", vendor: "none" };
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
    vendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
  };
});

await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.autoPlay(true);
  window.__lf.setTimeScale(1);
});

const parseSnapshot = (raw) => {
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
  let objects = 0, bytes = 0;
  for (let i = 0; i < nodes.length; i += stride) {
    const type = typeNames[nodes[i + iType]];
    const name = strings[nodes[i + iName]] || `(anonymous ${type})`;
    const size = nodes[i + iSelf];
    objects++; bytes += size;
    if (!COUNTED_TYPES.has(type)) continue;
    const key = `${type}|${name}`;
    const e = byTypeName.get(key) ?? { type, name, count: 0, bytes: 0 };
    e.count++; e.bytes += size;
    byTypeName.set(key, e);
  }
  return { nodeCount: objects, totalBytes: bytes, byTypeName };
};

const takeSnapshot = async (label) => {
  await cdp.send("HeapProfiler.collectGarbage");
  await page.evaluate(() => { if (typeof globalThis.gc === "function") globalThis.gc(); });
  const jsHeapMB = await page.evaluate(() => Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10);
  const chunks = [];
  const onChunk = (ev) => chunks.push(ev.chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  try {
    await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: true });
  } finally {
    cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  }
  const raw = chunks.join("");
  mkdirSync(RAW_DIR, { recursive: true });
  const file = `${RAW_DIR}/min${label}.heapsnapshot.json`;
  writeFileSync(file, raw);
  const parsed = parseSnapshot(raw);
  parsed.jsHeapMB = jsHeapMB;
  console.log(`[snap] Minute ${label}: ${parsed.nodeCount} Knoten, ${(parsed.totalBytes / 1048576).toFixed(1)} MB, Roh ${file}`);
  return parsed;
};

const started = Date.now();
let nextSnap = 0;
let simSeconds = 0;
let truncated = false;
const snapshots = {};
while (Date.now() - started < (RUN_SECONDS + 300) * 1000) {
  await page.waitForTimeout(POLL_MS);
  const s = await page.evaluate(() => {
    const st = window.__lf.stats();
    return { time: st?.time ?? null, scene: st?.scene ?? null };
  });
  if (!s || s.scene !== "run") continue;
  simSeconds = s.time;
  if (nextSnap < SNAP_MINUTES.length && s.time >= SNAP_MINUTES[nextSnap] * 60) {
    const m = SNAP_MINUTES[nextSnap];
    nextSnap++;
    snapshots[m] = await takeSnapshot(m);
    continue;
  }
  if (s.time >= RUN_SECONDS) { truncated = true; break; }
}

// Diff nach Konstruktor (Minute 5 -> 29), Top 20 je Bytes/Knoten.
const base = snapshots[SNAP_MINUTES[0]];
const end = snapshots[SNAP_MINUTES[1]];
const rows = [];
if (base && end) {
  for (const [key, eb] of end.byTypeName) {
    const ea = base.byTypeName.get(key) ?? { count: 0, bytes: 0 };
    const db = eb.bytes - ea.bytes, dc = eb.count - ea.count;
    if (db !== 0 || dc !== 0) rows.push({ constructor: eb.name, type: eb.type, deltaBytes: db, deltaCount: dc, endCount: eb.count, endBytes: eb.bytes });
  }
}
const topByBytes = [...rows].sort((a, b) => b.deltaBytes - a.deltaBytes || b.deltaCount - a.deltaCount).slice(0, 20);
const topByCount = [...rows].sort((a, b) => b.deltaCount - a.deltaCount || b.deltaBytes - a.deltaBytes).slice(0, 20);

const out = {
  script: "scripts/m10-heap-budget-snapshots.mjs",
  lane: "m10-heap-budget",
  purpose: "Fall-B-Diagnose: Echtzeit-Heap-Snapshot-Diff Minute 5 vs 29 (Post-GC), Top-Holder nach Wachstum",
  gitSha,
  startedAt: new Date(started).toISOString(),
  endedAt: new Date().toISOString(),
  renderer,
  truncated,
  simSeconds,
  errors,
  snapshots: Object.fromEntries(Object.entries(snapshots).map(([m, s]) => [m, {
    nodeCount: s.nodeCount, totalMB: Math.round(s.totalBytes / 1048576 * 10) / 10, jsHeapMB: s.jsHeapMB,
  }])),
  deltaPct: base && end ? Math.round(((end.totalBytes - base.totalBytes) / base.totalBytes) * 1000) / 10 : null,
  topByBytes,
  topByCount,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`${OUT}: Minute5 ${(base.totalBytes / 1048576).toFixed(1)} MB -> Minute29 ${(end.totalBytes / 1048576).toFixed(1)} MB (${out.deltaPct} %), Top-Holder: ${topByBytes.slice(0, 3).map((r) => `${r.type}|${r.constructor} ${(r.deltaBytes / 1048576).toFixed(1)} MB`).join(", ")}`);
await browser.close();
process.exit(0);
