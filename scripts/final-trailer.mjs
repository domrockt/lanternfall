#!/usr/bin/env node
// M6-final A6: Trailer in 8 kurzen Segmenten (je ~4,5 s), danach Zusammenbau.
//   node scripts/final-trailer.mjs --segment 1..8   (ein Segment, Timeout im Aufrufer)
//   node scripts/final-trailer.mjs --assemble       (GIF + 6 Uebersichts-Shots)
// Bewusst klein: 480x270, 8 fps -> wenig Speicher/CPU pro Segment.
import { ensureBuild, startServer, loadPlaywright, startRun, waitForScene } from "./harness.mjs";
import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const segArg = argv.indexOf("--segment");
const SEGMENT = segArg >= 0 ? Number(argv[segArg + 1]) : null;
const ASSEMBLE = argv.includes("--assemble");
const DIR = "shots/trailer-seg";
const FRAME_MS = 125;
const SEG_MS = 4500;
const FPS = 8;

function fail(msg) { console.error(msg); process.exit(1); }

if (ASSEMBLE) {
  const list = [];
  for (let s = 1; s <= 8; s++) {
    const dir = `${DIR}/${s}`;
    if (!existsSync(dir)) fail(`Segment ${s} fehlt`);
    const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
    if (files.length < 10) fail(`Segment ${s} hat nur ${files.length} Frames`);
    for (const f of files) list.push({ file: `${process.cwd()}/${dir}/${f}`, duration: SEG_MS / 1000 / files.length });
  }
  const listPath = `${DIR}/list.txt`;
  writeFileSync(listPath, list.map((f) => `file '${f.file}'\nduration ${f.duration}`).join("\n") + "\n");
  execFileSync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-vf", "fps=8,split[a][b];[a]palettegen=max_colors=32:stats_mode=diff[p];[b][p]paletteuse=dither=none",
    "-loop", "0", "shots/final-trailer.gif",
  ], { stdio: "inherit" });
  const overview = [
    ["shots/overview-1-intro.png", 1, 0],
    ["shots/overview-2-early.png", 2, 4],
    ["shots/overview-3-boss.png", 3, 5],
    ["shots/overview-4-chest.png", 4, 6],
    ["shots/overview-5-chaos.png", 6, 5],
    ["shots/overview-6-dawn.png", 8, 8],
  ];
  for (const [dest, seg, idx] of overview) {
    const files = readdirSync(`${DIR}/${seg}`).filter((f) => f.endsWith(".png")).sort();
    execFileSync("cp", [`${DIR}/${seg}/${files[Math.min(idx, files.length - 1)]}`, dest]);
  }
  writeFileSync("shots/final-trailer.json", JSON.stringify({
    segments: 8, seconds: (SEG_MS / 1000) * 8, fps: FPS, resolution: "480x270",
    gif: "shots/final-trailer.gif", overview: overview.map((o) => o[0]),
  }, null, 2));
  console.log(`Trailer zusammengebaut: 8 Segmente, ${(SEG_MS / 1000) * 8} s, 480x270, ${FPS} fps`);
  process.exit(0);
}

if (!SEGMENT || SEGMENT < 1 || SEGMENT > 8) fail("--segment 1..8 oder --assemble");

ensureBuild();
const dir = `${DIR}/${SEGMENT}`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let idx = 0;
const started = Date.now();
async function capture(ms = SEG_MS) {
  while (Date.now() - started < ms) {
    await page.screenshot({ path: `${dir}/${String(idx).padStart(3, "0")}.png` });
    idx += 1;
    await page.waitForTimeout(FRAME_MS);
  }
}

async function runTo(seconds) {
  await page.evaluate(() => { window.__lf.god(true); window.__lf.setSuppressLevelUps(true); window.__lf.setTimeScale(60); });
  while (true) {
    const s = await page.evaluate(() => window.__lf.stats());
    if (s.time >= seconds) break;
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.__lf.setTimeScale(1));
}

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=5`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });

  if (SEGMENT === 1) {
    // Intro: Titel 2 s, Charakterwahl 2,5 s.
    await waitForScene(page, "title");
    await page.waitForTimeout(300);
    await capture(2000);
    await page.keyboard.press("Enter");
    await waitForScene(page, "charselect");
    await capture(SEG_MS);
  } else {
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.setSuppressLevelUps(true);
      window.__lf.autoPlay(true);
      window.__lf.setTimeScale(1);
    });
    if (SEGMENT === 2) {
      await page.waitForTimeout(1800);
      await capture();
    } else if (SEGMENT === 3) {
      await page.evaluate(() => window.__lf.spawnBoss(1));
      await page.waitForTimeout(1200);
      await capture();
    } else if (SEGMENT === 4) {
      await page.evaluate(() => window.__lf.event("chest"));
      await page.waitForTimeout(900);
      await capture();
    } else if (SEGMENT === 5) {
      await page.evaluate(() => window.__lf.event("evolution"));
      await page.waitForTimeout(300);
      await capture();
    } else if (SEGMENT === 6) {
      await runTo(1400);
      await page.evaluate(() => {
        const sc = window.__game.scene.getScene("run");
        while (sc.levelUpOpen) window.__lf.pickLevelUp(0);
        for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
        window.__lf.setTimeScale(1);
        window.__lf.spawnEnemy("bog_rat", 240);
        window.__lf.spawnEnemy("wolf", 120);
        window.__lf.spawnEnemy("spider", 100);
      });
      await page.waitForTimeout(600);
      await capture();
    } else if (SEGMENT === 7) {
      await runTo(1790);
      await page.evaluate(() => window.__lf.spawnBoss(5));
      await page.waitForTimeout(1600);
      await capture();
    } else if (SEGMENT === 8) {
      await page.evaluate(() => window.__lf.event("dawn"));
      await page.waitForTimeout(500);
      await capture();
    }
  }
  writeFileSync(`${dir}/meta.json`, JSON.stringify({ segment: SEGMENT, frames: idx, ms: SEG_MS, fps: FPS, errors }, null, 2));
  console.log(`Segment ${SEGMENT}: ${idx} Frames, ${((Date.now() - started) / 1000).toFixed(1)} s real, ${errors.length} JS-Fehler`);
} finally {
  await browser.close();
  server.stop();
}
if (errors.length > 0) process.exit(1);
