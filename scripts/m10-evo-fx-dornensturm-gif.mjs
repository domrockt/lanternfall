// m10-evo-fx-dornensturm, Karte 5: Nachher-GIF des Dornensturm-Effekts (Werkzeug).
// 24 Frames à 90 ms während der Salven, mit lebenden Gegnern; GIF via convert.
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const frames = "shots/frames-dornen-after";
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.addWeapon("thorn_storm", 8);
    window.__lf.spawnEnemy("mudling", 12);
    window.__lf.spawnEnemy("bog_rat", 8);
  });
  // Warten bis die erste Salve fliegt, dann 24 Frames über ~2,2 s (2 Salven-Zyklen).
  await page.waitForFunction(() => {
    const scene = window.__game.scene.getScene("run");
    return (scene.children.list ?? []).some((c) => c.visible && (c.texture?.key === "projectile_thorn" || c.frame?.name === "projectile_thorn"));
  }, { timeout: 15000 });
  for (let i = 0; i < 24; i++) {
    await page.evaluate(() => {
      if (window.__lf.state().enemies < 16) window.__lf.spawnEnemy("mudling", 8);
    });
    await page.waitForTimeout(90);
    await page.screenshot({ path: `${frames}/f${String(i).padStart(3, "0")}.png` });
  }
} finally {
  await browser.close();
  server.stop?.();
}
if (errors.length > 0) {
  console.error("JS-Fehler:", errors);
  process.exit(1);
}
execFileSync("convert", [
  "-delay", "8", "-loop", "0",
  `${frames}/f*.png`,
  "-scale", "150%", "-layers", "Optimize",
  "shots/m10-evo-fx-dornensturm-after.gif",
]);
console.log("GIF geschrieben: shots/m10-evo-fx-dornensturm-after.gif, JS-Fehler:", errors.length);
