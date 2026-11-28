// m10-icons-consistency (Board #320): Ist-Scan aller 18 UI-Icons.
//
// Restpunkte aus #320 nach m10-icon-contrast (Kontrast) und #7149 (heart/
// charm/boots redraw): (1) Kontur/Lichtkante wirkt "vereist" — uniforme
// 1-px-Rampen-Lichtbänder statt einfacher Kanten; (2) Evolution-Icons sollen
// prächtiger wirken als Basis-Waffen-Icons; (3) 16 px Lesbarkeit.
//
// Metrik (offline auf den GEN_ICONS-Rastern, Skalen-unabhängig):
//  - Kanten: Anteil Licht-/Schatten-Rampenpixel am Körper, Rim-Anteil
//    (Lichtpixel, die oben/links an Kontur oder Transparenz grenzen =
//    uniformes "Eis-Band"), Einzelpixel-Rauschen, Rampen-Stufen.
//  - Pracht: distinct body colors, Akzentpixel (Glow/Gold 13/20/21/22),
//    Kontur+Körper-Farben.
//  - Lesbarkeit 16px: Körperpixel, größter Zusammenhangskomponente-Anteil,
//    WCAG-Kontrast (Regression zu m10-icon-contrast, Grenze 3:1).
//  - 0 Off-Palette, binäres Alpha.
//
// Nutzung: node scripts/m10-icons-consistency.mjs --out shots/m10-icons-consistency-before.json --sheet shots/m10-icons-consistency-before-4x.png

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

// --- TS-Quellen minimal parsen (generierte Dateien, stabiles Format) ---
function parseHexList(path) {
  const txt = readFileSync(path, "utf8");
  const m = txt.match(/export const PAL = \[([\s\S]*?)\] as const;/);
  if (!m) throw new Error(`PAL nicht gefunden in ${path}`);
  return [...m[1].matchAll(/0x([0-9a-fA-F]{6})/g)].map((x) => parseInt(x[1], 16));
}

function parseGenIcons(path) {
  const txt = readFileSync(path, "utf8");
  const m = txt.match(/export const GEN_ICONS: Record<string, GenSprite> = (\{[\s\S]*\n\});/);
  if (!m) throw new Error(`GEN_ICONS nicht gefunden in ${path}`);
  let body = m[1];
  body = body.replace(/^(\s+)([A-Za-z_][A-Za-z0-9_]*):/gm, '$1"$2":');
  body = body.replace(/\b(w|h|frames):/g, '"$1":');
  body = body.replace(/,\s*(\])/g, "$1");
  body = body.replace(/,(\s*\})\s*$/, "$1");
  return JSON.parse(body);
}

function charIndex(ch) {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "z") return ch.charCodeAt(0) - 97 + 10;
  return -1;
}

// --- Rampen (Quelle: scripts/art/lib.py RAMPS/SHADE) ---
// base -> [shadow, mid, light]
const RAMPS = {
  29: [28, 29, 30], 30: [28, 30, 31], 31: [29, 31, 31],
  4: [2, 4, 6], 3: [1, 3, 5], 2: [1, 2, 3],
  5: [2, 5, 7], 6: [3, 6, 9], 7: [4, 7, 8], 8: [5, 8, 10], 9: [6, 9, 11],
  10: [8, 10, 11], 11: [9, 11, 12], 12: [10, 12, 13], 13: [10, 13, 13],
  15: [14, 15, 16], 16: [14, 16, 17], 18: [15, 18, 19], 19: [17, 19, 20],
  20: [16, 20, 21], 21: [17, 21, 22],
  23: [14, 23, 25], 24: [23, 24, 25], 25: [23, 25, 26], 26: [24, 26, 27],
};
const RAMP_OF = {}; // alle Töne -> base
for (const [b, [sh, mid, li]] of Object.entries(RAMPS)) {
  RAMP_OF[sh] = +b; RAMP_OF[mid] = +b; RAMP_OF[li] = +b;
}
// Licht-/Schattentöne nach SHADE-Semantik (lib.py): Licht = der li-Ton einer
// Rampe (ein Ton kann mid der eigenen und li der Nachbar-Rampe sein — dann
// zählt er als Licht, genau wie shade_edges ihn behandelt).
const LIGHT_TONES = new Set(Object.values(RAMPS).map(([sh, mid, li]) => li));
const SHADOW_TONES = new Set(Object.values(RAMPS).map(([sh]) => sh));
const ACCENTS = new Set([13, 20, 21, 22]); // Glow/Gold-Akzente

