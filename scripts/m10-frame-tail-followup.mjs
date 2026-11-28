#!/usr/bin/env node
// m10-frame-tail-followup: Probe-Skript (Werkzeug, kein Deliverable).
//
//   node scripts/m10-frame-tail-followup.mjs --mode=seed --tag=before --out=<json>
//   node scripts/m10-frame-tail-followup.mjs --mode=dawn --tag=after  --out=<json>
//
// mode=seed: Spawn-Verteilung im NORMALPFAD, sim-exakt (simulate-Hook wie
//   m10-run-determinism.mjs). Je ganzzahliger Sim-Sekunde: kills/enemies/
//   spawnTotal (Summe spawner.spawnCounts) + rollierender Positions-Hash
//   (FNV-1a über uid/x/y der aktiven Gegner). Zwei Builds mit gleichem Seed
//   muessen bitgleiche Checksummen liefern (Abnahme: Normalpfad bitgleich).
//
// mode=dawn: Dawn-Drain-Beleg. 80 Debug-Spawns per window.__lf.spawnEnemy
//   queuen (Batching-Pfad), dann window.__lf.event("dawn") (startDawn).
//   PRE-FIX (Queue-Leak): die 80 materialisieren nie -> alive < 80.
//   POST-FIX: startDawn ruft drainDebugQueue -> alive >= 80.
//
// Keine FPS-/Echtzeit-Messung => OHNE flock (sim-exakte Marken, lastunabhaengig).
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const argOf = (name, fallback) => {
  const argv = process.argv.slice(2);
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  return fallback;
};

const MODE = String(argOf("mode", "seed"));
const TAG = String(argOf("tag", "before"));
const OUT = String(argOf("out", `${process.env.HOME}/tmp/m10-frame-tail-followup/probe-${MODE}-${TAG}.json`));
const SEED = Number(argOf("seed", "101"));
const SIM_SECONDS = Number(argOf("seconds", "90"));
const SCALE = Number(argOf("timescale", "10"));
const DAWN_QUEUE_N = Number(argOf("n", "80"));

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});

async function openRun(seed) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${seed}&detstart=1`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await waitForScene(page, "run");
  return { page, pageErrors };
}

if (MODE === "seed") {
  const { page, pageErrors } = await openRun(SEED);
  await page.evaluate((limit) => {
    const run = window.__game.scene.getScene("run");
    let nextSec = 1;
    const trace = { marks: [], final: null };
    window.__ffTrace = trace;
    let hash = 0x811c9dc5;
    const fnv = (v) => {
      hash ^= v & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    };
    const proto = Object.getPrototypeOf(run);
    const orig = proto.simulate;
    proto.simulate = function (dt) {
      orig.call(this, dt);
      const counts = this.spawner?.spawnCounts ?? {};
      let total = 0;
      for (const k in counts) total += counts[k];
      for (const e of this.enemies?.active ?? []) {
        if (!e.alive) continue;
        fnv(e.uid);
        fnv(Math.round(e.x * 100) & 0xffff);
        fnv(Math.round(e.y * 100) & 0xffff);
        if (e.elite) fnv(0x9e37);
      }
      while (nextSec <= limit && this.elapsed >= nextSec) {
        const hud = this.getHudState();
        trace.marks.push({
          s: nextSec,
          kills: hud.kills,
          level: hud.level,
          enemies: hud.enemies,
          spawnTotal: total,
          posHash: hash,
        });
        nextSec += 1;
      }
      if (nextSec > limit && trace.final === null) {
        const hud = this.getHudState();
        trace.final = { time: this.elapsed, kills: hud.kills, level: hud.level, posHash: hash };
      }
    };
    run.resumeRun();
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(10);
  }, SIM_SECONDS);

  await page.waitForFunction(
    (limit) => {
      const t = window.__ffTrace;
      return Boolean(t && (t.marks.length >= limit || t.final !== null));
    },
    SIM_SECONDS,
    { timeout: 240_000, polling: 120 },
  );

  const trace = await page.evaluate(() => window.__ffTrace);
  const checksum = `${trace.final?.posHash ?? 0}:${trace.marks.map((m) => m.posHash).join(",")}`;
  const out = {
    mode: "seed",
    tag: TAG,
    seed: SEED,
    simSeconds: SIM_SECONDS,
    marks: trace.marks.length,
    final: trace.final,
    marksFull: trace.marks,
    checksum,
    jsErrors: pageErrors,
    at: new Date().toISOString(),
  };
  mkdirSync(OUT.substring(0, OUT.lastIndexOf("/")), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ mode: MODE, tag: TAG, marks: trace.marks.length, checksum, jsErrors: pageErrors.length }, null, 2));
} else if (MODE === "dawn") {
  const { page, pageErrors } = await openRun(SEED);
  const res = await page.evaluate(async (n) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const run = window.__game.scene.getScene("run");
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    await sleep(800);
    const before = {
      enemies: window.__lf.state().enemies,
      spawnCounts: { ...(run.spawner?.spawnCounts ?? {}) },
    };
    const requested = window.__lf.spawnEnemy("bog_rat", n);
    const queued = { enemies: window.__lf.state().enemies, requested };
    window.__lf.event("dawn");
    await sleep(1200);
    const after = {
      enemies: window.__lf.state().enemies,
      spawnCounts: { ...(run.spawner?.spawnCounts ?? {}) },
      dawn: window.__lf.state().dawn === true,
      debugQueueLen: run.spawner?.debugQueue?.length ?? null,
    };
    // Materialisierung über spawnCounts-Delta (kampfunabhängig): startDawn
    // drainFirst (Cap 30), Sim-Substeps während Dawn dränieren den Rest;
    // danach 8 frische bog_rat + 4 skeleton aus dem Event-Handler.
    // Bog_rat-Delta 88 => Drain komplett, 8 => Leak.
    const delta = (id) => (after.spawnCounts[id] ?? 0) - (before.spawnCounts[id] ?? 0);
    const materialized = delta("bog_rat") - 8;
    return { before, queued, after, deltaBogRat: delta("bog_rat"), deltaSkeleton: delta("skeleton"), materialized };
  }, DAWN_QUEUE_N);

  const queuedMaterialized = res.materialized;
  const out = {
    mode: "dawn",
    tag: TAG,
    seed: SEED,
    queuedN: DAWN_QUEUE_N,
    ...res,
    queuedMaterialized,
    queueLenAfterDawn: res.after.debugQueueLen,
    verdict: queuedMaterialized >= DAWN_QUEUE_N && res.after.debugQueueLen === 0
      ? "PASS (Dawn-Drain materialisiert)"
      : "FAIL (Queue-Leak)",
    jsErrors: pageErrors,
    at: new Date().toISOString(),
  };
  mkdirSync(OUT.substring(0, OUT.lastIndexOf("/")), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ mode: MODE, tag: TAG, queuedMaterialized, verdict: out.verdict, jsErrors: pageErrors.length }, null, 2));
} else {
  throw new Error(`unbekannter Modus "${MODE}" (seed|dawn)`);
}

await browser.close();
process.exit(0);
