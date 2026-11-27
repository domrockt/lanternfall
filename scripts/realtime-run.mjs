#!/usr/bin/env node
// Realtime-Run: EIN kompletter Run in Echtzeit (timeScale 1), AutoPlay,
// God-Mode nur gegen den Tod. Protokolliert Boss-Zeitpunkte (5/10/15/20/25/30
// min ±2 s), Truhen, Evolutionen, FPS (min/median), Heap (Minute 1 vs. Ende),
// JS-Fehler und alle 5 min einen Screenshot.
//
// Volle 30 Minuten sind ein langer Lauf; für Lane-/CI-Tests:
//   node scripts/realtime-run.mjs --minutes 3
//
// Exit 0 nur, wenn alle Erwartungen für das gewählte Zeitfenster erfüllt sind.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argMinutes = (() => {
  const i = argv.indexOf("--minutes");
  if (i >= 0 && argv[i + 1]) return Number(argv[i + 1]);
  const inline = argv.find((a) => a.startsWith("--minutes="));
  return inline ? Number(inline.split("=")[1]) : 30;
})();
const MINUTES = Number.isFinite(argMinutes) ? Math.max(1, Math.min(30, Math.floor(argMinutes))) : 30;
const RUN_SECONDS = MINUTES * 60;
const FULL_RUN = MINUTES >= 30;
const BOSS_SECONDS = [300, 600, 900, 1200, 1500, 1800];
const BOSS_NAMES = ["Moorkönigin", "Knochenfürst", "Der Fahle Hirte", "Glockenturm-Golem", "Hexenzirkel", "Der Hohle König"];
const EVOLUTION_IDS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const POLL_MS = 250;
const SHOT_EVERY_SECONDS = 300;

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
// --disable-dev-shm-usage: /dev/shm ist auf diesem Host nur 64 MB; ohne das Flag
// stirbt der Renderer in langen 30-min-Laeufen ("Target closed") reproduzierbar ab.
const browser = await chromium.launch({ args: ["--disable-dev-shm-usage", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

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
const heapMB = async () => {
  let best = await heapOnce();
  for (let i = 0; i < 2; i++) {
    const s = await heapOnce();
    if (s.jsMB < best.jsMB) best = s;
  }
  return best;
};

let result = null;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=99`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
  });

  const started = Date.now();
  let heapStart = await heapMB();
  let heapMinute1 = null;
  let heapMinute29 = null;
  const fpsSamples = [];
  const bossSpawns = [];
  const shots = [];
  let chestsTracked = 0;
  let evolutionsSeen = new Set();
  let lastShotMinute = 0;
  let runState = null;
  let victory = false;
  let resultReason = null;
  let truncated = false;

  const wallLimitMs = (FULL_RUN ? RUN_SECONDS + 300 : RUN_SECONDS + 30) * 1000;
  while (Date.now() - started < wallLimitMs) {
    await page.waitForTimeout(POLL_MS);
    const s = await page.evaluate(() => window.__lf.stats());
    if (!s || s.scene !== "run") {
      if (s?.scene === "results") {
        const r = await page.evaluate(() => {
          const scene = window.__game.scene.getScene("results");
          return { reason: scene.result?.reason ?? null, kills: scene.result?.kills ?? 0 };
        });
        victory = r.reason === "dawn";
        resultReason = r.reason;
        await page.screenshot({ path: "shots/realtime-results.png" });
        break;
      }
      continue;
    }
    runState = s;
    // Heap-GC kostet Zeit: diesen Poll nicht als FPS-Sample werten.
    let heapPoll = false;
    if (s.time >= 60 && heapMinute1 === null) {
      heapMinute1 = await heapMB();
      heapPoll = true;
    }
    // Voller Lauf: Minute 29 VOR Dawn/Results messen (Pools noch aktiv).
    if (FULL_RUN && s.time >= 29 * 60 && heapMinute29 === null) {
      heapMinute29 = await heapMB();
      heapPoll = true;
    }
    // FPS erst nach 10 s Warmlauf zaehlen (erste Chunks/Shader).
    if (!heapPoll && s.time > 10 && Number.isFinite(s.fps)) fpsSamples.push(s.fps);

    for (const b of s.bossesSpawned ?? []) {
      if (!bossSpawns.some((x) => x.index === b.index)) {
        bossSpawns.push({ index: b.index, at: b.at, name: BOSS_NAMES[b.index] });
      }
    }
    if ((s.chestsDropped ?? 0) > chestsTracked) chestsTracked = s.chestsDropped;
    for (const w of s.weapons ?? []) if (EVOLUTION_IDS.includes(w.id)) evolutionsSeen.add(w.id);

    const minute = Math.floor(s.time / 60);
    if (minute >= SHOT_EVERY_SECONDS / 60 && minute > lastShotMinute && minute % (SHOT_EVERY_SECONDS / 60) === 0) {
      lastShotMinute = minute;
      const path = `shots/realtime-minute-${minute}.png`;
      await page.screenshot({ path });
      shots.push(path);
    }
    // Teil-Lauf endet am gewaehlten Zeitfenster; der volle Lauf laeuft bis
    // zum Endboss-Tod + Morgendaemmerung + Results-Szene weiter.
    if (!FULL_RUN && s.time >= RUN_SECONDS) {
      truncated = true;
      await page.screenshot({ path: "shots/realtime-end.png" });
      shots.push("shots/realtime-end.png");
      break;
    }
  }

  // Endzustand: bei truncated aus dem letzten Run; bei vollem Run aus Results-Registry.
  const finalState = (await page.evaluate(() => window.__lf.finalState())) ?? runState ?? {};
  const heapEnd = await heapMB();
  const heapRef = (heapMinute1 ?? heapStart).jsMB;
  // Volllauf: Minute 29 vor dem Run-Ende ist das Gate; Teil-Lauf: Ende.
  const heapLate = (FULL_RUN && heapMinute29 ? heapMinute29 : heapEnd).jsMB;
  const heapMeasured = heapRef > 0 && heapLate > 0;
  const heapDeltaPct = heapMeasured ? Math.round(((heapLate - heapRef) / heapRef) * 1000) / 10 : null;

  const expected = [];
  for (let i = 0; i < BOSS_SECONDS.length; i++) {
    if (BOSS_SECONDS[i] > RUN_SECONDS) continue;
    const spawn = bossSpawns.find((b) => b.index === i);
    const actual = spawn?.at ?? null;
    const ok = Number.isFinite(actual) && Math.abs(actual - BOSS_SECONDS[i]) <= 2;
    expected.push({ index: i, name: BOSS_NAMES[i], expectedSecond: BOSS_SECONDS[i], actualSecond: actual, ok });
  }

  let fpsMin = null;
  let fpsMedian = null;
  if (fpsSamples.length > 0) {
    const sorted = [...fpsSamples].sort((a, b) => a - b);
    fpsMin = Math.round(sorted[0] * 10) / 10;
    fpsMedian = Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10;
  }

  const bossOk = expected.every((b) => b.ok);
  const chestsOk = FULL_RUN ? chestsTracked >= 6 : true;
  const victoryOk = FULL_RUN ? victory : true;
  // Auch der Teil-Lauf muss das gewaehlte Zeitfenster wirklich erreicht haben.
  const simReached = (finalState?.time ?? runState?.time ?? 0) >= RUN_SECONDS - 2 || victory;
  const completedOk = FULL_RUN ? victory : simReached;
  // 3-Minuten-Lane-Lauf: FPS-Minimum ist hier kein hartes Gate (Warmlauf/
  // Host-Last), muss aber protokolliert sein. Voller Lauf: >= 55.
  const fpsOk = FULL_RUN ? (fpsMin ?? 0) >= 55 : fpsMin !== null;
  // Heap ist im vollen Lauf ein hartes Gate (Minute 1 vs. 29). Im Teil-Lauf
  // (--minutes <30) ist die erste Minute Warmlauf (Pools/Chunks/Audio) und
  // wird nur berichtet, nicht gegated.
  const heapOk = FULL_RUN ? heapMeasured && heapDeltaPct < 15 : heapMeasured;
  const heapGate = FULL_RUN ? heapOk : null;
  const passed = errors.length === 0 && bossOk && chestsOk && victoryOk && completedOk &&
    (FULL_RUN ? heapOk : true) && fpsOk;

  const summary = {
    mode: FULL_RUN ? "full-30min" : `partial-${MINUTES}min`,
    minutes: MINUTES,
    timeScale: 1,
    simMinutes: Math.round(((finalState?.time ?? runState?.time ?? 0) / 60) * 10) / 10,
    elapsedRealSeconds: Math.round((Date.now() - started) / 1000),
    truncated,
    completed: completedOk,
    bosses: expected,
    bossesDefeated: finalState?.bossesDefeated ?? runState?.bossesDefeated ?? 0,
    chestsDropped: finalState?.chestsDropped ?? chestsTracked,
    evolutions: [...evolutionsSeen],
    levels: finalState?.level ?? runState?.level ?? 0,
    kills: finalState?.kills ?? runState?.kills ?? 0,
    fps: {
      min: fpsMin,
      median: fpsMedian,
      samples: fpsSamples.length,
      target: 55,
      passed: fpsOk,
    },
    heap: {
      startMB: heapStart.jsMB,
      minute1MB: heapMinute1?.jsMB ?? null,
      minute29MB: heapMinute29?.jsMB ?? null,
      endMB: heapEnd.jsMB,
      cdpUsedMB: {
        start: heapStart.cdpMB, minute1: heapMinute1?.cdpMB ?? null,
        minute29: heapMinute29?.cdpMB ?? null, end: heapEnd.cdpMB,
      },
      measured: heapMeasured,
      deltaVsMinute1Pct: heapDeltaPct,
      targetPct: 15,
      gate: FULL_RUN ? "hard" : "informational-partial",
      passed: heapGate,
    },
    screenshots: shots,
    victory,
    resultReason,
    jsErrors: errors,
    passed,
  };
  result = summary;
  writeFileSync(`shots/realtime-${MINUTES}min.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

process.exit(result?.passed ? 0 : 1);