// --- WCAG ---
function srgbToLin(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(rgb) {
  return 0.2126 * srgbToLin((rgb >> 16) & 255) + 0.7152 * srgbToLin((rgb >> 8) & 255) + 0.0722 * srgbToLin(rgb & 255);
}
function contrast(l1, l2) {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// --- PNG (RGBA, kein Filter) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePng(path, w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

// --- Analyse ---
const PAL = parseHexList("src/palette.ts");
const GEN_ICONS = parseGenIcons("src/gfx/gen-icons.ts");
const BGS = { hud: 0x090c10, panel: 0x101724 };

const FAMILIES = [
  ["weapon", (k) => k.startsWith("weapon_")],
  ["passive", (k) => k.startsWith("passive_")],
  ["evo", (k) => k.startsWith("evo_")],
];

function analyze(key) {
  const rows = GEN_ICONS[key].frames[0];
  let offPalette = 0, softAlpha = 0, contour = 0, orphanContour = 0;
  let body = 0;
  const colors = new Map();
  let accents = 0;
  const rampTones = new Set(); // "base:tone"
  let lightPx = 0, shadowPx = 0, rimLight = 0;
  const cells = []; // grid cache
  const at = (x, y) => (x < 0 || y < 0 || x >= 16 || y >= 16 ? null : charIndex(rows[y][x]));
  const isBodyIdx = (i) => i !== null && i > 0;
  // largest connected component (4-neighb.) der Körperpixel
  const comp = Array.from({ length: 16 }, () => new Array(16).fill(-1));
  let bestComp = 0, nComps = 0;
  const bodyLums = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const ch = rows[y][x];
      if (ch === ".") continue;
      const idx = charIndex(ch);
      if (idx < 0 || idx >= PAL.length) { offPalette++; continue; }
      if (idx === 0) {
        contour++;
        // Kontur-Pixel ohne Körpernachbar (8-Nachbarn, da outline diagonal
        // arbeitet) = gerissene/lose Kontur
        if (![at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1),
              at(x - 1, y - 1), at(x + 1, y - 1), at(x - 1, y + 1), at(x + 1, y + 1)].some(isBodyIdx)) orphanContour++;
        continue;
      }
      body++;
      bodyLums.push(luminance(PAL[idx]));
      colors.set(idx, (colors.get(idx) ?? 0) + 1);
      if (ACCENTS.has(idx)) accents++;
      const b = RAMP_OF[idx];
      if (b !== undefined) {
        rampTones.add(`${b}:${LIGHT_TONES.has(idx) ? "li" : SHADOW_TONES.has(idx) ? "sh" : "mid"}`);
        if (LIGHT_TONES.has(idx)) {
          lightPx++;
          // Rim: oben oder links liegt Kontur (0) oder Transparenz
          const up = at(x, y - 1), lf = at(x - 1, y);
          if (up === 0 || up === null || lf === 0 || lf === null) rimLight++;
        } else if (SHADOW_TONES.has(idx)) shadowPx++;
      }
      comp[y][x] = 0;
    }
  }
  // connected components
  const stack = [];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (comp[y][x] === 0) {
        nComps++;
        let size = 0;
        stack.push([x, y]);
        comp[y][x] = nComps;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          size++;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < 16 && ny < 16 && comp[ny][nx] === 0) {
              comp[ny][nx] = nComps;
              stack.push([nx, ny]);
            }
          }
        }
        if (size > bestComp) bestComp = size;
      }
  const bodyMed = median(bodyLums);
  const per = {};
  for (const [bg, hex] of Object.entries(BGS)) per[bg] = +contrast(bodyMed, luminance(hex)).toFixed(2);
  return {
    icon: key,
    offPalette,
    softAlpha,
    contourPixels: contour,
    orphanContourPixels: orphanContour,
    bodyPixels: body,
    distinctColors: colors.size,
    accentPixels: accents,
    rampTonesUsed: rampTones.size,
    lightShare: body ? +(lightPx / body).toFixed(3) : 0,
    shadowShare: body ? +(shadowPx / body).toFixed(3) : 0,
    rimShare: lightPx ? +(rimLight / lightPx).toFixed(3) : 0,
    components: nComps,
    largestComponentShare: body ? +(bestComp / body).toFixed(3) : 0,
    bodyMedianLuminance: +bodyMed.toFixed(4),
    contrast: per,
    worstContrast: Math.min(...Object.values(per)),
  };
}

