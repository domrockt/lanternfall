#!/usr/bin/env node
// M10-dpr-budget-cap: M25-Last bei 780x360 dpr3, Vorher (?rbscale=0) vs. Nachher
// (adaptiver Regler). Je Lauf 10 s Messfenster wie scripts/perf.mjs (300 Gegner,
// 6 Basis-Waffen + 6 Evolutionen, Minute 25). Immer unter flock starten:
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-dpr-budget.mjs
// Ergebnis: shots/m10-dpr-budget.json (FPS + effektive Renderbreite je Lauf).
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const VIEWPORT = { width: 780, height: 360 };
const DPR = 3;
const TARGET_FPS = 50;
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const AFTER_RUNS = Math.max(1, Number(argOf("after-runs", "2")));
const OUT = String(argOf("out", "shots/m10-dpr-budget.json"));

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const measureMinute25 = async (mode) => {
  const query = mode === "before" ? "?debug=1&seed=1&rbscale=0" : "?debug=1&seed=1";
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}/${query}`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
    window.__lf.spawnEnemy("bog_rat", 400);
    window.__lf.spawnEnemy("wisp", 50);
    window.__lf.spawnEnemy("bogzombie", 50);
  });
  await page.waitForTimeout(500);
  // Burst-Phase als Warmup (kein Belegwert).
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const start = performance.now();
      const tick = () => (performance.now() - start >= 4000 ? resolve() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    });
  });
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
  await page.evaluate(({ evolutions, passives }) => {
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1490);
    window.__lf.setTimeScale(1);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });
  await page.waitForTimeout(6000);
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
  await page.waitForTimeout(400);

  const result = await page.evaluate(async ({ seconds }) => {
    const start = performance.now();
    let frames = 0, last = start, worst = 0, lastSpawn = start;
    const samples = [];
    const fpsEwma = { value: null };
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        if (frames > 0) worst = Math.max(worst, dt);
        last = now;
        frames++;
        const instant = 1000 / dt;
        fpsEwma.value = fpsEwma.value === null ? instant : fpsEwma.value * 0.9 + instant * 0.1;
        if (now - lastSpawn >= 50) {
          lastSpawn = now;
          const active = window.__lf.stats().enemies;
          const deficit = 300 - active;
          if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
          samples.push(active);
        }
        if (now - start >= seconds * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    return {
      fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
      frames,
      worstFrameMs: Math.round(worst * 10) / 10,
      minEnemies: samples.length ? Math.min(...samples) : 0,
      time: window.__lf.stats().time,
      kills: window.__lf.stats().kills,
      renderBuffer: [canvas.width, canvas.height],
      css: [Math.round(rect.width), Math.round(rect.height)],
      dpr: window.devicePixelRatio,
      renderWidth: canvas.width,
      renderScaleDivisor: Math.round(rect.width * window.devicePixelRatio / (canvas.width * window.devicePixelRatio) * 100) / 100,
    };
  }, { seconds: 10 });

  await page.close();
  return { ...result, jsErrors: errors, passed: result.fps >= TARGET_FPS && result.minEnemies >= 250 && errors.length === 0 };
};

const runs = [];
runs.push({ id: "before-rbscale0", mode: "before", ...(await measureMinute25("before")) });
for (let i = 1; i <= AFTER_RUNS; i++) {
  runs.push({ id: `after-auto-${i}`, mode: "after", ...(await measureMinute25("after")) });
}

const after = runs.filter((r) => r.mode === "after");
const result = {
  targetFps: TARGET_FPS,
  viewport: VIEWPORT,
  dpr: DPR,
  runs,
  summary: {
    beforeFps: runs[0].fps,
    beforeRenderWidth: runs[0].renderWidth,
    afterFps: after.map((r) => r.fps),
    afterRenderWidth: after.map((r) => r.renderWidth),
    afterMinFps: Math.min(...after.map((r) => r.fps)),
    afterPassedCount: after.filter((r) => r.passed).length,
    afterCount: after.length,
    jsErrors: runs.reduce((n, r) => n + r.jsErrors.length, 0),
  },
};
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.summary));
await browser.close();
server.stop();
process.exit(result.summary.afterMinFps >= TARGET_FPS && result.summary.jsErrors === 0 ? 0 : 1);
