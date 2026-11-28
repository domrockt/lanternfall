// M10-enemy-idle-anim-r2: Ist-/Probe-Aufnahme der Gegner-Sprite-Frames.
// Zaehlt je Gegnerklasse: Frames, byte-identische Duplikate, Pixel-Diff zwischen
// Frame 0 und den Folgeframes (ist ein Idle/Bob sichtbar?). Rendert auf Wunsch
// Kontaktboegen (Frames nebeneinander, 4x, nearest) als Beleg.
// Ausgabe: ~/games/.evidence/m10-enemy-idle-anim-r2/m10-enemy-idle-<tag>.json
//          (Kontaktboegen daneben: enemy-idle-<tag>-<klasse>.png)
// Aufruf: node scripts/m10-enemy-idle.mjs [before|after] [<klasse> ...]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { homedir } from "node:os";

const TAG = process.argv[2] ?? "before";
const WANTED = process.argv.slice(3);
const src = readFileSync("src/gfx/gen-enemies.ts", "utf8");
const enemySrc = readFileSync("src/data/enemies.ts", "utf8");
const palSrc = readFileSync("src/palette.ts", "utf8");

const PAL = [...palSrc.matchAll(/0x([0-9a-fA-F]{6})/g)].map((m) => [
  parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16),
]);
if (PAL.length !== 32) throw new Error(`Palette unvollstaendig: ${PAL.length}`);

// spriteKey -> id/name (Reihenfolge aus ENEMIES-Objekt).
const names = [];
for (const m of enemySrc.matchAll(/^\s+(\w+): \{ id: "(\w+)", name: "([^"]+)".*?spriteKey: "(\w+)"/gm)) {
  names.push({ id: m[2], name: m[3], spriteKey: m[4] });
}
if (names.length !== 30) throw new Error(`ENEMIES unvollstaendig: ${names.length}`);

