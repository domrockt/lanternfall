#!/usr/bin/env node
// M10-ui-text-cost: Messbasis fuer den UI-/Textkosten-Hebel.
//
// Instrumentiert (ohne Spielcode-Verhalten zu aendern):
//   - PixelText.setText-Aufrufe/s        (window.__lfText.setTextCalls)
//   - tatsaechliche setTexture-Aufrufe/s (window.__lfText.setTextureCalls)
//   - ensureGlyph-Aufrufe/s              (window.__lfText.ensureGlyphCalls)
//   - Update-Zeit der UI-Szene (ms/Frame) per Wrap um UI.update
//
// Last: 500 Gegner (bog_rat, werden auf 500 nachgespawnt), god + autoPlay,
// 6 Waffen Lv8, Seed 1, timeScale 1. Zusaetzlich ein eingefrorenes,
// deterministisches HUD ("stehendes HUD") fuer die Vorher/Nachher-Bildprobe.
//
// Beispiel:
//   flock /home/ai/games/.lf-perf.lock timeout 180 node scripts/m10-ui-cost.mjs \
//     --tag before --out shots/m10-ui-text-cost-before.json
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const num = (name, fallback) => {
  const v = Number(argOf(name, fallback));
  return Number.isFinite(v) ? v : fallback;
};

const TAG = String(argOf("tag", "before"));
const OUT = String(argOf("out", `shots/m10-ui-text-cost-${TAG}.json`));
const SECONDS = Math.max(1, num("seconds", 10));
const HUD_SECONDS = Math.max(1, num("hudSeconds", 4));
const ENEMIES = Math.max(1, Math.floor(num("enemies", 500)));
const WEAPONS = ["ember", "flail", "frost", "thorn", "storm", "lantern"];
const CONFIGS = [
  { name: "640x360@1", width: 640, height: 360, dpr: 1 },
  { name: "780x360@3", width: 780, height: 360, dpr: 3 },
];

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--enable-precise-memory-info",
    "--js-flags=--expose-gc",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const errors = [];
const clearLevelUps = async (page) => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

/** Wrap um UI.update: kumulierte Update-Zeit + Framezahl. */
const installUiTimer = async (page) => {
  await page.evaluate(() => {
    const ui = window.__game.scene.getScene("ui");
    // Phaser cacht die Update-Referenz beim Scene-Start in sys.sceneUpdate;
    // ein Patch auf ui.update greift deshalb nicht (0 Frames gemessen).
    const sys = ui.sys;
    if (!ui.__m10wrapped) {
      const w = window.__m10 = { uiMs: 0, uiFrames: 0 };
      const orig = sys.sceneUpdate.bind(ui);
      sys.sceneUpdate = function (time, delta) {
        const t0 = performance.now();
        orig(time, delta);
        w.uiMs += performance.now() - t0;
        w.uiFrames++;
      };
      ui.__m10wrapped = true;
    }
  });
};

const resetCounters = async (page) => {
  await page.evaluate(() => {
    const s = window.__lfText;
    window.__m10base = {
      setText: s.setTextCalls,
      setTexture: s.setTextureCalls,
      ensureGlyph: s.ensureGlyphCalls,
      uiMs: window.__m10.uiMs,
      uiFrames: window.__m10.uiFrames,
      start: performance.now(),
    };
  });
};

const readCounters = async (page, label) =>
  page.evaluate((label) => {
    const s = window.__lfText;
    const b = window.__m10base;
    const elapsedMs = performance.now() - b.start;
    const uiMs = window.__m10.uiMs - b.uiMs;
    const uiFrames = window.__m10.uiFrames - b.uiFrames;
    const sec = elapsedMs / 1000;
    return {
      label,
      elapsedMs: Math.round(elapsedMs),
      uiFrames,
      setText: s.setTextCalls - b.setText,
      setTexture: s.setTextureCalls - b.setTexture,
      ensureGlyph: s.ensureGlyphCalls - b.ensureGlyph,
      setTextPerSec: Math.round(((s.setTextCalls - b.setText) / sec) * 10) / 10,
      setTexturePerSec: Math.round(((s.setTextureCalls - b.setTexture) / sec) * 10) / 10,
      ensureGlyphPerSec: Math.round(((s.ensureGlyphCalls - b.ensureGlyph) / sec) * 10) / 10,
      uiMsPerFrame: uiFrames > 0 ? Math.round((uiMs / uiFrames) * 1000) / 1000 : null,
      uiMsTotal: Math.round(uiMs * 100) / 100,
    };
  }, label);

/** Laufende Messung mit Nachspawn auf Zielzahl (Worst Case). */
const measureRunning = async (page, target, seconds) =>
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
          const deficit = target - window.__lf.stats().enemies;
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

