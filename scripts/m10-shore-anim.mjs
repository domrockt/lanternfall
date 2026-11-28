#!/usr/bin/env node
// m10-water-shore-anim K1/K4: Vorher/Nachher-Belege fuer "Wasser/Ufer bei 1x
// lebendiger". Gleicher Seed (13) und dieselbe Wasser-Suche wie
// final-art-shots.mjs, damit before/after vergleichbar sind.
//
// Erzeugt je Tag:
//   shots/m10-shore-anim-<tag>.png      1x-Standbild (640x360, dpr 1)
//   shots/m10-shore-anim-<tag>-4x.png   4x-nearest Crop um die Uferkante
//   shots/m10-shore-anim-<tag>.gif      18 Frames a 140 ms (Animationsloop)
//   shots/m10-shore-anim-<tag>.json     WebGL-Renderer-String + Frame-Diff-Metrik
//
// Frame-Diff-Metrik: zwischen aufeinanderfolgenden Frames gezaehlte Pixel mit
// |Delta| >= 8 in einem Kanal (Mittel ueber alle Paare) — objektives Mass fuer
// "animiert" bei 1x. Kein flock (Momentaufnahmen, keine FPS-Messung).
// Aufruf: node scripts/m10-shore-anim.mjs --tag=before|after
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { inflateSync } from "node:zlib";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const TMP = `${homedir()}/tmp/m10-water-shore-anim`;
const FRAMES = 18;
const FRAME_MS = 140;
const OUT_JSON = `shots/m10-shore-anim-${TAG}.json`;

// ── Mini-PNG-Dekodierer (8-bit RGB/RGBA, nicht interlaced) ────────────────
function decodePng(buf) {
  let off = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`PNG bitDepth ${bitDepth} nicht unterstuetzt`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  if (channels === null) throw new Error(`PNG colorType ${colorType} nicht unterstuetzt`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * channels);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = raw[p + x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
    p += stride;
  }
  return { w, h, channels, data: out };
}

/** Animierte Pixel: Mittel der Pixeldifferenzen ueber alle Frame-Paare. */
function frameDiffStats(files) {
  const imgs = files.map((f) => decodePng(readFileSync(f)));
  const { w, h, channels } = imgs[0];
  let pairs = 0;
  let sumChanged = 0;
  let maxChanged = 0;
  let sumTotal = 0;
  for (let i = 1; i < imgs.length; i++) {
    const a = imgs[i - 1].data, b = imgs[i].data;
    let changed = 0;
    for (let o = 0; o < w * h * channels; o += channels) {
      if (Math.abs(b[o] - a[o]) >= 8 || Math.abs(b[o + 1] - a[o + 1]) >= 8 || Math.abs(b[o + 2] - a[o + 2]) >= 8) changed++;
    }
    sumChanged += changed;
    maxChanged = Math.max(maxChanged, changed);
    sumTotal += changed / (w * h);
    pairs++;
  }
  return {
    frameSize: `${w}x${h}`,
    pairs,
    changedPxAvg: Math.round(sumChanged / Math.max(1, pairs)),
    changedPxMax: maxChanged,
    changedPercent: Math.round((sumTotal / Math.max(1, pairs)) * 10000) / 100,
  };
}

ensureBuild();
mkdirSync(TMP, { recursive: true });
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];

