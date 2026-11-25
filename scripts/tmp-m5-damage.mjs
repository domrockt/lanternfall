#!/usr/bin/env node
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=5`);
await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.addWeapon("ember", 8);
  window.__lf.addWeapon("flail", 8);
  window.__lf.addWeapon("thorn", 8);
  window.__lf.spawnEnemy("bog_rat", 30);
  window.__lf.spawnEnemy("skeleton", 14);
  window.__lf.spawnEnemy("banshee", 10);
  window.__lf.spawnEnemy("bomber", 8);
  window.__lf.spawnEnemy("mudling", 12);
  window.__lf.setTimeScale(1);
});
await page.waitForTimeout(900);
await page.screenshot({ path: "shots/tmp-m5-damage.png" });
const st = await page.evaluate(() => window.__lf.state());
console.log("dmgViews", st.damageNumbers, "lod", st.lod.level, "errs", errs);
await browser.close(); server.stop();
