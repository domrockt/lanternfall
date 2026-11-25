import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { mkdirSync } from "node:fs";
ensureBuild();
mkdirSync("shots/tmp/m4b/nolight", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=21`);
await startRun(page);
await page.evaluate(() => { window.__lf.god(true); window.__lf.setTimeScale(1); });
await page.waitForTimeout(700);
await page.evaluate(() => {
  const sc = window.__game.scene.getScene("run");
  sc.light.setVisible(false);
});
const spots = await page.evaluate(() => {
  const sc = window.__game.scene.getScene("run");
  const px = Math.round(sc.posX), py = Math.round(sc.posY);
  let shore = null, path = null, water = null;
  for (let r = -1000; r <= 1000; r += 18) {
    for (let c = -1000; c <= 1000; c += 18) {
      const x = px + c, y = py + r;
      let wat = 0, land = 0;
      for (let dy = -40; dy <= 40; dy += 8) for (let dx = -40; dx <= 40; dx += 8) {
        if (sc.ground.kindAt(x + dx, y + dy) === "water") wat++; else land++;
      }
      const k = sc.ground.kindAt(x, y);
      if (!water && wat > 100) water = { x, y };
      if (!shore && wat > 25 && land > 25 && k !== "water") shore = { x, y };
      if (!path && k === "path" && wat === 0) path = { x, y };
    }
  }
  return { shore, path, water };
});
console.log("spots", JSON.stringify(spots));
for (const [name, p] of Object.entries(spots)) {
  if (!p) continue;
  await page.evaluate((p) => window.__lf.teleport(p.x, p.y), p);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `shots/tmp/m4b/nolight/${name}.png` });
  console.log(name, p);
}
console.log(errors.length ? "JS ERRORS:\n" + errors.join("\n") : "no JS errors");
await browser.close();
server.stop();
