#!/usr/bin/env node
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
const EVENTS = process.argv.slice(2);
const { chromium } = await loadPlaywright();
ensureBuild();
const server = await startServer();
const browser = await chromium.launch();
for (const ev of EVENTS) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=9`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.addWeapon("ember", 8);
    window.__lf.addWeapon("storm", 8);
    window.__lf.spawnEnemy("bog_rat", 24);
    window.__lf.spawnEnemy("skeleton", 12);
    window.__lf.spawnEnemy("banshee", 12);
    window.__lf.setTimeScale(1);
  });
  await page.waitForTimeout(400);
  await page.evaluate((name) => window.__lf.event(name), ev);
  const waits = { levelup: 450, evolution: 520, chest: 700, bossIntro: 380, bossDeath: 480, dawn: 1400 };
  await page.waitForTimeout(waits[ev] ?? 500);
  await page.screenshot({ path: `shots/tmp-m5-event-${ev}.png` });
  console.log(ev, errs);
  await page.close();
}
await browser.close(); server.stop();
