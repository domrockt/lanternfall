#!/usr/bin/env node
// m10-icon-redraw #7149 (K1/K4): Beleg + Metriken fuer die 12 UI-Icons.
//
// Liest die Raster aus src/gfx/gen-icons.ts (AUTO-GENERIERT, einzige Quelle),
// schreibt je Lauf:
//   shots/m10-icon-redraw-<phase>-<key>.png   4x-nearest-Crop je Icon (HUD-BG)
//   shots/m10-icon-redraw-<phase>-sheet.png   Kontaktbogen aller 12 Icons (4x)
//   shots/m10-icon-redraw-<phase>.json        Kontrast-/Kanten-/Silhouetten-Metriken
//
// Aufruf: node scripts/m10-icon-redraw.mjs before|after
import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const phase = process.argv[2] ?? "before";
if (phase !== "before" && phase !== "after") {
  console.error("usage: node scripts/m10-icon-redraw.mjs before|after");
  process.exit(2);
}

// ── Palette aus src/palette.ts ──────────────────────────────────────────────
const PAL = [];
for (const m of readFileSync(join(ROOT, "src/palette.ts"), "utf8").matchAll(/0x([0-9a-fA-F]{6}),\s*\/\/\s*(\d+)/g)) {
  PAL[Number(m[2])] = Number.parseInt(m[1], 16);
}
if (PAL.length !== 32) throw new Error(`Palette: ${PAL.length} Farben, erwartet 32`);

const HUD_BG = 0x090c10;
const PANEL_BG = 0x101724;

// ── GEN_ICONS-Raster aus gen-icons.ts lesen ────────────────────────────────
const ts = readFileSync(join(ROOT, "src/gfx/gen-icons.ts"), "utf8");
const icons = {};
for (const m of ts.matchAll(/(\w+): \{ w: \d+, h: \d+, frames: \[\s*\[([^\]]*)\]/g)) {
  const rows = [...m[2].matchAll(/"([.0-9a-z]{16})"/g)].map((r) => r[1]);
  if (rows.length === 16) icons[m[1]] = rows;
}
const KEYS = [
  "weapon_ember", "weapon_flail", "weapon_frost", "weapon_lantern", "weapon_storm", "weapon_thorn",
  "passive_boots", "passive_tome", "passive_heart", "passive_charm", "passive_whetstone", "passive_hourglass",
];
for (const k of KEYS) if (!icons[k]) throw new Error(`Icon fehlt in gen-icons.ts: ${k}`);

// ── Metriken ───────────────────────────────────────────────────────────────
const srgbToLin = (c) => (c /= 255, c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luminance = (rgb) =>
  0.2126 * srgbToLin((rgb >> 16) & 255) + 0.7152 * srgbToLin((rgb >> 8) & 255) + 0.0722 * srgbToLin(rgb & 255);
const contrast = (l1, l2) => {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function metrics(key) {
  const rows = icons[key];
  const body = []; // opake Koerper-Pixel (ohne Kontur 0)
  let contour = 0;
  let offPalette = 0;
  for (const row of rows) {
    for (const ch of row) {
      if (ch === ".") continue;
      const idx = /[0-9a-z]/.test(ch) ? parseInt(ch, 36) : -1;
      if (idx < 0 || idx > 31) offPalette++;
      if (idx === 0) contour++;
      else body.push({ lum: luminance(PAL[idx]), idx });
    }
  }
  const bodyLums = body.map((p) => p.lum);
  const bodyMedian = median(bodyLums);
  // Silhouetten-Kanten: linker/rechter Rand der Form (Kontur + Koerper) je Zeile
  const left = [], right = [];
  for (const row of rows) {
    const chars = [...row];
    left.push(chars.findIndex((c) => c !== "."));
    right.push(chars.lastIndexOf(chars.find((c) => c !== ".")));
  }
  // Kantenglätte: >1-px-Spruenge und Alternationen (+1/-1-Zittern) an derlinken Kante
  let coarseSteps = 0, alternations = 0;
  const dL = [];
  for (let y = 1; y < 16; y++) {
    if (left[y] < 0 || left[y - 1] < 0) continue;
    dL.push(left[y] - left[y - 1]);
  }
  for (let i = 1; i < dL.length; i++) {
    if (Math.abs(dL[i]) > 1) coarseSteps++;
    if (dL[i] !== 0 && dL[i - 1] !== 0 && Math.sign(dL[i]) !== Math.sign(dL[i - 1])) alternations++;
  }
  // isolierte Koerper-Pixel (kein orthogonaler Koerper-Nachbar) = Pocken/Rauschen
  const isBody = (x, y) => {
    const ch = rows[y]?.[x];
    return ch !== undefined && ch !== "." && ch !== "0";
  };
  let isolated = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (!isBody(x, y)) continue;
      if (!isBody(x - 1, y) && !isBody(x + 1, y) && !isBody(x, y - 1) && !isBody(x, y + 1)) isolated++;
    }
  }
  // Materialvielfalt im Koerper (Kern-Form lesbar = >= 3 verschiedene Rampen)
  const materials = [...new Set(body.map((p) => p.idx))].sort((a, b) => a - b);
  return {
    bodyPixels: body.length,
    contourPixels: contour,
    offPalette,
    bodyMedianContrastHUD: +contrast(bodyMedian, luminance(HUD_BG)).toFixed(2),
    bodyMedianContrastPanel: +contrast(bodyMedian, luminance(PANEL_BG)).toFixed(2),
    edgeCoarseSteps: coarseSteps,
    edgeAlternations: alternations,
    isolatedBodyPixels: isolated,
    materialCount: materials.length,
    materials,
  };
}

// ── PNG-Writer (RGBA, Filter 0) ────────────────────────────────────────────
const CRC_TABLE = [...Array(256)].map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (tag, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(tag), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function writePng(path, w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = rgba[y * w + x];
      raw.set([r, g, b, a], y * (w * 4 + 1) + 1 + x * 4);
    }
  }
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]));
}
const px = (rgb) => [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255];

