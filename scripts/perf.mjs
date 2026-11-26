#!/usr/bin/env node
// Performance-Harness: (1) 580 Gegner bei 1x, (2) volle Director-Dichte bei
// Minute 25. Ziel jeweils >= 55 FPS, 0 JS-Fehler.
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

// M8: Viewport/devicePixelRatio waehlbar (780x360 -> 780x360@3).
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const viewportArg = String(argOf("viewport", "960x540")).split("x").map(Number);
const VIEWPORT = { width: viewportArg[0] || 960, height: viewportArg[1] || 540 };
const DPR = Number(argOf("dpr", "1")) || 1;
const TAG = String(argOf("tag", ""));

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const clearLevelUps = async () => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

/** 10 s FPS messen; Gegner unter target werden nachgespawnt (Worst Case). */
const measure = async (target, seconds = 10) =>
  page.evaluate(async ({ target, seconds }) => {
    const start = performance.now();
    let frames = 0;
    let last = start;
    let worst = 0;
    let lastSpawn = start;
    const samples = [];
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        if (frames > 0) worst = Math.max(worst, dt);
        last = now;
        frames++;
        if (now - lastSpawn >= 50) {
          lastSpawn = now;
          const active = window.__lf.stats().enemies;
          const deficit = target - active;
          if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
          samples.push(window.__lf.stats().enemies);
        }
        if (now - start >= seconds * 1000) resolve();
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
      minEnemies: samples.length ? Math.min(...samples) : 0,
      avgEnemies: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : 0,
      targetEnemies: target,
    };
  }, { target, seconds });

let result;
try {
  // Phase 1: synthetische Spitzenlast direkt nach dem Start.
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
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
  await page.waitForTimeout(500);
  const burst = await measure(500);
  await clearLevelUps();
  // Screenshot erst nach geschlossenen Level-ups: er soll die 500er-Last zeigen,
  // nicht das Level-up-Panel. Kurz warten, damit die Roll-FPS aktuell ist.
  await page.waitForTimeout(1000);
  const burstState = await page.evaluate(() => window.__lf.stats());
  await page.screenshot({ path: "shots/perf-500.png" });

  // Phase 2: natürliche Director-Dichte bei Minute 25.
  await page.evaluate(({ evolutions, passives }) => {
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1490);
    window.__lf.setTimeScale(1);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });
  await page.waitForTimeout(6000);
  await clearLevelUps();
  const natural = await page.evaluate(() => window.__lf.stats());
  // Volle Director-Dichte ist ohne God-Waffen >300; mit allen Evolutionen
  // räumt der Bot schneller ab. Für die Worst-Case-Messung auf 300 auffüllen.
  const minute25 = await measure(Math.max(300, natural.enemies));
  const minute25State = await page.evaluate(() => window.__lf.stats());
  await page.screenshot({ path: "shots/perf-minute25.png" });

  const view = await page.evaluate(() => {
    const scale = window.__game.scale;
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    return { internal: [scale.width, scale.height], css: [Math.round(rect.width), Math.round(rect.height)], dpr: window.devicePixelRatio };
  });
  result = {
    targetFps: 55,
    viewport: VIEWPORT,
    dpr: DPR,
    view,
    burst: {
      ...burst,
      measuredFps: burstState.fps,
      level: burstState.level,
      kills: burstState.kills,
      passed: burst.fps >= 55 && burst.minEnemies >= 500,
    },
    minute25: {
      ...minute25,
      measuredFps: minute25State.fps,
      time: minute25State.time,
      level: minute25State.level,
      kills: minute25State.kills,
      // Unter 200 Gegnern wäre die Messung nicht aussagekräftig.
      passed: minute25.fps >= 55 && minute25.minEnemies >= 200,
    },
    jsErrors: errors,
    passed:
      burst.fps >= 55 && burst.minEnemies >= 500 &&
      minute25.fps >= 55 && minute25.minEnemies >= 200 &&
      errors.length === 0,
  };
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

if (result) writeFileSync(`shots/perf-m3${TAG}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result && result.passed ? 0 : 1);
