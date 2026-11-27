#!/usr/bin/env node
// M10-Ambient-Beleg: gleiche Debug-Szene wie shots/m10-ambient-640-before.png
// (god, autoPlay, 500 Gegner, skipTo 1490) auf dem Fix-Stand abbilden.
// Aufruf: node scripts/m10-ambient-batching.mjs --out shots/m10-ambient-640-after.png
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const OUT = String(argOf("out", "shots/m10-ambient-640-after.png"));
const ENEMIES = Number(argOf("enemies", "500"));
const TIME = Number(argOf("time", "1490"));
const VIEWPORT = { width: 640, height: 360 };

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const commands = [];
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  const call = async (name, args = []) => {
    commands.push({ call: name, args });
    await page.evaluate(({ name, args }) => window.__lf[name](...args), { name, args });
  };
  await call("god", [true]);
  await call("autoPlay", [true]);
  await call("setTimeScale", [1]);
  await call("spawnEnemy", ["bog_rat", ENEMIES]);
  await call("skipTo", [TIME]);
  // Boss-/Levelup-Modal wegklicken, damit das Bild die Spielwelt zeigt.
  for (let i = 0; i < 60; i++) {
    const open = await page.evaluate(() => window.__lf.stats().levelUpOpen);
    if (!open) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
  await page.waitForTimeout(2500);
  const stats = await page.evaluate(() => window.__lf.stats());
  await page.screenshot({ path: OUT });
  writeFileSync(`${OUT}.json`, JSON.stringify({
    url: `/??debug=1&seed=1`, scene: "run", commands, out: OUT,
    stats: { enemies: stats.enemies, fps: stats.fps, level: stats.level, kills: stats.kills }, enemies_target: ENEMIES, time_target: TIME,
    jsErrors: errors,
  }, null, 2));
  console.log(JSON.stringify({ enemies: stats.enemies, fps: stats.fps, jsErrors: errors.length }));
} finally {
  await page.close();
  await browser.close();
  server.stop();
}
process.exit(errors.length ? 1 : 0);
