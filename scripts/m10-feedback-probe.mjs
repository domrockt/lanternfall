#!/usr/bin/env node
// M10-feedback-budget: Chaos-Messlauf fuer Screen-Shake, Hit-Stop und Knockback.
//
// Startet einen echten Run headless, springt auf Minute 25 (Dauerfeuer-Endgame),
// spawnt 500 Gegner und loggt je Render-Frame:
//   - Treffer (CombatSystem.hitEnemy-Aufrufe)
//   - Shake-Intensitaet der Kamera in Pixeln (intensity * camera.width)
//   - Shake-Anfragen pro Frame (Aufrufe von camera.shake) in Pixeln
//   - Hit-Stop-Restdauer in ms
//   - Frame-Dauer in ms (Stutter > 33 ms)
//
// Aufruf (kein FPS-/flock-Lauf, reines Frame-Log):
//   node scripts/m10-feedback-probe.mjs --out shots/m10-feedback-budget-baseline.json
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const OUT = arg("out", "shots/m10-feedback-budget-baseline.json");
const LABEL = arg("label", "baseline");
const WALL_MS = Number(arg("wall", 8000));
const ENEMIES = Number(arg("enemies", 500));
const TIME_SCALE = Number(arg("scale", 30));
const SEED = Number(arg("seed", 101));

const WEAPONS = ["ember", "flail", "frost", "thorn", "storm", "lantern"];

