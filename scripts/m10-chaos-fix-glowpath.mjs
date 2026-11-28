#!/usr/bin/env node
/**
 * M10-chaos-fix-glow-runpath — Repro/Mess-Skript fuer das Minute-25-Chaos
 * (Befunde B1-Teil/B2/B5 aus docs/lanes/m10-chaos-legibility.md).
 *
 * Szenario wie das Audit (m10-chaos-legibility): seed=1, god, autoPlay,
 * 6 Basis-Waffen Lv8 + 6 Evolutionen Lv8 + 6 Passives St5, skipTo(1490) ->
 * Minute ~25, Gegnerbestand wird auf TARGET (300) gehalten. Beide Profile des
 * Audits: 640x360@1 und 780x360@3, je 3 Chaos-Frames (m25-1..3) aus dem
 * Live-Lauf + bildzentrierter 4x-nearest-Crop.
 *
 * Metriken je Frame: Near-White A7 (r,g,b >= 150 und r >= 235) ueber den
 * ganzen Frame und im A7-anteiligen Crop, plus Min-RGB>=200. Renderer-String
 * ist PFLICHT: iGPU (ANGLE/Mesa Intel) — SwiftShader-Belege sind ungueltig
 * und lassen das Skript mit rc=1 fehlschlagen.
 *
 * Nutzung (misst FPS -> IMMER unter der flock-Sperre):
 *   flock /home/ai/games/.lf-perf.lock node scripts/m10-chaos-fix-glowpath.mjs \
 *     --tag before   (bzw. --tag after)
 *
 * Output: shots/m10-chaos-fix-glowpath-<tag>.json,
 *         shots/m10-chaos-fix-glowpath-<tag>-<profil>-m25-<n>.png (+ -4x.png)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = argOf("tag", "before");
const TARGET = Number(argOf("target", "300"));
const FRAMES = Number(argOf("frames", "3"));
const PREFIX = argOf("prefix", `shots/m10-chaos-fix-glowpath-${TAG}`);
const TMP = `${process.env.HOME}/tmp/m10-chaos-fix-glow-runpath`;

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
const PROFILES = [
  { label: "640-360-1", width: 640, height: 360, dpr: 1 },
  { label: "780-360-3", width: 780, height: 360, dpr: 3 },
];

ensureBuild();
mkdirSync("shots", { recursive: true });
mkdirSync(TMP, { recursive: true });

// ---------- Pixel-Analyse (PNG -> ffmpeg rawvideo rgb24), wie m10-vfx-restore.mjs ----------

function pngSize(file) {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function isNearWhiteA7(r, g, b) {
  return r >= 150 && g >= 150 && b >= 150 && r >= 235;
}
function isNearWhiteMin200(r, g, b) {
  return Math.min(r, g, b) >= 200;
}

/** Near-White-Statistik: ganzer Frame + A7-anteiliger Crop
 *  (240x220 bei +360+160 im 960x540-Original => x 37,5..62,5 %, y 29,63..70,37 %). */
function analyzeShot(file) {
  const { width, height } = pngSize(file);
  const raw = `${TMP}/${file.split("/").pop()}.rgb24`;
  execFileSync("ffmpeg", ["-y", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", raw], { stdio: "ignore" });
  const buf = readFileSync(raw);
  const x0 = Math.round(width * 0.375), x1 = Math.round(width * 0.625);
  const y0 = Math.round(height * (160 / 540)), y1 = Math.round(height * (380 / 540));
  let a7 = 0, min200 = 0, a7Crop = 0, min200Crop = 0, cropPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const r = buf[i], g = buf[i + 1], b = buf[i + 2];
      const inCrop = x >= x0 && x < x1 && y >= y0 && y < y1;
      if (inCrop) cropPixels++;
      if (isNearWhiteA7(r, g, b)) { a7++; if (inCrop) a7Crop++; }
      if (isNearWhiteMin200(r, g, b)) { min200++; if (inCrop) min200Crop++; }
    }
  }
  unlinkSync(raw);
  const pct = (n, total) => Math.round((n / total) * 10000) / 100;
  return {
    pngWidth: width, pngHeight: height,
    nearWhiteA7Pct: pct(a7, width * height),
    nearWhiteMinRgb200Pct: pct(min200, width * height),
    nearWhiteA7CropPct: pct(a7Crop, cropPixels),
    nearWhiteMinRgb200CropPct: pct(min200Crop, cropPixels),
    cropDef: "A7-anteilig: x 37,5..62,5 %, y 29,63..70,37 % des Frames (240x220@+360+160 im 960x540-Original)",
  };
}

/** Bildzentrierter 4x-nearest-Crop (Viertel-Frame Mitte) — Beleg fuer Mixel/Streckung. */
function zoomCrop4x(file, out) {
  const { width, height } = pngSize(file);
  const cw = Math.floor(width / 4), ch = Math.floor(height / 4);
  const x = Math.floor((width - cw) / 2), y = Math.floor((height - ch) / 2);
  execFileSync("ffmpeg", ["-y", "-i", file, "-vf",
    `crop=${cw}:${ch}:${x}:${y},scale=${cw * 4}:${ch * 4}:flags=neighbor`, out],
    { stdio: "ignore" });
}

