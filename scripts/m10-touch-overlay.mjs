#!/usr/bin/env node
// m10-touch-overlay-crisp, Karte K1/K4: Ist-/Nachher-Messung des Touch-Overlays
// (Joystick-Ring, Thumb/Knauf, Pause-Knopf) bei 640x360@2 und 780x360@3.
//
// Synthetische TouchEvents (Touch/TouchEvent-Konstruktor) auf dem echten Canvas
// halten den Joystick sichtbar; je Profil zwei Samples:
//   dark : Ursprung abseits des Spielers (dunkles Spielfeld)
//   hot  : Ursprung nahe der Spielerlaterne (Lichten-Hotspot)
// Je Sample: 4x-nearest-Crops (Ring, Pause) + Pixelkennzahlen im Spielpixel-Raster:
//   scaleInteger        - Screenshot-px je Spielpixel ganzzahlig?
//   ringBandColor       - mittlere Ringband-Farbe (r 42..46 um Ursprung)
//   fieldColor          - Spielfeld-Farbe just ausserhalb (r 48..52)
//   contrast            - WCAG-Kontrast Ringband<->Spielfeld
//   ringBandDelta       - max. Kanaldiff der Ringfarbe dark<->hot (Alpha-Fill-Beleg)
//   edgeIntermediate    - Pixel an der Ring-Aussenkante, die weder Füll- noch
//                         Untergrundfarbe sind (weiche/AA-Kante, Soll: 0)
//   pause*              - dito fuer den Pause-Knopf (Balken<->Feld, Rand)
// Gates (VOR der Messung festgelegt, fuer before UND after verbindlich):
//   scaleInteger=true, ringBandDelta<=6, knobDelta<=6, Kontrast Ring/Knob/Balken
//   >= 3.0 (auch ueber Hotspot), edgeIntermediate=0, pause-Alphas >= 0.85.
// Aufruf: node scripts/m10-touch-overlay.mjs before   (bzw. after)
// Kein flock: Screenshot/JSON-Messung, keine FPS-/Echtzeitmessung.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

/** convert schreibt bis ~10 MB RGBA nach stdout — 1-MB-Default wuerde SIGTERM feuern. */
function conv(args, input) {
  return execFileSync("convert", args, { input: input && input.input !== undefined ? input.input : input, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

const TAG = String(process.argv[2] ?? "before");

const PROFILES = [
  { name: "640x360@2", viewport: { width: 640, height: 360 }, dpr: 2 },
  { name: "780x360@3", viewport: { width: 780, height: 360 }, dpr: 3 },
];

// Akzeptanzgrenzen (vor der Messung festgelegt):
const GATES = {
  scaleInteger: true,
  maxColorDeltaDarkVsHot: 6,
  minContrast: 3.0,
  maxEdgeIntermediate: 0,
  minAlpha: 0.85,
};

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

// --- Pixel-Analyse (Spielpixel-Raster aus dem Screenshot downtickn) ----------
function lum([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const l1 = lum(a);
  const l2 = lum(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
/** RGBA-Puffer -> Game-Pixelraster (jede n-te Screenshot-px-Spalte/Zeile). */
function gameGrid(buf, shotW, n, gw, gh, offX, offY) {
  const px = (x, y) => {
    const i = ((offY + y * n) * shotW + (offX + x * n)) * 4;
    return [buf[i], buf[i + 1], buf[i + 2]];
  };
  const grid = [];
  for (let y = 0; y < gh; y++) {
    const row = [];
    for (let x = 0; x < gw; x++) row.push(px(x, y));
    grid.push(row);
  }
  return grid;
}
function meanColor(pixels) {
  if (!pixels.length) return [0, 0, 0];
  const s = [0, 0, 0];
  for (const p of pixels) for (let i = 0; i < 3; i++) s[i] += p[i];
  return s.map((v) => Math.round(v / pixels.length));
}
function maxDelta(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}
/** Ringband-Pixel (Radialband um cx,cy) und Aussenkanten-Zwischenfarben. */
function ringStats(grid, cx, cy, rIn, rOut, edgeR, fieldColor) {
  const band = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      const r = Math.hypot(x - cx, y - cy);
      if (r >= rIn && r <= rOut) band.push(grid[y][x]);
    }
  }
  const bandColor = meanColor(band);
  const bandLum = lum(bandColor);
  const fieldLum = lum(fieldColor);
  let edgeIntermediate = 0;
  let edgeSamples = 0;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      const r = Math.round(Math.hypot(x - cx, y - cy));
      if (r < edgeR || r > edgeR + 2) continue;
      edgeSamples++;
      const l = lum(grid[y][x]) * 255;
      const fill = bandLum * 255;
      const bg = fieldLum * 255;
      if (Math.abs(l - fill) > 12 && Math.abs(l - bg) > 12) edgeIntermediate++;
    }
  }
  return { bandColor, contrast: contrast(bandColor, fieldColor), edgeIntermediate, edgeSamples };
}

// --- Touch-Helfer (echter TouchControls-Pfad ueber Canvas-Listener) ----------
async function fireTouch(page, type, id, x, y) {
  await page.evaluate(({ type, id, x, y }) => {
    const canvas = document.querySelector("canvas");
    const g = window.__game;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + (x / g.scale.width) * rect.width;
    const cy = rect.top + (y / g.scale.height) * rect.height;
    const t = new Touch({ identifier: id, target: canvas, clientX: cx, clientY: cy });
    const empty = type === "touchend" || type === "touchcancel";
    canvas.dispatchEvent(
      new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: empty ? [] : [t],
        targetTouches: empty ? [] : [t],
        changedTouches: [t],
      }),
    );
  }, { type, id, x, y });
}

