#!/usr/bin/env node
// M6-final Art-Belege: Wasser bei 1x (animiert, 8 Frames -> GIF), Spinne mit
// 8 Beinen, Hohler Koenig mit sichtbarem Schwertarm. Die Screenshots sind
// 480x270-Canvas-Aufnahmen; Vergroesserung/Kontaktbogen danach per ImageMagick.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];

const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const report = {};
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=13`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.setOption("scale", 1);
    window.__lf.god(true);
    window.__lf.setTimeScale(1);
  });
  await page.waitForTimeout(400);
  const canvas = page.locator("canvas");

  // 1) Wasserflaeche suchen: 8 Frames fuer die Animation, zwei Einzelframes.
  const water = await page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    const px = sc.posX;
    const py = sc.posY;
    let best = null;
    let bestScore = -1;
    for (let r = -700; r <= 700; r += 8) {
      for (let c = -700; c <= 700; c += 8) {
        const x = Math.round(px + c);
        const y = Math.round(py + r);
        let score = 0;
        for (let dy = -56; dy <= 56; dy += 8) {
          for (let dx = -56; dx <= 56; dx += 8) {
            if (sc.ground.kindAt(x + dx, y + dy) === "water") score++;
          }
        }
        if (score > bestScore) { bestScore = score; best = { x, y }; }
      }
    }
    return best;
  });
  // Am Ufer stehen, damit das Laternenlicht den Teich nicht flächig aufhellt.
  const shore = await page.evaluate((w) => {
    const sc = window.__game.scene.getScene("run");
    for (let r = 72; r <= 180; r += 8) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const x = Math.round(w.x + Math.cos(a) * r);
        const y = Math.round(w.y + Math.sin(a) * r);
        if (sc.ground.kindAt(x, y) !== "water") return { x, y };
      }
    }
    return { x: w.x, y: w.y };
  }, water);
  await page.evaluate((p) => window.__lf.teleport(p.x, p.y), shore);
  await page.waitForTimeout(500);
  await canvas.screenshot({ path: "shots/final-water-1x-a.png" });
  for (let i = 0; i < 8; i++) {
    await canvas.screenshot({ path: `shots/tmp-water-${i}.png` });
    await page.waitForTimeout(140);
  }
  await canvas.screenshot({ path: "shots/final-water-1x-b.png" });

  // 2) Spinne: 6 Tiere spawnen und heranlaufen lassen, dann Zeit verlangsamen.
  await page.evaluate(() => {
    window.__lf.teleport(2048, 2048);
    window.__lf.setTimeScale(1);
    window.__lf.spawnEnemy("spider", 1);
  });
  // Sofort nach dem Spawn die Simulation nahezu anhalten (Waffen treffen sonst).
  await page.waitForTimeout(80);
  await page.evaluate(() => { window.__lf.setTimeScale(0.01); });
  await page.waitForTimeout(120);
  const spiderPos = await page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    const spider = sc.enemies.active.find((e) => e.alive && e.def.id === "spider");
    if (!spider) return null;
    const cam = sc.cameras.main;
    cam.stopFollow();
    cam.setZoom(4);
    cam.centerOn(spider.x, spider.y);
    return { x: Math.round(spider.x), y: Math.round(spider.y) };
  });
  await page.waitForTimeout(250);
  await canvas.screenshot({ path: "shots/final-spider-1x.png" });
  report.spiderPos = spiderPos;
  report.spiders = await page.evaluate(() =>
    window.__game.scene.getScene("run").enemies.active.filter((e) => e.alive && e.def.id === "spider").length);

  // 3) Hohler Koenig (Boss-Index 5): Kamera auf den Boss zoomen, damit der
  //    Schwertarm im 1x-Bild belegt ist. Danach Zoom zuruecksetzen.
  await page.evaluate(() => { window.__lf.setTimeScale(1); window.__lf.spawnBoss(5); });
  // Banner-Intro abwarten, danach nah heranzoomen.
  await page.waitForTimeout(3600);
  const bossPos = await page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    const boss = sc.enemies.active.find((e) => e.alive && e.boss && e.bossIndex === 5)
      ?? sc.enemies.active.find((e) => e.alive && e.boss);
    if (!boss) return null;
    const cam = sc.cameras.main;
    cam.stopFollow();
    cam.setZoom(2.5);
    cam.centerOn(boss.x, boss.y + 8);
    return { x: boss.x, y: boss.y, id: boss.def.id };
  });
  await page.waitForTimeout(300);
  await canvas.screenshot({ path: "shots/final-hollow-king-1x.png" });
  report.boss = bossPos;
  report.bossList = await page.evaluate(() =>
    window.__game.scene.getScene("run").enemies.active
      .filter((e) => e.alive && e.boss)
      .map((e) => ({ id: e.def.id, bossIndex: e.bossIndex, x: Math.round(e.x), y: Math.round(e.y) })));

  await page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    const cam = sc.cameras.main;
    cam.setZoom(1);
    cam.startFollow(sc.player);
  });

  report.waterSpot = water;
  report.waterShore = shore;
  report.errors = errors;
} finally {
  writeFileSync("shots/final-art-shots.json", JSON.stringify(report, null, 2));
  await browser.close();
  server.stop();
}

if (errors.length > 0) {
  console.error("JS-Fehler:", errors);
  process.exit(1);
}
console.log("Art-Belege geschrieben:", JSON.stringify(report));
