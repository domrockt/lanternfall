// m10-icon-contrast #1: Körperkontrast aller UI-Icons gegen HUD-/Panel-Hintergrund.
//
// Methode (wie Vor-Lane m10-menu-art-crisp, F2/F3): WCAG-Kontrast des Icon-Körpers
// (Median-Luminanz aller opaken Pixel OHNE die 1-px-ink-Kontur, Index 0) gegen die
// Luminanz des Hintergrunds; Grenzwert 3:1. Offline auf den GEN_ICONS-Rastern —
// die Texturen werden mit binärem Alpha und Nearest-Neighbor ganzzahlig gezeichnet,
// daher ist das Rastermaß identisch zum gerenderten Ergebnis (Skalen-unabhängig).
//
// Hintergründe (Befund Vor-Lane): HUD #090c10, Build-Panel #101724 (night).
//
// Nutzung: node scripts/m10-icon-contrast.mjs --out shots/m10-icon-contrast-before.json
//          [--zoom shots/m10-icon-contrast-before-zoom.png] [--icons boots,tome,...]
// Ohne --icons werden für den Zoom automatisch alle Icons < 3:1 (schlechtester bg) genommen.

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
  // Keys ohne Anführungszeichen → JSON: "  passive_boots: {" → "  "passive_boots": {"
  body = body.replace(/^(\s+)([A-Za-z_][A-Za-z0-9_]*):/gm, '$1"$2":');
  body = body.replace(/\b(w|h|frames):/g, '"$1":');
  body = body.replace(/,\s*(\])/g, "$1");
  body = body.replace(/,(\s*\})\s*$/, "$1"); // Komma vor der schließenden äußeren Klammer
  return JSON.parse(body);
}

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
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function charIndex(ch) {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "z") return ch.charCodeAt(0) - 97 + 10;
  return -1;
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
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

// --- Analyse ---
const PAL = parseHexList("src/palette.ts");
const GEN_ICONS = parseGenIcons("src/gfx/gen-icons.ts");
const BGS = {
  hud: { hex: 0x090c10, label: "HUD #090c10" },
  panel: { hex: 0x101724, label: "Panel #101724 (night)" },
};

const keys = Object.keys(GEN_ICONS).filter((k) => k.startsWith("weapon_") || k.startsWith("passive_")).sort();
const results = [];
for (const key of keys) {
  const rows = GEN_ICONS[key].frames[0];
  const bodyLums = [];
  const bodyColors = new Map();
  let contour = 0;
  let offPalette = 0;
  let softAlpha = 0; // Raster ist per Konstruktion binär: '.'=transparent, sonst opak
  for (const row of rows) {
    for (const ch of row) {
      if (ch === ".") continue;
      const idx = charIndex(ch);
      if (idx < 0 || idx >= PAL.length) { offPalette++; continue; }
      if (idx === 0) { contour++; continue; } // 1-px-ink-Kontur ausgenommen
      const rgb = PAL[idx];
      bodyLums.push(luminance(rgb));
      bodyColors.set(rgb, (bodyColors.get(rgb) ?? 0) + 1);
    }
  }
  const bodyMed = median(bodyLums);
  const darkest = [...bodyColors.entries()].sort((a, b) => luminance(a[0]) - luminance(b[0]))[0]?.[0] ?? null;
  const per = {};
  for (const [bg, def] of Object.entries(BGS)) per[bg] = +contrast(bodyMed, luminance(def.hex)).toFixed(2);
  const worst = Math.min(...Object.values(per));
  results.push({
    icon: key,
    bodyPixels: bodyLums.length,
    contourPixels: contour,
    bodyMedianLuminance: +bodyMed.toFixed(4),
    darkestBodyColor: darkest == null ? null : "#" + darkest.toString(16).padStart(6, "0"),
    contrast: per,
    worstContrast: worst,
    pass: worst >= 3,
    offPalette,
    softAlpha,
  });
}

const fails = results.filter((r) => !r.pass);
const json = {
  tool: "scripts/m10-icon-contrast.mjs",
  method: "WCAG-Kontrast, Median-Luminanz des Icon-Körpers (ohne 1-px-ink-Kontur Index 0), Grenzwert 3:1",
  backgrounds: BGS,
  thresholds: { minContrast: 3 },
  icons: results,
  summary: {
    total: results.length,
    fails: fails.length,
    failingIcons: fails.map((r) => ({ icon: r.icon, contrast: r.contrast, worst: r.worstContrast })),
  },
};
writeFileSync(arg("out", "shots/m10-icon-contrast-before.json"), JSON.stringify(json, null, 2) + "\n");

// --- Zoom-Sheet: Icons 8x nearest auf beiden Hintergründen ---
function zoomSheet(icons, path) {
  if (!icons.length) return;
  const S = 8;
  const w = icons.length * 16 * S;
  const h = 2 * 16 * S;
  const img = Buffer.alloc(w * h * 4);
  const bgs = [BGS.hud.hex, BGS.panel.hex];
  for (let ry = 0; ry < h; ry++) {
    for (let rx = 0; rx < w; rx++) {
      const bg = bgs[Math.floor(ry / (16 * S))];
      const ix = Math.floor(rx / S);
      const icon = icons[Math.floor(ix / 16)];
      const px = ix % 16;
      const py = Math.floor(ry / S) % 16;
      const ch = GEN_ICONS[icon].frames[0][py][px];
      const idx = ch === "." ? -1 : charIndex(ch);
      const rgb = idx < 0 ? bg : PAL[idx];
      const o = (ry * w + rx) * 4;
      img[o] = (rgb >> 16) & 255;
      img[o + 1] = (rgb >> 8) & 255;
      img[o + 2] = rgb & 255;
      img[o + 3] = 255;
    }
  }
  writePng(path, w, h, img);
}

const zoomArg = arg("zoom", null);
if (zoomArg) {
  let list = arg("icons", null);
  let icons = list
    ? list.split(",").map((s) => (s.includes("_") ? s : `passive_${s}`))
    : fails.map((r) => r.icon);
  icons = icons.filter((k) => GEN_ICONS[k]);
  zoomSheet(icons, zoomArg);
  console.log(`zoom-sheet: ${zoomArg} (${icons.join(", ")})`);
}

console.log(JSON.stringify(json.summary, null, 2));
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"} ${r.icon.padEnd(22)} hud=${r.contrast.hud.toFixed(2).padStart(6)} panel=${r.contrast.panel.toFixed(2).padStart(6)}  dunkelste=${r.darkestBodyColor}`);
}