function round(n, digits = 1) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
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
  ],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let report = null;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);

  await page.evaluate(({ weapons, enemies, scale }) => {
    const round = (n, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
    const run = window.__game.scene.getScene("run");
    const cam = run.cameras.main;
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.skipTo(1500); // Minute 25: Endgame-Dauerfeuer
    window.__lf.setTimeScale(scale);

    const probe = window.__probe = {
      frames: [],
      hitsTotal: 0,
      shakeRequestsTotal: 0,
      hitStopPeakMs: 0,
      shakePeakPx: 0,
      shakeRequestPeakPx: 0,
      stutterFrames: 0,
      lastT: performance.now(),
      frame: { hits: 0, shakeRequests: 0, shakeRequestPx: 0, shakeActivePx: 0, hitStopMs: 0 },
    };

    const combat = run.combat;
    const origHit = combat.hitEnemy.bind(combat);
    combat.hitEnemy = (...args) => {
      probe.frame.hits += 1;
      probe.hitsTotal += 1;
      return origHit(...args);
    };

    const origShake = cam.shake.bind(cam);
    cam.shake = (duration, intensity, force, cb, ctx) => {
      const px = Math.max(0, Number(intensity) || 0) * cam.width;
      probe.frame.shakeRequests += 1;
      probe.frame.shakeRequestPx = Math.max(probe.frame.shakeRequestPx, px);
      probe.shakeRequestsTotal += 1;
      probe.shakeRequestPeakPx = Math.max(probe.shakeRequestPeakPx, px);
      // Wie im Spiel: nie force, damit Phaser laufende Shakes nicht neu startet.
      return origShake(duration, intensity, false, cb, ctx);
    };

    run.events.on("postupdate", () => {
      const now = performance.now();
      const dt = now - probe.lastT;
      probe.lastT = now;
      const activePx = cam.shakeEffect?.isRunning
        ? Math.max(0, cam.shakeEffect.intensity.x * cam.width)
        : 0;
      probe.frame.shakeActivePx = activePx;
      probe.frame.hitStopMs = Math.max(0, run.hitStop) * 1000;
      probe.shakePeakPx = Math.max(probe.shakePeakPx, activePx);
      probe.hitStopPeakMs = Math.max(probe.hitStopPeakMs, probe.frame.hitStopMs);
      if (dt > 33.4) probe.stutterFrames += 1;
      probe.frames.push({ dt: round(dt, 1), ...probe.frame });
      probe.frame = { hits: 0, shakeRequests: 0, shakeRequestPx: 0, shakeActivePx: 0, hitStopMs: 0 };
    });

    const types = ["bog_rat", "skeleton", "cultist", "golem", "horror", "wisp"];
    for (const id of weapons) {
      try { window.__lf.addWeapon(id, 8); } catch { /* Waffe ggf. noch nicht freigeschaltet */ }
    }
    for (let i = 0; i < enemies; i++) {
      window.__lf.spawnEnemy(types[i % types.length], 1);
    }
    // Boss als zusaetzlicher Feedback-Ausloeser (Hit-Stop/Shake).
    try { window.__lf.spawnBoss(4); } catch { /* egal */ }
  }, { weapons: WEAPONS, enemies: ENEMIES, scale: TIME_SCALE });

  await page.waitForTimeout(WALL_MS);

  const raw = await page.evaluate(() => {
    const round = (n, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
    const percentile = (sorted, p) => {
      if (sorted.length === 0) return 0;
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
      return sorted[idx];
    };
    const p = window.__probe;
    const frames = p.frames;
    const dts = frames.map((f) => f.dt).sort((a, b) => a - b);
    const hits = frames.map((f) => f.hits);
    const hitStop = frames.map((f) => f.hitStopMs);
    const shakeReq = frames.map((f) => f.shakeRequestPx);
    const activeFrames = frames.filter((f) => f.shakeActivePx > 0).length;
    return {
      frames: frames.length,
      scene: window.__lf.state().scene,
      enemies: window.__lf.stats().enemies,
      hitsTotal: p.hitsTotal,
      hitsPerFrameMax: Math.max(0, ...hits),
      hitsPerFrameAvg: round(hits.reduce((a, b) => a + b, 0) / Math.max(1, hits.length), 2),
      shakePeakPx: round(p.shakePeakPx, 2),
      shakeRequestPeakPx: round(p.shakeRequestPeakPx, 2),
      shakeRequestsTotal: p.shakeRequestsTotal,
      shakeActiveFrames: activeFrames,
      hitStopPeakMs: round(p.hitStopPeakMs, 1),
      hitStopFramesAboveMax: hitStop.filter((ms) => ms > 120.5).length,
      hitStopActiveFrames: hitStop.filter((ms) => ms > 0.5).length,
      stutterFrames: p.stutterFrames,
      frameMs: {
        avg: round(dts.reduce((a, b) => a + b, 0) / Math.max(1, dts.length), 1),
        p50: round(percentile(dts, 50), 1),
        p95: round(percentile(dts, 95), 1),
        p99: round(percentile(dts, 99), 1),
        max: round(dts[dts.length - 1] ?? 0, 1),
      },
      shakeRequestFramesTop: shakeReq.sort((a, b) => b - a).slice(0, 5).map((v) => round(v, 2)),
      hitsFramesTop: hits.sort((a, b) => b - a).slice(0, 5),
      hitStopFramesTop: hitStop.sort((a, b) => b - a).slice(0, 5).map((v) => round(v, 1)),
      sample: frames.slice(-8),
    };
  });

  const frames = raw.frames;
  const stutterRate = frames > 0 ? round((100 * raw.stutterFrames) / frames, 2) : 0;
  report = {
    schema: "m10-feedback-budget/v1",
    label: LABEL,
    generatedAt: new Date().toISOString(),
    method: `headless chromium 640x360@2x, Minute 25, ${ENEMIES} Gegner, timeScale ${TIME_SCALE}, ${WALL_MS} ms Wandzeit`,
    seed: SEED,
    timeScale: TIME_SCALE,
    wallMs: WALL_MS,
    ...raw,
    stutterRatePct: stutterRate,
    verdict: {
      shakePeakWithin6px: raw.shakePeakPx <= 6,
      hitStopNotCumulative: raw.hitStopPeakMs <= 121,
      hitStopMaxMs: raw.hitStopPeakMs,
      stutterFrames33ms: raw.stutterFrames,
      hitsSeen: raw.hitsTotal,
    },
    jsErrors: errors.slice(),
  };
} finally {
  await browser.close().catch(() => {});
  server.stop();
}

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  out: OUT,
  label: LABEL,
  frames: report?.frames,
  hitsTotal: report?.hitsTotal,
  hitsPerFrameMax: report?.hitsPerFrameMax,
  shakePeakPx: report?.shakePeakPx,
  shakeRequestPeakPx: report?.shakeRequestPeakPx,
  shakeRequestsTotal: report?.shakeRequestsTotal,
  hitStopPeakMs: report?.hitStopPeakMs,
  stutterFrames: report?.stutterFrames,
  frameMs: report?.frameMs,
  jsErrors: report?.jsErrors?.length,
}, null, 2));

// Harte Grenzen als Prozess-Exit, damit CI/Abnahme den Lauf bewerten kann.
const fail = [];
if (!report) fail.push("kein Report");
else {
  if (report.shakePeakPx > 6) fail.push(`Shake ${report.shakePeakPx}px > 6`);
  if (report.hitStopPeakMs > 121) fail.push(`Hit-Stop ${report.hitStopPeakMs}ms > 120`);
  if (report.jsErrors.length > 0) fail.push(`${report.jsErrors.length} JS-Fehler`);
}
if (fail.length > 0) {
  console.error(`FAIL: ${fail.join("; ")}`);
  process.exit(1);
}
console.log("PASS: Shake <= 6 px, Hit-Stop <= 120 ms, keine JS-Fehler");