const results = [];
for (const key of Object.keys(GEN_ICONS).sort()) results.push(analyze(key));

const fam = (prefix) => results.filter((r) => r.icon.startsWith(prefix));
const med = (arr) => median(arr);
const weaponColors = med(fam("weapon_").map((r) => r.distinctColors));
const evo = fam("evo_");
const evoColors = med(evo.map((r) => r.distinctColors));

const json = {
  tool: "scripts/m10-icons-consistency.mjs",
  card: "#320 (m9-art-fx-ui-03), Lane m10-icons-consistency",
  method: "Offline-Analyse der GEN_ICONS-Raster: Kanten-/Lichtkanten-Metrik, Pracht-Metrik, 16px-Lesbarkeit, WCAG-Kontrast (Regression).",
  thresholds: {
    offPalette: 0,
    softAlpha: 0,
    orphanContour: 0,
    worstContrastMin: 3, // Regression m10-icon-contrast
    rimShareMax: 0.9, // 1.0 = durchgehendes "Eis"-Lichtband (jeder Lichtpixel am Rand)
    evoDistinctMin: 4, // Evolution prächtiger: deutlich mehr Töne als Basis-Median
    largestComponentShareMin: 0.6, // eine dominante Silhouette, kein Splitterfeld
  },
  familyMedians: {
    weaponDistinctColors: weaponColors,
    evoDistinctColors: evoColors,
    evoOrnateAdvantage: +(evoColors - weaponColors).toFixed(2),
  },
  icons: results,
  summary: {
    total: results.length,
    offPalette: results.reduce((s, r) => s + r.offPalette, 0),
    softAlpha: results.reduce((s, r) => s + r.softAlpha, 0),
    orphanContour: results.reduce((s, r) => s + r.orphanContourPixels, 0),
    contrastFails: results.filter((r) => r.worstContrast < 3).map((r) => r.icon),
    icedCandidates: results.filter((r) => r.rimShare >= 0.9).map((r) => ({ icon: r.icon, rimShare: r.rimShare, lightShare: r.lightShare })),
    fragmented: results.filter((r) => r.largestComponentShare < 0.6).map((r) => ({ icon: r.icon, largestComponentShare: r.largestComponentShare, components: r.components })),
    evoNotOrnate: evo.filter((r) => r.distinctColors < Math.max(4, weaponColors)).map((r) => ({ icon: r.icon, distinctColors: r.distinctColors })),
  },
};

