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

// ── gen-Modus: F1 (Atmen) + F2 (Telegraph-Zucken) aus F0 erzeugen ─────────
// argv[2] === "gen": argv[3] = KommAListe der Boss-IDs (ohne "boss_"-Praefix).
// F1: Squash — Oberkoerper (bis 65 % der Silhouettenhoehe) 1 px nach unten,
//     Fuesse bleiben fix (<= 1 px Versatz, ganzzahlig, Palette unveraendert).
// F2: Zucken — ganzes Sprite 1 px nach oben (Telegraph-Vorlauf; im Spiel
//     zusaetzlich rot getoent, siehe Run.ts telegraph-Tint).
if (TAG === "gen") {
  const targets = (process.argv[3] ?? "").split(",").filter(Boolean);
  const lines = src.split("\n");
  let cur = null, frameIdx = -1, block = null, f0Rows = null, changed = 0;
  for (let i = 0; i < lines.length; i++) {
    const bm = lines[i].match(/^  boss_(\w+): \{ w: \d+, h: \d+, frames: \[$/);
    if (bm) { cur = targets.includes(bm[1]) ? bm[1] : null; frameIdx = -1; f0Rows = null; continue; }
    if (!cur) continue;
    if (lines[i] === "    [") { frameIdx++; block = { start: i, rows: [] }; continue; }
    if (/^    \],?$/.test(lines[i]) && block) {
      if (frameIdx > 0) {
        const old = f0Rows;
        const hgt = old.length, wid = old[0].length;
        const top = old.findIndex((r) => /[^.]/.test(r));
        let bottom = hgt - 1; while (!/[^.]/.test(old[bottom])) bottom--;
        const emptyRow = ".".repeat(wid);
        let out;
        if (frameIdx === 1) {
          // Squash: content bis split 1 px runter, Reihe top wird leer.
          const split = top + Math.round((bottom - top) * 0.65);
          out = [...old];
          out[top] = emptyRow;
          for (let y = top + 1; y <= split; y++) out[y] = old[y - 1];
        } else {
          // Zucken: ganzes Frame 1 px hoch.
          out = [...old.slice(1), emptyRow];
        }
        const gen = out.map((r, y) => `      "${r}"${y < out.length - 1 ? "," : ""}`);
        lines.splice(block.start + 1, gen.length, ...gen);
        changed++;
        block = null;
      } else {
        f0Rows = block.rows;
        block = null;
      }
      continue;
    }
    if (block) block.rows.push(lines[i].trim().replace(/^"/, "").replace(/",?$/, ""));
  }
  writeFileSync("src/gfx/gen-bosses.ts", lines.join("\n"));
  console.log(`gen: ${changed} Frames neu (Ziele: ${targets.join(", ")})`);
  process.exit(0);
}

// Optional: Idle-Zyklus als 2-Frame-GIF (nur wenn argv[3] === "gif")
// Optional: Idle-Zyklus als 2-Frame-GIF (nur wenn argv[3] === "gif").
// Frames werden als PNG gerendert (gleicher Encoder wie Kontaktbogen) und
// mit ffmpeg zum GIF verbunden (2.5 fps = 400 ms pro Frame, Endlosschleife).
if (process.argv[3] === "gif") {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "bossidle-"));
  const W = Math.max(...bosses.map((b) => b.frames[0][0].length)) + 8;
  const H = Math.max(...bosses.map((b) => b.frames[0].length)) + 8;
  const cols = 3;
  const rowsG = Math.ceil(bosses.length / cols);
  const GW = W * cols, GH = H * rowsG;
  for (let fi = 0; fi < 2; fi++) {
    const px = Buffer.alloc(GW * GH * 4);
    const put = (x, y, c) => {
      if (x < 0 || y < 0 || x >= GW || y >= GH) return;
      const o = (y * GW + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
    };
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) put(x, y, PAL[2]);
    bosses.forEach((b, bi) => {
      const f = b.frames[fi % b.frames.length];
      const ox = (bi % cols) * W + 4, oy = Math.floor(bi / cols) * H + 4;
      for (let y = 0; y < f.length; y++) for (let x = 0; x < f[y].length; x++) {
        const ch = f[y][x];
        if (ch === ".") continue;
        const c = PAL[parseInt(ch, 36)];
        for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++)
          put(ox + x * 2 + sx, oy + y * 2 + sy, c);
      }
    });
    savePng(join(dir, `f${fi}.png`), GW, GH, px);
  }
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "2.5",
    "-i", join(dir, "f%d.png"), "-loop", "0",
    "shots/m10-boss-idle-anim-idle.gif"], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg GIF-Fehler");
  console.log("gif: shots/m10-boss-idle-anim-idle.gif (2 Frames, 400 ms, 2x)");
}
