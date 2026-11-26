#!/usr/bin/env node
// M6-final A6: Trailer-GIF (30-40 s) mit 9 Stationen und 6 Uebersichts-Shots.
// Nimmt 960x540-Screenshots auf, schreibt eine ffmpeg-Concat-Liste und baut
// daraus shots/final-trailer.gif (480x270, 10 fps, 32 Farben).
import { ensureBuild, startServer, loadPlaywright, startRun, waitForScene } from "./harness.mjs";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DIR = "shots/trailer";
ensureBuild();
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const frames = [];
let idx = 0;
async function shot(name, duration) {
  const file = `${DIR}/${String(idx).padStart(3, "0")}-${name}.png`;
  idx += 1;
  await page.screenshot({ path: file });
  frames.push({ file, duration });
}
async function burst(name, count, gapMs, duration) {
  for (let i = 0; i < count; i++) {
    await shot(name, duration);
    if (i < count - 1) await page.waitForTimeout(gapMs);
  }
}

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=5`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });

  // 1) Titel (3,5 s)
  await waitForScene(page, "title");
  await page.waitForTimeout(400);
  await shot("title", 3.5);

  // 2) Charakterwahl (3,5 s)
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.waitForTimeout(350);
  await shot("charselect", 3.5);

  // 3) Fruehe Minute (3,6 s)
  await page.keyboard.press("Enter");
  await waitForScene(page, "run");
  await page.evaluate(() => { window.__lf.god(true); window.__lf.autoPlay(true); window.__lf.setTimeScale(1); });
  await page.waitForTimeout(2600);
  await burst("early", 9, 200, 0.4);

  // 4) Boss (3,6 s)
  await page.evaluate(() => window.__lf.spawnBoss(1));
  await page.waitForTimeout(1200);
  await burst("boss", 9, 200, 0.4);

  // 5) Truhe (3,6 s)
  await page.evaluate(() => window.__lf.event("chest"));
  await page.waitForTimeout(900);
  await burst("chest", 9, 200, 0.4);

  // 6) Evolution (3,6 s)
  await page.evaluate(() => { window.__lf.setSuppressLevelUps(true); window.__lf.event("evolution"); });
  await page.waitForTimeout(350);
  await burst("evolution", 9, 200, 0.4);

  // 7) Chaos Minute 25 (3,6 s)
  await page.evaluate(() => {
    window.__lf.setTimeScale(30);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
      window.__lf.addWeapon(id, 8);
    }
    window.__lf.skipTo(1450);
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    while (sc.levelUpOpen) window.__lf.pickLevelUp(0);
    window.__lf.setTimeScale(1);
    window.__lf.spawnEnemy("skeleton", 150);
    window.__lf.spawnEnemy("wolf", 120);
    window.__lf.spawnEnemy("bat", 120);
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__lf.setTimeScale(0.2));
  await burst("chaos", 9, 200, 0.4);

  // 8) Endboss (3,6 s)
  await page.evaluate(() => { window.__lf.setTimeScale(1); window.__lf.skipTo(1790); window.__lf.spawnBoss(5); });
  await page.waitForTimeout(1600);
  await burst("endboss", 9, 200, 0.4);

  // 9) Morgendaemmerung (3,6 s)
  await page.evaluate(() => { window.__lf.setTimeScale(1); window.__lf.event("dawn"); });
  await page.waitForTimeout(600);
  await burst("dawn", 9, 200, 0.4);

  // Concat-Liste + Trailer-GIF bauen.
  const listPath = `${DIR}/list.txt`;
  writeFileSync(listPath, frames.map((f) => `file '${process.cwd()}/${f.file}'\nduration ${f.duration}`).join("\n") + "\n");
  execFileSync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-vf", "fps=10,scale=480:270:flags=neighbor,split[a][b];[a]palettegen=max_colors=32:stats_mode=diff[p];[b][p]paletteuse=dither=none",
    "-loop", "0", "shots/final-trailer.gif",
  ], { stdio: "inherit" });
  const duration = frames.reduce((s, f) => s + f.duration, 0);

  // 6 Uebersichts-Screenshots fuer die Projektuebersicht.
  const picks = [
    ["shots/overview-1-title.png", frames.find((f) => f.file.includes("-title"))],
    ["shots/overview-2-charselect.png", frames.find((f) => f.file.includes("-charselect"))],
    ["shots/overview-3-early.png", frames.find((f) => f.file.includes("-early"))],
    ["shots/overview-4-boss.png", frames.filter((f) => f.file.includes("-boss"))[4]],
    ["shots/overview-5-chaos.png", frames.filter((f) => f.file.includes("-chaos"))[4]],
    ["shots/overview-6-dawn.png", frames.filter((f) => f.file.includes("-dawn"))[8]],
  ];
  for (const [dest, src] of picks) execFileSync("cp", [src.file, dest]);

  writeFileSync("shots/final-trailer.json", JSON.stringify({
    durationSeconds: duration,
    frames: frames.length,
    gif: "shots/final-trailer.gif",
    overview: picks.map((p) => p[0]),
    errors,
  }, null, 2));
  console.log(`Trailer: ${duration.toFixed(1)} s, ${frames.length} Frames, ${errors.length} JS-Fehler`);
} finally {
  await browser.close();
  server.stop();
}
if (errors.length > 0) process.exit(1);
