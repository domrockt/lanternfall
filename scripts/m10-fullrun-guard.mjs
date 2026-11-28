#!/usr/bin/env node
// M10-Abnahme-Wächter (Lane m10-fullrun-guard): beschleunigter 30-min-Sim-Lauf
// (autoPlay + timeScale 30, Muster scripts/fullrun.mjs), der die Inhaltstore aus
// ACCEPTANCE.md misst und ein Maschinen-JSON schreibt. Reines Mess-Skript —
// kein Balance-/Spielcode-Eingriff.
//
// Gemessen (K1, Ist-Messung):
//   - 6 Bosse mit Spawn-Sekunde (Soll 300/600/900/1200/1500/1800)
//   - Truhen, Evolutions, Kills, Level
//   - Sieg + resultReason (Soll: dawn)
//   - JS-Fehler (pageerror + console.error)
//   - Heap (JS-Heap nach GC): Start / Minute 1 / Minute 29 / Ende
//
// Aufruf (Mess-Sperre: flock nur bei FPS/Echtzeit-Läufen):
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-fullrun-guard.mjs \
//     --out shots/m10-fullrun-guard-baseline.json
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const BOSS_SECONDS = [300, 600, 900, 1200, 1500, 1800];
const BOSS_NAMES = ["Moorkönigin", "Knochenfürst", "Der Fahle Hirte", "Glockenturm-Golem", "Hexenzirkel", "Der Hohle König"];
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
const POLL_MS = 500;
const TIME_SCALE = 30;

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT = argOf("out", "shots/m10-fullrun-guard-baseline.json");
const SEED = Number(argOf("seed", "99"));

mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let summary = null;
let exitCode = 1;
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

  // Heap nach erzwungenem GC, dreifach gemessen (kleinster Wert = gehaltener Heap).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  const heapOnce = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    const jsUsed = await page.evaluate(() => {
      if (typeof globalThis.gc === "function") globalThis.gc();
      return Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10;
    });
    const usage = await cdp.send("Runtime.getHeapUsage");
    return { jsMB: jsUsed, cdpMB: Math.round((usage.usedSize / 1048576) * 10) / 10 };
  };
  const heapAt = async () => {
    let best = await heapOnce();
    for (let i = 0; i < 2; i++) {
      const s = await heapOnce();
      if (s.jsMB < best.jsMB) best = s;
    }
    return best;
  };
  const heapStart = await heapAt();
  let heapMinute1 = null;
  let heapMinute29 = null;

  const started = Date.now();
  let lastTime = 0;
  let lastRunState = null;
  let result = null;
  let fatal = null;
  try {
    while (Date.now() - started < 240000) {
      await page.waitForTimeout(POLL_MS);
      const s = await page.evaluate(() => window.__lf.stats());
      if (!s) continue;
      lastTime = s.time;
      if (s.scene === "run") {
        lastRunState = s;
        if (s.time >= 60 && heapMinute1 === null) heapMinute1 = await heapAt();
        if (s.time >= 29 * 60 && heapMinute29 === null) heapMinute29 = await heapAt();
      } else if (s.scene === "results") {
        result = await page.evaluate(() => {
          const scene = window.__game.scene.getScene("results");
          return { ...scene.result, dawn: Boolean(scene.result?.reason === "dawn") };
        });
        await page.screenshot({ path: OUT.replace(/\.json$/, "-results.png") });
        break;
      }
    }
  } catch (e) {
    fatal = String(e);
  }

  // Endzustand des Runs: bei hoher Zeitskalierung liegt der letzte Poll oft
  // vor Boss 6 – deshalb den beim Run-Ende konservierten State nutzen.
  const finalRun = (await page.evaluate(() => window.__lf.finalState())) ?? lastRunState;
  const heapEnd = await heapAt();

  const spawned = (finalRun?.bossesSpawned ?? []).map((b) => ({
    name: BOSS_NAMES[b.index] ?? `boss${b.index}`,
    index: b.index,
    expectedSecond: BOSS_SECONDS[b.index] ?? null,
    actualSecond: b.at,
  }));
  const heapDelta = heapMinute1?.jsMB > 0 && heapEnd.jsMB > 0
    ? Math.round(((heapEnd.jsMB - heapMinute1.jsMB) / heapMinute1.jsMB) * 1000) / 10
    : null;

  summary = {
    lane: "m10-fullrun-guard",
    kind: "measurement",
    seed: SEED,
    timeScale: TIME_SCALE,
    viewport: { width: 960, height: 540, dpr: 1 },
    simMinutes: Math.round(((finalRun?.time ?? lastTime) / 60) * 10) / 10,
    elapsedRealSeconds: Math.round((Date.now() - started) / 1000),
    completed: result !== null,
    fatal,
    bosses: {
      spawned,
      spawnedCount: spawned.length,
      defeated: finalRun?.bossesDefeated ?? 0,
      flags: finalRun?.bossFlags ?? [],
    },
    chestsDropped: finalRun?.chestsDropped ?? 0,
    elitesSpawned: finalRun?.elitesSpawned ?? 0,
    evolutions: finalRun?.evolutions ?? null,
    kills: finalRun?.kills ?? result?.kills ?? 0,
    level: finalRun?.level ?? result?.level ?? 0,
    victory: result?.dawn ?? false,
    resultReason: result?.reason ?? null,
    heap: {
      startMB: heapStart.jsMB,
      minute1MB: heapMinute1?.jsMB ?? null,
      minute29MB: heapMinute29?.jsMB ?? null,
      endMB: heapEnd.jsMB,
      cdpUsedMB: { start: heapStart.cdpMB, minute1: heapMinute1?.cdpMB ?? null, minute29: heapMinute29?.cdpMB ?? null, end: heapEnd.cdpMB },
      deltaVsMinute1Pct: heapDelta,
    },
    jsErrors: errors,
  };
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  server.stop();
}

if (summary) {
  writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  exitCode = summary.completed ? 0 : 1;
}
process.exit(exitCode);
