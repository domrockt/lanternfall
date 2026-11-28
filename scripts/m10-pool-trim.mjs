#!/usr/bin/env node
// Pool-Overhang-Probe (Lane m10-pool-trim, Karte #2438):
// 3-min-Echtzeitprobe (500-Gegner-Burst, god+autoPlay, LevelUps suppressed),
// danach Heap-Snapshot: die freien Listen der Pools zaehlen (private Felder
// sind zur Laufzeit plain properties -> Heap-Snapshot-Knoten nach Klassennamen).
//
// Gemessen wird Overhang nach Spitzenlast:
//   T0   direkt nach Burst (aktiv ~500)  -> free soll ~0 sein
//   T180 nach 3 min (Aktive gesunken)    -> free = gepoolter Overhang
// Pools: EnemyPool.free, ProjectilePool.free, generischer Pool.free
// (DamageNumbers.entryPool, Cap 48). Keine FPS-Messung -> ohne flock.
//
// Aufruf: node scripts/m10-pool-trim.mjs --out shots/m10-pool-trim-before.json
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argOf = (name, fallback) => {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT = argOf("out", "shots/m10-pool-trim-before.json");
const MINUTES = Number(argOf("minutes", "3")) || 3;
const BURST = 500;
const SEED = 99;
const POOL_CLASSES = ["EnemyPool", "ProjectilePool", "Pool"];

const gitSha = (() => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "unknown"; }
})();

/** Free-Listen aus dem Heap-Snapshot zaehlen. Der Produktionsbuild minifiziert
 *  Klassennamen — Recognition ueber Property-Signaturen (bleiben erhalten):
 *   generischer Pool (DamageNumbers.entryPool): free, activeSet, createdCount, factory, reset
 *   ProjectilePool:  free, active, scene, stats
 *   EnemyPool:       free, active, scene, fallbackAiRng, nextUid, rimDefCache, markerSpecCache
 *  Gemaessene Groesse = Element-Kanten des "free"-Arrays. */
