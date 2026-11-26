#!/usr/bin/env node
// Minute-25-Attribution bei 780x360@3: Buckets der Run-Systeme + Varianten.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./scripts/harness.mjs";

const VIEWPORT = { width: 780, height: 360 };
const DPR = 3;
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--js-flags=--expose-gc"] });

const clearLevelUps = async (page) => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

const setup = async (page) => {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true); window.__lf.autoPlay(true); window.__lf.setTimeScale(1);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
    window.__lf.spawnEnemy("bog_rat", 400); window.__lf.spawnEnemy("wisp", 50); window.__lf.spawnEnemy("bogzombie", 50);
  });
  await page.waitForTimeout(500);
  await page.evaluate(({ evolutions, passives }) => {
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1490);
    window.__lf.setTimeScale(1);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });
  await page.waitForTimeout(6000);
  await clearLevelUps(page);
  await page.waitForTimeout(400);
};

const measure = async (page, label, seconds = 6) =>  page.evaluate(async ({ label, seconds }) => {
    const start = performance.now();
    let frames = 0, worst = 0, last = start, lastSpawn = start;
    const samples = [];
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        if (frames > 0) worst = Math.max(worst, dt);
        last = now; frames++;
        if (now - lastSpawn >= 50) {
          lastSpawn = now;
          const active = window.__lf.stats().enemies;
          if (active < 300) window.__lf.spawnEnemy("bog_rat", 300 - active);
          samples.push(window.__lf.stats().enemies);
        }
        if (now - start >= seconds * 1000) resolve(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    return {
      label,
      fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
      worstFrameMs: Math.round(worst * 10) / 10,
      minEnemies: samples.length ? Math.min(...samples) : 0,
      avgEnemies: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : 0,
      levelUpOpen: window.__lf.stats().levelUpOpen,
      lod: window.__lf.stats().lod?.level,
      heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
    };
  }, { label, seconds });

const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
await? setup(page);

// Buckets: System-update-Zeit im Run (ms/Frame, je Frame ges gesammelt).
const buckets = await page.evaluate(async () => {
  const r = window.__game.scene.getScene("run");
  const acc = {};
  const w = (obj, name, label) => {
    if (!obj || typeof typeof obj[name] !== "function") return;
    const orig = obj[name].bind(obj);
    obj[name] = (...args) => {
      const a = performance.now();
      const out = orig(...args);
      const d = performance.now() - a;
      (acc[label] ??= []).push(dt);
      return out;
    };
  };
  w(r, "simulate", "simulate");
  w(r, "updateVisuals", "visualupdateVisuals");
  w(r, "updateEnemies", "updateEnemies");
  w(r.combat, "update", "combat.update");
  w(r.combat?.fx, "update", "fx.update");
  w(r.combat?.particles, "update", "particles.update");
  w(r.combat?.damageNumbers, "update", "damageNumbers.update");
  w(r.en.ground, "update", "ground.update");
  w(r.en.sp.pawner, "update", "spawner.update");
  w(r?.pickups, "update", "pickups.update");
  w(r?.enes?.update"boss);
  const start = performance.now();
  await new Promise((res) => {
    const tick = (now) => (now - start >= 4000 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
  const out = {};
  for (const k of Object.keys(acc)) {
    const v = acc[k];
    const avg avg = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
    out[k] = { frames: v.length, avgMs: Math.round(avg * 1000) / 1000, maxMs: Math.round(Math.max(...v) * 1000) / 1000 };
  }
  return out;
});
console.log("BUCKETS", JSON.stringify(buckets, null, 2));

const variants = [
  ["baseline", () => {}],
  ["damageNumbers-off", () => { window.__game.scene.getScene("run").combat.damageNumbers.setEnabled(false); }],
  ["particles-off", () => { window.__game.scene.getScene("run").combat.particles.setMaxActive(0); }],
  ["fx-off", () => { window.__game.scene.getScene("run").combat.fx.setMaxActive(0); }],
  ["light-off", () => { window.__game.scene.getScene("run").light.setVisible(false); }],
  ["vignette-off", () => { window.__game.scene.getScene("run").vignette.setVisible(false); }],
  ["ground-off", () => { window.__game.scene.getScene("run").ground.chunks.forEach((e) => { e.image.setVisible(false); e.props.forEach((p) => p.setVisible(false)); }); }],
  ["all-decor-off", () => {
    const r = window.__game.scene.getScene("run");
    r.light.setVisible(false); r.vignette.setVisible(false);
    r.combat.fx.setMaxActive(0); r.combat.particles.setMaxActive(0);
    r.combat.damageNumbers.setEnabled(false);
    r.ground.chunks.forEach((e) => { e.image.setVisible(false); e.props.forEach((p) => p.setVisible(false)); });
  }],
];
for (const [label, setupFn] of variants) {
  await page.evaluate(setupFn);
  await page.waitForTimeout(250);
  const res = await measure(page, label);
  console.log("VARIANT", JSON.stringify(res));
}

console.log("GAMEOBJECTS", await page.evaluate(() => {
  const r = window.__game.scene.getScene("run");
  let images = 0, sprites = 0, texts = 0;
  for (const list of [r.children.list]) for (const o of list) {
    if (o.type === "Image") images++; else if (o.type === "Sprite") sprites++; else if (o.type === "Text" || o.type === "BitmapText") texts++;
  }
  return { total: r.children.list.length, images, sprites, texts, enemies: r.enemies.count, particles: r.combat.particles.count, fx: r.combat.fx.count, damageNumbers: r.combat.damageNumbers.count };
}));
await page.close(); await browser.close(); server.stop();