async function overlayFacts(page) {
  return page.evaluate(() => {
    const g = window.__game;
    const ui = g.scene.getScene("ui");
    const t = ui.touch;
    const rect = g.canvas.getBoundingClientRect();
    const c = t?.stickContainer;
    const pc = t?.pauseContainer;
    const bg = t?.pauseBg;
    const bars = pc ? [pc.list[1], pc.list[2]] : [];
    return {
      view: {
        internalW: g.scale.width,
        internalH: g.scale.height,
        cssW: rect.width,
        cssH: rect.height,
        cssX: rect.left,
        cssY: rect.top,
        dpr: window.devicePixelRatio || 1,
      },
      stick: c ? { x: c.x, y: c.y, visible: c.visible } : null,
      knob: t?.knob ? { x: t.knob.x, y: t.knob.y } : null,
      pause: pc && bg
        ? {
            x: pc.x, y: pc.y, w: bg.width, h: bg.height,
            visible: pc.visible, fillAlpha: bg.fillAlpha, strokeAlpha: bg.strokeAlpha,
            bar1: { x: bars[0]?.x, fillAlpha: bars[0]?.fillAlpha },
            bar2: { x: bars[1]?.x, fillAlpha: bars[1]?.fillAlpha },
          }
        : null,
      safeInset: t?.safeInsetGame ? { ...t.safeInsetGame } : null,
    };
  });
}

// --- Messlauf ----------------------------------------------------------------
const report = { tag: TAG, gates: GATES, profiles: [], errors: [] };

