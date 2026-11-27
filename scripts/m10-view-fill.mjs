#!/usr/bin/env node
// M10-view-fill: Misst je Format, ob das Spielfeld das Fenster voll ausfuellt
// oder schwarze Balken/Streifen bleiben (Dom-Wunsch 21:45Z, Punkt 3).
//
//   node scripts/m10-view-fill.mjs --tag before
//   node scripts/m10-view-fill.mjs --tag after --out shots/m10-view-fill-after.json
//
// Fuer jedes Format (Default 640x360, 960x540, 1280x720, 2560x1440, dpr 1):
//  - Run starten (god + autoplay + Referenz-Gegner), Screenshot -> shots/m10-view-fill-<tag>-<W>x<H>.png
//  - DOM-Messung: Canvas-Rect, interne View-Groesse, dpr
//  - Pixel-Messung: PNG via ffmpeg nach RGB dekodieren, Randspalten/-zeilen
//    zaehlen, die zu 100% rein schwarz sind -> Balkenbreite px je Seite
//  - WebGL-Renderer-String (UNMASKED_RENDERER_WEBGL) in JEDE Messung
//    (Abnahme: SwiftShader-Belege ungueltig)
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
const OUT = String(argOf("out", `shots/m10-view-fill-${TAG}.json`));
const FORMATS = String(argOf("formats", "640x360,960x540,1280x720,2560x1440"))
  .split(",")
  .map((s) => s.split("x").map(Number))
  .map(([w, h]) => ({ width: w || 640, height: h || 360 }));
const DPR = Number(argOf("dpr", "1")) || 1;
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
 * Das Spielfeld ist pixelart mit strukturierter Grafik — eine ganze Spalte in
 * exakter Hintergrundfarbe kommt im Feld praktisch nicht vor.
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
    const page = await browser.newPage({ viewport: { width: fmt.width, height: fmt.height }, deviceScaleFactor: DPR });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    try {
      const url = `http://127.0.0.1:${server.port}/?debug=1&seed=1`;
      await page.goto(url);
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
          canvasRectCss: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
          internal: [window.__game.scale.width, window.__game.scale.height],
          renderer,
        };
      });

      const shot = `shots/m10-view-fill-${TAG}-${fmt.width}x${fmt.height}.png`;
      await page.screenshot({ path: shot });
      const deviceW = fmt.width * DPR;
      const deviceH = fmt.height * DPR;
      const pixels = await decodeRgb(shot, deviceW, deviceH);
      const bars = measureBars(pixels, deviceW, deviceH);
      results.push({
        format: `${fmt.width}x${fmt.height}`,
        dpr: DPR,
        devicePx: [deviceW, deviceH],
        canvasRectCss: dom.canvasRectCss,
        internal: dom.internal,
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
  fillsAll: results.every((r) => r.barsPx.left === 0 && r.barsPx.right === 0 && r.barsPx.top === 0 && r.barsPx.bottom === 0),
  jsErrors: jsErrorsTotal,
};
writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ out: OUT, fillsAll: summary.fillsAll, jsErrors: jsErrorsTotal }));
process.exit(0);
