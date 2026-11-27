// M10-boss-idle-anim #1: Ist-Aufnahme der Boss-Sprite-Frames.
// Rendert alle 6 Bosse 1x und 4x (Kontaktbogen) und zaehlt je Boss:
// Frames, Duplikate, Pixel-Diffs zwischen den Frames (Atmung sichtbar?).
// Ausgabe: shots/m10-boss-idle-anim-before.json + shots/m10-boss-idle-anim-before-640.png
// Aufruf: node scripts/m10-boss-idle-anim.mjs [before|after] [gif]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const TAG = process.argv[2] ?? "before";
const src = readFileSync("src/gfx/gen-bosses.ts", "utf8");
const palSrc = readFileSync("src/palette.ts", "utf8");

// Palette: 32 RGB-Werte aus src/palette.ts lesen.
const PAL = [...palSrc.matchAll(/0x([0-9a-fA-F]{6})/g)].map((m) => [
  parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16),
]);
if (PAL.length !== 32) throw new Error(`Palette unvollstaendig: ${PAL.length}`);

// GEN_BOSSES parsen: Frames sind Strings, Chars = Base-36-Palettenindex, "." = transparent.
const bossRe = /boss_(\w+): \{ w: (\d+), h: (\d+), frames: \[/g;
const marks = [];
let m;
while ((m = bossRe.exec(src))) marks.push([m[1], m.index]);
marks.push([null, src.length]);

const bosses = [];
for (let i = 0; i < marks.length - 1; i++) {
  const seg = src.slice(marks[i][1], marks[i + 1][1]);
  const frames = [...seg.matchAll(/^    \[\n((?:      .*\n)+?)    \]/gm)]
    .map((x) => x[1].split("\n").map((l) => l.trim().replace(/",?$/, "").slice(1, -1)));
  bosses.push({ id: marks[i][0], frames });
}

// ── Mini-PNG-Encoder (8-bit RGBA, Filter 0) ───────────────────────────────
function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function savePng(path, w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]));
}

// Hintergrund wie im Spiel (nachtMid 2), Zellen alternierend night 1.
function renderSheet(scale, path) {
  const cells = bosses.map((b) => b.frames.length);
  const pad = 8 * scale, labelH = 10 * scale;
  const cols = bosses.map((b) => b.frames.reduce((a, f) => Math.max(a, f[0].length), 0));
  const rows = bosses.map((b) => b.frames.reduce((a, f) => Math.max(a, f.length), 0));
  const cellW = Math.max(...cols) * scale + pad * 2;
  const cellH = Math.max(...rows) * scale + pad * 2 + labelH;
  const W = cellW, H = bosses.reduce((a, b) => a + cellH, 0);
  const px = Buffer.alloc(W * H * 4);
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
  };
  // 7-Segment-Ziffern + Buchstaben für Labels (3x5-Font).
  const FONT = {
    0: ["111","101","101","101","111"], 1: ["010","110","010","010","111"],
    2: ["111","001","111","100","111"], 3: ["111","001","111","001","111"],
    4: ["101","101","111","001","001"], 5: ["111","100","111","001","111"],
    6: ["111","100","111","101","111"], 7: ["111","001","010","010","010"],
    8: ["111","101","111","101","111"], 9: ["111","101","111","001","111"],
    B: ["110","101","110","101","110"], O: ["111","101","101","101","111"],
    S: ["111","100","111","001","111"], F: ["111","100","110","100","100"],
    "-": ["000","000","111","000","000"], D: ["110","101","101","101","110"],
    U: ["101","101","101","101","111"], P: ["111","101","111","100","100"],
    X: ["101","101","010","101","101"], " ": ["000","000","000","000","000"],
    T: ["111","010","010","010","010"], W: ["101","101","101","111","101"],
    I: ["111","010","010","010","111"], N: ["101","111","111","111","101"],
  };
  const drawText = (text, x0, y0, s, color) => {
    let cx = x0;
    for (const ch of text) {
      const g = FONT[ch.toUpperCase()] ?? FONT[" "];
      for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++)
        if (g[gy][gx] === "1") for (let sy = 0; sy < s; sy++) for (let sx = 0; sx < s; sx++)
          put(cx + gx * s + sx, y0 + gy * s + sy, color);
      cx += 4 * s;
    }
  };
  let y0 = 0;
  bosses.forEach((b, bi) => {
    const bgc = bi % 2 ? PAL[1] : PAL[2];
    for (let y = y0; y < y0 + cellH; y++) for (let x = 0; x < W; x++) put(x, y, bgc);
    drawText(`BOSS ${bi} F${b.frames.length}`, pad, y0 + pad, scale, PAL[21]);
    b.frames.forEach((f, fi) => {
      const fx = pad, fy = y0 + pad + labelH;
      for (let y = 0; y < f.length; y++) for (let x = 0; x < f[y].length; x++) {
        const ch = f[y][x];
        if (ch === ".") continue;
        const c = PAL[parseInt(ch, 36)];
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++)
          put(fx + x * scale + sx, fy + y * scale + sy, c);
      }
    });
    y0 += cellH;
  });
  savePng(path, W, H, px);
  return { W, H };
}

