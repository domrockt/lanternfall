#!/usr/bin/env node
// Attrib Attributions-Profiler: welche Bild kostet FPS bei 780x360@3?
import { ensureBuild, startServer, loadPlaywright, startRun } from "./scripts/harness.mjs";

const VIEWPORT = { width: 780, height: 360 };
const DPR = 3;
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const measure = async (label, setup, seconds = 5) => {
  await page.evaluate(setup);
  await page.waitForTimeout(300);
  const fps = await page.evaluate(async (s) => {
    let frames = 0;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        frames++;
        if (now - start >= s * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      frames = 0;
    });
    return Math.round((frames / ((performance.now() - start) / 1000)) * 10) / 10;
  }, seconds);
  console.log(label.padEnd(30), fps);
  return fps;
};

await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true); window.__lf.autoPlay(true); window.__lf.setTimeScale(1);
  for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
  window.__lf.spawnEnemy("bog_rat", 400);
  window.__lf.spawnEnemy("wisp", 50);
  window.__lf.spawnEnemy("bogzombie", 50);
});
await page.waitForTimeout(600);

await measure("baseline-500", () => {});
await measure("vignette-aus", () => { const r = window.__game.scene.getScene("run"); r.vignette.setVisible(false); });
await measure("light-aus", () => { const r = window.__game.scene.getScene("run"); r.light.setVisible(false); });
await measure("ground-aus", () => { const r = window.__game.scene.getScene("run"); r.ground.chunks.forEach((e) => { e.image.setVisible(false); e.props.forEach((p) => p.setVisible(false)); }); });
await measure("fx-particles-aus", () => { const r = window.__game.scene.getScene("run"); r.combat.fx.setMaxActive(0); });
await measure("enemies-unsichtbar", () => { const r = window.__game.scene.getScene("run"); for (const e of r.enemies.active) e.sprite.setVisible(false); });
await measure("alles-wieder-an", () => { const r = window.__game.scene.getScene("run"); r.vignette.setVisible(true); r.light.setVisible(true); r.ground.chunks.forEach((e) => { e.image.setVisible(true); e.props.forEach((p) => p.setVisible(true)); }); r.combat.fx.setMaxActive(220); for (const e of r.enemies.active) e.sprite.setVisible(true); });

console.log("errors", errors.length ? errors : "none");
await page.close(); await browser.close(); server.stop();
