#!/usr/bin/env node
// Test: Vignette als CSS-Compositor-Overlay statt WebGL-BlBlend-Pass.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./scripts/harness.mjs";

const VIEWPORT = { width: 780, height: 360 };
const DPR = 3;
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] });

const measure = async (page, label, setup, seconds = 5) => {
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
  console.log(label.padEnd(24), res);
  return res;
};

const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true); window.__lf.autoPlay(true); window.__lf.setTimeScale(1);
  for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
  window.__lf.spawnEnemy("bog_rat", 400); window.__lf.spawnEnemy("wisp", 50); window.__lf.spawnEnemy("bogzombie", 50);
});
await page.waitForTimeout(800);

await measure(page, "baseline", () => {});
await measure(page, "cssCSS-vignette", () => {
  const r = window.__game.scene.getScene("run");
  r.vignette.setVisible(false);
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:10;" +
    "background:radial-gradient(ellipse 290px 290px at 50% 50%, rgba(6,7,12,0) 0%, rgba(6,7,12,0.16) 70%, rgba(6,7,12,0.65) 100%);";
  document.body.appendChild(d);
});
await measure(page, "w-vignette wieder-off", () => {
  document.querySelectorAll("div").forEach((d) => { if (d.style.zIndex === "10") d.remove(); });
});
await page.close(); await browser.close(); server.stop();