// ── Metriken je Boss ──────────────────────────────────────────────────────
function metrics(b) {
  const grids = b.frames.map((f) => f.map((row) => [...row].map((ch) => (ch === "." ? -1 : parseInt(ch, 36)))));
  const diff = (a, b2) => {
    let d = 0;
    for (let y = 0; y < a.length; y++) for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b2[y][x]) d++;
    return d;
  };
  const pairs = [];
  for (let f = 1; f < grids.length; f++) pairs.push({ pair: `F0-F${f}`, diffPx: diff(grids[0], grids[f]) });
  const sigs = grids.map((g) => JSON.stringify(g));
  const dupCount = sigs.length - new Set(sigs).size;
  // Vertikaler Versatz der Silhouette (bounding box shift) F0 vs F1
  const bbox = (g) => {
    let top = Infinity, bot = -Infinity;
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] >= 0) { top = Math.min(top, y); bot = Math.max(bot, y); }
    return { top, bot };
  };
  const b0 = bbox(grids[0]);
  const shifts = grids.slice(1).map((g) => bbox(g).top - b0.top);
  return {
    frames: grids.length,
    duplicateFrames: dupCount,
    pixelDiffs: pairs,
    idleShiftTopPx: shifts[0] ?? null,
    telegraphShiftTopPx: shifts[1] ?? null,
    chars: [...new Set(b.frames.flat().join("").split(""))].sort().join(""),
  };
}

const result = {
  tag: TAG,
  generated: new Date().toISOString(),
  bosses: bosses.map((b) => ({ id: b.id, w: b.frames[0][0].length, h: b.frames[0].length, ...metrics(b) })),
};
mkdirSync("shots", { recursive: true });
writeFileSync(`shots/m10-boss-idle-anim-${TAG}.json`, JSON.stringify(result, null, 2));
const info = renderSheet(4, `shots/m10-boss-idle-anim-${TAG}-640.png`);
console.log(JSON.stringify(result.bosses.map((b) => ({
  id: b.id, frames: b.frames, dup: b.duplicateFrames,
  diffs: b.pixelDiffs.map((p) => p.diffPx).join("/"), shift: b.idleShiftTopPx,
})), null, 1));
console.log(`sheet: shots/m10-boss-idle-anim-${TAG}-640.png ${info.W}x${info.H}`);

