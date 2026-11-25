#!/usr/bin/env node
// Einmaliger Vorher-Beleg: Minute 12 / 25 aus dem Stand vor M5 (Commit 4e8fee0).
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const clear = async () => {
  for (let i = 0; i < 60; i++) {
    if (!(await page.evaluate(() => window.__lf?.state().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=55`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
    for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(700);
    window.__lf.setTimeScale(2);
  });
  await page.waitForTimeout(6000);
  await clear();
  await page.evaluate(() => window.__lf.setTimeScale(1));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "shots/m5-readability-m12-before.png" });
  const s12 = await page.evaluate(() => window.__lf.state());
  console.log("m12", s12.time, s12.enemies, s12.fps);
  await page.evaluate(() => {
    for (const id of ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"]) window.__lf.addWeapon(id, 8);
    window.__lf.skipTo(1490);
    window.__lf.setTimeScale(2);
  });
  await page.waitForTimeout(6000);
  await clear();
  await page.evaluate(() => window.__lf.setTimeScale(1));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "shots/m5-readability-m25-before.png" });
  const s25 = await page.evaluate(() => window.__lf.state());
  console.log("m25", s25.time, s25.enemies, s25.fps, "errors", errors);
} finally {
  await browser.close();
  server.stop();
}
