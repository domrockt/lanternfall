#!/usr/bin/env node
// CPU-Headroom-Test: 3 ms Busy-Loop pro Frame Frame.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./scripts/harness.mjs";
const VIEWPORT = { width: 780, height: 360 };
const DPR = 3;
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] });

const measure = async (page, label, burnMs, seconds = 5) => {
  const res = await page.evaluate(async ({ s, burnMs }) => {
    let frames = 0;
    const start = performance.now();
    let lastSpawn = start;
    await new Promise((resolve) => {
      const tick = (now) => {
        const b0 = performance.now();
        while (performance.now() - b0 < burnMs) {}
        frames++;
        if (now - lastSpawn >= 50) {
          lastSpawn = now;
          const active = window.__lf.stats().enemies;
          if (active < 500) window.__lf.spawnEnemy("bog_rat", 500 - active);
        }
        if (now - start >= s * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return Math.round((frames / ((performance.now() - start) / 1000)) * 10) / 10;
  }, { s: seconds, burnMs });
  console.log(label.padEnd(26), res);
};
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true); window.__lf.autoPlay(true); window.__lf.setTimeScale(1);
  for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
  window.__lf.spawnEnemy("bog_rat", 400); window.__lf.spawnEnemy("wisp", 50); window.__lf.spawnEnemy("bogzombie", 50);
});
await page.waitForTimeout(800);
await measure(page, "cpuBurnburn 0ms", 0);
await measure(page, "burn 2ms", 2);
await measure(page, "burn 4ms", 4);
await measure(page, "burn 8ms", 8);
await page.close(); await browser.close(); server.stop();
