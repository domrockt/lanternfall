// Debug 3: exakter Hauptskript-Flow (simulate-Hook + 700s-Wartelogik), mit Dump.
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101&detstart=1`);
await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
await waitForScene(page, "title");
await page.keyboard.press("Enter");
await waitForScene(page, "charselect");
await page.keyboard.press("1");
await page.keyboard.press("Enter");
await waitForScene(page, "run");
const MAX_SECONDS = 700;
await page.evaluate(([maxSec]) => {
  const run = window.__game.scene.getScene("run");
  const rec = { calls: 0, bySec: {}, first: null };
  window.__spawnRec = rec;
  const proto = Object.getPrototypeOf(run.spawner);
  const origSpawnAt = proto.spawnAt;
  proto.spawnAt = function (def, x, y, opts) {
    const e = origSpawnAt.call(this, def, x, y, opts);
    rec.calls += 1;
    const s = Math.floor(run.elapsed);
    if (!rec.first) rec.first = { s, uid: e?.uid, elapsed: run.elapsed };
    (rec.bySec[s] = rec.bySec[s] || []).push(`${e.uid}`);
    return e;
  };
  let nextSec = 1;
  const trace = { spawns: [], events: [], simCalls: 0, lastElapsed: 0 };
  window.__probe = trace;
  const runProto = Object.getPrototypeOf(run);
  const origSim = runProto.simulate;
  runProto.simulate = function (dt) {
    origSim.call(this, dt);
    trace.simCalls += 1;
    trace.lastElapsed = this.elapsed;
    while (nextSec <= maxSec && this.elapsed >= nextSec) {
      const arr = rec.bySec[nextSec];
      trace.spawns.push(arr ? arr.join(";") : "");
      nextSec += 1;
    }
  };
  run.events.on("bossWarn", (e) => trace.events.push({ kind: "bossWarn", index: e.index, at: run.elapsed }));
  run.events.on("bossDefeated", (e) => trace.events.push({ kind: "bossDefeated", index: e.index, at: run.elapsed }));
}, [MAX_SECONDS]);
await page.evaluate(() => {
  window.__lf.autoPlay(true);
  window.__lf.god(false);
  window.__lf.setTimeScale(30);
  window.__game.scene.getScene("run").resumeRun();
});
await page.waitForFunction(
  (limit) => {
    const g = window.__game;
    if (!g) return false;
    const run = g.scene.getScene("run");
    if (run && run.scene.isActive()) {
      const t = window.__probe;
      return Boolean(t && t.spawns.length >= limit);
    }
    return g.scene.isActive("results");
  },
  MAX_SECONDS, { timeout: 300_000, polling: 200 },
);
const dbg = await page.evaluate(() => {
  const rec = window.__spawnRec;
  const t = window.__probe;
  const keys = Object.keys(rec.bySec).map(Number);
  const inRange = keys.filter((k) => k >= 1 && k <= 700);
  const marksInRange = inRange.reduce((n, k) => n + rec.bySec[k].length, 0);
  return {
    calls: rec.calls, keyCount: keys.length, keyMin: Math.min(...keys), keyMax: Math.max(...keys),
    marksInRange, traceLen: t.spawns.length, traceMarks: t.spawns.filter(Boolean).length,
    simCalls: t.simCalls, lastElapsed: t.lastElapsed,
    events: t.events, nonEmptySample: t.spawns.map((s, i) => [i + 1, s]).filter((x) => x[1]).slice(0, 5),
  };
});
console.log(JSON.stringify(dbg, null, 1));
await browser.close();
