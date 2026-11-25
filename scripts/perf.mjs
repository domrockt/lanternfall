#!/usr/bin/env node
// Performance-Harness: Run mit 500 Gegnern, FPS über 10 s (Ziel >= 55).
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    window.__lf.spawnEnemy("bog_rat", 400);
    window.__lf.spawnEnemy("wisp", 50);
    window.__lf.spawnEnemy("bogzombie", 50);
  });
  await page.waitForTimeout(500);

  const measurement = await page.evaluate(async () => {
    const start = performance.now();
    let frames = 0;
    let last = start;
    let worst = 0;
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        if (frames > 0) worst = Math.max(worst, dt);
        last = now;
        frames++;
        if (now - start >= 10000) resolve();
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
    };
  });

  const state = await page.evaluate(() => window.__lf.state());
  await page.screenshot({ path: "shots/perf-500.png" });
  result = {
    targetFps: 55,
    ...measurement,
    measuredFps: state.fps,
    enemies: state.enemies,
    level: state.level,
    kills: state.kills,
    time: state.time,
    engineFps: state.fps,
    jsErrors: errors,
    passed: measurement.fps >= 55 && errors.length === 0,
  };
} finally {
  await browser.close();
  server.stop();
}

console.log(JSON.stringify(result, null, 2));
process.exit(result && result.passed ? 0 : 1);
