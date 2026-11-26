#!/usr/bin/env node
// M6-Nachtrag A7: Endgame-Lesbarkeit bei 6 Waffen auf Maximalstufe.
// Minute 25, gleiche Gegnerdichte, einmal mit gedaempften Effekten (nachher)
// und einmal ohne Daempfung (vorher, Debug-Schalter).
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];

const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const report = {};
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=77`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.setTimeScale(30);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
      window.__lf.addWeapon(id, 8);
    }
    window.__lf.skipTo(1450);
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    while (sc.levelUpOpen) window.__lf.pickLevelUp(0);
  });
  await page.evaluate(() => {
    window.__lf.setTimeScale(1);
    window.__lf.spawnEnemy("bog_rat", 160);
    window.__lf.spawnEnemy("skeleton", 140);
    window.__lf.spawnEnemy("wolf", 110);
  });
  await page.waitForTimeout(850);
  await page.evaluate(() => { window.__lf.setTimeScale(0.12); });
  await page.waitForTimeout(120);

  const statsAfter = await page.evaluate(() => window.__lf.stats());
  await page.evaluate(() => window.__lf.setFxDamping(true));
  // Boss-Intro-Banner (Minute 20) ausblenden lassen, damit die Lesbarkeit
  // der Effekte und nicht das Overlay bewertet wird.
  await page.waitForTimeout(3200);
  await page.screenshot({ path: "shots/final-vfx-m25-after.png" });

  await page.evaluate(() => window.__lf.setFxDamping(false));
  await page.waitForTimeout(350);
  await page.screenshot({ path: "shots/final-vfx-m25-before.png" });
  const statsBefore = await page.evaluate(() => window.__lf.stats());

  report.after = statsAfter;
  report.before = statsBefore;
  report.errors = errors;
} finally {
  writeFileSync("shots/final-vfx-readability.json", JSON.stringify(report, null, 2));
  await browser.close();
  server.stop();
}
if (errors.length > 0) {
  console.error("JS-Fehler:", errors);
  process.exit(1);
}
console.log("VFX-Lesbarkeit-Belege:", JSON.stringify(report.after?.enemies), "Gegner, fxAlpha",
  report.after?.fxAlpha, "/", report.before?.fxAlpha);
