#!/usr/bin/env node
// M10-Crowd-Variantenton-Messung (Karte #7327): misst je Gegnertyp die
// Farb-Distanz zwischen Basis-Ton (Frame <spriteKey>) und Varianten-Ton
// (Frame <spriteKey>_3) direkt aus den erzeugten Atlas-Frames (Canvas-
// Readback, exakte Paletten-RGB-Werte, kein Rendern/Skalieren im Weg).
//
//   node scripts/m10-crowd-tone.mjs --tag=before
//   -> shots/m10-crowd-tone-before.json + 4 PNGs (640x360, 780x360@3, 2x 4x-Zoom)
//
// Kein FPS-Anteil -> ohne flock (feste Pixelwerte, lastunabhaengig).
import { writeFileSync } from "node:fs";
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
const OUT_JSON = `shots/m10-crowd-tone-${TAG}.json`;
// Horde aus den art-director-Schlechtpunkten + Kontexttypen (Minute-30-Umgebung).
const MIX = [
  ["skeleton", 90], ["harpy", 70], ["centipede", 50],
  ["ghoul", 50], ["bog_rat", 60], ["wisp", 40],
];

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();

// RGB -> HSV (fuer Hue-/Chroma-Befund).
function hsv([r, g, b]) {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    const R = r / 255, G = g / 255, B = b / 255;
    if (mx === R) h = ((G - B) / d) % 6;
    else if (mx === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h: Math.round(h * 10) / 10, s: mx === 0 ? 0 : Math.round((d / mx) * 1000) / 1000, v: Math.round(mx * 1000) / 1000 };
}
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

async function measure(page) {
  return page.evaluate(() => {
    const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const hsv = ([r, g, b]) => {
      const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
      const d = mx - mn;
      let h = 0;
      if (d > 0) {
        const R = r / 255, G = g / 255, B = b / 255;
        if (mx === R) h = ((G - B) / d) % 6;
        else if (mx === G) h = (B - R) / d + 2;
        else h = (R - G) / d + 4;
        h = (h * 60 + 360) % 360;
      }
      return { h: Math.round(h * 10) / 10, s: mx === 0 ? 0 : Math.round((d / mx) * 1000) / 1000, v: Math.round(mx * 1000) / 1000 };
    };
    const scene = window.__game.scene.getScene("run");
    const tex = scene.textures.get("runtime_atlas");
    const names = tex.getFrameNames().filter((n) => /^enemy_.+_3$/.test(n));
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const src = tex.source && tex.source[0] ? tex.source[0].image : null;

    const bodyOf = (frameName) => {
      const f = tex.get(frameName);
      cv.width = f.cutWidth; cv.height = f.cutHeight;
      ctx.clearRect(0, 0, f.cutWidth, f.cutHeight);
      ctx.drawImage(src, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
      const data = ctx.getImageData(0, 0, f.cutWidth, f.cutHeight).data;
      const counts = new Map();
      let body = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 255) continue; // binäres Alpha: nur deckende Pixel
        // Kontur (0x06070c) und Augen/Glow (0xfff8e6) zaehlen nicht als Koerper.
        const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        if (key === 0x06070c || key === 0xfff8e6) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        body++;
      }
      let dom = null, domN = 0;
      for (const [k, n] of counts) if (n > domN) { dom = k; domN = n; }
      const mean = [0, 0, 0];
      for (const [k, n] of counts) {
        mean[0] += ((k >> 16) & 255) * n; mean[1] += ((k >> 8) & 255) * n; mean[2] += (k & 255) * n;
      }
      return {
        dominant: dom,
        dominantShare: body ? Math.round((domN / body) * 1000) / 1000 : 0,
        mean: mean.map((v) => Math.round(v / Math.max(1, body))),
        tones: counts.size,
        bodyPixels: body,
      };
    };

    const out = {};
    for (const n of names.sort()) {
      const spriteKey = n.replace(/_3$/, "");
      const base = bodyOf(spriteKey);
      const variant = bodyOf(n);
      const lumDist = Math.round(Math.abs(lum(base.mean) - lum(variant.mean)) * 10) / 10;
      const domLumDist = Math.round(Math.abs(lum([base.dominant >> 16, (base.dominant >> 8) & 255, base.dominant & 255]) - lum([variant.dominant >> 16, (variant.dominant >> 8) & 255, variant.dominant & 255])) * 10) / 10;
      const rgbDist = Math.round(Math.sqrt(
        (base.mean[0] - variant.mean[0]) ** 2 + (base.mean[1] - variant.mean[1]) ** 2 + (base.mean[2] - variant.mean[2]) ** 2,
      ) * 10) / 10;
      const bh = hsv(base.mean), vh = hsv(variant.mean);
      out[spriteKey] = {
        base: { mean: base.mean, dominant: base.dominant, tones: base.tones, hsv: bh },
        variant: { mean: variant.mean, dominant: variant.dominant, tones: variant.tones, hsv: vh },
        lumDist, domLumDist, rgbDist,
        hueDelta: Math.round(Math.abs(bh.h - vh.h) * 10) / 10,
      };
    }
    return out;
  });
}

