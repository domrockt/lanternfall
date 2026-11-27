#!/usr/bin/env node
// M10-view-fill-refit: Format-Matrix ueber 7 Geraeteformate (Nachschnitt Doms
// Punkt 3, 21:45Z — nach dem Merge m10-perf-cap-rollback).
//
//   node scripts/m10-view-fill-refit.mjs --tag before
//   node scripts/m10-view-fill-refit.mjs --tag after --out shots/m10-viewrefit-after.json
//
// Je Format (Default: 640x360@1, 960x540@1, 1280x720@1, 1920x1080@1,
// 2560x1440@1, 3840x2160@1, 780x360@dpr3 mit SKALIERUNG=3):
//  - Run starten (god + autoplay + Referenz-Gegner), Screenshot
//    -> shots/m10-viewrefit-<tag>-<WxH>d<dpr>.png
//  - DOM-Messung: Canvas-Rect (CSS), interne View, dpr, SKALIERUNG-Setting
//  - Pixel-Messung: PNG via ffmpeg nach RGB dekodieren, Randspalten/-zeilen
//    zaehlen, die zu 100% Seitenhintergrund #06070c sind -> Balken px je Seite
//  - Invarianten je Format: bars==0 (kein Balken), Canvas-Rect == Viewport
//    (kein Crop/Overflow), ganzzahlige Geraetepixel (scale=n exakt,
//    Canvas-Geraetepixel == intern * n; gebrochene Skalierung im Fill-Pfad
//    wird als fractional dokumentiert, nicht als Mangel gewertet)
//  - WebGL-Renderer-String in JEDE Messung (SwiftShader-Belege ungueltig)
// Kein Tuning-Loop: genau ein Messlauf ueber alle Formate.
import { writeFileSync } from "node:fs";
import { spawn as spawnProc } from "node:child_process";
import { ensureBuild, startRun, startServer, loadPlaywright } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = String(argOf("tag", "before"));
const OUT = String(argOf("out", `shots/m10-viewrefit-${TAG}.json`));
// Format "WxH@dpr:setting" — setting = SKALIERUNG-Option (0 = AUTO).
const FORMATS = String(
  argOf(
    "formats",
    "640x360@1:0,960x540@1:0,1280x720@1:0,1920x1080@1:0,2560x1440@1:0,3840x2160@1:0,780x360@3:3",
  ),
)
  .split(",")
  .map((s) => {
    const m = s.match(/^(\d+)x(\d+)@(\d+(?:\.\d+)?):(\d+)$/);
    if (!m) throw new Error(`Unverstaendliches Format: ${s}`);
    return { width: +m[1], height: +m[2], dpr: +m[3], setting: +m[4] };
  });
const SETTLE_MS = Number(argOf("settle", "2000")) || 2000;

/** PNG -> RGB24-Rohbytes via ffmpeg (kein PNG-Lib-Dependency). */
function decodeRgb(pngPath, width, height) {
  return new Promise((resolve, reject) => {
    const child = spawnProc("ffmpeg", [
      "-y", "-loglevel", "error",
      "-i", pngPath,
      "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => process.stderr.write(c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg rc=${code}`));
      const buf = Buffer.concat(chunks);
      if (buf.length !== width * height * 3) {
        return reject(new Error(`ffmpeg bytes ${buf.length} != ${width * height * 3}`));
      }
      resolve(buf);
    });
  });
}

/** Seitenhintergrund aus index.html (Balken-Farbe ausserhalb des Canvas). */
const BG = { r: 0x06, g: 0x07, b: 0x0c };
const TOL = 2;
const isBg = (r, g, b) =>
  Math.abs(r - BG.r) <= TOL && Math.abs(g - BG.g) <= TOL && Math.abs(b - BG.b) <= TOL;

/**
 * Balkenmessung: laeuft von jedem Rand nach innen und stoppt an der ersten
 * Spalte/Zeile, die nicht (nahezu) komplett Seitenhintergrund #06070c ist.
 */
function measureBars(buf, width, height) {
  const px = (x, y) => {
    const o = (y * width + x) * 3;
    return [buf[o], buf[o + 1], buf[o + 2]];
  };
  const colIsBg = (x) => {
    for (let y = 0; y < height; y++) {
      const [r, g, b] = px(x, y);
      if (!isBg(r, g, b)) return false;
    }
    return true;
  };
  const rowIsBg = (y) => {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = px(x, y);
      if (!isBg(r, g, b)) return false;
    }
    return true;
  };
  let left = 0;
  while (left < width && colIsBg(left)) left++;
  let right = 0;
  while (right < width && colIsBg(width - 1 - right)) right++;
  let top = 0;
  while (top < height && rowIsBg(top)) top++;
  let bottom = 0;
  while (bottom < height && rowIsBg(height - 1 - bottom)) bottom++;
  return {
    barsPx: { left, right, top, bottom },
    field: { x: left, y: top, width: width - left - right, height: height - top - bottom },
  };
}

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--autoplay-policy=no-user-gesture-required",
] });

