#!/usr/bin/env node
// M3-Abnahme Fullrun: 30 Minuten mit AutoPlay + God + 30x, alle 6 Bosse,
// Truhen, Morgendämmerung/Sieg, JS-Fehler und FPS-Minimum.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const EXPECTED_BOSS_SECONDS = [300, 600, 900, 1200, 1500, 1800];
const BOSS_NAMES = ["Moorkönigin", "Knochenfürst", "Der Fahle Hirte", "Glockenturm-Golem", "Hexenzirkel", "Der Hohle König"];
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
const POLL_MS = 500;

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let result = null;
let summaryPassed = false;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=99`);
  await startRun(page);
  await page.evaluate(({ evolutions, passives }) => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.setTimeScale(30);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });

  // Heap nach erzwungenem GC: JS-Heap (performance.memory) ist das Gate,
  // CDP-usedSize (inkl. V8-Code/External) wird zusaetzlich berichtet.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  // Eine einzelne GC-Messung streut um 1-3 MB. Dreimal sammeln und den
  // kleinsten JS-Retained-Wert nehmen: das ist der tatsaechlich gehaltene Heap.
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
  let fpsMin = Number.POSITIVE_INFINITY;
  let samples = 0;
  let lastTime = 0;
  let dawnSeen = false;
  const phaseSeen = new Set();
  let shot25 = false;
  let lastRunState = null;
  let finalAtRealTime = false;
  let realTimeSince = 0;

  while (Date.now() - started < 150000) {
    await page.waitForTimeout(POLL_MS);
    // Level-ups automatisch wegklicken (UI macht das bei autoPlay selbst).
    const s = await page.evaluate(() => window.__lf.stats());
    lastTime = s.time;
    samples += 1;
    if (s.scene === "run" && s.time >= 60 && heapMinute1 === null) heapMinute1 = await heapAt();
    if (s.scene === "run" && s.time >= 29 * 60 && heapMinute29 === null) heapMinute29 = await heapAt();
    if (s.scene === "run") {
      lastRunState = s;
      // Letzte Sim-Minute in Echtzeit: FPS-Messung unter voller Dichte,
      // Endboss-Kampf und Morgendämmerung werden nicht durch 30x verzerrt.
      if (s.time >= 1760 && !finalAtRealTime) {
        finalAtRealTime = true;
        realTimeSince = Date.now();
        await page.evaluate(() => window.__lf.setTimeScale(1));
      }
      // 12 s Eingewöhnung nach dem 30x→1x-Wechsel: der erste Frame nach dem
      // Catch-up ist kurz langsam (Chunks/GC), danach liegt die Dichte voll an.
      if (finalAtRealTime && Date.now() - realTimeSince > 12000) fpsMin = Math.min(fpsMin, s.fps);
      if (s.boss) phaseSeen.add(`${s.boss.index}:${s.boss.phase}`);
      if (s.time >= 25 * 60 && !shot25) {
        shot25 = true;
        await page.screenshot({ path: "shots/m3-fullrun-minute25.png" });
      }
      if (s.dawn) dawnSeen = true;
    } else if (s.scene === "results") {
      result = await page.evaluate(() => {
        const r = window.__game.scene.getScene("results");
        return { ...r.result, dawn: Boolean(r.result?.reason === "dawn") };
      });
      await page.screenshot({ path: "shots/m3-fullrun-results.png" });
      break;
    }
  }

  // Endzustand des Runs: bei hoher Zeitskalierung liegt der letzte Poll oft
  // Sekunden vor Boss 6 – deshalb den beim Run-Ende konservierten State nutzen.
  const finalRun = (await page.evaluate(() => window.__lf.finalState())) ?? lastRunState;

  const spawnTimes = (finalRun?.bossesSpawned ?? []).map((b) => b.at);
  const timingOk = EXPECTED_BOSS_SECONDS.every((expected, i) => {
    const actual = spawnTimes[i];
    return Number.isFinite(actual) && Math.abs(actual - expected) <= 2;
  });
  const allBosses = (finalRun?.bossesSpawned ?? []).length === 6;
  const flags = finalRun?.bossFlags ?? [];
  const chests = finalRun?.chestsDropped ?? 0;
  const dawn = dawnSeen || Boolean(finalRun?.dawn) || Boolean(result?.dawn);
  const victory = result?.reason === "dawn";
  const finalBossDefeated = Boolean(finalRun?.bossFlags?.[5]) && (finalRun?.bossesDefeated ?? 0) >= 6;
  const ok = allBosses && timingOk && chests >= 6 && dawn && victory && finalBossDefeated && errors.length === 0;

  const heapEnd = await heapAt();
  const heapRef = (heapMinute1 ?? heapStart).jsMB;
  const heapLate = (heapMinute29 ?? heapEnd).jsMB;
  const heapMeasured = heapRef > 0 && heapLate > 0;
  const heapDeltaPct = heapMeasured ? Math.round(((heapLate - heapRef) / heapRef) * 1000) / 10 : null;
  const heapOk = heapMeasured && heapDeltaPct < 15;
  const fpsOk = Number.isFinite(fpsMin) && fpsMin >= 55;

  const summary = {
    milestone: "M3",
    simMinutes: Math.round((finalRun?.time ?? lastTime) / 60 * 10) / 10,
    pollSamples: samples,
    bosses: {
      expectedSeconds: EXPECTED_BOSS_SECONDS,
      spawned: (finalRun?.bossesSpawned ?? []).map((b, i) => ({
        name: BOSS_NAMES[b.index] ?? `boss${b.index}`,
        index: b.index,
        expectedSecond: EXPECTED_BOSS_SECONDS[i],
        actualSecond: b.at,
      })),
      flags,
      defeated: finalRun?.bossesDefeated ?? 0,
      finalBossDefeated,
      phasesSeen: [...phaseSeen],
    },
    chestsDropped: chests,
    elitesSpawned: finalRun?.elitesSpawned ?? 0,
    enemiesAtEnd: finalRun?.enemies ?? 0,
    kills: finalRun?.kills ?? result?.kills ?? 0,
    level: finalRun?.level ?? result?.level ?? 0,
    dawn,
    victory,
    resultReason: result?.reason ?? null,
    fpsMin: Number.isFinite(fpsMin) ? Math.round(fpsMin * 10) / 10 : null,
    fpsWindow: "ab Sim-Zeit 29:20 bei 1x (volle Dichte + Endboss)",
    heap: {
      // JS-Heap (performance.memory, nach GC) ist das Gate; CDP-usedSize
      // inkl. V8-Code/External-Allokationen steht nur als Diagnose daneben.
      startMB: heapStart.jsMB,
      minute1MB: heapMinute1?.jsMB ?? null,
      minute29MB: heapMinute29?.jsMB ?? null,
      endMB: heapEnd.jsMB,
      cdpUsedMB: { start: heapStart.cdpMB, minute1: heapMinute1?.cdpMB ?? null, minute29: heapMinute29?.cdpMB ?? null, end: heapEnd.cdpMB },
      measured: heapMeasured,
      deltaVsMinute1Pct: heapDeltaPct,
      targetPct: 15,
      passed: heapOk,
    },
    fps: { min: Number.isFinite(fpsMin) ? Math.round(fpsMin * 10) / 10 : null, target: 55, passed: fpsOk },
    jsErrors: errors,
    passed: ok && heapOk && fpsOk,
  };
  summaryPassed = summary.passed;
  writeFileSync("shots/m3-fullrun.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

process.exit(summaryPassed ? 0 : 1);
