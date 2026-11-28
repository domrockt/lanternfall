#!/usr/bin/env node
// Lane m10-heap-pool-fix (K2-Diagnose): Pool-Wachstum ueber den 30-min-Lauf.
//
// Misst alle 5 Sim-Minuten (volle Abnahme-Last wie fullrun: alle Evolutions
// Stufe 8, Passives Stufe 5, timeScale 30, AutoPlay, God, Seed 99):
//   - gcMB:      retained JS-Heap nach erzwungenem Voll-GC (Gate-Metrik)
//   - enemies:   EnemyPool  active / free / createdTotal
//   - projectiles: ProjectilePool  active (stats) / created / spawned
//   - fx / particles: FxSystem.count / Pool-Slots
//
// Aufruf:
//   node scripts/m10-heap-pool-fix.mjs [--minutes=30] [--out=shots/m10-heap-pool-fix-pools.json]
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
const OUT = strArg("out", "shots/m10-heap-pool-fix-pools.json");
const RUN_SECONDS = MINUTES * 60;
const POLL_MS = 500;
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded_windows",
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

const gcHeapMB = async () => {
  let best = 0;
  for (let i = 0; i < 2; i++) {
    await cdp.send("HeapProfiler.collectGarbage");
    const v = await page.evaluate(() => {
      globalThis.gc?.();
      const used = performance.memory?.usedJSHeapSize ?? 0;
      return Math.round((used / 1048576) * 10) / 10;
    });
    best = best === 0 ? v : Math.min(best, v);
  }
  return best;
};

const poolStats = () =>
  page.evaluate(() => {
    const run = window.__game?.scene?.getScene?.("run");
    if (!run) return null;
    const ep = run.enemies;
    const cs = run.combat;
    const pp = cs?.projectiles;
    return {
      enemies: ep
        ? { active: ep.count, free: ep.freeCount, created: ep.createdTotal }
        : null,
      projectiles: pp
        ? {
            active: pp.active?.length ?? null,
            created: pp.stats?.created ?? null,
            spawned: pp.stats?.spawned ?? null,
          }
        : null,
      fxCount: cs?.fx?.count ?? null,
      particles: cs?.particles?.count ?? null,
      damage: cs?.damageNumbers ? (cs.damageNumbers.count ?? null) : null,
    };
  });

const samples = [];
let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);
  await page.evaluate(({ evolutions, passives }) => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.setTimeScale(30);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });

  const started = Date.now();
  let nextMinute = 1;
  let last = null;
  while (Date.now() - started < 900_000) {
    await page.waitForTimeout(POLL_MS);
    const s = await page.evaluate(() => window.__lf.stats());
    if (!s) continue;
    last = s;
    if (s.scene !== "run") break;
    if ((s.time ?? 0) >= nextMinute * 60 && nextMinute % 5 === 1) {
      const heapMB = await gcHeapMB();
      const pools = await poolStats();
      samples.push({
        simMinute: nextMinute - 1,
        wallSec: Math.round((Date.now() - started) / 1000),
        gcMB: heapMB,
        kills: s.kills ?? null,
        enemies: s.enemies ?? null,
        pools,
      });
      console.log(`[m${String(nextMinute - 1).padStart(2, "0")}] gc=${heapMB} MB`, JSON.stringify(pools));
    }
    if ((s.time ?? 0) >= nextMinute * 60) nextMinute += 1;
    if ((s.time ?? 0) >= RUN_SECONDS) break;
  }
  result = {
    tool: "m10-heap-pool-fix.mjs",
    generatedAt: new Date().toISOString(),
    args: { minutes: MINUTES, seed: SEED },
    simMinutesReached: Math.round(((last?.time ?? 0) / 60) * 10) / 10,
    kills: last?.kills ?? null,
    jsErrors: errors,
    samples,
  };
} catch (err) {
  result = { tool: "m10-heap-pool-fix.mjs", fatal: String(err), jsErrors: errors, samples };
} finally {
  await browser.close();
  server.stop();
}
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ fatal: result.fatal, sim: result.simMinutesReached, samples: samples.length, jsErrors: result.jsErrors?.length }, null, 2));
