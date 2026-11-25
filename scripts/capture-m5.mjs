#!/usr/bin/env node
// Frischer Spiel-Capture nach der M5-Abnahme: shots/latest.png + shots/latest.gif
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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
const frames = "shots/frames-m5";
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=77`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
    for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(60);
    window.__lf.spawnEnemy("bog_rat", 90);
    window.__lf.spawnEnemy("skeleton", 30);
    window.__lf.spawnEnemy("banshee", 20);
  });
  for (let i = 0; i < 36; i++) {
    await page.evaluate((k) => {
      const open = window.__lf.state().levelUpOpen;
      if (open) window.__lf.pickLevelUp(0);
      if (window.__lf.state().enemies < 90) window.__lf.spawnEnemy("bog_rat", 40);
      if (k === 12) window.__lf.openChest();
    }, i);
    await page.waitForTimeout(90);
    await page.screenshot({ path: `${frames}/f${String(i).padStart(3, "0")}.png` });
  }
  await page.screenshot({ path: "shots/latest.png" });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "12", "-i", `${frames}/f%03d.png`,
    "-vf", "scale=480:270:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=full[p];[s1][p]paletteuse=dither=none",
    "shots/latest.gif"], { stdio: ["ignore", "ignore", "inherit"] });
} finally {
  await browser.close();
  server.stop();
}
rmSync(frames, { recursive: true, force: true });
writeFileSync("shots/latest.json", JSON.stringify({ jsErrors: errors }, null, 2));
console.log(errors.length ? "JS ERRORS:\n" + errors.join("\n") : "no JS errors");
