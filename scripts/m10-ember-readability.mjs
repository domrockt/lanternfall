#!/usr/bin/env node
/**
 * M10 ember-readability — Messwerkzeug fuer den ACCEPTANCE-Restpunkt
 * "Ember-Projektil im Halo teils ueberstrahlt".
 *
 * Nimmt die ECHTEN Spieltexturen (Phaser-Texture-Manager aus dem dist-Build),
 * rendert daraus ein 1x/4x-Kontaktblatt und berechnet:
 *   - Near-White-Anteil (zwei kalibrierte Definitionen wie in ACCEPTANCE A7 /
 *     docs/lanes/m10-vfx-evo.md),
 *   - Alpha-Verteilung (nur 0/255 = binaeres Alpha),
 *   - Off-Palette-Pixel gegen die 32 Farben aus src/palette.ts.
 *
 * "Glow-Kleck" = Muendungsglut des Ember-Schusses, wie sie im Spiel additiv
 * ueber den Nachtgrund gelegt wird (fx_fire bzw. nach dem Fix fx_ember_muzzle).
 * Gemessen wird der Footprint (Pixel, die den Hintergrund veraendern).
 *
 * Aufruf: node scripts/m10-ember-readability.mjs [outJson] [outPngBase]
 *   Default: shots/m10-ember-readability-baseline.json
 *            shots/m10-ember-readability-baseline
 *
 * Kein FPS-/Echtzeitlauf -> keine flock-Sperre noetig.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, loadPlaywright, startServer } from "./harness.mjs";

// Live-Import von src/palette.ts funktioniert unter Node nur ueber den
// Vite-SSR-Loader; fuer dieses CLI-Skript genuegt die Palette als Hex-Liste aus
// der Datei (identisch zu PAL). tests/ember-readability.test.ts importiert PAL
// direkt und nutzt die exportierten Analysefunktionen.
const PALETTE_HEX = [
  0x06070c, 0x0a0e16, 0x101724, 0x17202e, 0x1e2a3a, 0x2a3547, 0x3a4a5c, 0x4e5f6e,
  0x6b7c86, 0x8fa0a6, 0xb8c4c2, 0xd9ddcd, 0xf2edd8, 0xfff8e6, 0x2b1410, 0x4d2214,
  0x7a331a, 0xa84a21, 0xcf6b26, 0xef9130, 0xffb84d, 0xffd77a, 0xffeeb0, 0x3d1220,
  0x7a1f2e, 0xb8303f, 0xe4574d, 0xff8a6b, 0x16261e, 0x22382a, 0x3d5a38, 0x6f9b58,
];

export const NEAR_WHITE_DEFS = {
  // A7-Kalibrierung (final-vfx-readability.mjs): r,g,b >= 150 und r >= 235
  a7: { r: 150, g: 150, b: 150, rMin: 235 },
  // m10-vfx-evo-Kalibrierung: min(R,G,B) >= 200
  minRgb200: { min: 200 },
};

export function isNearWhiteA7(r, g, b) {
  return r >= 150 && g >= 150 && b >= 150 && r >= 235;
}

export function isNearWhiteMin(r, g, b, min = 200) {
  return Math.min(r, g, b) >= min;
}

/** Index einer exakten Palettenfarbe, sonst -1. */
export function paletteIndex(r, g, b) {
  const hex = (r << 16) | (g << 8) | b;
  return PALETTE_HEX.indexOf(hex);
}

/**
 * Analysiert einen RGBA-Buffer (Uint8ClampedArray-Form) pixelgenau.
 * `footprint` (optional) schraenkt die Grundgesamtheit auf Pixel ein, die
 * gegenueber einem Hintergrund veraendert wurden (Glow-Footprint).
 */
export function analyzeRgba(rgba, w, h, footprint = null) {
  const total = w * h;
  let opaque = 0;
  let transparent = 0;
  let semi = 0;
  let offPalette = 0;
  let nearA7 = 0;
  let nearMin = 0;
  let measured = 0;
  const colors = new Map();
  const violations = [];
  for (let i = 0; i < total; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    if (footprint && !footprint[i]) continue;
    measured++;
    if (a === 0) { transparent++; continue; }
    if (a !== 255) { semi++; continue; }
    opaque++;
    const pi = paletteIndex(r, g, b);
    if (pi < 0) {
      offPalette++;
      if (violations.length < 50) {
        violations.push({ x: i % w, y: Math.floor(i / w), rgb: [r, g, b], hex: `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}` });
      }
    } else {
      colors.set(pi, (colors.get(pi) ?? 0) + 1);
    }
    if (isNearWhiteA7(r, g, b)) nearA7++;
    if (isNearWhiteMin(r, g, b)) nearMin++;
  }
  const pct = (n) => (opaque ? +((100 * n) / opaque).toFixed(2) : 0);
  const pctTotal = (n) => (total ? +((100 * n) / total).toFixed(2) : 0);
  return {
    w, h, total, measured, opaque, transparent, semi,
    offPalette,
    nearWhiteA7: nearA7,
    nearWhiteA7Pct: pct(nearA7),
    nearWhiteA7PctOfFrame: pctTotal(nearA7),
    nearWhiteMinRgb200: nearMin,
    nearWhiteMinRgb200Pct: pct(nearMin),
    nearWhiteMinRgb200PctOfFrame: pctTotal(nearMin),
    paletteColors: [...colors.entries()].sort((a, b) => b[1] - a[1]).map(([i, n]) => ({ index: i, hex: `#${PALETTE_HEX[i].toString(16).padStart(6, "0")}`, n })),
    violations,
    binaryAlpha: semi === 0,
  };
}

