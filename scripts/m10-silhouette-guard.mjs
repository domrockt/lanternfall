#!/usr/bin/env node
// M10-crowd-silhouette-guard (#10331): Ist-Verifikation der Chaos-Lesbarkeits-
// Metriken direkt am Spritesatz — OHNE Browser, OHNE flock (keine FPS-Messung).
//
// Misst dieselben harten Kennzahlen, die die gemergten Lanes als Zielwerte
// geliefert haben, und schreibt sie als Vorher-JSON (Beleg, keine Wunschwerte):
//
//   M1 Kontur      (docs/lanes/m10-chaos-silhouettes.md)  Rim-Band = Randpixel + 1 px innen;
//                  Luminanz-Differenz gegen dunkles Moor PAL 28 (L 34) / helles Moor PAL 31,
//                  Schwelle 40. Rim-Light %, Top-Light %, Randkontrast dunkel, unter Schwelle %.
//   M2 Elite-Rim   (docs/lanes/m10-elite-rim.md)          Randpixel des Elite-Rim-Frames zu 100 %
//                  Amber (PAL 20), beide Posen (Ruhe + Bob).
//   M3 Familien    (docs/lanes/m10-enemy-palette.md)      strongFamilies >= 5 ueber die
//                  500er-Chaos-Mischung (Palettenindex-Klassifikation, wie Test/Skript dort).
//   M4 Varianten   (docs/lanes/m10-crowd-variety.md + m10-crowd-variant-tone)  Frames 2/3 tragen
//                  den Variantenton: gleiche Silhouette, Pixel-Diff > 0, RGB-Distanz >= 60.
//   M5 Idle-Frames (docs/lanes/m10-enemy-idle-anim-r2.md)  30 Basis-Framesets a 4 Frames +
//                  30 Rim-Framesets a 2 Frames, 0 byte-identische Duplikate.
//   (M6 Tier-Dyes  (docs/lanes/m10-elite-tier-families.md) ELITE_TIER_DYES = [16,8,19,25,31],
//                  min. Tier-Zentroid-Distanz >= 30 — Kontrollmetrik.)
//
// Aufruf:
//   node --experimental-strip-types scripts/m10-silhouette-guard.mjs
// Ausgabe:
//   ~/games/.evidence/m10-crowd-silhouette-guard/m10-silhouette-guard-before.json
import { register } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

