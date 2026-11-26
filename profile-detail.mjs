#!/usr/bin/env node
// Instrumentst diene Systeme der Run-Szene; ms/Frame.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./scripts/harness.mjs";
const VIEWPORT = { width: 780, height: 360 };
const DPR = 3;
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.autoPlay(true);
  window.__lf.setTimeScale(1);
  for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
  window.__lf.spawnEnemy("bog_rat", 400);
  window.__lf.spawnEnemy("wisp", 50);
  window.__lf.spawnEnemy("bogzombie", 50);
});
await page.waitForTimeout(1000);
const data = await page.evaluate(async () => {
  const r = window.__game.scene.getScene("run");
  const buckets = {};
  const w = (obj, name, label) => {
    const orig = obj[name].bind(obj);
    obj[name] = (...args) => {
      const a = performance.now();
      orig(...args);
      if (!buckets[label]) buckets[label] = [];
      buckets[label].push(performance.now() - a);
    };
  };
  w(r.combat, "update", "combat");
  w(r.enemies, "compact", "compactEnemies");
  w(r.spawner, "update", "spawner");
  w(r.pickups, "update", "pickups");
  w(r.ground, "update", "ground");
  w(r.combat.fx, "update", "fx");
  w(r.combat.particles, "update", "particles");
  w(r.combat.damageNumbers, "update", "damageNumbers");
  w(r.bosses, "update", "bosses");
  w(r.enemyShots, "update", "enemyShots");
  w(r.hazards, "update", "hazards");
  w(r.chests, "update", "chests");
  w(r, "updateVisualVisual", "updateVisuals");__DSML__});
console.log(JSON.stringify(data, null, 2));
await page.close();
await browser.close();
server.stop();
