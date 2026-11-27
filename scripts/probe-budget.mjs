// TEMP-Sonde (nicht committen): warum senkt der Render-Regler in der Messung nicht?
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const VIEWPORT = { width: 780, height: 360 };
const DPR = 3;
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
page.on("pageerror", (e) => console.log("[pageerror]", String(e)));
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
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => {
    const g = window.__game;
    const c = document.querySelector("canvas");
    return {
      fps: Math.round((g?.loop?.actualFps ?? -1) * 10) / 10,
      loopFps: g?.loop?.actualFps,
      hasLoop: !!g?.loop,
      canvasW: c?.width,
      canvasH: c?.height,
      scaleW: g?.scale?.width,
      scaleH: g?.scale?.height,
      gameLoopRunning: g?.loop?.running,
      stats: window.__lf.stats(),
      rbscaleDebug: window.__lf.stats?.()?.renderScale,
    };
  });
  console.log(i + 1, JSON.stringify(s));
}
await browser.close();
server.stop();