// ---------- Browser / Messlauf ----------

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const report = { tag: TAG, target: TARGET, profiles: [], jsErrors: [] };

try {
  for (const prof of PROFILES) {
    const page = await browser.newPage({
      viewport: { width: prof.width, height: prof.height },
      deviceScaleFactor: prof.dpr,
    });
    page.on("pageerror", (e) => report.jsErrors.push(`${prof.label}: ${e}`));
    page.on("console", (m) => { if (m.type() === "error") report.jsErrors.push(`${prof.label}: ${m.text()}`); });

    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await startRun(page);
    await page.evaluate(({ evolutions, passives }) => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
      window.__lf.setTimeScale(1);
      for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
    }, { evolutions: EVOLUTIONS, passives: PASSIVES });
    await page.waitForTimeout(500);
    await page.evaluate(({ evolutions, passives }) => {
      for (const id of evolutions) window.__lf.addWeapon(id, 8);
      for (const id of passives) window.__lf.addPassive(id, 5);
      window.__lf.skipTo(1490);
      window.__lf.setTimeScale(1);
    }, { evolutions: EVOLUTIONS, passives: PASSIVES });
    await page.waitForTimeout(6000);
    for (let i = 0; i < 40; i++) {
      if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
      await page.evaluate(() => window.__lf.pickLevelUp(0));
    }

    // Renderer-Pflicht: iGPU oder Abbruch (SwiftShader-Belege ungueltig).
    const renderer = await page.evaluate(() => {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
      const str = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl?.getParameter(gl.RENDERER) ?? "");
      return { renderer: str, swiftShader: /swiftshader/i.test(str) };
    });
    if (renderer.swiftShader) {
      console.error(`[glowpath] FAIL: SwiftShader-Renderer (${renderer.renderer}) — Beleg ungueltig`);
      process.exit(1);
    }

    // Gegnerbestand auf TARGET halten, FPS nebenbei messen (Live-Lauf).
    const fps = await page.evaluate(async ({ seconds, target }) => {
      const start = performance.now();
      let frames = 0, last = start, lastSpawn = 0;
      await new Promise((resolve) => {
        const tick = (now) => {
          if (frames > 0 && now - last > 0) { /* nur Zaehlen */ }
          last = now; frames++;
          if (now - lastSpawn >= 150) {
            lastSpawn = now;
            const active = window.__lf.stats().enemies;
            if (active < target) window.__lf.spawnEnemy("bog_rat", target - active);
          }
          if (now - start >= seconds * 1000) resolve(); else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return { fps: Math.round((frames / ((performance.now() - start) / 1000)) * 10) / 10, frames };
    }, { seconds: 5, target: TARGET });

    // 3 Chaos-Frames aus dem Live-Lauf (Bestand gehalten; Evolutions-Waffen
    // schlichten zu schnell -> wie im Audit alle ~120 ms nachfuellen, direkt
    // vor dem Screenshot, sonst zerfaellt der Bestand auf ~25).
    const framesOut = [];
    for (let n = 1; n <= FRAMES; n++) {
      for (let k = 0; k < 3; k++) {
        await page.evaluate((target) => {
          const active = window.__lf.stats().enemies;
          if (active < target) window.__lf.spawnEnemy("bog_rat", target - active);
        }, TARGET);
        await page.waitForTimeout(120);
      }
      const stats = await page.evaluate(() => {
        const s = window.__lf.stats();
        return {
          enemies: s.enemies, time: s.time, lodLevel: s.lodLevel, fxAlpha: s.fxAlpha,
          kills: s.kills, level: s.level,
        };
      });
      const png = `${PREFIX}-${prof.label}-m25-${n}.png`;
      await page.screenshot({ path: png });
      const zoom = `${PREFIX}-${prof.label}-m25-${n}-4x.png`;
      zoomCrop4x(png, zoom);
      framesOut.push({ png, zoom, stats, pixels: analyzeShot(png) });
      await page.waitForTimeout(450);
    }

    report.profiles.push({ profile: prof, renderer, fps, frames: framesOut });
    await page.close();
  }
} finally {
  await browser.close();
  await server.stop();
}

const worst = Math.max(...report.profiles.flatMap((p) => p.frames.map((f) => f.pixels.nearWhiteA7Pct)));
report.worstNearWhiteA7Pct = worst;
report.gate = { nearWhiteA7Pct: 4.16, definition: "A7: r,g,b >= 150 und r >= 235, ganzer Frame" };
writeFileSync(`${PREFIX}.json`, JSON.stringify(report, null, 2));
console.log(`[glowpath] ${TAG}: worstNearWhiteA7Pct=${worst} (Gate 4,16), profiles=${report.profiles.length}, jsErrors=${report.jsErrors.length}`);
for (const p of report.profiles) {
  console.log(`  ${p.profile.label}: renderer="${p.renderer.renderer}" fps=${p.fps.fps}`);
  for (const f of p.frames) console.log(`    ${f.png}: a7=${f.pixels.nearWhiteA7Pct}% crop=${f.pixels.nearWhiteA7CropPct}% min200=${f.pixels.nearWhiteMinRgb200Pct}% enemies=${f.stats.enemies}`);
}
if (report.jsErrors.length > 0) {
  console.error("[glowpath] JS-Fehler im Lauf — Belege ungueltig");
  process.exit(1);
}