/** 16x16-Raster als 4x-nearest-Crop mit HUD-Hintergrund. */
function shot(rows, scale = 4, gap = 0, bg = HUD_BG) {
  const n = rows.length;
  const w = (16 * n + gap * (n - 1)) * scale;
  const h = 16 * scale;
  const out = Array.from({ length: w * h }, () => px(bg));
  for (let i = 0; i < n; i++) {
    const grid = rows[i];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const ch = grid[y][x];
        const col = ch === "." ? bg : PAL[parseInt(ch, 36)];
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const ox = (i * (16 + gap) + x) * scale + sx;
            out[(y * scale + sy) * w + ox] = px(col);
          }
        }
      }
    }
  }
  return { w, h, rgba: out };
}

// ── Ausgabe ────────────────────────────────────────────────────────────────
const outDir = join(ROOT, "shots");
mkdirSync(outDir, { recursive: true });
const report = { phase, generated: new Date().toISOString(), method: "4x-nearest, HUD-BG #090c10; Kontrast-Methode identisch tests/icon-contrast.test.ts", icons: {} };
for (const key of KEYS) {
  report.icons[key] = metrics(key);
  const { w, h, rgba } = shot([icons[key]]);
  writePng(join(outDir, `m10-icon-redraw-${phase}-${key}.png`), w, h, rgba);
}
const sheet = shot(KEYS.map((k) => icons[k]), 4, 2);
writePng(join(outDir, `m10-icon-redraw-${phase}-sheet.png`), sheet.w, sheet.h, sheet.rgba);

// Muss-Liste des art-directors (#7149): heart/charm/boots
report.mustFix = {
  passive_heart: "Muss: glatte Kurvenkante statt Zeilen-Alternation; Kerbe/Silhouette muss als einheitliche Herzform lesen",
  passive_charm: "Muss: mehrgliedrige Silhouette (Kette + Medaillon mit Kern-Form), bisher Blob mit Rand-Puenktchen",
  passive_boots: "Muss: klare Stiefel-Lesbarkeit (Schaft + Sohle + Spitze) statt schraegem Balken",
};
const jsonPath = join(outDir, `m10-icon-redraw-${phase}.json`);
writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
console.log(`wrote ${jsonPath} + ${KEYS.length} Crops + sheet (${phase})`);
for (const key of ["passive_heart", "passive_charm", "passive_boots"]) {
  const m = report.icons[key];
  console.log(key, JSON.stringify(m));
}
