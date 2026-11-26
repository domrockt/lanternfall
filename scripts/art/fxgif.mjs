// M4-Effekt-Beleg: GIF waehrend der Wirkung mit lebenden Gegnern.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "../harness.mjs";
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=21`);
await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.autoPlay(true);
  window.__lf.setTimeScale(1);
  for (const id of ["frost", "thorn"]) window.__lf.addWeapon(id, 8);
});
await page.waitForTimeout(400);
mkdirSync("shots/tmp/fxgif", { recursive: true });
// 24 Frames à 120 ms: Frostnova + Dornensturm + Blitze treffen die Horde.
for (let i = 0; i < 40; i++) {
  await page.evaluate((k) => {
    const run = window.__game.scene.getScene("run");
    // Lebende Gegner nah am Spieler halten, damit Wirkung + Treffer sichtbar sind.
    if (run.enemies.active.length < 34) window.__lf.spawnEnemy("bog_rat", 30);
    for (const e of run.enemies.active) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - run.posX, e.y - run.posY);
      if (d > 170) {
        const a = Math.random() * Math.PI * 2;
        e.x = run.posX + Math.cos(a) * (70 + Math.random() * 60);
        e.y = run.posY + Math.sin(a) * (60 + Math.random() * 40);
      }
    }
  }, i);
  await page.waitForTimeout(70);
  // Direkt vor dem Frame Dialoge wegklicken (kann waehrend des Wartens aufgehen).
  for (let k = 0; k < 5; k++) {
    if (!(await page.evaluate(() => window.__lf.state().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
  await page.screenshot({ path: `shots/tmp/fxgif/f${String(i).padStart(2, "0")}.png` });
}
// Gezielter Frostnova-Still: pollen bis ring_frost mit Alpha sichtbar ist.
let frostShot = false;
for (let t = 0; t < 90; t++) {
  await page.waitForTimeout(60);
  const hit = await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const keyOf = (o) => {
      const f = o.frame?.name;
      return f && f !== "__BASE" ? f : o.texture?.key;
    };
    return run.children.list.some((o) => keyOf(o) === "ring_frost" &&
      o.visible && o.alpha > 0.4 && Math.abs(o.x - run.posX) < 90);
  });
  if (!hit) continue;
  for (let k = 0; k < 5; k++) {
    if (!(await page.evaluate(() => window.__lf.state().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
  await page.screenshot({ path: "shots/m4-fx-frost.png" });
  frostShot = true;
  break;
}
console.log(JSON.stringify({ frames: 40, frostShot, jsErrors: errors }));
await browser.close();
server.stop();
