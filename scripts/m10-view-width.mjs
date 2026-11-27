#!/usr/bin/env node
// M10-view-width A/B-Messung
import { writeFileSync } from "node:fs";
import { ensureBuild, startRun, startServer, loadPlaywright } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const CAP = String(argOf("cap", "on"));
const SECONDS = Number(argOf("seconds", "10")) || 10;
const ENEMIES = Number(argOf("enemies", "500")) || 500;
const TAG = String(argOf("tag", "cap"));
const OUT = String(argOf("out", `shots/m10-view-width-${TAG}.json`));
const SHOT = String(argOf("shot", `shots/m10-view-width-${TAG}.png`));
const viewportArg = String(argOf("viewport", "780x360")).split("x").map(Number);
const VIEWPORT = { width: viewportArg[0] || 780, height: viewportArg[1] || 360 };
const DPR = Number(argOf("dpr", "3")) || 3;

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--autoplay-policy=no-user-gesture-required",
] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let result = null;
try {
  const url = `http://127.0.0.1:${server.port}/?debug=1&seed=1${CAP === "off" ? "&viewcap=off" : ""}`;
  await page.goto(url);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
      window.__lf.addWeapon(id, 8);
    }
    window.__lf.spawnEnemy("bog_rat", 400);
    window.__lf.spawnEnemy("wisp", 50);
    window.__lf.spawnEnemy("bogzombie", 50);
  });
  await page.waitForTimeout(1600);

  const measure = await page.evaluate(async ({ ENEMIES, SECONDS }) => {
    const start = performance.now();
    let frames = 0;
    let last = start;
    let worst = 0;
    const samples = [];
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        if (frames > 0) worst = Math.max(worst, dt);
        last = now;
        frames++;
        if (frames % 6 === 0) {
          const active = window.__lf.stats().enemies;
          const deficit = ENEMIES - active;
          if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
          samples.push(window.__lf.stats().enemies);
        }
        if (now - start >= SECONDS * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    return {
      fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
      frames,
      elapsedMs: Math.round(elapsed),
      worstFrameMs: Math.round(worst * 10) / 10,
      avgEnemies: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : 0,
      minEnemies: samples.length ? Math.min(...samples) : 0,
      targetEnemies: ENEMIES,
    };
  }, { ENEMIES, SECONDS });

  const view = await page.evaluate(() => {
    const scale = window.__game.scale;
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    return {
      internal: [scale.width, scale.height],
      css: [Math.round(rect.width), Math.round(rect.height)],
      dpr: window.devicePixelRatio,
    };
  });
  await page.screenshot({ path: SHOT });

  result = {
    cap: CAP,
    viewport: VIEWPORT,
    dpr: DPR,
    view,
    measure,
    jsErrors: errors,
    passed: measure.fps >= 55 && measure.minEnemies >= 200 && errors.length === 0,
  };
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

process.exit(result && result.passed ? 0 : 1);