async function crowdShots(page, prefix) {
  await page.evaluate((mix) => {
    const run = window.__game.scene.getScene("run");
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.skipTo(120); // Minute 2: Horde ohne Endgame-Chaos, Tone sichtbar
    window.__lf.setTimeScale(1);
    for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
    const px = 2048, py = 2048;
    window.__lf.teleport(px, py);
    for (const [id, n] of mix) window.__lf.spawnEnemy(id, n);
    const act = run.enemies.active.filter((e) => e.alive);
    let i = 0;
    for (const e of act) {
      const a = (i / act.length) * Math.PI * 2;
      const r = 40 + (i % 5) * 18;
      e.x = px + Math.cos(a) * r; e.y = py + Math.sin(a) * r;
      e.vx = 0; e.vy = 0; e.hp = 1e9; e.damage = 0;
      i++;
    }
  }, MIX);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `shots/${prefix}.png` });
}

try {
  // Messung + Shots je Auflösung in eigener Page (Viewport/DPR unterschiedlich).
  const pages = [];
  const mk = async (w, h, dsf) => {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
    p.on("pageerror", (e) => console.error("[pageerror]", String(e)));
    await p.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await startRun(p);
    pages.push(p);
    return p;
  };
  const p640 = await mk(640, 360, 1);
  const tones = await measure(p640);

  await crowdShots(p640, `m10-crowd-tone-${TAG}-640x360`);
  const p780 = await mk(780, 360, 3);
  await crowdShots(p780, `m10-crowd-tone-${TAG}-780x360@3`);
  // 4x-Zoom: 160x90-Ausschnitt um den Spieler, als 640x360 gerendert.
  const p4x = await mk(160, 90, 4);
  await crowdShots(p4x, `m10-crowd-tone-${TAG}-zoom4x`);
  // 2. 4x-Zoom, anderer Ausschnitt (192x108 @2 -> 384x216).
  const p4b = await mk(192, 108, 2);
  await crowdShots(p4b, `m10-crowd-tone-${TAG}-zoom4b`);
  await browser.close();

  const types = Object.entries(tones).map(([k, v]) => ({ spriteKey: k, ...v }));
  types.sort((a, b) => a.domLumDist - b.domLumDist);
  const json = {
    generatedAt: new Date().toISOString(),
    method: "Je Gegnertyp: Mittelton aller Koerperpixel (ohne Kontur 0x06070c und Augen/Glow 0xfff8e6, deckende Pixel) aus Atlas-Frame <spriteKey> vs. <spriteKey>_3 (Canvas-Readback, exakte Palettenwerte); lumDist = |Luminanz-Differenz|, rgbDist = euklidische RGB-Distanz",
    tag: TAG,
    weakestFirst: types,
    focus: ["skeleton", "centipede", "harpy"],
  };
  writeFileSync(OUT_JSON, JSON.stringify(json, null, 2));
  console.log("weakest 8:");
  for (const t of types.slice(0, 8)) console.log(`  ${t.spriteKey.padEnd(18)} domLumDist=${String(t.domLumDist).padStart(6)} meanLumDist=${String(t.lumDist).padStart(6)} rgbDist=${String(t.rgbDist).padStart(6)}`);
  console.log(`-> ${OUT_JSON}`);
} finally {
  browser.close().catch(() => {});
  server.stop();
}
