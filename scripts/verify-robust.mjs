#!/usr/bin/env node
// Robustheits-Check: ganzzahlige Skalierung bei Fenstergrößen, Tab-Pause
// (visibilitychange → Loop schläft, keine Zeit springt) und Terrain-Worker.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const canvasCss = () => page.evaluate(() => {
  const c = window.__game.canvas;
  return { w: Number.parseFloat(c.style.width), h: Number.parseFloat(c.style.height) };
});
const scaleOk = (css) =>
  Number.isInteger(css.w / 480) && Number.isInteger(css.h / 270) && css.w / 480 === css.h / 270 && css.w >= 480;

let result = null;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  const sizes = [];
  for (const [w, h] of [[960, 540], [1440, 810], [800, 450], [1920, 1080], [1024, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    const css = await canvasCss();
    sizes.push({ viewport: `${w}x${h}`, canvas: `${css.w}x${css.h}`, scale: css.w / 480, ok: scaleOk(css) });
  }

  // Tab-Pause: visibilitychange wie im echten Browser ausloesen (hidden ->
  // Loop schlaeft). Waehrend hidden darf die Spielzeit stehen, nach dem
  // Zurueckkehren muss sie wieder laufen.
  const setHidden = (hidden) => page.evaluate((h) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
  await setHidden(true);
  await page.waitForTimeout(300);
  const hiddenAt = await page.evaluate(() => window.__lf.stats().time);
  await page.waitForTimeout(1000);
  const hiddenAfter = await page.evaluate(() => window.__lf.stats().time);
  const pausedOk = Math.abs(hiddenAfter - hiddenAt) < 0.05;
  await setHidden(false);
  await page.waitForTimeout(600);
  const resumedAt = await page.evaluate(() => window.__lf.stats().time);
  const resumedOk = resumedAt > hiddenAfter + 0.2;
  // Kein Zeit-Sprung beim Aufwachen: 600 ms Wartezeit dürfen maximal ~3 s
  // Spielzeit nachholen, nicht die gesamte versteckte Dauer.
  const noJumpOk = resumedAt - hiddenAfter < 3;

  const worker = await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    return { chunks: run.ground.loadedChunks, hasWorker: Boolean(run.ground.worker), terrain: run.ground.kindAt(run.posX, run.posY) };
  });
  const atlas = await page.evaluate(() => {
    if (!window.__game.textures.exists("runtime_atlas")) return { exists: false, frames: 0, hasFxSpark: false };
    const tex = window.__game.textures.get("runtime_atlas");
    return {
      exists: true,
      frames: tex.getFrameNames().length,
      hasFxSpark: tex.has("fx_spark"),
      hasEnemy: tex.has("enemy_bog_rat"),
    };
  });

  const passed = sizes.every((s) => s.ok) && pausedOk && resumedOk && noJumpOk &&
    worker.chunks > 0 && worker.hasWorker && atlas.exists && atlas.hasFxSpark && atlas.hasEnemy &&
    errors.length === 0;
  result = {
    scaling: sizes,
    pause: {
      hiddenAt: Math.round(hiddenAt * 100) / 100,
      hiddenAfter: Math.round(hiddenAfter * 100) / 100,
      pausedDelta: Math.round((hiddenAfter - hiddenAt) * 100) / 100,
      pausedOk,
      resumedAt: Math.round(resumedAt * 100) / 100,
      resumedOk,
      noJumpOk,
    },
    terrainWorker: worker,
    atlas,
    jsErrors: errors,
    passed,
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  await page.close();
  await browser.close();
  server.stop();
}
process.exit(result?.passed ? 0 : 1);
