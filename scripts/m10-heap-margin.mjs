#!/usr/bin/env node
// Lane m10-heap-margin: Endgame-Allokationsprofil fuer den 780-Pfad
// (780x360@3, Minute-20-29-Szenario: 500 Gegner + Projektile + Damage-Text).
// Misst Heap-Wachstum (JS-Heap nach erzwungenem Voll-GC) ueber das
// Endgame-Fenster plus Sampling-Heap-Profil der Top-Alloc-Sites.
// Aufruf: node scripts/m10-heap-margin.mjs --out=shots/m10-heap-margin-before.json
// Heap-Szenario: OHNE flock (lastunabhaengig, WHY: Heap-Messung ist lastunabhaengig).
// Nur echte fullrun-FPS-Messungen laufen unter `flock -w`:
//   flock -w 300 /home/ai/games/.lf-perf.lock npm run fullrun
// (-w 300 = 30-Min-Sim @ timeScale 30 ~ 60-120 s real + Build/Boot ~120 s Puffer;
// bei Lock-Timeout rc != 0: Meldung "Sperre /home/ai/games/.lf-perf.lock belegt —
// spaeter erneut versuchen" + Exitcode weiterreichen — kein stiller Abbruch.)
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline !== undefined) return inline.split("=").slice(1).join("=");
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const num = (name, fallback) => Number(argOf(name, fallback)) || fallback;

const VIEWPORT_ARG = String(argOf("viewport", "780x360")).split("x").map(Number);
const VIEWPORT = { width: VIEWPORT_ARG[0] || 780, height: VIEWPORT_ARG[1] || 360 };
const DPR = num("dpr", 3);
const SEED = num("seed", 99);
const FROM_MIN = num("fromMin", 20);
const TO_MIN = num("toMin", 29);
const TIME_SCALE = num("timeScale", 60);
const OUT = String(argOf("out", "shots/m10-heap-margin-before.json"));

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

// Identische Aggregation wie heap-alloc-profile.mjs.
function aggProfile(profile) {
  const map = new Map();
  const walk = (n) => {
    const cf = n.callFrame ?? {};
    const self = n.selfSize ?? 0;
    if (self > 0) {
      const k = `${cf.functionName || "(anonymous)"}|${(cf.url || "").replace(/^https?:\/\/127\.0\.0\.1:\d+\//, "")}|${(cf.lineNumber ?? -1) + 1}`;
      const e = map.get(k) ?? { fn: cf.functionName || "(anonymous)", url: (cf.url || "").replace(/^https?:\/\/127\.0\.0\.1:\d+\//, ""), line: (cf.lineNumber ?? -1) + 1, bytes: 0 };
      e.bytes += self;
      map.set(k, e);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(profile.head);
  return [...map.values()].sort((a, b) => b.bytes - a.bytes);
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
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const cdp = await page.context().newCDPSession(page);
await cdp.send("HeapProfiler.enable");

const heapOnce = async () => {
  await cdp.send("HeapProfiler.collectGarbage");
  const jsMB = await page.evaluate(() => {
    if (typeof globalThis.gc === "function") globalThis.gc();
    return Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10;
  });
  const usage = await cdp.send("Runtime.getHeapUsage");
  return { jsMB, cdpMB: Math.round((usage.usedSize / 1048576) * 10) / 10 };
};
const heapAt = async () => {
  let best = await heapOnce();
  for (let i = 0; i < 2; i++) {
    const s = await heapOnce();
    if (s.jsMB < best.jsMB) best = s;
  }
  return best;
};

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);
  await page.evaluate(({ evolutions, passives, timeScale }) => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.setTimeScale(timeScale);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES, timeScale: TIME_SCALE });

  // Auf Sim-Minute FROM_MIN laufen; Gegnerdichte auf >= 500 top-uppen (Endgame).
  let stat = null;
  const simTime = () => page.evaluate(() => (window.__lf.stats?.() ?? window.__lf.getQuickStats?.())?.time ?? 0);
  while ((await simTime()) < FROM_MIN * 60) await page.waitForTimeout(500);
  stat = await page.evaluate(() => window.__lf.stats());
  if (stat.enemies < 500) {
    const need = Math.min(500 - stat.enemies, 400);
    // Mischung wie Minute 20+: Swarm + Chaser + Tank.
    await page.evaluate((n) => {
      window.__lf.spawnEnemy("bog_rat", Math.floor(n * 0.4));
      window.__lf.spawnEnemy("skeleton", Math.floor(n * 0.3));
      window.__lf.spawnEnemy("knight", Math.max(1, Math.floor(n * 0.1)));
      window.__lf.spawnEnemy("harpy", Math.floor(n * 0.2));
    }, need);
  }

  const heapFrom = await heapAt();

  // Sampling waehrend des Endgame-Fensters.
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 32768, includeObjectsCollectedByMajorGC: false, includeObjectsCollectedByMinorGC: false });

  let fpsMin = Number.POSITIVE_INFINITY;
  let fpsSamples = 0;
  while (true) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => window.__lf.stats());
    if (!s) continue;
    fpsMin = Math.min(fpsMin, s.fps ?? Number.POSITIVE_INFINITY);
    fpsSamples += 1;
    if (s.scene !== "run") break;
    if ((s.time ?? 0) >= TO_MIN * 60) { stat = s; break; }
  }

  const heap = await cdp.send("HeapProfiler.stopSampling");
  const heapTo = await heapAt();

  const allocTop = aggProfile(heap.profile).slice(0, 20);
  const deltaMB = Math.round((heapTo.jsMB - heapFrom.jsMB) * 10) / 10;
  const deltaPct = Math.round(((heapTo.jsMB - heapFrom.jsMB) / heapFrom.jsMB) * 1000) / 10;

  result = {
    tool: "m10-heap-margin.mjs",
    generatedAt: new Date().toISOString(),
    args: { viewport: VIEWPORT, dpr: DPR, seed: SEED, fromMin: FROM_MIN, toMin: TO_MIN, timeScale: TIME_SCALE },
    heap: { fromMB: heapFrom.jsMB, toMB: heapTo.jsMB, deltaMB, deltaPct, cdpFromMB: heapFrom.cdpMB, cdpToMB: heapTo.cdpMB },
    enemies: stat?.enemies ?? null,
    kills: stat?.kills ?? null,
    fpsMin: Number.isFinite(fpsMin) ? Math.round(fpsMin * 10) / 10 : null,
    fpsSamples,
    jsErrors: errors,
    allocTop,
  };
} catch (err) {
  result = { tool: "m10-heap-margin.mjs", generatedAt: new Date().toISOString(), fatal: String(err), jsErrors: errors };
} finally {
  await page.close();
  await browser.close();
  server.stop();
}
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