const results = [];
let jsErrorsTotal = 0;
try {
  for (const fmt of FORMATS) {
    const page = await browser.newPage({
      viewport: { width: fmt.width, height: fmt.height },
      deviceScaleFactor: fmt.dpr,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    try {
      const url = `http://127.0.0.1:${server.port}/?debug=1&seed=1`;
      await page.goto(url);
      await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
      if (fmt.setting > 0) {
        await page.evaluate((s) => window.__lf.setOption("scale", s), fmt.setting);
      }
      await startRun(page);
      await page.evaluate(() => {
        window.__lf.god(true);
        window.__lf.autoPlay(true);
        window.__lf.setTimeScale(1);
        window.__lf.spawnEnemy("bog_rat", 40);
        window.__lf.spawnEnemy("wisp", 20);
      });
      await page.waitForTimeout(SETTLE_MS);

      const dom = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        const rect = canvas.getBoundingClientRect();
        let renderer = null;
        try {
          const probe = document.createElement("canvas");
          const gl = probe.getContext("webgl2") || probe.getContext("webgl");
          const dbg = gl.getExtension("WEBGL_debug_renderer_info");
          renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
        } catch { renderer = "unavailable"; }
        return {
          viewportCss: [window.innerWidth, window.innerHeight],
          dpr: window.devicePixelRatio,
          setting: window.__lf.options().scale,
          canvasRectCss: [rect.x, rect.y, rect.width, rect.height].map((v) => Math.round(v * 1000) / 1000),
          internal: [window.__game.scale.width, window.__game.scale.height],
          renderer,
        };
      });

      const shot = `shots/m10-viewrefit-${TAG}-${fmt.width}x${fmt.height}d${fmt.dpr}.png`;
      await page.screenshot({ path: shot });
      const deviceW = Math.round(fmt.width * fmt.dpr);
      const deviceH = Math.round(fmt.height * fmt.dpr);
      const pixels = await decodeRgb(shot, deviceW, deviceH);
      const bars = measureBars(pixels, deviceW, deviceH);

      // Invarianten aus DOM-Mass: scale = Geraetehoehe / interne Hoehe (360).
      const scaleObserved = deviceH / dom.internal[1];
      const scaleInteger = Number.isInteger(Math.round(scaleObserved * 1e6) / 1e6);
      const canvasDeviceW = dom.canvasRectCss[2] * dom.dpr;
      const canvasDeviceH = dom.canvasRectCss[3] * dom.dpr;
      const pixelExact = Math.abs(canvasDeviceW - dom.internal[0] * scaleObserved) <= 0.5
        && Math.abs(canvasDeviceH - dom.internal[1] * scaleObserved) <= 0.5;
      const rectAtOrigin = Math.abs(dom.canvasRectCss[0]) <= 0.5 && Math.abs(dom.canvasRectCss[1]) <= 0.5;
      const noOverflow = dom.canvasRectCss[0] + dom.canvasRectCss[2] <= fmt.width + 0.5
        && dom.canvasRectCss[1] + dom.canvasRectCss[3] <= fmt.height + 0.5;
      const barsZero = bars.barsPx.left === 0 && bars.barsPx.right === 0
        && bars.barsPx.top === 0 && bars.barsPx.bottom === 0;
      results.push({
        format: `${fmt.width}x${fmt.height}@${fmt.dpr}`,
        setting: dom.setting,
        devicePx: [deviceW, deviceH],
        canvasRectCss: dom.canvasRectCss,
        internal: dom.internal,
        scaleObserved: Math.round(scaleObserved * 1e6) / 1e6,
        scaleInteger,
        pixelExact,
        rectAtOrigin,
        noOverflow,
        barsZero,
        pass: barsZero && rectAtOrigin && noOverflow && pixelExact,
        renderer: dom.renderer,
        shot,
        ...bars,
        jsErrors: errors,
      });
      jsErrorsTotal += errors.length;
      console.log(JSON.stringify(results[results.length - 1]));
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.stop();
}

const summary = {
  tag: TAG,
  measuredAt: new Date().toISOString(),
  formats: results,
  allPass: results.every((r) => r.pass),
  allInteger: results.every((r) => r.scaleInteger),
  jsErrors: jsErrorsTotal,
};
writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ out: OUT, allPass: summary.allPass, allInteger: summary.allInteger, jsErrors: jsErrorsTotal }));
process.exit(0);
