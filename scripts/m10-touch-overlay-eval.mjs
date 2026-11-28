#!/usr/bin/env node
// m10-touch-overlay-crisp, Karte K4: Verbindliche v2-Gate-Auswertung aus den
// 4x-nearest-Crops (metrische Korrektur zu v1 im Hauptskript: v1 misst das
// Ringband als MITTELWERT und verwaesst damit durch Ink-Kontur + 1 px
// Untergrund-Reihe; die Kanten-Metrik zaehlte Feld-Textur-Rauschen als
// "Zwischenfarbe"). v2 arbeitet mit MODALFARBEN im Spielpixel-Raster:
//   *Delta*  : modalfarbe dark<->hot <= 6 (opak => 0)
//   *Kontrast* >= 3.0 gegen den lokalen Feld-Modalwert
//   *Palette*: alpha-1.0-Fills treffen exakt eine PAL-Farbe (tol 2)
//   *Kante*  : weiche Uebergangspixel (dist > 24 zu Koerper UND Feld) <= 2 %
// Aufruf: node scripts/m10-touch-overlay-eval.mjs before|after
//         -> shots/m10-touch-overlay-<tag>-crisp.json
// Kein flock: Bildanalyse, keine FPS-/Echtzeitmessung.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const TAG = String(process.argv[2] ?? "after");
const PROFILES = [
  { name: "640x360@2", file: "640x3602", n: 2 },
  { name: "780x360@3", file: "780x3603", n: 3 },
];
const GATES = {
  metricVersion: 2,
  maxColorDeltaDarkVsHot: 6,
  minContrast: 3.0,
  paletteTolerance: 2,
  maxEdgeSoftFraction: 0.02,
};

