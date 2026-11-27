#!/usr/bin/env node
// M10-fx-mixel-fix (Dom-Wunsch 21:15Z, Punkt 4a): Ist-/Nachher-Beleg fuer
// Mixel bei grossen Feuer-/Aura-Effekten (Explosion, Karo-Halo).
//
//   node scripts/m10-fx-mixel.mjs --prefix shots/m10-fx-mixel-before --path legacy
//   node scripts/m10-fx-mixel.mjs --prefix shots/m10-fx-mixel-after  --path mixel
//
// Stellt die Mixel-Szene nach: fx_fire-Explosion (Scale 1,4/2,0), fx_halo-Halo
// (Scale 2,8/4,6), fx_halo_cold (1,8) und fx_shock-Explosionsring (3,3) — die
// realen Caller-Scales aus CombatSystem/Run — in zwei Views (640x360 und
// 960x540), je 2x-nearest ver grossert. Der Draw-Pfad wird 1:1 nachgebaut:
//   legacy: Level-1-Textur, Sprite-Scale = gewuenschter Scale (alter FxSystem)
//   mixel:  Bake-Stufe L = mixelLevelFor(...), Frames auf Stufen-Keys,
//           Sprite-Scale = Scale/L  (neuer FxSystem, Draw-Scale <= 1)
// plus JSON mit Textur-Pixelgroesse vs. Sprite-Pixelgroesse (Blockgroesse).
//
// Keine FPS-/Echtzeit-Messung -> laeuft ohne flock. Deterministisch, kein Polling.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}
const prefix = opt("prefix", "shots/m10-fx-mixel-before");
const path = opt("path", "legacy"); // legacy | mixel
const PNG_SCALE = 2; // Vergrößerung nearest (2–4x erlaubt, nie verzerren)

// --- Frame-Generatoren aus dem TS-Quellcode (rolldown-Bundle, wie Vite es tut). ---
const tmpDir = join(homedir(), "tmp", "m10-fx-mixel");
mkdirSync(tmpDir, { recursive: true });
const bundleFile = join(tmpDir, `gen-fx-${process.pid}.mjs`);
const { rolldown } = await import("rolldown");
const bundle = await rolldown({
  input: fileURLToPath(new URL("../src/gfx/gen-fx.ts", import.meta.url)),
  external: [/^phaser/],
  platform: "node",
});
await bundle.write({ file: bundleFile, format: "esm" });
const palBundleFile = join(tmpDir, `palette-${process.pid}.mjs`);
const palBundle = await rolldown({
  input: fileURLToPath(new URL("../src/palette.ts", import.meta.url)),
  platform: "node",
});
await palBundle.write({ file: palBundleFile, format: "esm" });
const fx = await import(`file://${bundleFile}`);
const { PAL } = await import(`file://${palBundleFile}`);
rmSync(bundleFile, { force: true });
rmSync(palBundleFile, { force: true });

// --- Showcase: reale Caller-Scales (CombatSystem/Run) je Effekt. ---
// [base, frameIndex, drawScale, label]
const SHOWCASE = [
  ["fx_fire", 0, 1.4, "ember-aura"],
  ["fx_fire", 0, 2.0, "explosion-klein"],
  ["fx_halo", 0, 2.8, "karo-halo (radius/12)"],
  ["fx_halo", 0, 4.6, "boss-death-halo"],
  ["fx_halo_cold", 1, 1.8, "soul-orb-halo"],
  ["fx_shock", 2, 3.3, "explosionsring"],
];

/** Draw-Pfad nachbauen: liefert { key, texW, texH, rows, spriteScale }. */
function drawEntry(base, frameIndex, drawScale) {
  const level1 = LEVEL1[base];
  if (path === "legacy") {
    // Alter FxSystem: Level-1-Textur, Scale ungeteilt.
    return {
      key: base, texW: level1.w, texH: level1.h,
      rows: level1.frames[frameIndex] ?? level1.frames[0],
      spriteScale: drawScale,
    };
  }
  // Neuer FxSystem: kleinste Stufe >= Scale, Frames auf Stufen-Keys, Scale/L.
  const level = fx.mixelLevelFor(base, drawScale);
  const baked = BAKED.get(`${base}@${level}`) ?? level1;
  return {
    key: fx.mixelTextureKey(base, level),
    texW: baked.w, texH: baked.h,
    rows: baked.frames[frameIndex] ?? baked.frames[0],
    spriteScale: drawScale / level,
    level,
  };
}

const LEVEL1 = fx.mixelLevel1Frames();
const BAKED = new Map(fx.mixelBakes().map((b) => [`${b.base}@${b.level}`, b]));

// --- Minimaler PNG-Encoder (RGBA, Filter 0). ---
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function charToIndex(ch) {
  if (!ch || ch === ".") return -1;
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  return Math.max(0, Math.min(31, ch.charCodeAt(0) - 97 + 10));
}

