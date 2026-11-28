#!/usr/bin/env node
/**
 * Lane m10-boss-portrait-w2-r2: Vorher/Nachher-Kontaktboegen + Metriken + WebGL-Renderer-String.
 *
 *   node scripts/m10-boss-portrait-w2.mjs --tag before --out ~/games/.evidence/m10-boss-portrait-w2-r2
 *   node scripts/m10-boss-portrait-w2.mjs --tag after  --out ~/games/.evidence/m10-boss-portrait-w2-r2
 *
 * Erzeugt je Boss der Fix-Liste (coven, pale_shepherd, hollow_king) + moor_queen (bewusst
 * unveraenderte Kontrolle) einen Kontaktbogen (3 Frames, 1x + 4x, nearest, Nachthintergrund
 * PAL[2]) und ein Metrik-JSON (offPalette, duplicateFrames, silhouetteContrast p75,
 * edgeContrast) fuer ALLE 6 Bosse. Der WebGL-Renderer-String wird einmal pro Lauf aus dem
 * gebauten Spiel ausgelesen (Renderer-Pflicht, Dom 19:20Z) und ins JSON geschrieben.
 *
 * Liest nur src/gfx/gen-bosses.ts (AUTO-GENERIERT) — keine Spiellogik, kein flock (keine
 * FPS-/Echtzeit-Messung).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { ensureBuild, startServer, loadPlaywright } from "./harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
process.chdir(ROOT);

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const TAG = arg("tag", "before").replace(/[^a-zA-Z0-9-]/g, "");
const OUT = path.resolve(arg("out", path.join(ROOT, "shots")));
mkdirSync(OUT, { recursive: true });

/** Bosse mit eigenem Kontaktbogen (3 Fix-Kandidaten + unveraenderte Kontrolle). */
const SHEET_IDS = ["coven", "pale_shepherd", "hollow_king", "moor_queen"];
const BG = 2; // night — Boss erscheint nachts auf dunklem Grund

// ── Palette ─────────────────────────────────────────────────────────────────
const palSrc = readFileSync(path.join(ROOT, "src/palette.ts"), "utf8");
const PAL = [...palSrc.matchAll(/0x([0-9a-fA-F]{6})/g)].map((m) => m[1]);
if (PAL.length !== 32) throw new Error(`Palette: ${PAL.length} Farben statt 32`);
const rgb = (i) => [parseInt(PAL[i].slice(0, 2), 16), parseInt(PAL[i].slice(2, 4), 16), parseInt(PAL[i].slice(4, 6), 16)];
const lum = (i) => { const [r, g, b] = rgb(i); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

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
const pctile = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function metrics(id) {
  const sp = sprites[id];
  let offPalette = 0;
  const lums = [];
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

// ── PNG-Encoder (RGBA, opak) ────────────────────────────────────────────────
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
  ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]));
}
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
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
}

const GAP = 12, PAD = 10;
function sheetFor(id) {
  const sp = sprites[`boss_${id}`];
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

// ── Renderer-String aus dem gebauten Spiel (Pflicht, Dom 19:20Z) ────────────
async function rendererString() {
  try {
    ensureBuild();
    const { chromium } = await loadPlaywright();
    const server = await startServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1`);
    await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
    const renderer = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return null;
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    });
    await browser.close();
    return renderer;
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

const renderer = await rendererString();
const metricsOut = IDS.map(metrics);
const json = {
  lane: "m10-boss-portrait-w2-r2",
  tag: TAG,
  capturedAt: new Date().toISOString(),
  renderer,
  tool: "scripts/m10-boss-portrait-w2.mjs",
  sheetIds: SHEET_IDS,
  metrics: metricsOut,
};
writeFileSync(path.join(OUT, `m10-boss-portrait-w2-${TAG}.json`), JSON.stringify(json, null, 2) + "\n");
for (const id of SHEET_IDS) {
  const c = sheetFor(id);
  writePng(path.join(OUT, `m10-boss-portrait-w2-${TAG}-${id}.png`), c.w, c.h, c.px);
}
console.log(`[m10-boss-portrait-w2] tag=${TAG} out=${OUT} renderer=${renderer}`);
for (const m of metricsOut)
  console.log(`  ${m.id} ${m.size} frames=${m.frames} offPal=${m.offPalette} dup=${m.duplicates} silKontrast=${m.silhouetteContrast} kanten=${m.edgeContrast}`);
