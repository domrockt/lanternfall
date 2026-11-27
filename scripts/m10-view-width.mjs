#!/usr/bin/env node
// M10-view-width A/B-Messung
import { writeFileSync } from "node:fs";
import { ensureBuild, startRun, startServer, loadPlaywright } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

// M10-perf-cap-rollback: der --cap-Schalter ist entfallen (Crowd-Deckel rueckgebaut).
const SECONDS = Number(argOf("seconds", "10")) || 10;
const ENEMIES = Number(argOf("enemies", "500")) || 500;
// M10-perf-cap-rollback: --minute 25 = Skip in die Minute-25-Nachstellung
// (skipTo, wie scripts/m10-fx-add-cap.mjs), Ziel-Gegnerzahl dann 300 (M25-Last).
const MINUTE = Number(argOf("minute", "0")) || 0;
const TAG = String(argOf("tag", "cap"));
const OUT = String(argOf("out", `shots/m10-view-width-${TAG}.json`));
const SHOT = String(argOf("shot", `shots/m10-view-width-${TAG}.png`));
const viewportArg = String(argOf("viewport", "780x360")).split("x").map(Number);
const VIEWPORT = { width: viewportArg[0] || 780, height: viewportArg[1] || 360 };
const DPR = Number(argOf("dpr", "3")) || 3;

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--autoplay-policy=no-user-gesture-required",
] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let result = null;
try {
  const url = `http://127.0.0.1:${server.port}/?debug=1&seed=1`;
  await page.goto(url);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
      window.__lf.addWeapon(id, 8);
    }
    window.__lf.spawnEnemy("bog_rat", 400);
    window.__lf.spawnEnemy("wisp", 50);
    window.__lf.spawnEnemy("bogzombie", 50);
  });
  await page.waitForTimeout(1600);

  // M10-perf-cap-rollback: Minute-25-Nachstellung — in die Minute skippen,
  // Level-up-Panels schliessen, dann messen (Muster m10-fx-add-cap.mjs).
  if (MINUTE > 0) {
    await page.evaluate((minute) => {
      window.__lf.skipTo(minute * 60 - 10);
      window.__lf.setTimeScale(1);
    }, MINUTE);
    await page.waitForTimeout(5000);
    for (let i = 0; i < 40; i++) {
      const open = await page.evaluate(() => window.__lf?.stats().levelUpOpen);
      if (!open) break;
      await page.evaluate(() => window.__lf.pickLevelUp(0));
    }
    await page.waitForTimeout(500);
  }

  const measure = await page.evaluate(async ({ ENEMIES, SECONDS }) => {
    const start = performance.now();
    let frames = 0;
    let last = start;
    let worst = 0;
    const samples = [];
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        if (frames > 0) worst = Math.max(worst, dt);
        last = now;
        frames++;
        if (frames % 6 === 0) {
          const active = window.__lf.stats().enemies;
          const deficit = ENEMIES - active;
          if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
          samples.push(window.__lf.stats().enemies);
        }
        if (now - start >= SECONDS * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    return {
      fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
      frames,
      elapsedMs: Math.round(elapsed),
      worstFrameMs: Math.round(worst * 10) / 10,
      avgEnemies: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : 0,
      minEnemies: samples.length ? Math.min(...samples) : 0,
      targetEnemies: ENEMIES,
    };
  }, { ENEMIES, SECONDS });

  const view = await page.evaluate(() => {
    const scale = window.__game.scale;
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    return {
      internal: [scale.width, scale.height],
      css: [Math.round(rect.width), Math.round(rect.height)],
      dpr: window.devicePixelRatio,
    };
  });

  // M10-perf-cap-rollback: Renderer-String (SwiftShader-Belege sind ungueltig)
  // + effektive Reglerstufe des DPR-Budget-Reglers (Teil C: bleibt 1 auf iGPU).
  const gpu = await page.evaluate(() => {
    const gl = window.__game?.renderer?.gl;
    if (!gl) return { renderer: null, vendor: null };
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
      vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
    };
  });
  const renderScale = await page.evaluate(() => Number(window.__rbDbg?.scale ?? 1));

  // M10-view-width: optionaler overlay-freier Sicht-Beleg (art-director 27.11.):
  // Level-up-Overlays schliessen, Gegner auf Zielzahl auffüllen und kurz laufen
  // lassen, damit der Screenshot die Crowd (Klemme aktiv) zeigt, nicht das Panel.
  if (argOf("clear-levelups", "off") === "on") {
    for (let i = 0; i < 40; i++) {
      const open = await page.evaluate(() => window.__lf?.stats().levelUpOpen);
      if (!open) break;
      await page.evaluate(() => window.__lf.pickLevelUp(0));
    }
    await page.evaluate(({ ENEMIES }) => {
      const s = window.__lf.stats();
      const deficit = ENEMIES - s.enemies;
      if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
    }, { ENEMIES });
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: SHOT });

  result = {
    suite: "view-width",
    when: new Date().toISOString(),
    minute: MINUTE,
    gpu,
    renderScale,
    viewport: VIEWPORT,
    dpr: DPR,
    view,
    measure,
    jsErrors: errors,
    passed: measure.fps >= 55 && measure.minEnemies >= 200 && errors.length === 0,
  };
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

process.exit(result && result.passed ? 0 : 1);