// Optional: Idle-Zyklus als 2-Frame-GIF (nur wenn argv[3] === "gif")
if (process.argv[3] === "gif") {
  const palIdx = [...new Set(bosses.flatMap((b) => b.frames.slice(0, 2).flat().join("").split("")))]
    .filter((c) => c !== ".").map((c) => parseInt(c, 36)).sort((a, b) => a - b);
  const palCount = Math.max(4, 1 << Math.ceil(Math.log2(palIdx.length + 1)));
  const W = Math.max(...bosses.map((b) => b.frames[0][0].length)) + 4;
  const H = Math.max(...bosses.map((b) => b.frames[0].length)) + 4;
  const cols = 3, rows = Math.ceil(bosses.length / cols);
  const CW = W, CH = H, GW = CW * cols, GH = CH * rows;
  // GIF mit 2 Bildern, delay 40 cs (400 ms)
  const globalPal = Buffer.alloc(palCount * 3);
  globalPal[0] = 0x10; globalPal[1] = 0x17; globalPal[2] = 0x24; // Hintergrund night
  palIdx.forEach((pi, i) => { const c = PAL[pi]; globalPal.set(c, (i + 1) * 3); });
  const transparentIdx = 0; // Index 0 = Hintergrund (hier opak genutzt) — stattdessen opak
  const gce = (delay) => Buffer.from([0x21, 0xf9, 0x04, 0x00, delay & 0xff, (delay >> 8) & 0xff, 0x00, 0x00]);
  const imgDesc = () => {
    const d = Buffer.alloc(10);
    d.writeUInt16LE(0, 0); d.writeUInt16LE(0, 2); d.writeUInt16LE(GW, 4); d.writeUInt16LE(GH, 6);
    return Buffer.concat([Buffer.from([0x2c]), d, Buffer.from([0x00])]);
  };
  // LZW-Encoder (min code size 8)
  function lzw(indices) {
    const minCode = 8, clear = 1 << minCode, end = clear + 1;
    let dict = new Map(), next = end + 1, size = minCode + 1;
    const out = []; let cur = 0, curBits = 0;
    const emit = (code) => { cur |= code << curBits; curBits += size; while (curBits >= 8) { out.push(cur & 0xff); cur >>= 8; curBits -= 8; } };
    emit(clear);
    let w = "";
    for (const k of indices) {
      const c = String.fromCharCode(k);
      const wk = w + c;
      if (dict.has(wk)) w = wk;
      else {
        emit(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
        if (next < 4096) { dict.set(wk, next); if (next === (1 << size) && size < 12) size++; next++; }
        else { emit(clear); dict.clear(); next = end + 1; size = minCode + 1; }
        w = c;
      }
    }
    if (w) emit(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
    emit(end);
    if (curBits > 0) out.push(cur & 0xff);
    return Buffer.from(out);
  }
  const framesData = [0, 1].map((fi) => {
    const idx = new Uint8Array(GW * GH);
    bosses.forEach((b, bi) => {
      const f = b.frames[fi % b.frames.length];
      const ox = (bi % cols) * CW + 2, oy = Math.floor(bi / cols) * CH + 2;
      for (let y = 0; y < f.length; y++) for (let x = 0; x < f[y].length; x++) {
        const ch = f[y][x];
        if (ch === ".") { idx[(oy + y) * GW + ox + x] = 0; continue; }
        idx[(oy + y) * GW + ox + x] = 1 + palIdx.indexOf(parseInt(ch, 36));
      }
    });
    const data = lzw([...idx]);
    const blocks = [];
    for (let i = 0; i < data.length; i += 255) {
      const sl = data.subarray(i, Math.min(i + 255, data.length));
      blocks.push(Buffer.from([sl.length]), sl);
    }
    return Buffer.concat([gce(40), imgDesc(), Buffer.from([0x08]), ...blocks, Buffer.from([0x00])]);
  });
  const header = Buffer.concat([
    Buffer.from("GIF89a"),
    (() => { const d = Buffer.alloc(7); d.writeUInt16LE(GW, 0); d.writeUInt16LE(GH, 2); d[4] = 0xf7; d[5] = 0; d[6] = 0; return d; })(),
    globalPal,
    Buffer.from([0x21, 0xff, 0x0b, ..."NETSCAPE2.0".length === 11 ? "NETSCAPE2.0" : ""])
      .length && Buffer.concat([Buffer.from([0x21, 0xff, 0x0b]), Buffer.from("NETSCAPE2.0"), Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00])]),
  ]);
  writeFileSync(`shots/m10-boss-idle-anim-idle.gif`, Buffer.concat([header, ...framesData, Buffer.from([0x3b])]));
  console.log("gif: shots/m10-boss-idle-anim-idle.gif");
}