/** HUD deterministisch einfrieren (timeScale 0), Welt-Kamera fuer den Shot aus. */
const freezeHud = async (page) =>
  page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    run.timeScale = 0; // direkte Zuweisung: setTimeScale clamped auf >= 1
    run.kills = 4242;
    run.elapsed = 754;
    run.xpState.level = 12;
    run.xpState.xp = 3;
    run.hp = 77;
    run.maxHp = 100;
    const ui = window.__game.scene.getScene("ui");
    return { hud: ui ? true : false };
  });

const settleFrames = async (page, frames = 4) =>
  page.evaluate((frames) => new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      n++;
      if (n >= frames) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), frames);

const screenshotHud = async (page, path) => {
  await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    run.cameras.main.setVisible(false);
  });
  await settleFrames(page, 3);
  const rect = await page.evaluate(() => {
    const c = document.querySelector("canvas").getBoundingClientRect();
    return { x: c.x, y: c.y, width: c.width, height: c.height };
  });
  await page.screenshot({
    path,
    clip: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.min(30, Math.round(rect.height)),
    },
  });
  await page.evaluate(() => {
    window.__game.scene.getScene("run").cameras.main.setVisible(true);
  });
  return { path, clip: { width: Math.round(rect.width), height: 30 } };
};

let result;
try {
  const configs = [];
  for (const cfg of CONFIGS) {
    const page = await browser.newPage({
      viewport: { width: cfg.width, height: cfg.height },
      deviceScaleFactor: cfg.dpr,
    });
    page.on("pageerror", (e) => errors.push(`${cfg.name}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${cfg.name}: ${m.text()}`); });

    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await startRun(page);
    await page.evaluate((weapons) => {
      const run = window.__lf;
      run.god(true);
      run.autoPlay(true);
      run.setTimeScale(1);
      for (const id of weapons) run.addWeapon(id, 8);
    }, WEAPONS);
    await page.evaluate((enemies) => window.__lf.spawnEnemy("bog_rat", enemies), ENEMIES);
    await page.waitForTimeout(500);
    await clearLevelUps(page);
    await installUiTimer(page);
    await settleFrames(page, 3);

    // 1) Laufendes Spiel (HUD-Werte aendern sich, volle Last).
    await resetCounters(page);
    const running = await measureRunning(page, ENEMIES, SECONDS);
    const runningText = await readCounters(page, "running");
    await clearLevelUps(page);

    const state = await page.evaluate(() => {
      const scale = window.__game.scale;
      const c = document.querySelector("canvas").getBoundingClientRect();
      return {
        enemies: window.__lf.stats().enemies,
        internal: [scale.width, scale.height],
        css: [Math.round(c.width), Math.round(c.height)],
        dpr: window.devicePixelRatio,
      };
    });
    await page.close();

    // 2) Stehendes HUD auf einem frischen Run: sofort eingefroren, keine
    //    AutoPlay-Picks/Kaempfe -> Vorher/Nachher-HUD-Crop ist deterministisch.
    const snapPage = await browser.newPage({
      viewport: { width: cfg.width, height: cfg.height },
      deviceScaleFactor: cfg.dpr,
    });
    snapPage.on("pageerror", (e) => errors.push(`${cfg.name} snapshot: ${String(e)}`));
    snapPage.on("console", (m) => { if (m.type() === "error") errors.push(`${cfg.name} snapshot: ${m.text()}`); });
    await snapPage.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await startRun(snapPage);
    await snapPage.evaluate((weapons) => {
      const run = window.__lf;
      run.setTimeScale(1);
      for (const id of weapons) run.addWeapon(id, 8);
    }, WEAPONS);
    await freezeHud(snapPage);
    await clearLevelUps(snapPage);
    await settleFrames(snapPage, 6);
    await snapPage.waitForTimeout(100);
    const screenshot = await screenshotHud(
      snapPage,
      `shots/m10-ui-text-cost-hud-${TAG}-${cfg.name.replace(/[^0-9a-z]/gi, "")}.png`,
    );
    await installUiTimer(snapPage);
    await resetCounters(snapPage);
    await snapPage.waitForTimeout(HUD_SECONDS * 1000);
    const standing = await readCounters(snapPage, "standingHud");
    await snapPage.close();

    configs.push({ config: cfg, state, running, runningText, standingHud: standing, screenshot });
  }
  result = { tag: TAG, setup: { enemies: ENEMIES, weapons: WEAPONS, seed: 1, autoplay: true, seconds: SECONDS, hudSeconds: HUD_SECONDS }, configs, jsErrors: errors };
} finally {
  await browser.close();
  server.stop();
}

if (result) {
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
process.exit(result && errors.length === 0 ? 0 : 1);
