#!/usr/bin/env node
// M10-Realtime-Probe: faehrt die kritische Phase des Echtzeitlaufs (Minute
// 18-25: 500+ Gegner, Endgame-Last) in <= 5 min mit Zeitraffer und
// Screenshot-Burst (der plausible Abbruch-Ausloeser von fa2-04) und meldet
// die Ziel-Lebendigkeit. Wird als Gate vor dem 30-min-Lauf benutzt.
//
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-realtime-probe.mjs
//
// Exit 0, wenn das Ziel die ganze Phase ueberlebt, 0 JS-Fehler und alle
// Burst-Screenshots erfolgreich sind. JSON: shots/m10-realtime-probe.json
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

// Kritische Phase: Minute 18 (fa2-04 starb danach) bis Minute 25.
const PHASE_FROM = 18 * 60;
const PHASE_TO = 25 * 60;
// Zeitraffer 4x: 7 Sim-Minuten = ~105 s Echtzeit, genug Exposition, <= 5 min.
const TIME_SCALE = 4;
// Burst: alle 4 s Echtzeit ein Screenshot (unter ~/tmp/, kein Beleg-Ordner).
const BURST_EVERY_MS = 4000;
const POLL_MS = 250;
const USER_DATA_DIR = `${process.env.HOME}/tmp/m10-realtime-stability/chrome-probe-${process.pid}-${Date.now()}`;
const BURST_DIR = `${process.env.HOME}/tmp/m10-realtime-stability/probe-burst`;
mkdirSync(BURST_DIR, { recursive: true });

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
// Gleiche Flags wie der 30-min-Lauf (K1-Diagnose), plus isoliertem Profil.
const browser = await chromium.launchPersistentContext(USER_DATA_DIR, { args: ["--disable-dev-shm-usage", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--autoplay-policy=no-user-gesture-required"], viewport: { width: 960, height: 540 } });
const page = browser.pages()[0] ?? await browser.newPage();
const errors = [];
const crashes = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("crash", () => crashes.push({ at: new Date().toISOString() }));

let result = null;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=99`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.skipTo(1080); // Minute 18
    window.__lf.setTimeScale(4);
  });

  const started = Date.now();
  let phaseReached = false;
  let lastBurst = 0;
  let burstShots = 0;
  let burstFailures = 0;
  const fpsSamples = [];
  let enemiesMax = 0;
  let lastStats = null;

  while (Date.now() - started < 300_000) {
    await page.waitForTimeout(POLL_MS);
    const s = await page.evaluate(() => window.__lf.stats());
    lastStats = s;
    if (!s || s.scene !== "run") break;
    phaseReached = phaseReached || s.time >= PHASE_FROM;
    if (s.time > 10 && Number.isFinite(s.fps)) fpsSamples.push(s.fps);
    if ((s.enemies ?? 0) > enemiesMax) enemiesMax = s.enemies;
    // Screenshot-Burst waehrend der kritischen Phase (Last wie fa2-04).
    if (phaseReached && Date.now() - lastBurst >= BURST_EVERY_MS) {
      lastBurst = Date.now();
      try {
        await page.screenshot({ path: `${BURST_DIR}/burst-${burstShots}.png` });
        burstShots++;
      } catch {
        burstFailures++;
      }
    }
    if (s.time >= PHASE_TO) break;
  }

  // Lebendigkeitspruefung: Ziel muss danach noch evaluate beantworten.
  const alive = await page.evaluate(() => ({
    scene: window.__lf.stats().scene,
    time: window.__lf.stats().time,
  }));
  const sorted = [...fpsSamples].sort((a, b) => a - b);
  const fpsMin = sorted.length ? Math.round(sorted[0] * 10) / 10 : null;
  const fpsMedian = sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10 : null;

  const phaseOk = !!phaseReached && (alive?.time ?? 0) >= PHASE_TO - 2;
  const aliveOk = alive?.scene === "run";
  const burstOk = burstFailures === 0;
  const passed = phaseOk && aliveOk && burstOk && crashes.length === 0 && errors.length === 0;

  result = {
    mode: "m10-realtime-probe",
    phase: { fromSecond: PHASE_FROM, toSecond: PHASE_TO, timeScale: TIME_SCALE },
    simMinutesReached: Math.round(((alive?.time ?? 0) / 60) * 10) / 10,
    phaseReached,
    targetAlive: aliveOk,
    enemiesMax,
    fps: { min: fpsMin, median: fpsMedian, samples: fpsSamples.length },
    burst: { shots: burstShots, failures: burstFailures, everyMs: BURST_EVERY_MS },
    wallSeconds: Math.round((Date.now() - started) / 1000),
    crashes,
    host: { loadavg1: Math.round(os.loadavg()[0] * 100) / 100, freememMB: Math.round(os.freemem() / 1048576) },
    jsErrors: errors,
    lastStats,
    passed,
  };
  writeFileSync("shots/m10-realtime-probe.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  const partial = {
    mode: "m10-realtime-probe",
    crashed: true,
    fatal: String(e),
    crashes,
    jsErrors: errors,
    passed: false,
  };
  writeFileSync("shots/m10-realtime-probe.json", JSON.stringify(partial, null, 2));
  console.log(JSON.stringify(partial, null, 2));
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

process.exit(result?.passed ? 0 : 1);
