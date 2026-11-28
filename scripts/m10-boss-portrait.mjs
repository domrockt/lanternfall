#!/usr/bin/env node
/**
 * M10-boss-portrait-crisp: Kontaktbögen + Zeichen-Qualitäts-Metriken für die 6 Bosse.
 *
 * Liest src/gfx/gen-bosses.ts (AUTO-GENERIERT von scripts/art/gen_bosses.py) als
 * Quelle der Wahrheit und erzeugt:
 *   shots/m10-boss-portrait-<tag>-<boss>.png  (je Boss: 3 Frames bei 1x und 4x, nearest)
 *   shots/m10-boss-portrait-<tag>-all.png     (Übersicht, alle 6 bei 4x)
 *   shots/m10-boss-portrait-<tag>.json        (Metriken je Boss)
 *
 * Metriken (Nur-Lesen, keine Spiellogik):
 *   offPalette         – Pixel, deren Char kein gültiger Palettenindex 0-31 ist
 *   silhouetteContrast – p75 der Luminanz-Differenz gefüllter Pixel vs. Nacht-Hintergrund PAL[2]
 *   edgeContrast       – mittlere |dL| zwischen horizontal benachbarten gefüllten Pixeln (Lichtkanten)
 *   duplicateFrames    – Anzahl Frame-Dubletten je Boss
 *
 * Aufruf: node scripts/m10-boss-portrait.mjs --tag before|after
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SHOTS = path.join(ROOT, "shots");

const argTag = process.argv.includes("--tag")
  ? process.argv[process.argv.indexOf("--tag") + 1]
  : "before";

// ── Palette aus src/palette.ts lesen (bleibt automatisch synchron) ──────────
const palSrc = readFileSync(path.join(ROOT, "src/palette.ts"), "utf8");
const PAL = [...palSrc.matchAll(/0x([0-9a-fA-F]{6})/g)].map((m) => m[1]);
if (PAL.length !== 32) throw new Error(`Palette: ${PAL.length} Farben statt 32`);
const rgb = (i) => [parseInt(PAL[i].slice(0, 2), 16), parseInt(PAL[i].slice(2, 4), 16), parseInt(PAL[i].slice(4, 6), 16)];
const lum = (i) => {
  const [r, g, b] = rgb(i);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// ── gen-bosses.ts parsen ────────────────────────────────────────────────────
const src = readFileSync(path.join(ROOT, "src/gfx/gen-bosses.ts"), "utf8");
const sprites = {};
const re = /boss_([a-z_]+):\s*\{\s*w:\s*(\d+),\s*h:\s*(\d+),\s*frames:\s*\[([\s\S]*?)\]\s*\}/g;
for (const m of src.matchAll(re)) {
  const [, id, w, h, body] = m;
  const rows = [...body.matchAll(/"([^"]*)"/g)].map((r) => r[1]);
  const h2 = Number(h), w2 = Number(w);
  if (rows.length % h2 !== 0) throw new Error(`boss_${id}: ${rows.length} Zeilen, kein Vielfaches von h=${h2}`);
  const frames = [];
  for (let f = 0; f < rows.length / h2; f++) frames.push(rows.slice(f * h2, (f + 1) * h2));
  sprites[`boss_${id}`] = { w: w2, h: h2, frames };
}
const IDS = Object.keys(sprites);
if (IDS.length !== 6) throw new Error(`${IDS.length} Bosse statt 6: ${IDS.join(",")}`);

// ── Metriken ────────────────────────────────────────────────────────────────
const BG = 2; // night — Boss erscheint nachts auf dunklem Grund
const pctile = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

function metrics(id) {
  const sp = sprites[id];
  let offPalette = 0;
  const lums = []; // Luminanz aller gefüllten Pixel (Frame 0)
  let edgeSum = 0, edgeN = 0;
  const sigs = sp.frames.map((f) => f.join("\n"));
  let duplicates = sigs.length - new Set(sigs).size;
  for (const [fi, frame] of sp.frames.entries()) {
    for (let y = 0; y < frame.length; y++) {
      for (let x = 0; x < frame[y].length; x++) {
        const ch = frame[y][x];
        let idx = -1;
        if (ch !== ".") {
          idx = parseInt(ch, 36);
          if (!Number.isInteger(idx) || idx < 0 || idx > 31) { offPalette++; continue; }
        }
        if (fi === 0 && ch !== ".") {
          lums.push(lum(idx));
          if (x + 1 < frame[y].length && frame[y][x + 1] !== ".") {
            const nb = parseInt(frame[y][x + 1], 36);
            if (Number.isInteger(nb) && nb <= 31) { edgeSum += Math.abs(lum(idx) - lum(nb)); edgeN++; }
          }
        }
      }
    }
  }
  const bgL = lum(BG);
  const diffs = lums.map((l) => Math.abs(l - bgL));
  return {
    id,
    size: `${sp.w}x${sp.h}`,
    frames: sp.frames.length,
    offPalette,
    duplicates,
    silhouetteContrast: Math.round(pctile(diffs, 0.75) * 10) / 10,
    edgeContrast: edgeN ? Math.round((edgeSum / edgeN) * 10) / 10 : 0,
    filledPixels: lums.length,
  };
}

// ── PNG-Encoder (RGBA, kein Alpha bei Kontaktbogen — Hintergrund opak) ──────
function writePng(file, w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const chunk = (tag, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(tag, "ascii");
    const crcBuf = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcBuf) >>> 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

// ── Rendering ───────────────────────────────────────────────────────────────
class Canvas {
  constructor(w, h, bgIdx = BG) {
    this.w = w; this.h = h;
    const [r, g, b] = rgb(bgIdx);
    this.px = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) { this.px[i * 4] = r; this.px[i * 4 + 1] = g; this.px[i * 4 + 2] = b; this.px[i * 4 + 3] = 255; }
  }
  blit(frame, w, h, ox, oy, scale) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = frame[y]?.[x];
        if (!ch || ch === ".") continue;
        const idx = parseInt(ch, 36);
        if (!Number.isInteger(idx) || idx < 0 || idx > 31) continue;
        const [r, g, b] = rgb(idx);
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const px = ox + x * scale + sx, py = oy + y * scale + sy;
            if (px < 0 || px >= this.w || py < 0 || py >= this.h) continue;
            const o = (py * this.w + px) * 4;
            this.px[o] = r; this.px[o + 1] = g; this.px[o + 2] = b;
          }
      }
    }
  }
  rect(x, y, w, h, idx) {
    const [r, g, b] = rgb(idx);
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        if (xx < 0 || xx >= this.w || yy < 0 || yy >= this.h) continue;
        const o = (yy * this.w + xx) * 4;
        this.px[o] = r; this.px[o + 1] = g; this.px[o + 2] = b;
      }
  }
}

const FRAME_NAMES = ["F0 Ruhe", "F1 Atmen", "F2 Wind-up"];
const GAP = 12, PAD = 10;

function sheetFor(id) {
  const sp = sprites[id];
  const row1x = sp.w + GAP;
  const row4x = sp.w * 4 + GAP;
  const w = PAD * 2 + row4x * 3 - GAP;
  const h = PAD * 2 + sp.h + 8 + sp.h * 4;
  const c = new Canvas(w, h);
  let x = PAD;
  for (const f of sp.frames) { c.blit(f, sp.w, sp.h, x, PAD, 1); x += row1x; }
  x = PAD;
  const y4 = PAD + sp.h + 8;
  for (const f of sp.frames) { c.blit(f, sp.w, sp.h, x, y4, 4); x += row4x; }
  return c;
}

function sheetAll() {
  const order = IDS;
  const cells = order.map((id) => sprites[id]);
  const cellW = 96 * 4 + GAP;
  const cols = 3, rows = 2;
  const w = PAD * 2 + cellW * cols;
  const h = PAD * 2 + (96 * 4 + 16) * rows;
  const c = new Canvas(w, h);
  for (const [i, id] of order.entries()) {
    const sp = sprites[id];
    const cx = PAD + (i % cols) * cellW + Math.round((96 * 4 - sp.w * 4) / 2);
    const cy = PAD + Math.floor(i / cols) * (96 * 4 + 16);
    c.blit(sp.frames[0], sp.w, sp.h, cx, cy, 4);
  }
  return c;
}

const metricsOut = IDS.map(metrics).map((m) => ({ ...m, frameNames: FRAME_NAMES }));
writeFileSync(path.join(SHOTS, `m10-boss-portrait-${argTag}.json`), JSON.stringify(metricsOut, null, 2) + "\n");
for (const id of IDS) {
  const c = sheetFor(id);
  writePng(path.join(SHOTS, `m10-boss-portrait-${argTag}-${id}.png`), c.w, c.h, c.px);
}
{
  const c = sheetAll();
  writePng(path.join(SHOTS, `m10-boss-portrait-${argTag}-all.png`), c.w, c.h, c.px);
}
console.log(`[m10-boss-portrait] tag=${argTag} bosse=${IDS.length}`);
for (const m of metricsOut)
  console.log(`  ${m.id} ${m.size} frames=${m.frames} offPal=${m.offPalette} dup=${m.duplicates} silKontrast=${m.silhouetteContrast} kanten=${m.edgeContrast}`);
