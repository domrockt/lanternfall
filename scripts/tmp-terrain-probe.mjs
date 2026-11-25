#!/usr/bin/env node
// M4b Terrain-Probe: mehrere Positionen (Gras, Weg, Wasserufer, Deko) als PNG.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { mkdirSync } from "node:fs";

ensureBuild();
mkdirSync("shots/tmp/m4b", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=21`);
await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.setTimeScale(1);
  window.__lf.addWeapon("ember", 8);
});
await page.waitForTimeout(900);

// Wasserufer + Weg + Deko-Stellen suchen.
const spots = await page.evaluate(() => {
  const sc = window.__game.scene.getScene("run");
  const px = Math.round(sc.posX);
  const py = Math.round(sc.posY);
  let shore = null, path = null, decor = null, water = null;
  for (let r = -900; r <= 900; r += 16) {
    for (let c = -900; c <= 900; c += 16) {
      const x = px + c, y = py + r;
      const k = sc.ground.kindAt(x, y);
      let land = 0, wat = 0;
      for (let dy = -32; dy <= 32; dy += 8) for (let dx = -32; dx <= 32; dx += 8) {
        const q = sc.ground.kindAt(x + dx, y + dy);
        if (q === "water") wat++; else land++;
      }
      if (!shore && wat > 12 && land > 12) shore = { x, y };
      if (!water && wat > 40) water = { x, y };
      if (!path && k === "path") path = { x, y };
      if (!decor && k === "grass" && wat === 0) decor = { x, y };
    }
  }
  return { shore, path, decor, water };
});
console.log("spots", JSON.stringify(spots));

const shoot = async (name, x, y) => {
  await page.evaluate(([x, y]) => {
    window.__lf.teleport(x, y);
    window.__lf.spawnEnemy("bog_rat", 3);
  }, [x, y]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `shots/tmp/m4b/${name}.png` });
};

for (const [name, p] of Object.entries(spots)) {
  if (p) await shoot(name, p.x, p.y);
}
console.log(errors.length ? "JS ERRORS:\n" + errors.join("\n") : "no JS errors");
await browser.close();
server.stop();