// GEN_ENEMIES parsen (gleiches Format wie GEN_BOSSES).
const keyRe = /enemy_(\w+): \{ w: (\d+), h: (\d+), frames: \[/g;
const marks = [];
let m;
while ((m = keyRe.exec(src))) marks.push([m[1], m.index]);
marks.push([null, src.length]);

const sprites = {};
for (let i = 0; i < marks.length - 1; i++) {
  const seg = src.slice(marks[i][1], marks[i + 1][1]);
  const frames = [...seg.matchAll(/^    \[\n((?:      .*\n)+?)    \]/gm)]
    .map((x) => x[1].split("\n").map((l) => l.trim().replace(/",?$/, "").slice(1, -1)));
  sprites[marks[i][0]] = { w: Number(seg.match(/w: (\d+)/)[1]), h: Number(seg.match(/h: (\d+)/)[1]), frames };
}

// ── Mini-PNG-Encoder (8-bit RGBA, Filter 0) ───────────────────────────────
function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = table[n] || ((c = n) & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1);
    table[n] = c >>> 0;
  }
  return (x) => { let v = -1; for (const b of x) v = table[(v ^ b) & 255] ^ (v >>> 8); return (v ^ -1) >>> 0; };
}
const crc = crc32();
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy ? rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
      : raw.set(rgba.slice(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Kontaktbogen: Frames einer Klasse nebeneinander, 4x, 1 px Trennpixel (Palette 0).
function sheet(spr, scale = 4) {
  const w = spr.w, h = spr.h, n = spr.frames.length;
  const outW = (w * n + (n - 1)) * scale, outH = h * scale;
  const rgba = Buffer.alloc(outW * outH * 4);
  const put = (x, y, c) => {
    for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
      const o = ((y * scale + sy) * outW + x * scale + sx) * 4;
      rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255;
    }
  };
  for (let f = 0; f < n; f++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = spr.frames[f][y]?.[x];
      put(f * (w + 1) + x, y, ch === "." || ch === undefined ? [20, 20, 26] : PAL[parseInt(ch, 36)]);
    }
  }
  return { buf: png(outW, outH, rgba), outW, outH };
}

// ── Analyse ───────────────────────────────────────────────────────────────
const rows = [];
for (const { id, name, spriteKey } of names) {
  const key = spriteKey.replace(/^enemy_/, "");
  const spr = sprites[key];
  if (!spr) { rows.push({ id, spriteKey, error: "fehlt" }); continue; }
  const sigs = spr.frames.map((f) => f.join("\n"));
  const frames = sigs.length;
  const seen = new Map();
  const dupGroups = [];
  sigs.forEach((s, i) => {
    if (!seen.has(s)) { seen.set(s, [i]); } else { seen.get(s).push(i); }
  });
  for (const g of seen.values()) if (g.length > 1) dupGroups.push(g);
  // Pixel-Diff Frame 0 -> Frame i (gefuellte Pixel an unterschiedlicher Position/Farbe).
  const diffs = sigs.map((s, i) => {
    if (i === 0) return 0;
    const a = s.split("\n"), b = sigs[0].split("\n");
    let d = 0;
    for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) {
      if ((a[y]?.[x] ?? ".") !== (b[y]?.[x] ?? ".")) d++;
    }
    return d;
  });
  rows.push({ id, name, spriteKey, w: spr.w, h: spr.h, frames, dupGroups, diffs, idleAnimated: diffs.slice(1).some((d) => d > 0) });
}

const dupClasses = rows.filter((r) => r.frames === 1 || (r.dupGroups && r.dupGroups.length));
const result = {
  tag: TAG,
  date: new Date().toISOString(),
  classes: rows.length,
  classesWithFrames: rows.filter((r) => r.frames !== undefined).length,
  singleFrameClasses: rows.filter((r) => r.frames === 1).map((r) => r.id),
  duplicateClasses: dupClasses.map((r) => ({ id: r.id, frames: r.frames, dupGroups: r.dupGroups })),
  idleFrozenClasses: rows.filter((r) => r.frames > 1 && !r.idleAnimated).map((r) => r.id),
  detail: rows,
};

const dir = `${homedir()}/games/.evidence/m10-enemy-idle-anim-r2`;
mkdirSync(dir, { recursive: true });
const jsonPath = `${dir}/m10-enemy-idle-${TAG}.json`;
writeFileSync(jsonPath, JSON.stringify(result, null, 2));

// Kontaktboegen: Wunsch-Klassen, sonst 3 repraesentative (erste frozen, erste single-frame, erste ok).
const wanted = WANTED.length ? WANTED : (() => {
  const picks = [];
  for (const c of [...result.singleFrameClasses, ...result.idleFrozenClasses, ...dupClasses.map((d) => d.id)]) {
    if (picks.length < 3 && !picks.includes(c)) picks.push(c);
  }
  for (const { id } of names) if (picks.length < 3 && !picks.includes(id)) picks.push(id);
  return picks;
})();
const shots = [];
for (const id of wanted) {
  const row = rows.find((r) => r.id === id);
  const spr = sprites[id.replace(/^enemy_/, "")];
  if (!row || !spr) continue;
  const { buf, outW, outH } = sheet(spr);
  const p = `${dir}/enemy-idle-${TAG}-${id}-${outW}x${outH}.png`;
  writeFileSync(p, buf);
  shots.push(p);
}

console.log(`JSON: ${jsonPath}`);
console.log(`Klassen: ${result.classesWithFrames}, 1-Frame: ${result.singleFrameClasses.join(",") || "-"}, Duplikate: ${result.duplicateClasses.length}, idle-standbild: ${result.idleFrozenClasses.join(",") || "-"}`);
for (const r of rows) console.log(`  ${r.id.padEnd(16)} frames=${r.frames} dupGroups=${JSON.stringify(r.dupGroups || "-")} diffs=${(r.diffs || []).join(",")}`);
for (const s of shots) console.log(`Shot: ${s}`);
