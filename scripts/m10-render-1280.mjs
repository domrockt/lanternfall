#!/usr/bin/env node
// K1, Lane m10-render-1280-gap (Karte #13894, Befund #12969):
// Repro-Scan "1280er Viewport – Ground-Chunks rechts/unten teils ungerendert
// (dunkles Quadrat)". Rendert 1280x720 bei dpr 1 und dpr 2 (Kontrolle
// 960x540@1), je Start-Shot + 60 Spiel-Sekunden Laufen in 8 Richtungen
// (timeScale 8, Muster scripts/verify-terrain.mjs).
// Scan A: reine Schwarz-Flaechen im Spielfeld-Rect (checkScreenshot aus
//   scripts/terrain-coverage.mjs, gleiche Pruefung wie der Suite-Test).
// Scan B: ergaenzende Dunkelheits-Messung — der Befund #12969 beschreibt ein
//   DUNKLES Quadrat mit sichtbarem radialen Licht-Gradient, also NICHT reines
//   Schwarz. Dazu Zellen-Mittel-Luminanz (32px-Raster) und Quadranten-Mittel;
//   grosse sehr dunkle ZellenWaenden waeren der Befund.
// Belege nach ~/games/.evidence/m10-render-1280-gap/ (untracked).
// Mess-Skript-Regel: Werkzeug, max. 2 Edit-Iterationen, dann verbindlich.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { checkScreenshot, decodePng } from "./terrain-coverage.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const OUT_DIR = join(homedir(), "games", ".evidence", "m10-render-1280-gap");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const CELL = 32; // Zellen-Raster fuer Luminanz-Mittel (Scan B)
const DARK_CELL_LUM = 16; // Zelle gilt als "sehr dunkel" darunter

const SIZES = [
  { width: 960, height: 540, dpr: 1, label: "control-960-dpr1" },
  { width: 1280, height: 720, dpr: 1, label: "1280-dpr1" },
  { width: 1280, height: 720, dpr: 2, label: "1280-dpr2" },
  { width: 1920, height: 1080, dpr: 1, label: "1920-dpr1" },
];
const DIRECTIONS = [
  ["ArrowRight"], ["ArrowRight", "ArrowUp"], ["ArrowUp"], ["ArrowLeft", "ArrowUp"],
  ["ArrowLeft"], ["ArrowLeft", "ArrowDown"], ["ArrowDown"], ["ArrowRight", "ArrowDown"],
];
const PHASE_MS = Math.round(7500 / 8); // 60 Spiel-Sekunden bei timeScale 8

/** Zellen- und Quadranten-Luminanz eines dekodierten RGBA-Frames. */
function darknessScan(img) {
  const { width: w, height: h, data } = img;
  const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const cellSums = new Map();
  const quadSums = [0, 0, 0, 0];
  const quadN = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      const l = lum(i);
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      const key = cy * Math.ceil(w / CELL) + cx;
      const cell = cellSums.get(key) ?? { sum: 0, n: 0 };
      cell.sum += l; cell.n++;
      cellSums.set(key, cell);
      const q = (y < h / 2 ? 0 : 2) + (x < w / 2 ? 0 : 1);
      quadSums[q] += l; quadN[q]++;
    }
  }
  let min = { lum: Infinity, cx: -1, cy: -1 };
  let darkCells = 0;
  for (const [key, { sum, n }] of cellSums) {
    const m = sum / n;
    if (m < min.lum) min = { lum: Math.round(m * 10) / 10, cx: key % Math.ceil(w / CELL), cy: Math.floor(key / Math.ceil(w / CELL)) };
    if (m < DARK_CELL_LUM) darkCells++;
  }
  return {
    minCell: min,
    darkCells,
    darkCellPx: darkCells * CELL * CELL,
    quadrants: quadSums.map((s, q) => Math.round((s / Math.max(1, quadN[q])) * 10) / 10),
  };
}

ensureBuild();
mkdirSync(OUT_DIR, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const result = { sizes: [] };

try {
  for (const size of SIZES) {
    const page = await browser.newPage({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.dpr,
    });
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(`[${size.label}] ${e}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${size.label}] ${m.text()}`); });
    try {
      await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=13`);
      await startRun(page);
      await page.evaluate(() => {
        window.__lf.god(true);
        window.__lf.setSuppressLevelUps(true); // keine Overlays im Prueffenster
        window.__lf.setTimeScale(8); // 60 Spiel-Sekunden in ~7.5 s Echtzeit
      });
      await page.waitForTimeout(300);
      const startShot = await page.screenshot();
      for (const keys of DIRECTIONS) {
        for (const k of keys) await page.keyboard.down(k);
        await page.waitForTimeout(PHASE_MS);
        for (const k of keys) await page.keyboard.up(k);
      }
      const endShot = await page.screenshot();
      const renderer = await page.evaluate(() => window.__lf.rendererInfo());
      const entry = {
        label: size.label,
        viewport: `${size.width}x${size.height}`,
        dpr: size.dpr,
        renderer: { context: renderer.context, renderer: renderer.renderer, vendor: renderer.vendor },
        start: { black: checkScreenshot(startShot), darkness: darknessScan(decodePng(startShot)) },
        end: { black: checkScreenshot(endShot), darkness: darknessScan(decodePng(endShot)) },
      };
      writeFileSync(join(OUT_DIR, `${STAMP}-${size.label}-start.png`), startShot);
      writeFileSync(join(OUT_DIR, `${STAMP}-${size.label}-end.png`), endShot);
      result.sizes.push(entry);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.stop();
}

// Befund reproduzierbar, wenn irgendein Shot eine reine Schwarz-Flaeche
// (>= MIN_REGION_PX) oder eine sehr dunkle Zellenflaeche (> 4 Zellen) zeigt —
// 4x4 Zellen (128px) sind laut Kalibrierung (m10-terrain-hole-guard K1:
// legitime Prop-Schatten < 135 px) kein Schatten mehr.
for (const s of result.sizes) {
  for (const phase of ["start", "end"]) {
    s[phase].repro = !s[phase].black.ok || s[phase].darkness.darkCells > 4;
  }
}
result.reproducible = result.sizes.some((s) => s.start.repro || s.end.repro);
result.rendererValid = result.sizes.length === SIZES.length &&
  !/swiftshader|llvmpipe|software/i.test(result.sizes.map((s) => s.renderer.renderer).join(", "));
result.jsErrors = errors;
result.passed = Boolean(result.sizes.length === SIZES.length && result.rendererValid && errors.length === 0);
writeFileSync(join(OUT_DIR, `${STAMP}-render-1280.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.sizes.map((s) => ({
  label: s.label,
  renderer: s.renderer.renderer,
  start: { maxRegion: s.start.black.maxRegion, ok: s.start.black.ok, minCell: s.start.darkness.minCell, darkCells: s.start.darkness.darkCells, quadrants: s.start.darkness.quadrants, repro: s.start.repro },
  end: { maxRegion: s.end.black.maxRegion, ok: s.end.black.ok, minCell: s.end.darkness.minCell, darkCells: s.end.darkness.darkCells, quadrants: s.end.darkness.quadrants, repro: s.end.repro },
})), null, 2));
console.log(`m10-render-1280: reproducible=${result.reproducible} rendererValid=${result.rendererValid} jsErrors=${errors.length} -> ${result.passed ? "OK" : "FAIL"}`);
process.exit(result.passed ? 0 : 1);
