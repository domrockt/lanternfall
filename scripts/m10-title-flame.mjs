#!/usr/bin/env node
// Lane m10-title-flame-crisp: Titel-Screenshots in den 3 Abnahme-Formaten.
//   node scripts/m10-title-flame.mjs before   -> shots/m10-title-flame-before-<view>.png
//   node scripts/m10-title-flame.mjs after    -> shots/m10-title-flame-after-<view>.png (+ GIF)
// Views: 640x360, 780x360 (M8-Standard), 1920x1080 (Desktop 4x). Exit 0 nur bei 0 JS-Fehlern.
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const phase = process.argv[2] === "after" ? "after" : "before";
const VIEWS = [
  { name: "640x360", width: 640, height: 360 },
  { name: "780x360", width: 780, height: 360 },
  { name: "1920x1080", width: 1920, height: 1080 },
];
const GIF_VIEWS = phase === "after" ? ["640x360"] : [];
const GIF_FRAMES = 10; // ~2 fps anim -> 10 Frames bei 2 fps GIF-Rate = 5 s Zyklus

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const results = [];
try {
  for (const v of VIEWS) {
    const page = await browser.newPage({ viewport: { width: v.width, height: v.height } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1`);
    await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
    await waitForScene(page, "title");
    await page.waitForTimeout(700);
    const out = `shots/m10-title-flame-${phase}-${v.name}.png`;
    await page.screenshot({ path: out });
    results.push({ out, view: v.name, jsErrors: errors });
    if (GIF_VIEWS.includes(v.name)) {
      const gifOut = `shots/m10-title-flame-${phase}-${v.name}.gif`;
      const framesDir = `shots/.frames-flame-${process.pid}`;
      mkdirSync(framesDir, { recursive: true });
      for (let i = 0; i < GIF_FRAMES; i++) {
        await page.screenshot({ path: `${framesDir}/f${String(i).padStart(3, "0")}.png` });
        if (i < GIF_FRAMES - 1) await page.waitForTimeout(480); // 2 fps Animation -> halber Zyklus pro Frame-Paar
      }
      execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        "-framerate", "2", "-i", `${framesDir}/f%03d.png`,
        "-vf", "scale=iw:ih:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=64:stats_mode=full[p];[s1][p]paletteuse=dither=none",
        gifOut,
      ], { stdio: ["ignore", "ignore", "inherit"] });
      results.push({ out: gifOut, view: v.name, frames: GIF_FRAMES, jsErrors: errors });
      writeFileSync(`shots/m10-title-flame-${phase}-${v.name}.png.json`, JSON.stringify(results.at(-1), null, 2));
    }
    await page.close();
    if (errors.length) {
      console.error(`JS-Fehler bei ${v.name}:`, errors);
      process.exit(1);
    }
  }
} finally {
  await browser.close();
  server?.stop();
}
writeFileSync(`shots/m10-title-flame-${phase}.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
