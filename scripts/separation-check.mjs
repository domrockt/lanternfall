#!/usr/bin/env node
// Regression: 20 Gegner exakt übereinander → nach 2 s müssen sie sich getrennt haben.
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
    window.__lf.autoPlay(false);
    window.__lf.spawnEnemy("bog_rat", 20);
    const run = window.__game.scene.getScene("run");
    for (const e of run.enemies.active) {
      e.x = run.player.x;
      e.y = run.player.y;
    }
  });
  await page.waitForTimeout(2000);

  const measurement = await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const alive = run.enemies.active.filter((e) => e.alive);
    let minDist = Infinity;
    let overlapping = 0;
    let pairs = 0;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const d = Math.hypot(alive[i].x - alive[j].x, alive[i].y - alive[j].y);
        pairs++;
        if (d < 0.5) overlapping++;
        minDist = Math.min(minDist, d);
      }
    }
    return {
      alive: alive.length,
      pairs,
      overlapping,
      minDist: pairs > 0 ? Math.round(minDist * 100) / 100 : null,
    };
  });

  result = {
    ...measurement,
    jsErrors: errors,
    passed: errors.length === 0 && measurement.minDist !== null && measurement.minDist > 0.5,
  };
} finally {
  await browser.close();
  server.stop();
}

console.log(JSON.stringify(result, null, 2));
process.exit(result && result.passed ? 0 : 1);
