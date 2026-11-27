#!/usr/bin/env node
// M10-death-fx-frames: Beleg-Skript fuer die Todes-VFX-Frames.
//
//   node scripts/m10-death-frames.mjs --prefix shots/m10-death-frames-before
//   node scripts/m10-death-frames.mjs --prefix shots/m10-death-frames --chaos
//
// Modus 1 (immer): rendert alle Frame-Sets aus src/gfx/gen-fx.ts (export
// deathFrameSets) als 4x-nearest Kontaktboegen — eine PNG je Frame-Key:
//   <prefix>-<name>.png  (name: blob|dust|fire|bone|void|boss)
// plus <prefix>.json mit Inventar.
//
// Modus 2 (--chaos): zusaetzlich ein In-Game-Chaos-Screenshot (>= 300 Gegner,
// alle 4 Todesklassen sterben gleichzeitig) via Playwright + window.__lf:
//   <prefix>-chaos.png + Eintrag im selben JSON (jsErrors muss 0 sein).
//
// Keine FPS-/Echtzeit-Messung → laeuft ohne flock. Deterministisch, kein Sleep-Polling.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}
const prefix = opt("prefix", "shots/m10-death-frames");
const doChaos = argv.includes("--chaos");
const SCALE = 4;

// --- Frame-Sets aus dem TS-Quellcode holen (rolldown-Bundle, wie Vite es tut). ---
const tmpDir = join(homedir(), "tmp", "m10-death-fx-frames");
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
const { deathFrameSets, PAL } = await import(`file://${bundleFile}`).then(async (fx) =>
  import(`file://${palBundleFile}`).then((pal) => ({ ...fx, PAL: pal.PAL })));
rmSync(bundleFile, { force: true });
rmSync(palBundleFile, { force: true });

// Kurz-Namen fuer die Beleg-Dateien (Briefing: blob/dust/fire/bone/boss).
const SHORT = {
  fx_death_blob: "blob",
  fx_death_dust: "dust",
  fx_death_fire: "fire",
  fx_death_bone: "bone",
  fx_death_void: "void",
  fx_boss_core: "boss",
};

// --- Minimaler PNG-Encoder (RGBA, Filter 0), damit kein Imagemagick noetig ist. ---
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
  ihdr[8] = 8; ihdr[9] = 6; // 8 bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Zeichnet eine Zeichen-Zeile als RGBA-Puffer: "." transparent, sonst Palette. */
function charToIndex(ch) {
  if (!ch || ch === ".") return -1;
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  return Math.max(0, Math.min(31, ch.charCodeAt(0) - 97 + 10));
}
function hexToRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/**
 * Kontaktbogen: alle Frames eines Sets nebeneinander, SCALE-fach nearest,
 * Hintergrund = nightDeep (1) wie der Spielfeld-Himmel.
 */
function sheetPng(set) {
  const gap = 2; // Spielpixel zwischen Frames
  const fw = set.w + gap;
  const wPx = (fw * set.frames.length - gap) * SCALE;
  const hPx = set.h * SCALE;
  const rgba = new Uint8Array(wPx * hPx * 4);
  const bg = hexToRgb(PAL[3]); // nightMid: nightDeep-Rims bleiben als dunkle Kante lesbar
  for (let i = 0; i < wPx * hPx; i++) rgba.set(bg, i * 4);
  set.frames.forEach((rows, f) => {
    const ox = f * fw * SCALE;
    for (let y = 0; y < set.h; y++) {
      for (let x = 0; x < set.w; x++) {
        const idx = charToIndex(rows[y]?.[x]);
        if (idx < 0) continue;
        const [r, g, b] = hexToRgb(PAL[idx]);
        for (let sy = 0; sy < SCALE; sy++) {
          for (let sx = 0; sx < SCALE; sx++) {
            const px = ox + x * SCALE + sx;
            const py = y * SCALE + sy;
            rgba.set([r, g, b, 255], (py * wPx + px) * 4);
          }
        }
      }
    }
  });
  return encodePng(wPx, hPx, rgba);
}

// --- Modus 1: Frame-Kontaktboegen. ---
const sets = deathFrameSets();
mkdirSync(dirname(`${prefix}.png`), { recursive: true });
const inventory = {};
for (const [key, set] of Object.entries(sets)) {
  const short = SHORT[key] ?? key;
  const file = `${prefix}-${short}.png`;
  writeFileSync(file, sheetPng(set));
  inventory[key] = { file, short, w: set.w, h: set.h, frames: set.frames.length };
  console.log(`[m10-death-frames] ${key} -> ${file} (${set.w}x${set.h}, ${set.frames.length} Frames, ${SCALE}x)`);
}

// --- Modus 2: In-Game-Chaos-Screenshot. ---
let chaos = null;
if (doChaos) {
  const { ensureBuild, startServer, loadPlaywright, startRun } = await import("./harness.mjs");
  ensureBuild();
  const server = await startServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1`);
    await startRun(page);
    await page.evaluate(() => {
      const lf = window.__lf;
      lf.god(true);
      lf.setSuppressLevelUps(true);
      lf.setFxDamping(false);
      // Waffen hochziehen, damit im Chaos sehr viele Tode pro Sekunde passieren.
      lf.addWeapon("ember", 8);
      lf.addWeapon("frost", 8);
      lf.addWeapon("flail", 8);
      lf.addWeapon("storm", 8);
      // Alle 4 Todesklassen gleichzeitig spawnen (Klasse je Archetyp, siehe death.ts):
      lf.spawnEnemy("bogzombie", 80); // chaser -> crumble -> fx_death_bone
      lf.spawnEnemy("skeleton", 60); // chaser -> crumble
      lf.spawnEnemy("bog_rat", 220); // swarm -> burst -> fx_death_blob
      lf.spawnEnemy("crow", 100); // swarm -> burst
      lf.spawnEnemy("mudling", 40); // splitter -> burst
      lf.spawnEnemy("banshee", 50); // phaser -> dissolve -> fx_death_void
      lf.spawnEnemy("harpy", 50); // orbiter -> dissolve
      lf.spawnEnemy("cultist", 20); // summoner -> dissolve
      lf.spawnEnemy("ghoul", 50); // charger -> sputter -> fx_death_fire/dust
      lf.spawnEnemy("toad", 40); // ranged -> sputter
      lf.spawnEnemy("bomber", 30); // exploder -> sputter
    });
    // 1.5 s Kampf: Waffen toeten, Death-FX laufen 0.3-0.9 s → im Bild sichtbar.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${prefix}-chaos.png` });
    const state = await page.evaluate(() => ({ ...window.__lf.state(), spawnCounts: window.__lf.state().spawnCounts }));
    chaos = { file: `${prefix}-chaos.png`, state, jsErrors: errors };
    console.log(`[m10-death-frames] chaos -> ${prefix}-chaos.png (enemies=${state.enemies}, kills=${state.kills}, jsErrors=${errors.length})`);
  } finally {
    await browser.close();
    server.stop();
  }
}

writeFileSync(`${prefix}.json`, JSON.stringify({
  generatedAt: new Date().toISOString(),
  scale: SCALE,
  frames: inventory,
  chaos,
  note: "Frame-Quelle: deathFrameSets() in src/gfx/gen-fx.ts (Single Source of Truth).",
}, null, 2));
console.log(`[m10-death-frames] inventar -> ${prefix}.json`);
