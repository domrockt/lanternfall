#!/usr/bin/env node
// M4b-Belege Terrain/Wasser: Tiles-Atlas, Ufer-Shots, Wasser-GIF (Wellen/Ripples).
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

ensureBuild();
mkdirSync("shots/tmp/m4b", { recursive: true });
rmSync("shots/tmp/m4b/water-frames", { recursive: true, force: true });
mkdirSync("shots/tmp/m4b/water-frames", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=21`);
await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.setTimeScale(1);
});
await page.waitForTimeout(700);
// Kartenbelege ohne Spielerlicht-Linse, damit Terrainfarben unverfälscht sind.
await page.evaluate(() => { const sc = window.__game.scene.getScene("run"); sc.light.setVisible(false); });

// Atlas (Terrain-Streifen).
const atlas = await page.evaluate(() => window.__lf.tileset());
writeFileSync("shots/tileset-atlas.png", Buffer.from(atlas.split(",")[1], "base64"));

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
      if (!path && k === "path") path = { x, y };
    }
  }
  return { shore, path, water };
});
console.log("spots", JSON.stringify(spots));

await page.evaluate((p) => window.__lf.teleport(p.x, p.y), spots.shore);
await page.waitForTimeout(900);
await page.screenshot({ path: "shots/tmp/m4b/shore-2x.png" });

await page.evaluate((p) => window.__lf.teleport(p.x, p.y), spots.path);
await page.waitForTimeout(900);
await page.screenshot({ path: "shots/tmp/m4b/path-2x.png" });

// Wasser: 30 Frames à 120 ms (Ripples wechseln alle 620 ms).
await page.evaluate((p) => window.__lf.teleport(p.x, p.y), spots.water);
await page.waitForTimeout(900);
for (let i = 0; i < 36; i++) {
  await page.screenshot({ path: `shots/tmp/m4b/water-frames/f${String(i).padStart(3, "0")}.png` });
  await page.waitForTimeout(90);
}
try {
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", "8", "-i", "shots/tmp/m4b/water-frames/f%03d.png",
    "-vf", "scale=480:-1:flags=neighbor,split[a][b];[a]palettegen=max_colors=32:stats_mode=full[p];[b][p]paletteuse=dither=none", "shots/m4b-water.gif"]);
  console.log("water gif ok");
} catch (e) {
  console.log("gif failed", String(e));
}
console.log(errors.length ? "JS ERRORS:\n" + errors.join("\n") : "no JS errors");
await browser.close();
server.stop();
