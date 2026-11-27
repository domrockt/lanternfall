#!/usr/bin/env node
// M10-Re-Rootcause: A/B-Matrix fuer die FPS-Regression in fa-01.
// Nur messen, kein Tuning. Nutzt das bestehende Harness (harness.mjs) und
// dieselbe rAF-Messung wie perf.mjs, aber mit schaltbaren Last-Parametern.
//
// Beispiele:
//   node scripts/m10-perf-rootcause.mjs --tag a --viewport 640x360 --dpr 1 \
//     --enemies 500 --weapons off --out shots/m10-perf-rootcause-a.json
//   node scripts/m10-perf-rootcause.mjs --tag f --viewport 1080x360 --dpr 3 \
//     --weapons on --ui off --postfx off
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const bool = (name, fallback) => {
  const v = argOf(name, fallback ? "on" : "off");
  return v === "on" || v === "true" || v === "1";
};
const num = (name, fallback) => {
  const v = Number(argOf(name, fallback));
  return Number.isFinite(v) ? v : fallback;
};

const viewportArg = String(argOf("viewport", "640x360")).split("x").map(Number);
const VIEWPORT = { width: viewportArg[0] || 640, height: viewportArg[1] || 360 };
const DPR = num("dpr", 1) || 1;
const ENEMIES = Math.max(1, Math.floor(num("enemies", 500)));
const WEAPONS = bool("weapons", false);
const PARTICLES = String(argOf("particles", "default")); // default | reduced | off
const UI = bool("ui", true);
const POSTFX = bool("postfx", true);
const DAMPING = bool("damping", true);
const SECONDS = Math.max(1, num("seconds", 10));
const TAG = String(argOf("tag", ""));
const OUT = String(argOf("out", `shots/m10-perf-rootcause${TAG ? "-" + TAG : ""}.json`));

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const clearLevelUps = async () => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

/** 1-s-Buckets: avg/min FPS; Gegner unter target werden nachgespawnt (Worst Case). */
const measure = async (target, seconds) =>
  page.evaluate(async ({ target, seconds }) => {
    const start = performance.now();
    let frames = 0;
    let last = start;
    let worst = 0;
    let lastSpawn = start;
    const buckets = [];
    let bucketFrames = 0;
    let bucketStart = start;
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        if (frames > 0) worst = Math.max(worst, dt);
        last = now;
        frames++;
        bucketFrames++;
        if (now - lastSpawn >= 50) {
          lastSpawn = now;
          const active = window.__lf.stats().enemies;
          const deficit = target - active;
          if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
        }
        if (now - bucketStart >= 1000) {
          buckets.push(Math.round((bucketFrames / ((now - bucketStart) / 1000)) * 10) / 10);
          bucketFrames = 0;
          bucketStart = now;
        }
        if (now - start >= seconds * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    return {
      fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
      fpsMin: buckets.length ? Math.min(...buckets) : null,
      fpsBuckets: buckets,
      frames,
      elapsedMs: Math.round(elapsed),
      worstFrameMs: Math.round(worst * 10) / 10,
      targetEnemies: target,
    };
  }, { target, seconds });

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  await page.evaluate(({ weapons }) => {
    const run = window.__lf;
    run.god(true);
    run.autoPlay(true);
    run.setTimeScale(1);
    if (weapons) {
      for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
        run.addWeapon(id, 8);
      }
    }
  }, { weapons: WEAPONS });
  await page.evaluate(({ enemies }) => {
    window.__lf.spawnEnemy("bog_rat", enemies);
  }, { enemies: ENEMIES });
  await page.waitForTimeout(500);

  // Schalter direkt am Szenen-Objekt (kein Spielcode geaendert).
  const applied = await page.evaluate(({ particles, ui, postfx, damping }) => {
    const run = window.__game.scene.getScene("run");
    const combat = run.combat;
    const info = {
      particlesBefore: combat.particles.active.length,
      fxBefore: combat.fx.active.length,
      spritesScene: run.children.list.length,
    };
    if (particles === "reduced") {
      combat.particles.setMaxActive(40);
      combat.fx.setMaxActive(40);
    } else if (particles === "off") {
      combat.particles.spawn = () => null;
      combat.fx.spawn = () => null;
      combat.particles.active.length = 0;
      combat.fx.active.length = 0;
    }
    if (!ui) {
      window.__game.scene.stop("ui");
    }
    if (!postfx) {
      if (run.vignette) run.vignette.setVisible(false);
      if (run.light) run.light.setVisible(false);
      combat.damageNumbers.setEnabled(false);
    }
    if (damping) combat.setFxDamping(true); else combat.setFxDamping(false);
    return info;
  }, { particles: PARTICLES, ui: UI, postfx: POSTFX, damping: DAMPING });

  await clearLevelUps();
  await page.waitForTimeout(500);
  const measured = await measure(ENEMIES, SECONDS);
  const state = await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const combat = run.combat;
    const scale = window.__game.scale;
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    const visible = run.children.list.filter((o) => o.visible).length;
    return {
      enemies: run.enemies.count,
      sprites: run.children.list.length,
      visibleSprites: visible,
      projectiles: combat.projectiles.active.length,
      enemyShots: run.enemyShots.count,
      particles: combat.particles.active.length,
      fx: combat.fx.active.length,
      level: run.xpState.level,
      kills: run.kills,
      internal: [scale.width, scale.height],
      css: [Math.round(rect.width), Math.round(rect.height)],
      dpr: window.devicePixelRatio,
    };
  });

  result = {
    tag: TAG,
    targetFps: 55,
    config: {
      viewport: VIEWPORT,
      dpr: DPR,
      enemies: ENEMIES,
      weapons: WEAPONS,
      particles: PARTICLES,
      ui: UI,
      postfx: POSTFX,
      damping: DAMPING,
      seconds: SECONDS,
    },
    measured,
    state,
    setup: applied,
    jsErrors: errors,
  };
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

if (result) {
  mkdirSync("shots", { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result, null, 2));
process.exit(result && errors.length === 0 ? 0 : 1);
