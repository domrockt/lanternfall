#!/usr/bin/env node
// Attributions-Profiler mit Gegner-Refill pro Variante.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./scripts/harness.mjs";

const VIEWPORT = { width: 780, height: 360 };
const DPR = 3;
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] });

const measure = async (page, label, setup, seconds = 4) => {
  await page.evaluate(setup);
  await page.waitForTimeout(200);
  const res = await page.evaluate(async (s) => {
    let frames = 0;
    const start = performance.now();
    let lastSpawn = start;
    await new Promise((resolve) => {
      const tick = (now) => {
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
  }, seconds);
  console.log(label.padEnd(28), res, "enemies", await page.evaluate(() => window.__lf.stats().enemies));
  return res;
};

const variants = [
  ["baseline", () => {}],
  ["vignette-off", () => { window.__game.scene.getScene("run").vignette.setVisible(false); }],
  ["light-off", () => { window.__game.scene.getScene("run").light.setVisible(false); }],
  ["vignette+light-off", () => { const r = window.__game.scene.getScene("run"); r.vignette.setVisible(false); r.light.setVisible(false); }],
  ["ground-off", () => { window.__game.scene.getScene("run").ground.chunks.forEach((e) => { e.image.setVisible(false); e.props.forEach((p) => p.setVisible(false)); }); }],
  ["fx-off", () => { window.__game.scene.getScene("run").combat.fx.setMaxActive(0); }],
];

for (const [label, setup] of variants) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true); window.__lf.autoPlay(true); window.__lf.setTimeScale(1);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
    window.__lf.spawnEnemy("bog_rat", 400); window.__lf.spawnEnemy("wisp", 50); window.__lf.spawnEnemy("bogzombie", 50);
  });
  await page.waitForTimeout(800);
  await measure(page, label, setup);
  await page.close();
}

await browser.close(); server.stop();