try {
  for (const fmt of PROFILES) {
    const context = await browser.newContext({
      viewport: fmt.viewport,
      deviceScaleFactor: fmt.dpr,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(`${fmt.name}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") report.errors.push(`${fmt.name}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101`);
    await startRun(page);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__lf.god(true));

    const profile = { name: fmt.name, samples: {} };
    const samples = [
      { key: "dark", teleport: null, ox: Math.round(fmt.viewport.width * 0.22), oy: Math.round(fmt.viewport.height * 0.3) },
      { key: "hot", teleport: [1000, 1000], ox: Math.round(fmt.viewport.width / 2) - 60, oy: Math.round(fmt.viewport.height / 2) },
    ];

    for (const s of samples) {
      if (s.teleport) {
        await page.evaluate(({ x, y }) => window.__lf.teleport(x, y), { x: s.teleport[0], y: s.teleport[1] });
        await page.waitForTimeout(500);
      }
      await fireTouch(page, "touchstart", 7, s.ox, s.oy);
      await page.waitForTimeout(120);
      await fireTouch(page, "touchmove", 7, s.ox + 26, s.oy + 8);
      await page.waitForTimeout(300);

      const facts = await overlayFacts(page);
      const box = await page.locator("canvas").boundingBox();
      const n = (box.width * fmt.dpr) / facts.view.internalW; // Screenshot-px je Spielpixel
      const shotPng = await page.screenshot();

      // Crops: Ring (112x112 Spielpixel) + Pause (44x34) als 4x-nearest-PNGs.
      const suffix = `${fmt.name.replace(/[^0-9a-z]/gi, "")}-${s.key}`;
      const ringHalf = 56;
      const crops = {};
      const cropDef = (name, gx, gy, gw, gh) => ({
        name, gx, gy, gw, gh,
        png: `shots/m10-touch-overlay-${TAG}-${suffix}-${name}-4x.png`,
      });
      const defs = [
        cropDef("ring", s.ox - ringHalf, s.oy - ringHalf, ringHalf * 2, ringHalf * 2),
        cropDef("pause", facts.pause.x + facts.pause.w / 2 - 22, facts.pause.y + facts.pause.h / 2 - 17, 44, 34),
      ];
      for (const d of defs) {
        const png = await page.screenshot({
          clip: {
            x: box.x + d.gx * (box.width / facts.view.internalW),
            y: box.y + d.gy * (box.height / facts.view.internalH),
            width: (d.gw * box.width) / facts.view.internalW,
            height: (d.gh * box.height) / facts.view.internalH,
          },
        });
        conv(["png:-", "-filter", "point", "-resize", "400%", d.png], png);
        crops[d.name] = d.png;
      }

      // Rohpixel des Ring-Crops im Game-Raster auswerten (Full-Screenshot).
      const ringPngFull = await page.screenshot();
      const rgba = conv(["png:-", "-depth", "8", "rgba:-"], ringPngFull);
      const shotW = Math.round(box.width * fmt.dpr);
      const offX = Math.round(box.x * fmt.dpr);
      const offY = Math.round(box.y * fmt.dpr);
      const R = 56;
      const grid = gameGrid(rgba, shotW, Math.round(n), R * 2, R * 2, offX + Math.round((s.ox - R) * n), offY + Math.round((s.oy - R) * n));
      // Spielfeldfarbe: Ring ausserhalb (r 48..52):
      const fieldPx = [];
      const bandPx = [];
      const KX = R + 26, KY = R + 8; // Knauf-Position (Touchmove +26/+8)
      const knobPx = [];
      const knobFieldPx = [];
      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[0].length; x++) {
          const r = Math.hypot(x - R, y - R);
          if (r >= 48 && r <= 52) fieldPx.push(grid[y][x]);
          if (r >= 42 && r <= 46) bandPx.push(grid[y][x]);
          const kr = Math.hypot(x - KX, y - KY);
          if (kr <= 12) knobPx.push(grid[y][x]);
          if (kr >= 17 && kr <= 24) knobFieldPx.push(grid[y][x]);
        }
      }
      const fieldColor = meanColor(fieldPx);
      const ring = ringStats(grid, R, R, 42, 46, 47, fieldColor);
      const knobColor = meanColor(knobPx);
      const knobFieldColor = meanColor(knobFieldPx);

      // Pause-Crop im Game-Raster: Balken (boneLight) vs Feld rechts vom Knopf.
      const pauseRgba = conv(["png:-", "-depth", "8", "rgba:-"], await page.screenshot());
      const PW = 44, PH = 34;
      const pGrid = gameGrid(pauseRgba, shotW, Math.round(n), PW, PH, offX + Math.round((facts.pause.x - 7) * n), offY + Math.round((facts.pause.y - 8) * n));
      const pauseBarPx = [];
      const pauseBgPx = [];
      const pauseFieldPx = [];
      for (let y = 0; y < PH; y++) {
        for (let x = 0; x < PW; x++) {
          const lx = x - 7, ly = y - 8; // lokal im 30x18-Knopf
          const inBtn = lx >= 0 && lx < 30 && ly >= 0 && ly < 18;
          const inBar = inBtn && ly >= 4 && ly < 14 && ((lx >= 7 && lx < 11) || (lx >= 17 && lx < 21));
          if (inBar) pauseBarPx.push(pGrid[y][x]);
          else if (inBtn && ly > 1 && ly < 17 && lx > 1 && lx < 28) pauseBgPx.push(pGrid[y][x]);
          else if (!inBtn) pauseFieldPx.push(pGrid[y][x]);
        }
      }
      const pauseBarColor = meanColor(pauseBarPx);
      const pauseBgColor = meanColor(pauseBgPx);
      const pauseFieldColor = meanColor(pauseFieldPx);
      // Rand-Zwischenfarben am Knopf-Rand (Stroke 1px bei lx=0/29, ly=0/17):
      let pauseEdgeIntermediate = 0;
      let pauseEdgeSamples = 0;
      for (let y = 0; y < PH; y++) {
        for (let x = 0; x < PW; x++) {
          const lx = x - 7, ly = y - 8;
          const onEdge = (lx === 0 || lx === 29 || ly === 0 || ly === 17) && lx >= 0 && lx < 30 && ly >= 0 && ly < 18;
          if (!onEdge) continue;
          pauseEdgeSamples++;
          const l = lum(pGrid[y][x]) * 255;
          const bgL = lum(pauseBgColor) * 255;
          const fL = lum(pauseFieldColor) * 255;
          if (Math.abs(l - bgL) > 12 && Math.abs(l - fL) > 12) pauseEdgeIntermediate++;
        }
      }

      profile.samples[s.key] = {
        origin: { x: s.ox, y: s.oy },
        facts,
        pxPerGame: n,
        scaleInteger: Number.isInteger(Math.round(n * 1000) / 1000) && Math.abs(n - Math.round(n)) < 1e-6,
        crops,
        ringBandColor: ring.bandColor,
        fieldColor,
        ringContrast: Math.round(ring.contrast * 100) / 100,
        ringEdgeIntermediate: ring.edgeIntermediate,
        ringEdgeSamples: ring.edgeSamples,
        knobColor,
        knobFieldColor,
        knobContrast: Math.round(contrast(knobColor, knobFieldColor) * 100) / 100,
        pauseBarColor,
        pauseBgColor,
        pauseFieldColor,
        pauseBarContrast: Math.round(contrast(pauseBarColor, pauseFieldColor) * 100) / 100,
        pauseEdgeIntermediate,
        pauseEdgeSamples,
      };
      // Finger abmelden, damit das naechste Sample einen frischen Touchstart bekommt.
      await fireTouch(page, "touchend", 7, s.ox + 26, s.oy + 8);
      await page.waitForTimeout(150);
    }

    // Dark<->Hot-Vergleich (Alpha-Fill-Nachweis):
    const d = profile.samples.dark;
    const h = profile.samples.hot;
    profile.ringBandDeltaDarkVsHot = maxDelta(d.ringBandColor, h.ringBandColor);
    profile.knobDeltaDarkVsHot = maxDelta(d.knobColor, h.knobColor);
    profile.fieldBrightnessDeltaDarkVsHot = maxDelta(d.fieldColor, h.fieldColor);
    profile.pauseBgDeltaDarkVsHot = maxDelta(d.pauseBgColor, h.pauseBgColor);
    report.profiles.push(profile);
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

// Gate-Auswertung (verbindlich, gleich fuer before und after):
report.gateResults = report.profiles.map((p) => ({
  profile: p.name,
  scaleInteger: p.samples.dark.scaleInteger && p.samples.hot.scaleInteger,
  ringBandDeltaOk: p.ringBandDeltaDarkVsHot <= GATES.maxColorDeltaDarkVsHot,
  knobDeltaOk: p.knobDeltaDarkVsHot <= GATES.maxColorDeltaDarkVsHot,
  ringContrastOk: p.samples.dark.ringContrast >= GATES.minContrast && p.samples.hot.ringContrast >= GATES.minContrast,
  knobContrastOk: p.samples.dark.knobContrast >= GATES.minContrast && p.samples.hot.knobContrast >= GATES.minContrast,
  pauseBarContrastOk: p.samples.dark.pauseBarContrast >= GATES.minContrast,
  edgesOk: p.samples.dark.ringEdgeIntermediate <= GATES.maxEdgeIntermediate
    && p.samples.hot.ringEdgeIntermediate <= GATES.maxEdgeIntermediate
    && p.samples.dark.pauseEdgeIntermediate <= GATES.maxEdgeIntermediate,
  pauseAlphasOk: p.samples.dark.facts.pause.fillAlpha >= GATES.minAlpha
    && p.samples.dark.facts.pause.strokeAlpha >= GATES.minAlpha
    && p.samples.dark.facts.pause.bar1.fillAlpha >= GATES.minAlpha
    && p.samples.dark.facts.pause.bar2.fillAlpha >= GATES.minAlpha,
}));

const out = `shots/m10-touch-overlay-${TAG}.json`;
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`[m10-touch-overlay] ${out}`);
for (const g of report.gateResults) console.log(JSON.stringify(g));
console.log(JSON.stringify(report.profiles.map((p) => ({
  profile: p.name,
  ringDelta: p.ringBandDeltaDarkVsHot,
  knobDelta: p.knobDeltaDarkVsHot,
  ringContrastDark: p.samples.dark.ringContrast,
  ringContrastHot: p.samples.hot.ringContrast,
  edgeIntermediate: [p.samples.dark.ringEdgeIntermediate, p.samples.hot.ringEdgeIntermediate],
  pauseEdge: p.samples.dark.pauseEdgeIntermediate,
})), null, 1));
if (report.errors.length) console.log("ERRORS:", report.errors.slice(0, 5));
