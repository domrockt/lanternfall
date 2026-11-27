// TEMP-Sonde 2 (nicht committen): setzt der Phaser-ScaleManager canvas.width zurueck?
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
const VIEWPORT = { width: 780, height: 360 };
const DPR = 3;
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
await startRun(page);
await page.evaluate(() => { window.__lf.god(true); window.__lf.autoPlay(true); });
await page.waitForTimeout(3000);
const r1 = await page.evaluate(() => {
  const g = window.__game; const c = g.canvas;
  const before = { w: c.width, h: c.height, rw: g.renderer.width, rh: g.renderer.height };
  c.width = 390; c.height = 180; g.renderer.resize(390, 180);
  return { before, immediate: { w: c.width, h: c.height, rw: g.renderer.width, rh: g.renderer.height } };
});
await page.waitForTimeout(600);
const r2 = await page.evaluate(() => {
  const g = window.__game; const c = g.canvas;
  return { w: c.width, h: c.height, rw: g.renderer.width, rh: g.renderer.height, css: [c.style.width, c.style.height], scaleW: g.scale.width, scaleH: g.scale.height };
});
console.log(JSON.stringify({ r1, r2 }));
await browser.close(); server.stop();