// ── Loader-Hooks: Phaser-Stub (nur Typos im Import-Pfad genutzt) + .ts-Auflösung ──
const hookSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "phaser") {
    return {
      url: "data:text/javascript,export default { BlendModes: { ADD: 1, NORMAL: 0 } };",
      format: "module",
      shortCircuit: true,
    };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\\.\\w+$/.test(specifier)) {
      return {
        url: new URL(specifier + ".ts", context.parentURL).href,
        format: "module-typescript",
        shortCircuit: true,
      };
    }
    throw err;
  }
}
`;
register("data:text/javascript," + encodeURIComponent(hookSrc), import.meta.url);

const { PAL } = await import(new URL("../src/palette.ts", import.meta.url));
const { ENEMY_LIST } = await import(new URL("../src/data/enemies.ts", import.meta.url));
const {
  enemySpriteFrames,
  enemyFrameGrids,
  eliteRimFrame,
  ELITE_RIM_COLOR,
  ELITE_RIM_FRAMES,
  ELITE_TIER_DYES,
} = await import(new URL("../src/gfx/enemySprites.ts", import.meta.url));

// ── Metric-Helfer (identisch zu tests/enemy-silhouette.test.ts / enemy-palette.test.ts) ──
const lum = (i) => {
  const c = PAL[i];
  return 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
};
const LUM_DARK = lum(28); // dunkles Moor
const LUM_LIGHT = lum(31); // helles Moor
const THRESHOLD = 40;

const isEdge = (g, x, y) => {
  const h = g.length, w = g[0].length;
  const filled = (a, b) => a >= 0 && a < w && b >= 0 && b < h && g[b][a] !== null;
  return filled(x, y) && (!filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1));
};

/** Rim-Band: Randpixel + 1 px innen (wie m10-chaos-silhouettes K1). */
function rimBand(g) {
  const h = g.length, w = g[0].length;
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (g[y][x] === null) continue;
      if (isEdge(g, x, y) ||
        (x > 0 && g[y][x - 1] !== null && isEdge(g, x - 1, y)) ||
        (x < w - 1 && g[y][x + 1] !== null && isEdge(g, x + 1, y)) ||
        (y > 0 && g[y - 1][x] !== null && isEdge(g, x, y - 1)) ||
        (y < h - 1 && g[y + 1][x] !== null && isEdge(g, x, y + 1))) out.push({ x, y, c: g[y][x] });
    }
  }
  return out;
}

function contourMetrics(g) {
  const h = g.length, w = g[0].length;
  const rim = rimBand(g);
  let rimLight = 0, below = 0, contrastSum = 0;
  for (const p of rim) {
    const l = lum(p.c);
    if (l >= 70) rimLight++;
    const c = l - LUM_DARK;
    contrastSum += c;
    if (c < THRESHOLD) below++;
  }
  let topPixels = 0, topLight = 0;
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h && g[y][x] === null) y++;
    if (y >= h) continue;
    topPixels++;
    if (lum(g[y][x]) >= 85) topLight++;
  }
  let edgePixels = 0, inkEdge = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isEdge(g, x, y)) { edgePixels++; if (g[y][x] === 0) inkEdge++; }
    }
  }
  return {
    rimLightPct: +(100 * rimLight / rim.length).toFixed(1),
    topLightPct: +(100 * topLight / topPixels).toFixed(1),
    edgeContrastDark: +(contrastSum / rim.length).toFixed(1),
    belowThresholdDarkPct: +(100 * below / rim.length).toFixed(1),
    inkEdgePct: +(100 * inkEdge / edgePixels).toFixed(1),
  };
}

const mean = (arr) => +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);

// ── M1: Kontur je Archetyp (Basis-Ruhepose, geschärft) ──
const contour = ENEMY_LIST.map((def, i) => ({
  id: def.id,
  ...contourMetrics(enemySpriteFrames(i)[0]),
}));
const contourMean = {
  rimLightPct: mean(contour.map((c) => c.rimLightPct)),
  topLightPct: mean(contour.map((c) => c.topLightPct)),
  edgeContrastDark: mean(contour.map((c) => c.edgeContrastDark)),
  belowThresholdDarkPct: mean(contour.map((c) => c.belowThresholdDarkPct)),
  minEdgeContrastDark: +Math.min(...contour.map((c) => c.edgeContrastDark)).toFixed(1),
};

// ── M2: Elite-Rim (beide Posen) ──
function amberEdgeShare(g) {
  const h = g.length, w = g[0].length;
  let edge = 0, amber = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isEdge(g, x, y)) { edge++; if (g[y][x] === ELITE_RIM_COLOR) amber++; }
    }
  }
  return +(amber / edge).toFixed(3);
}
const gridSig = (g) => JSON.stringify(g);
const px = (g) => g.flat().filter((c) => c !== null).length;

const eliteRim = ENEMY_LIST.map((def, i) => {
  const r0 = eliteRimFrame(i, 0);
  const r1 = eliteRimFrame(i, 1);
  let d = 0;
  const f0 = r0.flat(), f1 = r1.flat();
  for (let k = 0; k < f0.length; k++) if (f0[k] !== f1[k]) d++;
  return {
    id: def.id,
    amberEdgeSharePose0: amberEdgeShare(r0),
    amberEdgeSharePose1: amberEdgeShare(r1),
    pose0Pixels: px(r0),
    poseDiffPixels: d,
  };
});

// ── M6: Tier-Zentroid-Distanz (Koerperpixel der Rim-Frames, ohne 0/13/Amber) ──
const tierSum = Array.from({ length: 5 }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
ENEMY_LIST.forEach((def, i) => {
  const grid = eliteRimFrame(i, 0);
  for (const row of grid) {
    for (const c of row) {
      if (c === null || c === 0 || c === 13 || c === ELITE_RIM_COLOR) continue;
      const t = tierSum[def.tier];
      t.r += (PAL[c] >> 16) & 255; t.g += (PAL[c] >> 8) & 255; t.b += PAL[c] & 255; t.n++;
    }
  }
});
const centroids = tierSum.map((t) => [t.r / t.n, t.g / t.n, t.b / t.n]);
const centroidDist = (a, b) =>
  Math.round(Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) * 10) / 10;
const tierDistances = [];
for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) tierDistances.push(centroidDist(centroids[a], centroids[b]));
const minTierCentroidDist = Math.min(...tierDistances);

// ── M3: Familien über die 500er-Chaos-Mischung (m10-enemy-palette) ──
// Klassifikation über Palettenindex (identisch zu tests/enemy-palette.test.ts).
function family(c) {
  if (c <= 0) return "kontur";
  if (c <= 2) return "dunkel-neutral";
  if (c <= 7) return "blau";
  if (c <= 9) return "mittel-neutral";
  if (c <= 13) return "hell-neutral";
  if (c <= 19) return "glut-braun";
  if (c <= 22) return "gold";
  if (c <= 27) return "blut-rot";
  return "gruen";
}
const MIX = [
  ["bog_rat", 70], ["wisp", 40], ["mudling", 40], ["crow", 50], ["bogzombie", 40],
  ["toad", 20], ["skeleton", 40], ["bat", 50], ["ghoul", 30], ["witchling", 25],
  ["slime", 30], ["scarecrow", 10], ["wolf", 25], ["spider", 25], ["cultist", 15],
  ["golem", 10], ["bomber", 10], ["banshee", 10], ["knight", 5], ["wraith", 5],
  ["horror", 8], ["abom", 5],
];
const familyCounts = {};
let mixTotal = 0;
for (const [id, count] of MIX) {
  const i = ENEMY_LIST.findIndex((d) => d.id === id);
  if (i < 0) throw new Error(`MIX-Typ fehlt: ${id}`);
  for (const g of enemyFrameGrids(i)) {
    for (const row of g) {
      for (const c of row) {
        if (c === null) continue;
        familyCounts[family(c)] = (familyCounts[family(c)] ?? 0) + count;
        mixTotal += count;
      }
    }
  }
}
const familyShares = Object.fromEntries(
  Object.entries(familyCounts).map(([f, n]) => [f, +(100 * n / mixTotal).toFixed(1)]),
);
const strongFamilies = Object.entries(familyShares)
  .filter(([f, s]) => s >= 8 && f !== "kontur" && f !== "dunkel-neutral" && f !== "mittel-neutral")
  .map(([f]) => f).sort();

// ── M4: Varianten (Frames 2/3, crowd-variety + variant-tone) ──
// bog_rat/wisp/bogzombie: textures.ts rendert handgezeichnete 2-Frame-Sets —
// die generierten Varianten-Frames werden im Spiel nie gezeigt (wie in
// tests/crowd-variant-tone.test.ts ausgespart).
const HAND_DRAWN = new Set(["bog_rat", "wisp", "bogzombie"]);
const rgbDist = (a, b) => Math.round(Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) * 10) / 10;
function bodyMean(g) {
  const s = [0, 0, 0]; let n = 0;
  for (const row of g) for (const c of row) {
    if (c === null || c === 0 || c === 13) continue;
    s[0] += (PAL[c] >> 16) & 255; s[1] += (PAL[c] >> 8) & 255; s[2] += PAL[c] & 255; n++;
  }
  return [s[0] / n, s[1] / n, s[2] / n];
}
const silhouette = (g) => g.map((row) => row.map((p) => (p === null ? "." : "#")).join("")).join("\n");

const variants = ENEMY_LIST.filter((d) => !HAND_DRAWN.has(d.id)).map((def) => {
  const i = ENEMY_LIST.indexOf(def);
  const grids = enemyFrameGrids(i);
  const base = grids[0], varG = grids[2], genPose2 = enemySpriteFrames(i)[2], genPose3 = enemySpriteFrames(i)[3], varG3 = grids[3];
  const f0 = genPose2.flat(), f2 = varG.flat();
  let d = 0;
  for (let k = 0; k < f0.length; k++) if (f0[k] !== f2[k]) d++;
  let d3 = 0;
  const g0 = genPose3.flat(), g3 = varG3.flat();
  for (let k = 0; k < g0.length; k++) if (g0[k] !== g3[k]) d3++;
  return {
    id: def.id,
    frames: grids.length,
    // "gleiche Silhouette": Varianten-Frame 2/3 gegen die generierten Posen
    // (Vertrag aus tests/crowd-variant-tone.test.ts — nur Umfaerbung, gleiche Maske).
    silhouetteEqual: silhouette(genPose2) === silhouette(varG) && silhouette(genPose3) === silhouette(varG3),
    variantDiffPixels: d,
    variantDiffPixelsPose3: d3,
    bodyRgbDist: rgbDist(bodyMean(base), bodyMean(varG)),
  };
});

// ── M5: Idle-Framesets (Basis + Rim, 0 Duplikate) ──
const idle = ENEMY_LIST.map((def, i) => {
  const base = enemySpriteFrames(i);
  const rim0 = eliteRimFrame(i, 0);
  const rim1 = eliteRimFrame(i, 1);
  const sigs = base.map(gridSig);
  let dupPairs = 0;
  for (let a = 0; a < sigs.length; a++) for (let b = a + 1; b < sigs.length; b++) if (sigs[a] === sigs[b]) dupPairs++;
  const f0 = base[0].flat(), f1 = base[1].flat();
  let baseDiff = 0;
  for (let k = 0; k < f0.length; k++) if (f0[k] !== f1[k]) baseDiff++;
  return {
    id: def.id,
    baseFrames: base.length,
    baseDuplicatePairs: dupPairs,
    basePoseDiffPixels: baseDiff,
    rimFrames: 2,
    rimDuplicate: gridSig(rim0) === gridSig(rim1),
  };
});

// ── Bericht ──
const report = {
  generatedAt: new Date().toISOString(),
  commit: execSync("git rev-parse HEAD").toString().trim(),
  mode: "sprite-grids-headless (browserfrei, kein flock, keine FPS-Messung)",
  note: "Vorher-Beleg zu #10331: gepinnte Werte = Ist-Stand des gemergten main (Commit oben).",
  contour: { perType: contour, mean: contourMean },
  eliteRim: {
    colorIndex: ELITE_RIM_COLOR,
    minAmberEdgeShare: Math.min(...eliteRim.map((e) => e.amberEdgeSharePose0), ...eliteRim.map((e) => e.amberEdgeSharePose1)),
    perType: eliteRim,
  },
  tierDyes: { dyes: ELITE_TIER_DYES, minTierCentroidDist, tierDistances: tierDistances.map((d) => d) },
  families: { mixTotal, shares: familyShares, strongFamilies },
  variants: { handDrawnTypes: [...HAND_DRAWN], perType: variants, minBodyRgbDist: +Math.min(...variants.map((v) => v.bodyRgbDist)).toFixed(1) },
  idle: { perType: idle, baseFrameCounts: [...new Set(idle.map((x) => x.baseFrames))], rimFrameCounts: [...new Set(idle.map((x) => x.rimFrames))], rimFramesetLengths: [...new Set(Object.values(ELITE_RIM_FRAMES).map((f) => f.length))], totalDuplicatePairs: idle.reduce((a, b) => a + b.baseDuplicatePairs, 0), rimDuplicates: idle.filter((x) => x.rimDuplicate).map((x) => x.id) },
};

const outDir = `${homedir()}/games/.evidence/m10-crowd-silhouette-guard`;
mkdirSync(outDir, { recursive: true });
const out = `${outDir}/m10-silhouette-guard-before.json`;
writeFileSync(out, JSON.stringify(report, null, 2));

console.log("M1 Kontur  (Mittel):", contourMean);
console.log("M2 Elite-Rim: Farbe", ELITE_RIM_COLOR, "min Amber-Edge-Share", report.eliteRim.minAmberEdgeShare);
console.log("M6 Tier-Dyes:", ELITE_TIER_DYES, "min Zentroid-Distanz", minTierCentroidDist);
console.log("M3 Familien:", JSON.stringify(familyShares), "strongFamilies =", strongFamilies.length, strongFamilies.join(","));
console.log("M4 Varianten: Typen", variants.length, "min Body-RGB-Distanz", report.variants.minBodyRgbDist, "ungleiche Silhouetten:", variants.filter((v) => !v.silhouetteEqual).map((v) => `${v.id} (diff ${v.variantDiffPixels})`).join(",") || "-");
console.log("M5 Idle: Basis-Frames", report.idle.baseFrameCounts.join("/"), "Rim-Frames", report.idle.rimFrameCounts.join("/"), "Duplikate", report.idle.totalDuplicatePairs, "Rim-Duplikate", report.idle.rimDuplicates.length);
console.log("JSON:", out);