const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const report = { tag: TAG, viewport: "640x360", dpr: 1, seed: 13 };
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=13`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.setOption("scale", 1);
    window.__lf.god(true);
    window.__lf.setTimeScale(1);
  });
  await page.waitForTimeout(400);

  // Wasserflaeche suchen (wie final-art-shots: Spielpixel-Score um Sichtmitte).
  const water = await page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    const px = sc.posX;
    const py = sc.posY;
    let best = null;
    let bestScore = -1;
    for (let r = -700; r <= 700; r += 8) {
      for (let c = -700; c <= 700; c += 8) {
        const x = Math.round(px + c);
        const y = Math.round(py + r);
        let score = 0;
        for (let dy = -56; dy <= 56; dy += 8) {
          for (let dx = -56; dx <= 56; dx += 8) {
            if (sc.ground.kindAt(x + dx, y + dy) === "water") score++;
          }
        }
        if (score > bestScore) { bestScore = score; best = { x, y, score: bestScore }; }
      }
    }
    return best;
  });
  // Am Ufer stehen: naechster Nicht-Wasser-Punkt vom Seemittelpunkt.
  const shore = await page.evaluate((w) => {
    const sc = window.__game.scene.getScene("run");
    for (let r = 72; r <= 180; r += 8) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const x = Math.round(w.x + Math.cos(a) * r);
        const y = Math.round(w.y + Math.sin(a) * r);
        if (sc.ground.kindAt(x, y) !== "water") return { x, y };
      }
    }
    return { x: w.x, y: w.y };
  }, water);
  await page.evaluate((p) => window.__lf.teleport(p.x, p.y), shore);
  // Chunks nach dem Teleport laden (Worker malt je Chunk alle Animations-
  // stufen): grosszuegig warten, bis der Ausschnitt vollstaendig da ist.
  await page.waitForTimeout(2600);
  for (let i = 0; i < 40; i++) {
    const loaded = await page.evaluate(() => window.__game.scene.getScene("run").ground.loadedChunks);
    await page.waitForTimeout(250);
    const loaded2 = await page.evaluate(() => window.__game.scene.getScene("run").ground.loadedChunks);
    if (loaded2 === loaded && loaded2 >= 12) break;
  }
  const canvas = page.locator("canvas");

  // 1x-Standbild + GIF-Frames.
  await canvas.screenshot({ path: `shots/m10-shore-anim-${TAG}.png` });
  const frameFiles = [];
  for (let i = 0; i < FRAMES; i++) {
    const f = `${TMP}/shore-${TAG}-${String(i).padStart(2, "0")}.png`;
    await canvas.screenshot({ path: f });
    frameFiles.push(f);
    await page.waitForTimeout(FRAME_MS);
  }

  // 4x-nearest Crop um die Uferkante (Wassermittelpunkt im Screen-Space).
  const shot = await page.evaluate((w) => {
    const sc = window.__game.scene.getScene("run");
    const cam = sc.cameras.main;
    return {
      cx: Math.round(w.x - cam.scrollX),
      cy: Math.round(w.y - cam.scrollY),
      scroll: [Math.round(cam.scrollX), Math.round(cam.scrollY)],
      renderer: (() => {
        const gl = window.__game.renderer?.gl;
        if (!gl) return { renderer: "non-webgl", vendor: null };
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        return {
          renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
          vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
        };
      })(),
    };
  }, water);
  const crop = `${TMP}/shore-${TAG}-crop.png`;
  const cropW = 160, cropH = 120;
  const cx = Math.max(0, Math.min(640 - cropW, shot.cx - cropW / 2));
  const cy = Math.max(0, Math.min(360 - cropH, shot.cy - cropH / 2));
  execFileSync("convert", [
    `shots/m10-shore-anim-${TAG}.png`, "-crop", `${cropW}x${cropH}+${cx}+${cy}`,
    "-filter", "point", "-resize", "400%", crop,
  ]);
  execFileSync("cp", [crop, `shots/m10-shore-anim-${TAG}-4x.png`]);
  execFileSync("convert", ["-delay", String(FRAME_MS / 10), "-loop", "0", ...frameFiles, `shots/m10-shore-anim-${TAG}.gif`]);

  report.renderer = shot.renderer;
  report.waterSpot = water;
  report.shoreSpot = shore;
  report.shoreScreen = { cx: shot.cx, cy: shot.cy };
  report.frames = FRAMES;
  report.frameMs = FRAME_MS;
  report.frameDiff = frameDiffStats(frameFiles);
  report.errors = errors;
} finally {
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  await browser.close();
  server.stop();
}

if (errors.length > 0) {
  console.error("JS-Fehler:", errors);
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