// --- 4x-Kontaktbogen (dunkler Moor-Hintergrund, 4x nearest, beschriftet) ---
const DIGITS = {
  0: ["111", "101", "101", "101", "111"], 1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"], 3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"], 5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"], 7: ["111", "001", "010", "010", "010"],
  8: ["111", "101", "111", "101", "111"], 9: ["111", "101", "111", "001", "111"],
  "-": ["000", "000", "111", "000", "000"], e: ["111", "100", "111", "100", "111"],
  v: ["101", "101", "101", "101", "010"], o: ["111", "101", "101", "101", "111"],
  w: ["101", "101", "101", "111", "101"], p: ["111", "101", "111", "100", "100"],
  a: ["010", "101", "111", "101", "101"], s: ["111", "100", "111", "001", "111"],
  i: ["010", "000", "010", "010", "010"], c: ["111", "100", "100", "100", "111"],
  n: ["101", "111", "111", "111", "101"], g: ["111", "101", "101", "111", "001"],
  b: ["111", "101", "111", "101", "111"], f: ["111", "100", "111", "100", "100"],
  x: ["000", "101", "010", "101", "000"], t: ["111", "010", "010", "010", "010"],
  r: ["111", "101", "111", "110", "101"], d: ["110", "101", "101", "101", "110"],
  k: ["101", "110", "100", "110", "101"], m: ["101", "111", "111", "101", "101"],
  u: ["101", "101", "101", "101", "111"], l: ["100", "100", "100", "100", "111"],
  h: ["101", "101", "111", "101", "101"], j: ["001", "001", "001", "101", "111"],
  q: ["010", "101", "101", "010", "001"], y: ["101", "101", "010", "010", "010"],
  z: ["111", "001", "010", "100", "111"], _: ["000", "000", "000", "000", "111"],
};

function contactSheet(path, scale) {
  const order = Object.keys(GEN_ICONS).sort();
  const COLS = 6;
  const rows = Math.ceil(order.length / COLS);
  const PAD = 4, LABEL_H = 6, CELL = 16 * scale;
  const w = COLS * (CELL + PAD) + PAD;
  const h = rows * (CELL + LABEL_H + PAD) + PAD + LABEL_H + 2;
  const BG = [0x17, 0x20, 0x2e]; // nightMid
  const FG = [0xd9, 0xdd, 0xcd]; // boneLight
  const img = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    img[i * 4] = BG[0]; img[i * 4 + 1] = BG[1]; img[i * 4 + 2] = BG[2]; img[i * 4 + 3] = 255;
  }
  const set = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 4;
    img[o] = (rgb >> 16) & 255; img[o + 1] = (rgb >> 8) & 255; img[o + 2] = rgb & 255; img[o + 3] = 255;
  };
  const drawText = (text, ox, oy) => {
    let cx = ox;
    for (const ch of text.toLowerCase()) {
      const g = DIGITS[ch];
      if (!g) { cx += 4; continue; }
      for (let gy = 0; gy < 5; gy++)
        for (let gx = 0; gx < 3; gx++)
          if (g[gy][gx] === "1") for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) set(cx + gx * scale + sx, oy + gy * scale + sy, 0x6b7c86);
      cx += 4 * scale;
    }
  };
  order.forEach((key, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const ox = PAD + col * (CELL + PAD);
    const oy = PAD + LABEL_H + row * (CELL + LABEL_H + PAD);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const ch = GEN_ICONS[key].frames[0][y][x];
        if (ch === ".") continue;
        const rgb = PAL[charIndex(ch)];
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++)
            set(ox + x * scale + sx, oy + y * scale + sy, rgb);
      }
    }
    drawText(key.replace(/^(weapon|passive|evo)_/, ""), ox, oy - LABEL_H - 1);
  });
  writePng(path, w, h, img);
  return { path, order, w, h };
}

writeFileSync(arg("out", "shots/m10-icons-consistency-before.json"), JSON.stringify(json, null, 2) + "\n");
const sheet = contactSheet(arg("sheet", "shots/m10-icons-consistency-before-4x.png"), 4);
console.log(JSON.stringify({ summary: json.summary, familyMedians: json.familyMedians, sheet }, null, 2));