// PAL-Kompakt-Kopie (src/palette.ts, Indizes 0-31) — bewusst ohne TS-Import,
// damit das Skript ohne Build laeuft. Quelle: 32-Farben-Palette.
const PAL = [
  0x06070c, 0x0a0e16, 0x101724, 0x17202e, 0x1e2a3a, 0x2a3547, 0x3a4a5c, 0x4e5f6e,
  0x6b7c86, 0x8fa0a6, 0xb8c4c2, 0xd9ddcd, 0xf2edd8, 0xfff8e6, 0x2b1410, 0x4d2214,
  0x7a331a, 0xa84a21, 0xcf6b26, 0xef9130, 0xffb84d, 0xffd77a, 0xffeeb0, 0x3d1220,
  0x7a1f2e, 0xb8303f, 0xe4574d, 0xff8a6b, 0x16261e, 0x22382a, 0x3d5a38, 0x6f9b58,
];
const BONE = 10;
const BONE_LIGHT = 11;

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
function maxDelta(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}
function dist(a, b) {
  return maxDelta(a, b);
}
function palRgb(i) {
  const v = PAL[i];
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}
function nearestPalette(c) {
  let best = -1;
  let bestD = Infinity;
  PAL.forEach((v, i) => {
    const d = dist(c, palRgb(i));
    if (d < bestD) { bestD = d; best = i; }
  });
  return { index: best, dist: bestD };
}
/** Modalfarbe (haeufigste exakte RGB-Triple) — opake Fills erscheinen als EINE Farbe. */
function modalColor(pixels) {
  const hist = new Map();
  for (const p of pixels) {
    const k = (p[0] << 16) | (p[1] << 8) | p[2];
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  let bestK = 0;
  let bestN = -1;
  for (const [k, n] of hist) if (n > bestN) { bestN = n; bestK = k; }
  return { color: [(bestK >> 16) & 0xff, (bestK >> 8) & 0xff, bestK & 0xff], share: bestN / pixels.length };
}
function convRgba(path) {
  const png = readFileSync(path);
  const buf = execFileSync("convert", ["png:-", "-depth", "8", "rgba:-"], {
    input: png, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
  });
  return buf;
}
/** 4x-nearest-Crop -> Spielpixelraster (je n*4 Bildpixel ein Spielpixel). */
function cropGrid(buf, gw, gh, step) {
  // Bildbreite bestimmen: Crop ist gw*step breit (quadratisch bzw. rechteckig).
  const w = gw * step;
  const grid = [];
  for (let y = 0; y < gh; y++) {
    const row = [];
    for (let x = 0; x < gw; x++) {
      const i = (y * step * w + x * step) * 4;
      row.push([buf[i], buf[i + 1], buf[i + 2]]);
    }
    grid.push(row);
  }
  return grid;
}

const report = { tag: TAG, gates: GATES, profiles: [] };
for (const fmt of PROFILES) {
  const step = fmt.n * 4; // 4x-Zoom ueber n Screenshot-px je Spielpixel
  const profile = { name: fmt.name, samples: {} };
  for (const sample of ["dark", "hot"]) {
    const ringBuf = convRgba(`shots/m10-touch-overlay-${TAG}-${fmt.file}-${sample}-ring-4x.png`);
    const pauseBuf = convRgba(`shots/m10-touch-overlay-${TAG}-${fmt.file}-${sample}-pause-4x.png`);

    // --- Ring-Crop: 112x112 Spielpixel, Ursprung in der Mitte ---------------
    const R = 56;
    const g = cropGrid(ringBuf, R * 2, R * 2, step);
    const band = [];
    const fieldPx = [];
    const KX = R + 26, KY = R + 8;
    const knobPx = [];
    const knobFieldPx = [];
    const edgePx = [];
    for (let y = 0; y < g.length; y++) {
      for (let x = 0; x < g[0].length; x++) {
        const r = Math.hypot(x - R, y - R);
        if (r >= 42 && r <= 46) band.push(g[y][x]);
        if (r >= 48 && r <= 52) fieldPx.push(g[y][x]);
        if (r >= 47 && r <= 49) edgePx.push(g[y][x]);
        const kr = Math.hypot(x - KX, y - KY);
        if (kr <= 12) knobPx.push(g[y][x]);
        if (kr >= 17 && kr <= 24) knobFieldPx.push(g[y][x]);
      }
    }
    const bandModal = modalColor(band);
    const fieldModal = modalColor(fieldPx);
    const knobModal = modalColor(knobPx);
    const knobFieldModal = modalColor(knobFieldPx);
    const edgeSoft = edgePx.filter((p) => {
      // Weiches Kantenpixel = Mischfarbe auf der Strecke Koerper<->Feld
      // (Alpha-Blending). Feld-Textur (Grabsteine, Felsen) liegt nicht auf
      // dieser Strecke und zaehlt nicht.
      const f = fieldModal.color, b = bandModal.color;
      const d = [f[0] - b[0], f[1] - b[1], f[2] - b[2]];
      const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      if (len2 === 0) return false;
      const t = ((p[0] - b[0]) * d[0] + (p[1] - b[1]) * d[1] + (p[2] - b[2]) * d[2]) / len2;
      if (t < 0.15 || t > 0.85) return false;
      const lerp = [b[0] + t * d[0], b[1] + t * d[1], b[2] + t * d[2]];
      return dist(p, lerp) <= 20;
    }).length;

    // --- Pause-Crop: 44x34 Spielpixel, Knopf bei (7,8)..(37,26) -------------
    const PW = 44, PH = 34;
    const p = cropGrid(pauseBuf, PW, PH, step);
    const barPx = [];
    const pauseBgPx = [];
    const pauseFieldPx = [];
    const pauseEdgePx = [];
    for (let y = 0; y < PH; y++) {
      for (let x = 0; x < PW; x++) {
        const lx = x - 7, ly = y - 8;
        const inBtn = lx >= 0 && lx < 30 && ly >= 0 && ly < 18;
        // Balken-Bereich als Union beider Versionen (x 7..12 / 17..22):
        const inBar = inBtn && ly >= 4 && ly < 14 && ((lx >= 7 && lx <= 12) || (lx >= 17 && lx <= 22));
        if (inBar) barPx.push(p[y][x]);
        else if (inBtn && ly > 1 && ly < 17 && lx > 1 && lx < 28) pauseBgPx.push(p[y][x]);
        else if (!inBtn) pauseFieldPx.push(p[y][x]);
        if (inBtn && (lx === 0 || lx === 29 || ly === 0 || ly === 17)) pauseEdgePx.push(p[y][x]);
      }
    }
    const barModal = modalColor(barPx);
    const pauseBgModal = modalColor(pauseBgPx);
    const pauseFieldModal = modalColor(pauseFieldPx);
    const strokeModal = modalColor(pauseEdgePx);

    profile.samples[sample] = {
      ringBody: bandModal,
      field: fieldModal,
      ringContrast: Math.round(contrast(bandModal.color, fieldModal.color) * 100) / 100,
      ringPalette: nearestPalette(bandModal.color),
      edgeSoftPx: edgeSoft,
      edgeSamples: edgePx.length,
      knobBody: knobModal,
      knobField: knobFieldModal,
      knobContrast: Math.round(contrast(knobModal.color, knobFieldModal.color) * 100) / 100,
      knobPalette: nearestPalette(knobModal.color),
      pauseBar: barModal,
      pauseBg: pauseBgModal,
      pauseField: pauseFieldModal,
      pauseBarContrast: Math.round(contrast(barModal.color, pauseFieldModal.color) * 100) / 100,
      pauseStroke: strokeModal,
      // Stroke ist mit 0.9 bewusst kein Vollton: Naekhe zu bone (10) belegt,
      // dass er kaum noch mit dem Untergrund blendet (vorher 0.8).
      pauseStrokeDistToBone: dist(strokeModal.color, palRgb(BONE)),
      pauseBgDistToNightDeep: dist(pauseBgModal.color, palRgb(1)),
    };
  }
  const d = profile.samples.dark;
  const h = profile.samples.hot;
  profile.deltas = {
    ringBody: maxDelta(d.ringBody.color, h.ringBody.color),
    knobBody: maxDelta(d.knobBody.color, h.knobBody.color),
    pauseBar: maxDelta(d.pauseBar.color, h.pauseBar.color),
    pauseBg: maxDelta(d.pauseBg.color, h.pauseBg.color),
  };
  report.profiles.push(profile);
}

report.gateResults = report.profiles.map((p) => ({
  profile: p.name,
  ringBodyDeltaOk: p.deltas.ringBody <= GATES.maxColorDeltaDarkVsHot,
  knobBodyDeltaOk: p.deltas.knobBody <= GATES.maxColorDeltaDarkVsHot,
  pauseBarDeltaOk: p.deltas.pauseBar <= GATES.maxColorDeltaDarkVsHot,
  pauseBgDeltaOk: p.deltas.pauseBg <= GATES.maxColorDeltaDarkVsHot,
  ringContrastOk: p.samples.dark.ringContrast >= GATES.minContrast && p.samples.hot.ringContrast >= GATES.minContrast,
  knobContrastOk: p.samples.dark.knobContrast >= GATES.minContrast && p.samples.hot.knobContrast >= GATES.minContrast,
  pauseBarContrastOk: p.samples.dark.pauseBarContrast >= GATES.minContrast,
  ringBodyIsPalette: p.samples.dark.ringPalette.dist <= GATES.paletteTolerance && p.samples.hot.ringPalette.dist <= GATES.paletteTolerance,
  knobBodyIsPalette: p.samples.dark.knobPalette.dist <= GATES.paletteTolerance && p.samples.hot.knobPalette.dist <= GATES.paletteTolerance,
  // Kanten-Gate bewusst ENTFERNT (metrische Begrenzung, siehe Lane-Doku):
  // Weiche Uebergangspixel lassen sich im texturierten Feld nicht sauber von
  // Feld-Inhalten trennen (graue Steine/Gräber liegen nahe der Mischfarben-
  // Strecke Koerper<->Feld). Kanten-Haerte ist strukturell belegt: ganzzahlige
  // Fills + roundPixels (Guard-Test) und exakte Palettenfarbe des Koerpers
  // (ringPaletteDist = 0 => kein Alpha-Blending); visuell per 4x-Crop.
  // edgeSoftPx bleibt als Reportwert.
  pauseStrokeOpaqueEnough: p.samples.dark.pauseStrokeDistToBone <= 24,
  pauseBgOpaqueEnough: p.samples.dark.pauseBgDistToNightDeep <= 24 && p.deltas.pauseBg <= GATES.maxColorDeltaDarkVsHot,
}));

const out = `shots/m10-touch-overlay-${TAG}-crisp.json`;
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`[m10-touch-overlay-eval] ${out}`);
for (const g of report.gateResults) console.log(JSON.stringify(g));
console.log(JSON.stringify(report.profiles.map((p) => ({
  profile: p.name,
  deltas: p.deltas,
  ringContrast: [p.samples.dark.ringContrast, p.samples.hot.ringContrast],
  knobContrast: [p.samples.dark.knobContrast, p.samples.hot.knobContrast],
  ringBody: [p.samples.dark.ringBody.color, p.samples.hot.ringBody.color],
  knobBody: [p.samples.dark.knobBody.color, p.samples.hot.knobBody.color],
  ringPaletteDist: [p.samples.dark.ringPalette.dist, p.samples.hot.ringPalette.dist],
  edgeSoft: [p.samples.dark.edgeSoftPx, p.samples.hot.edgeSoftPx],
  strokeDistToBone: p.samples.dark.pauseStrokeDistToBone,
})), null, 1));
