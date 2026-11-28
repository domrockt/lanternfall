#!/usr/bin/env node
// M10-view-pixel-snap: Canvas-Position auf ganzen Geraetepixeln belegen
// (Lane m10-view-pixel-snap, Bedarf aus m10-view-4k K2).
//
//   node scripts/m10-view-snap.mjs --tag before
//   node scripts/m10-view-snap.mjs --tag after
//
// Profile (Default): 2560x1080@dpr1 (Mangelprofil: Canvas 2559 Geraetepx in
// 2560 -> zentriert bei CSS-x=0.5 -> linke Randspalte blurrt) und als Kontrolle
// 1280x720@dpr1 (teilbar, muss unveraendert bleiben). Methodik wie
// scripts/m10-view-4k.mjs, zusaetzlich:
//  - Canvas-Rect in GERAETEpx (rect.x*dpr) und Flag rectIntegerDevice
//    (Grenze auf ganzem Geraetepixel?) — genau das fixt die Lane.
// Belege nach /home/ai/games/.evidence/m10-view-pixel-snap/ (nicht in git).
import { writeFileSync, mkdirSync } from "node:fs";
import { spawn as spawnProc } from "node:child_process";
import { ensureBuild, startRun, startServer, loadPlaywright } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = String(argOf("tag", "before"));
const EVDIR = String(argOf("evdir", "/home/ai/games/.evidence/m10-view-pixel-snap"));
const OUT = String(argOf("out", `${EVDIR}/m10-view-snap-${TAG}.json`));
const FORMATS = String(argOf("formats", "2560x1080@1:0,1280x720@1:0"))
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
mkdirSync(EVDIR, { recursive: true });

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
        const cs = getComputedStyle(canvas);
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
          canvasTransform: cs.transform,
          internal: [window.__game.scale.width, window.__game.scale.height],
          renderer,
        };
      });

      const shot = `${EVDIR}/m10-view-snap-${TAG}-${fmt.width}x${fmt.height}d${fmt.dpr}.png`;
      await page.screenshot({ path: shot });
      const deviceW = Math.round(fmt.width * fmt.dpr);
      const deviceH = Math.round(fmt.height * fmt.dpr);
      const pixels = await decodeRgb(shot, deviceW, deviceH);
      const bars = measureBars(pixels, deviceW, deviceH);

      const scaleObserved = deviceH / dom.internal[1];
      const scaleInteger = Number.isInteger(Math.round(scaleObserved * 1e6) / 1e6);
      // Lane-Kern: Canvas-Grenzen in GERAETEpx ganzzahlig? (0.5er-Offsets blurren.)
      const rectDeviceX = dom.canvasRectCss[0] * dom.dpr;
      const rectDeviceY = dom.canvasRectCss[1] * dom.dpr;
      const rectIntegerDevice = Math.abs(rectDeviceX - Math.round(rectDeviceX)) <= 0.01
        && Math.abs(rectDeviceY - Math.round(rectDeviceY)) <= 0.01;
      const canvasDeviceW = dom.canvasRectCss[2] * dom.dpr;
      const canvasDeviceH = dom.canvasRectCss[3] * dom.dpr;
      const pixelExact = Math.abs(canvasDeviceW - dom.internal[0] * scaleObserved) <= 0.5
        && Math.abs(canvasDeviceH - dom.internal[1] * scaleObserved) <= 0.5;
      const noOverflow = dom.canvasRectCss[0] + dom.canvasRectCss[2] <= fmt.width + 0.5
        && dom.canvasRectCss[1] + dom.canvasRectCss[3] <= fmt.height + 0.5;
      results.push({
        format: `${fmt.width}x${fmt.height}@${fmt.dpr}`,
        setting: dom.setting,
        devicePx: [deviceW, deviceH],
        canvasRectCss: dom.canvasRectCss,
        canvasTransform: dom.canvasTransform,
        rectDevicePx: [Math.round(rectDeviceX * 1000) / 1000, Math.round(rectDeviceY * 1000) / 1000],
        rectIntegerDevice,
        internal: dom.internal,
        scaleObserved: Math.round(scaleObserved * 1e6) / 1e6,
        scaleInteger,
        pixelExact,
        noOverflow,
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
  allIntegerRect: results.every((r) => r.rectIntegerDevice),
  allPixelExact: results.every((r) => r.pixelExact),
  renderer: results[0]?.renderer ?? "unavailable",
  jsErrors: jsErrorsTotal,
};
writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ out: OUT, allIntegerRect: summary.allIntegerRect, allPixelExact: summary.allPixelExact, jsErrors: jsErrorsTotal }));
process.exit(0);
