#!/usr/bin/env node
// M10 Terrain-Kanten-Scan (Logik-Ebene, kein Renderer/Canvas).
// Klassifiziert das Terrain-Feld über mehrere Seeds und misst Kanten-Fehlerklassen:
//
//  loch   — isolierte 1-px-Zellen (Art A, alle 8 Nachbarn != A): 1-px-Inseln/-Löcher
//  misch  — fraktionale Mischzellen: Klassifikation an Subpixel-Offsets (x+0.5/y+0.5)
//           weicht vom gemalten ganzzahligen Pixel ab (Spiel-Query vs. Renderzelle)
//  doppel — doppelte Kanten: angrenzende Zellen unterschiedlicher Art, deren BEIDE
//           Seiten je einen Saum malen (Autotile-Masken über echte normalizeBlob/
//           missingSides/cornerMask aus src/logic/autotile.ts, Saum-Gates wie tiles.ts)
//
// Aufruf (tiles.ts importiert intern ohne Endung -> einmalig bündeln, dann Node):
//   npx esbuild scripts/m10-terrain-edge.mjs --bundle --platform=node --format=esm \
//     --outfile=~/tmp/m10-terrain-edge-crisp/scan.bundle.mjs
//   node ~/tmp/m10-terrain-edge-crisp/scan.bundle.mjs shots/m10-terrain-edge-after.json
import { writeFileSync } from "node:fs";
import { terrainSampleAt } from "../src/gfx/tiles.ts";
import { blobMask, normalizeBlob } from "../src/logic/autotile.ts";

const SEEDS = [13, 7, 42];
const REGION = { x: 960, y: 960, w: 320, h: 320 };
const KINDS = ["grass", "path", "mud", "water"];
const codeOf = (k) => (k === "water" ? 3 : k === "mud" ? 2 : k === "path" ? 1 : 0);

// Saum-Gate je Zelle (Replikat der Painter-Entscheidung in tiles.ts, Logik-Ebene):
// path/mud malen einen Saum, sobald die normalisierte Blob-Maske nicht voll ist;
// Wasser malt Ufer, sobald ein 4-Nachbar Land ist; Gras malt nur Wasserbank.
const rimOf = (grid, x, y, w, h, kind) => {
  const mask = normalizeBlob(blobMask((dx, dy) => {
    const nx = x + dx, ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < w && ny < h && grid[ny * w + nx] === grid[y * w + x];
  }));
  if (kind === "path" || kind === "mud") return mask !== 0xff;
  if (kind === "water") {
    return (x > 0 && grid[y * w + x - 1] !== 3) || (x < w - 1 && grid[y * w + x + 1] !== 3) ||
      (y > 0 && grid[(y - 1) * w + x] !== 3) || (y < h - 1 && grid[(y + 1) * w + x] !== 3);
  }
  return false; // Gras: nur Ausfransung (hash-gegate) bzw. Wasserbank — kein material-eigener Saum
};

const result = { seeds: {}, region: REGION, generated: new Date().toISOString() };
let totCells = 0, totLoch = 0, totDoppel = 0, totMisch = 0, totMischSamples = 0;

for (const seed of SEEDS) {
  const { x: ox, y: oy, w, h } = REGION;
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      grid[y * w + x] = codeOf(terrainSampleAt(ox + x, oy + y, seed, 1920).kind);
    }
  }
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? grid[y * w + x] : -1);

  // 1) Löcher: isolierte 1-px-Zellen je Art.
  const loch = { grass: 0, path: 0, mud: 0, water: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = grid[y * w + x];
      let same = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) === k) same++;
      if (same === 1) loch[KINDS[k]]++;
    }
  }

  // 2) Doppelte Kanten: beide Seiten einer Artgrenze malen je einen eigenen Saum.
  const doppel = { "path|mud": 0, "path|water": 0, "mud|water": 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = grid[y * w + x];
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const b = at(x + dx, y + dy);
        if (b < 0 || a === b || a === 0 || b === 0) continue; // Gras = Übergangsseite, kein Doppelsaum
        const key = [Math.min(a, b), Math.max(a, b)].join("|");
        if (!(key in doppel)) continue;
        const ka = KINDS[a], kb = KINDS[b];
        if (rimOf(grid, x, y, w, h, ka) && rimOf(grid, x + dx, y + dy, w, h, kb)) doppel[key]++;
      }
    }
  }

  // 3) Fraktionale Mischzellen: Subpixel-Query weicht vom Pixel-Klassifikat ab.
  let misch = 0, samples = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const cell = grid[y * w + x];
      for (const [fx, fy] of [[0.5, 0.5], [0.9, 0.1], [0.1, 0.9]]) {
        samples++;
        if (codeOf(terrainSampleAt(ox + x + fx, oy + y + fy, seed, 1920).kind) !== cell) misch++;
      }
    }
  }

  const cells = w * h;
  const lochSum = loch.grass + loch.path + loch.mud + loch.water;
  const doppelSum = Object.values(doppel).reduce((a, b) => a + b, 0);
  result.seeds[seed] = {
    cells,
    loch,
    lochSum,
    doppel,
    doppelSum,
    mischSamples: samples,
    misch,
    mischRate: +(misch / samples).toFixed(5),
    edgeErrorRate: +((lochSum + doppelSum) / cells).toFixed(6),
  };
  totCells += cells; totLoch += lochSum; totDoppel += doppelSum;
  totMisch += misch; totMischSamples += samples;
}

result.total = {
  cells: totCells,
  loch: totLoch,
  doppel: totDoppel,
  edgeErrorRate: +((totLoch + totDoppel) / totCells).toFixed(6),
  mischSamples: totMischSamples,
  misch: totMisch,
  mischRate: +(totMisch / totMischSamples).toFixed(5),
};
const out = process.argv[2] ?? "shots/m10-terrain-edge-after.json";
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.total, null, 2));
console.log(`m10-terrain-edge: JSON -> ${out}`);