/** Composited einen Frame additiv mit Alpha ueber nightDeep (Palette 1). */
export function compositeAdditive(rgba, w, h, alpha, bg = [0x0a, 0x0e, 0x16]) {
  const out = new Uint8ClampedArray(w * h * 4);
  const footprint = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3];
    if (a === 0) {
      out[i * 4] = bg[0]; out[i * 4 + 1] = bg[1]; out[i * 4 + 2] = bg[2]; out[i * 4 + 3] = 255;
      continue;
    }
    for (let c = 0; c < 3; c++) {
      out[i * 4 + c] = Math.min(255, Math.round(bg[c] + rgba[i * 4 + c] * alpha));
    }
    out[i * 4 + 3] = 255;
    footprint[i] = 1;
  }
  return { rgba: out, footprint };
}

const outJson = process.argv[2] ?? "shots/m10-ember-readability-baseline.json";
const outPngBase = process.argv[3] ?? outJson.replace(/\.json$/, "");

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=77`);
  await page.waitForFunction(() => Boolean(window.__game && window.__lf), { timeout: 15000 });
  await page.waitForFunction(() => window.__game.textures.exists("projectile_ember"), { timeout: 15000 });

  // Nach dem Fix existiert eine eigene Muendungsglut mit dunkler Kontur;
  // vor dem Fix ist der Ember-Glow die geteilte fx_fire-Textur.
  const glowKey = await page.evaluate(() => (window.__game.textures.exists("fx_ember_muzzle") ? "fx_ember_muzzle" : "fx_fire"));

  const raw = await page.evaluate(({ glowKey }) => {
    const mgr = window.__game.textures;
    const dump = (key) => {
      if (!mgr.exists(key)) return null;
      const tex = mgr.get(key);
      const src = tex.getSourceImage();
      const w = src.width ?? src.naturalWidth;
      const h = src.height ?? src.naturalHeight;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      return { w, h, rgba: Array.from(data) };
    };
    const keys = ["projectile_ember", glowKey, `${glowKey}_2`, `${glowKey}_3`, `${glowKey}_4`, `${glowKey}_5`, `${glowKey}_6`];
    const textures = {};
    for (const k of keys) {
      const d = dump(k);
      if (d) textures[k] = d;
    }
    return { glowKey, textures };
  }, { glowKey });

  const textures = {};
  for (const [key, d] of Object.entries(raw.textures)) {
    textures[key] = analyzeRgba(new Uint8ClampedArray(d.rgba), d.w, d.h);
  }

  // Glow-Kleck: erster Frame des Muendungs-Glows additiv ueber NightDeep.
  const glowFrame = raw.textures[raw.glowKey];
  let glow = null;
  if (glowFrame) {
    const comp = compositeAdditive(new Uint8ClampedArray(glowFrame.rgba), glowFrame.w, glowFrame.h, 0.95);
    const ana = analyzeRgba(comp.rgba, glowFrame.w, glowFrame.h, comp.footprint);
    glow = {
      texture: raw.glowKey,
      frame: 0,
      additiveAlpha: 0.95,
      background: "#0a0e16 (nightDeep)",
      footprintPixels: comp.footprint.reduce((n, v) => n + v, 0),
      ...ana,
    };
  }

  const proj = textures["projectile_ember"];
  const totals = {
    // Off-Palette wird nur auf den QUELLTEXTUREN gezaehlt: der additive
    // Glow-Kleck entsteht per Definition aus Zwischenfarben ausserhalb der Palette.
    offPalette: Object.values(textures).reduce((n, t) => n + t.offPalette, 0),
    semiAlpha: Object.values(textures).reduce((n, t) => n + t.semi, 0),
    binaryAlpha: Object.values(textures).every((t) => t.binaryAlpha),
  };

  const report = {
    lane: "m10-ember-readability",
    generatedAt: new Date().toISOString(),
    gitHead: execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(),
    source: "Phaser texture manager (dist build), echte Spieltexturen",
    definitions: {
      nearWhiteA7: "r,g,b >= 150 und r >= 235 (ACCEPTANCE A7 / final-vfx-readability)",
      nearWhiteMinRgb200: "min(R,G,B) >= 200 (m10-vfx-evo)",
      offPalette: "opake RGB-Pixel, die keiner der 32 Palettenfarben exakt entsprechen (nur Quelltexturen)",
      binaryAlpha: "alle Alpha-Werte sind 0 oder 255",
      prozentBasis: "opake Pixel (bei Glow: Footprint-Pixel); *PctOfFrame zusaetzlich auf Frame-Flaeche",
    },
    target: { nearWhitePctMax: 4.16, offPaletteMax: 0, binaryAlpha: true },
    glowKey: raw.glowKey,
    projectile: proj,
    glow,
    textures,
    totals,
    jsErrors: errors,
  };

  // Kontaktblatt 1x/4x aus den echten Frames.
  const sheet = await page.evaluate((frames) => {
    const draw = (scale) => {
      const pad = 4;
      const labelH = 10;
      const cellW = Math.max(...frames.map((f) => Math.max(f.w * scale, f.key.length * 4 + 4))) + pad * 2;
      const cellH = Math.max(...frames.map((f) => f.h)) * scale + pad * 2 + labelH;
      const cols = Math.min(4, frames.length);
      const rows = Math.ceil(frames.length / cols);
      const c = document.createElement("canvas");
      c.width = cols * cellW;
      c.height = rows * cellH;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#101724";
      ctx.fillRect(0, 0, c.width, c.height);
      frames.forEach((f, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = col * cellW + pad, y = row * cellH + pad;
        // Schachbrett fuer Alpha-Sichtbarkeit.
        for (let yy = 0; yy < f.h * scale; yy += 2 * scale) {
          for (let xx = 0; xx < f.w * scale; xx += 2 * scale) {
            ctx.fillStyle = ((xx / scale + yy / scale) & 1) ? "#1e2a3a" : "#17202e";
            ctx.fillRect(x + xx, y + yy, 2 * scale, 2 * scale);
          }
        }
        const tmp = document.createElement("canvas");
        tmp.width = f.w; tmp.height = f.h;
        tmp.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(f.rgba), f.w, f.h), 0, 0);
        ctx.drawImage(tmp, x, y, f.w * scale, f.h * scale);
        ctx.fillStyle = "#d9ddcd";
        ctx.font = "8px monospace";
        ctx.fillText(f.key, x, y + f.h * scale + 8);
      });
      return c.toDataURL("image/png");
    };
    return { "1x": draw(1), "4x": draw(4) };
  }, Object.entries(raw.textures).map(([key, d]) => ({ key, w: d.w, h: d.h, rgba: d.rgba })));

  writeFileSync(outJson, JSON.stringify(report, null, 2));
  for (const [scale, dataUrl] of Object.entries(sheet)) {
    writeFileSync(`${outPngBase}-${scale}.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
  }

  console.log(`[m10-ember-readability] ${outJson}`);
  console.log(`projectile_ember: nearWhiteA7=${proj.nearWhiteA7Pct}% (frame ${proj.nearWhiteA7PctOfFrame}%) nearWhiteMin200=${proj.nearWhiteMinRgb200Pct}% (frame ${proj.nearWhiteMinRgb200PctOfFrame}%) offPalette=${proj.offPalette} binaryAlpha=${proj.binaryAlpha}`);
  if (glow) console.log(`glow(${glow.texture}): nearWhiteA7=${glow.nearWhiteA7Pct}% nearWhiteMin200=${glow.nearWhiteMinRgb200Pct}% offPalette=${glow.offPalette} footprint=${glow.footprintPixels}px`);
  console.log(`totals: offPalette=${totals.offPalette} semiAlpha=${totals.semiAlpha} binaryAlpha=${totals.binaryAlpha} jsErrors=${errors.length}`);
  const pass = proj.nearWhiteA7Pct <= 4.16 && proj.nearWhiteMinRgb200Pct <= 4.16 &&
    (glow ? glow.nearWhiteA7Pct <= 4.16 && glow.nearWhiteMinRgb200Pct <= 4.16 : true) &&
    totals.offPalette === 0 && totals.binaryAlpha;
  console.log(`VERDICT: ${pass ? "PASS" : "FAIL"} (Ziel Near-White <= 4,16 %, Off-Palette 0, binaeres Alpha)`);
  if (errors.length) console.log("JS ERRORS:\n" + errors.join("\n"));
} finally {
  await browser.close();
  server.stop();
}