/** Eine Szene zeichnen: nachtgrauer Grund + Showcase-Effekte an festen Positionen. */
function scenePng(viewW, viewH, layout) {
  const W = viewW * PNG_SCALE;
  const H = viewH * PNG_SCALE;
  const rgba = new Uint8Array(W * H * 4);
  const bg = [(PAL[1] >> 16) & 255, (PAL[1] >> 8) & 255, PAL[1] & 255, 255];
  for (let i = 0; i < W * H; i++) rgba.set(bg, i * 4);

  const entries = [];
  for (const e of layout) {
    const { rows, texW, texH, spriteScale } = e.draw;
    const h0 = rows.length;
    const w0 = rows[0]?.length ?? 0;
    for (let ty = 0; ty < texH; ty++) {
      for (let tx = 0; tx < texW; tx++) {
        // Quellpixel: Stufen-Texturen sind texW gross; Level-1-rows nur w0 breit.
        const sx = texW === w0 ? tx : Math.floor((tx * w0) / texW);
        const sy = texH === h0 ? ty : Math.floor((ty * h0) / texH);
        const idx = charToIndex(rows[sy]?.[sx]);
        if (idx < 0) continue;
        const [r, g, b] = [(PAL[idx] >> 16) & 255, (PAL[idx] >> 8) & 255, PAL[idx] & 255];
        // Zielpixel: Sprite-Scale in Spielpixeln, dann PNG_SCALE-fach nearest.
        const gx0 = Math.round(e.x + (tx - texW / 2) * spriteScale);
        const gy0 = Math.round(e.y + (ty - texH / 2) * spriteScale);
        const gsize = Math.max(1, Math.round(spriteScale));
        for (let dy = 0; dy < gsize; dy++) {
          for (let dx = 0; dx < gsize; dx++) {
            for (let sy2 = 0; sy2 < PNG_SCALE; sy2++) {
              for (let sx2 = 0; sx2 < PNG_SCALE; sx2++) {
                const px = (gx0 + dx) * PNG_SCALE + sx2;
                const py = (gy0 + dy) * PNG_SCALE + sy2;
                if (px < 0 || py < 0 || px >= W || py >= H) continue;
                rgba.set([r, g, b, 255], (py * W + px) * 4);
              }
            }
          }
        }
      }
    }
    entries.push({ label: e.label, base: e.base, x: e.x, y: e.y });
  }
  return { png: encodePng(W, H, rgba), entries };
}

// --- Layout: Effekte ueber die Szene verteilt (Positionen im JSON dokumentiert). ---
const LAYOUTS = {
  640: [
    { base: "fx_fire", i: 0, s: 1.4, x: 96, y: 288, label: "ember-aura" },
    { base: "fx_fire", i: 0, s: 2.0, x: 190, y: 296, label: "explosion-klein" },
    { base: "fx_halo", i: 0, s: 2.8, x: 320, y: 240, label: "karo-halo" },
    { base: "fx_halo", i: 0, s: 4.6, x: 512, y: 200, label: "boss-death-halo" },
    { base: "fx_halo_cold", i: 1, s: 1.8, x: 96, y: 120, label: "soul-orb-halo" },
    { base: "fx_shock", i: 2, s: 3.3, x: 420, y: 96, label: "explosionsring" },
  ],
  960: [
    { base: "fx_fire", i: 0, s: 1.4, x: 140, y: 430, label: "ember-aura" },
    { base: "fx_fire", i: 0, s: 2.0, x: 280, y: 445, label: "explosion-klein" },
    { base: "fx_halo", i: 0, s: 2.8, x: 480, y: 360, label: "karo-halo" },
    { base: "fx_halo", i: 0, s: 4.6, x: 770, y: 300, label: "boss-death-halo" },
    { base: "fx_halo_cold", i: 1, s: 1.8, x: 140, y: 180, label: "soul-orb-halo" },
    { base: "fx_shock", i: 2, s: 3.3, x: 630, y: 145, label: "explosionsring" },
  ],
};

mkdirSync(dirname(`${prefix}.png`), { recursive: true });
const inventory = {
  path,
  pngScale: PNG_SCALE,
  note: "Blockgroesse = Spielpixel je Textur-Pixel. legacy: = Sprite-Scale (Mixel, wenn > 1). mixel: = Scale/Stufe (<= 1).",
  effects: {},
};
for (const [viewName, layout] of Object.entries(LAYOUTS)) {
  const draws = layout.map((e) => ({ ...e, draw: drawEntry(e.base, e.i, e.s) }));
  const { png } = scenePng(Number(viewName), viewName === "640" ? 360 : 540, draws);
  const file = `${prefix}-${viewName}.png`;
  writeFileSync(file, png);
  inventory.effects[viewName] = draws.map((e) => ({
    label: e.label,
    base: e.base,
    frame: e.i,
    requestedScale: e.s,
    texture: { key: e.draw.key, w: e.draw.texW, h: e.draw.texH },
    bakeLevel: e.draw.level ?? 1,
    spriteScale: Number(e.draw.spriteScale.toFixed(4)),
    blockGamePx: Number(e.draw.spriteScale.toFixed(4)),
    blockDevicePx: Number((e.draw.spriteScale * PNG_SCALE).toFixed(2)),
    mixel: e.draw.spriteScale > 1.001,
  }));
  console.log(`[m10-fx-mixel] ${file} (${viewName}, path=${path})`);
}
inventory.summary = {
  worstBlockGamePx: Math.max(...Object.values(inventory.effects).flat().map((e) => e.blockGamePx)),
  mixelCount: Object.values(inventory.effects).flat().filter((e) => e.mixel).length,
  acceptance: path === "legacy"
    ? "BEFORE: Blockgroesse > 1 px auf Nimbus-/Explosions-Effekten = Mixel-Befund."
    : "AFTER: Blockgroesse <= 1 px ueberall (kein Scale > 1 am Draw).",
};
writeFileSync(`${prefix}.json`, JSON.stringify(inventory, null, 2));
console.log(`[m10-fx-mixel] ${prefix}.json — worstBlockGamePx=${inventory.summary.worstBlockGamePx}, mixelEffects=${inventory.summary.mixelCount}`);
