#!/usr/bin/env node
// M1-Verifikation: 60 s Spielzeit bei 10x, AutoPlay, Screenshots, Zustands-Checks.
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const shots = [];
const snap = async (name) => {
  await page.screenshot({ path: `shots/m1-${name}.png` });
  shots.push(`shots/m1-${name}.png`);
};

let out;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await snap("title");

  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.waitForTimeout(300);
  await snap("charselect");

  await page.keyboard.press("Enter");
  await waitForScene(page, "run");
  await page.waitForTimeout(800);
  await snap("run-start");

  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(10);
  });

  // 6 s real = 60 s Spielzeit; Level-up-Dialoge automatisch wegklicken.
  const deadline = Date.now() + 6600;
  let pickCount = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(100);
    const opened = await page.evaluate(() => {
      const s = window.__lf.state();
      return s.levelUpOpen;
    });
    if (opened) {
      try {
        await page.evaluate(() => window.__lf.pickLevelUp(0));
        pickCount++;
      } catch { /* Dialog evtl. bereits zu */ }
    }
  }
  await page.evaluate(() => window.__lf.setTimeScale(1));
  // Falls gerade ein Dialog offen ist: wegklicken, damit der Run-Screenshot Gameplay zeigt.
  for (let i = 0; i < 5; i++) {
    if (!(await page.evaluate(() => window.__lf.state().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
  await page.waitForTimeout(250);
  await snap("run");

  const afterRun = await page.evaluate(() => window.__lf.state());

  // Level-up-Dialog für Screenshot herstellen
  await page.evaluate(() => {
    window.__lf.autoPlay(false);
    const s = window.__lf.state();
    window.__lf.giveXp(Math.max(1, Math.ceil(s.xpNeed - s.xp) + 5));
  });
  await page.waitForTimeout(250);
  const levelUpOpen = await page.evaluate(() => window.__lf.state().levelUpOpen);
  if (levelUpOpen) await snap("levelup");
  while (await page.evaluate(() => window.__lf.state().levelUpOpen)) {
    await page.evaluate(() => window.__lf.pickLevelUp(0));
    await page.waitForTimeout(60);
  }

  // Pause/Build-Overlay
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const pauseOpen = await page.evaluate(() => window.__lf.state().paused);
  if (pauseOpen) await snap("pause");
  await page.keyboard.press("Escape");

  // Ergebnisse: Gott aus, Gegnerwelle, auf Tod warten (max. 8 s)
  await page.evaluate(() => {
    window.__lf.god(false);
    window.__lf.autoPlay(false);
    window.__lf.spawnEnemy("bogzombie", 120);
    window.__lf.setTimeScale(10);
  });
  let died = false;
  const deathDeadline = Date.now() + 10000;
  while (Date.now() < deathDeadline) {
    await page.waitForTimeout(150);
    const snapshot = await page.evaluate(() => ({ scene: window.__lf.state().scene, levelUpOpen: window.__lf.state().levelUpOpen }));
    if (snapshot.scene === "results") { died = true; break; }
    // Ein während der Todesphase geöffneter Level-up pausiert den Run — wegklicken.
    if (snapshot.levelUpOpen) {
      try { await page.evaluate(() => window.__lf.pickLevelUp(0)); } catch { /* egal */ }
    }
  }
  if (died) { await page.waitForTimeout(300); await snap("results"); }

  const checks = {
    noJsErrors: errors.length === 0,
    levelAboveOne: afterRun.level > 1,
    killsAboveZero: afterRun.kills > 0,
    timerRuns: afterRun.time > 1,
    gameTimeAtLeast55: afterRun.time >= 55,
    levelUpDialogOpened: levelUpOpen,
    pauseOpened: pauseOpen,
    resultsReached: died,
    gameTimeAtLeast: afterRun.time,
  };

  out = {
    passed: checks.noJsErrors && checks.levelAboveOne && checks.killsAboveZero && checks.timerRuns
      && checks.gameTimeAtLeast55 && checks.levelUpDialogOpened && checks.pauseOpened && checks.resultsReached,
    checks,
    sockets: { pickCount, shots },
    state: afterRun,
    jsErrors: errors,
  };
} finally {
  await browser.close();
  server.stop();
}

console.log(JSON.stringify(out, null, 2));
process.exit(out && out.passed ? 0 : 1);