function parseFreeLists(snap) {
  const meta = snap.snapshot?.meta ?? snap.meta ?? snap;
  const { nodes, edges, strings } = snap;
  const { node_fields, edge_fields } = meta;
  const NODE_TYPES = meta.node_types[0];
  const ETYPES = meta.edge_types[0];
  const NF = node_fields.length;
  const TYPE = node_fields.indexOf("type");
  const ECOUNT = node_fields.indexOf("edge_count");
  const ETYPE = edge_fields.indexOf("type");
  const ENAME = edge_fields.indexOf("name_or_index");
  const ETO = edge_fields.indexOf("to_node");
  const EF = edge_fields.length;
  const nodeCount = nodes.length / NF;

  // Ordinal -> Startindex der Kanten dieses Knotens im edges-Array
  const edgeStart = new Int32Array(nodeCount);
  let acc = 0;
  for (let i = 0; i < nodeCount; i++) {
    edgeStart[i] = acc;
    acc += nodes[i * NF + ECOUNT];
  }

  // Element-Kanten eines Array-Knotens zaehlen
  const countElements = (arrayOrdinal) => {
    let elements = 0;
    const start = edgeStart[arrayOrdinal];
    const ec = nodes[arrayOrdinal * NF + ECOUNT];
    for (let ae = 0; ae < ec; ae++) {
      if (ETYPES[edges[start + ae * EF + ETYPE]] === "element") elements++;
    }
    return elements;
  };

  // Objekte mit "free"-Property einsammeln (Signatur = sortierte Property-Namen)
  const holders = [];
  for (let i = 0; i < nodeCount; i++) {
    const base = i * NF;
    if (NODE_TYPES[nodes[base + TYPE]] !== "object") continue;
    const start = edgeStart[i];
    const ec = nodes[base + ECOUNT];
    let freeTarget = -1;
    let activeTarget = -1;
    const props = [];
    for (let e = 0; e < ec; e++) {
      const off = start + e * EF;
      if (ETYPES[edges[off + ETYPE]] !== "property") continue;
      const name = strings[edges[off + ENAME]];
      if (name === "free") freeTarget = edges[off + ETO] / NF;
      else if (name === "active") activeTarget = edges[off + ETO] / NF;
      else props.push(name);
    }
    if (freeTarget < 0) continue;
    const free = countElements(freeTarget);
    const activeElements = activeTarget >= 0 ? countElements(activeTarget) : -1;
    holders.push({ sig: props.slice().sort().join(","), free, activeElements, props });
  }

  const labelOf = (h) => {
    if (h.props.includes("activeSet")) return "genericPool";
    if (h.props.includes("stats")) return "ProjectilePool";
    if (h.props.includes("fallbackAiRng")) return "EnemyPool";
    return `unbekannt(${h.sig.slice(0, 80)})`;
  };
  const sums = { EnemyPool: { instances: 0, free: 0, active: 0 },
    ProjectilePool: { instances: 0, free: 0, active: 0 },
    genericPool: { instances: 0, free: 0, active: 0 } };
  const unknown = [];
  for (const h of holders) {
    const label = labelOf(h);
    if (sums[label]) {
      sums[label].instances += 1;
      sums[label].free += h.free;
      if (h.activeElements >= 0) sums[label].active += h.activeElements;
    } else unknown.push({ sig: h.sig, free: h.free });
  }
  return { sums, unknown, holderCount: holders.length };
}

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-dev-shm-usage", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--enable-precise-memory-info", "--js-flags=--expose-gc",
    "--autoplay-policy=no-user-gesture-required"],
  viewport: { width: 960, height: 540 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const cdp = await page.context().newCDPSession(page);
await cdp.send("HeapProfiler.enable");
// Snapshot wird als addHeapSnapshotChunk-Event-Stream geliefert (leere Methode-Rückgabe).
let chunks = [];
cdp.on("HeapProfiler.addHeapSnapshotChunk", (e) => chunks.push(e.chunk));
const takeSnap = async () => {
  chunks = [];
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  return JSON.parse(chunks.join(""));
};
const heapMB = async () => {
  await cdp.send("HeapProfiler.collectGarbage");
  return page.evaluate(() =>
    Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10);
};

await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.autoPlay(true);
  window.__lf.setSuppressLevelUps(true);
});

// Burst: 500 Gegner, dann direkt Snapshot T0.
await page.evaluate((n) => window.__lf.spawnEnemy("bog_rat", n), BURST);
await page.waitForTimeout(500);
const t0Stats = await page.evaluate(() => window.__lf.stats());
const t0 = { active: t0Stats.enemies, kills: t0Stats.kills, pools: null, heapMB: await heapMB() };
t0.pools = parseFreeLists(await takeSnap()).sums;

// 3 min laufen lassen: Autoplay killt die Burst-Welle, Direktor spawnet normal.
await page.waitForTimeout(MINUTES * 60 * 1000);
const t180Stats = await page.evaluate(() => window.__lf.stats());
const tEnd = {
  active: t180Stats.enemies,
  kills: t180Stats.kills,
  simSeconds: t180Stats.time,
  pools: null,
  heapMB: await heapMB(),
};
const endParse = parseFreeLists(await takeSnap());
tEnd.pools = endParse.sums;

const report = {
  tag: OUT.includes("after") ? "after" : "before",
  gitSha, seed: SEED, minutes: MINUTES, burst: BURST,
  t0, tEnd,
  overhang: {
    EnemyPool: tEnd.pools.EnemyPool.free,
    ProjectilePool: tEnd.pools.ProjectilePool.free,
    genericPool: tEnd.pools.genericPool.free,
  },
  crossCheck: {
    EnemyPoolActive: tEnd.pools.EnemyPool.active,
    statsActive: tEnd.active,
    freeListHolders: endParse.holderCount,
    unknownSignatures: endParse.unknown.slice(0, 5),
  },
  jsErrors: errors,
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
await server.stop();
process.exit(0);
