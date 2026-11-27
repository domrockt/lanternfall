#!/usr/bin/env node
// M10-Beleg: 15 Spielminuten AutoPlay (timeScale 30, god) fuer den Ergebnis-Screen.
// Schreibt shots/m10-results-attribution.json plus Screenshots bei 1920x1080 und 640x360.
//
// Kein FPS-Gate und kein flock: reine Logik-/Anzeige-Messung, keine Echtzeit-FPS.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const MINUTES = Number(argOf("minutes", "15"));
const TAG = String(argOf("tag", ""));
const RUN_SECONDS = MINUTES * 60;
const VIEWPORTS = [
  { width: 1920, height: 1080, label: "1920x1080" },
  { width: 640, height: 360, label: "640x360" },
];
const WEAPONS = ["ember", "flail", "frost", "thorn", "storm", "lantern"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
const samples = [];
let proof = null;
let stressProof = null;

try {
  const page = await browser.newPage({ viewport: VIEWPORTS[0] });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=99`);
  await startRun(page);
  await page.evaluate(({ weapons, passives }) => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of weapons) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.setTimeScale(30);
  }, { weapons: WEAPONS, passives: PASSIVES });

  const started = Date.now();
  let nextChest = 60;
  let lastSample = -1;
  let ended = false;
  while (!ended && Date.now() - started < 240_000) {
    const snap = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const state = window.__lf.state();
      return {
        time: state.time,
        levelUpOpen: state.levelUpOpen,
        chestOpen: state.chestOpen,
        scene: state.scene,
        damageByWeapon: state.damageByWeapon ?? {},
        weapons: state.weapons,
        kills: state.kills,
      };
    });
    if (snap.scene !== "run") { ended = true; break; }
    if (snap.levelUpOpen) {
      await page.evaluate(() => { try { window.__lf.pickLevelUp(0); } catch { /* UI hat schon gepickt */ } });
      continue;
    }
    if (snap.chestOpen) {
      await page.evaluate(() => {
        const run = window.__game.scene.getScene("run");
        if (run.chestOpen) run.finishChest();
      });
      continue;
    }
    if (snap.time >= nextChest) {
      await page.evaluate(() => { try { window.__lf.openChest(); } catch { /* bereits offen */ } });
      nextChest += 60;
      continue;
    }
    if (snap.time - lastSample >= 15) {
      lastSample = snap.time;
      samples.push({
        time: Math.round(snap.time * 10) / 10,
        kills: snap.kills,
        weapons: snap.weapons,
        damageByWeapon: snap.damageByWeapon,
      });
    }
    if (snap.time >= RUN_SECONDS) {
      ended = true;
      break;
    }
    await page.waitForTimeout(150);
  }

  await page.evaluate(() => window.__lf.finishRun("giveup"));
  await page.waitForFunction(() => window.__lf.state().scene === "results", { timeout: 8000 });
  await page.waitForTimeout(350);
  proof = await page.evaluate(() => {
    const sc = window.__game.scene.getScene("results");
    return { ...(sc.proof()), result: sc.result };
  });

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(700);
    const suffix = TAG ? `-${TAG}` : "";
    await page.screenshot({ path: `shots/m10-results-attribution${suffix}-${vp.label}.png` });
  }

  // Layout-Stress: alle 12 moeglichen Waffennamen in einer Ergebnistabelle.
  const stressPage = await browser.newPage({ viewport: VIEWPORTS[0] });
  stressPage.on("pageerror", (e) => errors.push(String(e)));
  stressPage.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await stressPage.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=99&stress12=1`);
  await startRun(stressPage);
  await stressPage.evaluate(() => window.__lf.finishRun("dawn"));
  await stressPage.waitForFunction(() => window.__lf.state().scene === "results", { timeout: 8000 });
  await stressPage.waitForTimeout(350);
  stressProof = await stressPage.evaluate(() => {
    const sc = window.__game.scene.getScene("results");
    return { ...(sc.proof()) };
  });
  for (const vp of VIEWPORTS) {
    await stressPage.setViewportSize({ width: vp.width, height: vp.height });
    await stressPage.waitForTimeout(700);
    await stressPage.screenshot({ path: `shots/m10-results-attribution-stress12-${vp.label}.png` });
  }
} finally {
  const report = {
    generated: new Date().toISOString(),
    minutes: MINUTES,
    timeScale: 30,
    samples,
    proof,
    stressProof,
    errors,
    jsErrors: errors.length,
  };
  writeFileSync("shots/m10-results-attribution.json", JSON.stringify(report, null, 2));
  await browser.close();
  server.stop();
  console.log(`samples=${samples.length} jsErrors=${errors.length} total=${proof?.totalDamage} bars=${proof?.barsSum} delta=${proof?.deltaPct}% overlaps=${proof?.overlaps} stressRows=${stressProof?.rowCount} stressOverlaps=${stressProof?.overlaps}`);
  if (errors.length > 0) process.exit(1);
}
