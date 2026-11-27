#!/usr/bin/env node
// M10-ground-cost — Karte 1: Messung, was Moor-Terrain-Rendering bei 640x360
// in Minute 25 pro Frame kostet. Drei Bedingungen, gleiche Szene, gleiche Dichte:
//   on     : GroundRenderer normal (Chunks, Props, Ripples, Ambient)
//   hidden : alle Ground-Bilder visible=false (keine Draw-Calls, Update laeuft)
//   frozen : zusaetzlich update() deaktiviert (keine Per-Frame-Iteration)
// Attribution: on-hidden = Draw-/Renderpfad, hidden-frozen = Update-Pfad.
// 3 Laeufe, Reihenfolge je Lauf rotiert (Waerme-Bias). Laeuft unter flock.
import { writeFileSync, mkdirSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const VIEWPORT = { width: 640, height: 360 };
const DPR = 1;
const OUT = "shots/m10-ground-cost-baseline.json";
const RUNS = 3;
const SECONDS = 6;
const TARGET_ENEMIES = 300;
const STEPS = ["on", "hidden", "frozen"];

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
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const errors = [];

/** Setzt den Ground in den gewuenschten Messzustand (idempotent). */
const setGroundMode = async (page, mode) =>
  page.evaluate((m) => {
    const scene = window.__game.scene.getScene("run");
    const g = scene.ground;
    const imgs = new Set();
    for (const e of g.chunks.values()) {
      imgs.add(e.image);
      for (const p of e.props) imgs.add(p);
      for (const r of e.ripples) imgs.add(r.img);
    }
    for (const r of g.ripples) imgs.add(r.img);
    for (const f of g.fireflies) imgs.add(f.img);
    for (const b of g.fogBanks) imgs.add(b.img);
    if (!g.__origUpdate) g.__origUpdate = g.update;
    if (m === "on") {
      for (const i of imgs) i.setVisible(true);
      g.update = g.__origUpdate;
    } else if (m === "hidden") {
      for (const i of imgs) i.setVisible(false);
      g.update = g.__origUpdate;
    } else {
      for (const i of imgs) i.setVisible(false);
      g.update = () => {};
    }
  }, mode);

/** rAF-Framedauern messen, Gegner auf Ziel auffuellen (Worst Case). */
const measure = async (page, seconds) =>
  page.evaluate(async ({ seconds, target }) => {
    const start = performance.now();
    const deltas = [];
    let last = start;
    let lastSpawn = start;
    const enemies = [];
    await new Promise((resolve) => {
      const tick = (now) => {
        if (deltas.length || now > start) {
          if (deltas.length > 0) deltas.push(now - last);
          else deltas.push(now - start);
        }
        last = now;
        if (now - lastSpawn >= 50) {
          lastSpawn = now;
          const active = window.__lf.stats().enemies;
          const deficit = target - active;
          if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
          enemies.push(active);
        }
        if (now - start >= seconds * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    const sorted = [...deltas].sort((a, b) => a - b);
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    return {
      frames: deltas.length,
      elapsedMs: Math.round(elapsed),
      fps: Math.round((deltas.length / (elapsed / 1000)) * 10) / 10,
      meanFrameMs: Math.round(mean * 100) / 100,
      medianFrameMs: Math.round(q(0.5) * 100) / 100,
      p95FrameMs: Math.round(q(0.95) * 100) / 100,
      worstFrameMs: Math.round(sorted[sorted.length - 1] * 100) / 100,
      minEnemies: enemies.length ? Math.min(...enemies) : 0,
      avgEnemies: enemies.length ? Math.round(enemies.reduce((a, b) => a + b, 0) / enemies.length) : 0,
    };
  }, { seconds, target: TARGET_ENEMIES });

const runs = [];
try {
  for (let run = 0; run < RUNS; run++) {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
    page.on("pageerror", (e) => errors.push(`run${run}: ${e}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`run${run}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
      for (const id of ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"]) {
        window.__lf.addWeapon(id, 8);
      }
      for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) {
        window.__lf.addPassive(id, 5);
      }
      window.__lf.setTimeScale(30);
      window.__lf.skipTo(1490);
    });
    // Level-ups wegklicken, bis wir wirklich in Minute 25 stehen.
    for (let i = 0; i < 60; i++) {
      const st = await page.evaluate(() => window.__lf.stats());
      if (st.levelUpOpen) await page.evaluate(() => window.__lf.pickLevelUp(0));
      if (st.time >= 1495) break;
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => window.__lfr?.pickLevelUp?.(0));
    await page.evaluate(() => window.__lf.setTimeScale(1));
    await page.waitForTimeout(800);
    // Baseline-Screenshot fuer den spaeteren Pixel-Diff (vor dem Fix).
    await page.screenshot({ path: "shots/m10-ground-cost-before.png" });

    const order = STEPS.slice(run % STEPS.length).concat(STEPS.slice(0, run % STEPS.length));
    const result = { run: run + 1, order, modes: {} };
    for (const mode of order) {
      await setGroundMode(page, mode);
      await page.waitForTimeout(250); // Umbau-Frames verwerfen
      const m = await measure(page, SECONDS);
      result.modes[mode] = m;
      await setGroundMode(page, "on");
      await page.waitForTimeout(200);
    }
    const on = result.modes.on;
    const hidden = result.modes.hidden;
    const frozen = result.modes.frozen;
    result.attribution = {
      renderMsPerFrame: Math.round((on.meanFrameMs - hidden.meanFrameMs) * 100) / 100,
      updateMsPerFrame: Math.round((hidden.meanFrameMs - frozen.meanFrameMs) * 100) / 100,
      groundTotalMsPerFrame: Math.round((on.meanFrameMs - frozen.meanFrameMs) * 100) / 100,
      fpsGainIfNoGroundDraw: Math.round((frozen.fps - on.fps) * 10) / 10,
    };
    runs.push(result);
    console.log(`run ${run + 1}: on ${on.fps} FPS (${on.meanFrameMs} ms) | hidden ${hidden.fps} | frozen ${frozen.fps} | Draw ${result.attribution.renderMsPerFrame} ms | Update ${result.attribution.updateMsPerFrame} ms`);
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const summary = {
  viewport: VIEWPORT,
  dpr: DPR,
  runs: RUNS,
  secondsPerMode: SECONDS,
  targetEnemies: TARGET_ENEMIES,
  fps: {
    onMin: Math.min(...runs.map((r) => r.modes.on.fps)),
    onMedian: median(runs.map((r) => r.modes.on.fps)),
    hiddenMedian: median(runs.map((r) => r.modes.hidden.fps)),
    frozenMedian: median(runs.map((r) => r.modes.frozen.fps)),
  },
  attributionMsPerFrame: {
    renderMedian: median(runs.map((r) => r.attribution.renderMsPerFrame)),
    updateMedian: median(runs.map((r) => r.attribution.updateMsPerFrame)),
    totalMedian: median(runs.map((r) => r.attribution.groundTotalMsPerFrame)),
  },
  hot: median(runs.map((r) => r.attribution.groundTotalMsPerFrame)) >= 2,
};
const payload = {
  card: "m10-ground-cost/1-messung",
  measuredAt: new Date().toISOString(),
  command: "flock /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs",
  summary,
  runs,
  jsErrors: errors,
  passed: errors.length === 0,
};
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`Ground gesamt ${summary.attributionMsPerFrame.totalMedian} ms/Frame -> hot=${summary.hot}; 0 JS-Fehler: ${errors.length === 0}`);
process.exit(errors.length === 0 ? 0 : 1);
