#!/usr/bin/env node
/**
 * M10 ember-trail — Messwerkzeug fuer den Restpunkt aus m10-ember-readability:
 * "Der additiv gezeichnete Schweif (fx_fire-Trail am Ember-Projektil) wurde
 * nicht separat als Glow-Footprint vermessen".
 *
 * Misst den Ember-Schweif so, wie er im Spiel gerendert wird (NORMAL-Blend,
 * Ember-Orange-Tint, alphaFrom/alphaTo ueber life, Skalierung 0,8 -> 0,15):
 *   - Near-White-Anteil des gerenderten Schweifs (beide kalibrierten
 *     Definitionen wie in docs/lanes/m10-vfx-evo.md),
 *   - Glow-Footprint (Pixel, die den nightDeep-Hintergrund veraendern),
 *   - Worst-Case-Stack: trailInterval 0,05 s / life 0,22 s -> bis zu 5 Puffs
 *     uebereinander, aeltester zuerst, jeder mit seinem Alter (Alpha/Skala/
 *     Animationsframe), voll ueberlappend = obere Schranke.
 *   - projectile_ember als Kontext (Kern/Kontur unveraendert?).
 *
 * Aufruf:
 *   node scripts/m10-ember-trail.mjs shots/m10-ember-trail-before.json shots/m10-ember-trail-before
 *   node scripts/m10-ember-trail.mjs shots/m10-ember-trail-after.json  shots/m10-ember-trail-after  --chaos
 *
 * Der Modus (before/after) wird automatisch erkannt: existiert die
 * Textur `fx_ember_trail`, wird der Fixed-Trail (statisch, alphaFrom 0,4)
 * gemessen, sonst der fx_fire-Trail wie im Vorgaenger-Job.
 *
 * Kein FPS-/Echtzeitlauf -> keine flock-Sperre noetig.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, loadPlaywright, startServer, startRun } from "./harness.mjs";

// Palette als Hex-Liste aus src/palette.ts (32 Farben) — bewusst NICHT aus
// m10-ember-readability.mjs importiert: jenes Skript misst bei Import gleich
// selbst (Top-Level-Code) und wuerde den eigenen Lauf verdoppeln.
const PALETTE_HEX = [
  0x06070c, 0x0a0e16, 0x101724, 0x17202e, 0x1e2a3a, 0x2a3547, 0x3a4a5c, 0x4e5f6e,
  0x6b7c86, 0x8fa0a6, 0xb8c4c2, 0xd9ddcd, 0xf2edd8, 0xfff8e6, 0x2b1410, 0x4d2214,
  0x7a331a, 0xa84a21, 0xcf6b26, 0xef9130, 0xffb84d, 0xffd77a, 0xffeeb0, 0x3d1220,
  0x7a1f2e, 0xb8303f, 0xe4574d, 0xff8a6b, 0x16261e, 0x22382a, 0x3d5a38, 0x6f9b58,
];

/** Index einer exakten Palettenfarbe, sonst -1. */
export function paletteIndex(r, g, b) {
  const hex = (r << 16) | (g << 8) | b;
  return PALETTE_HEX.indexOf(hex);
}

export function isNearWhiteA7(r, g, b) {
  return r >= 150 && g >= 150 && b >= 150 && r >= 235;
}

export function isNearWhiteMin(r, g, b, min = 200) {
  return Math.min(r, g, b) >= min;
}

/** Pixelanalyse wie in m10-ember-readability.mjs (gleiche Metriken). */
export function analyzeRgba(rgba, w, h, footprint = null) {
  const total = w * h;
  let opaque = 0;
  let transparent = 0;
  let semi = 0;
  let offPalette = 0;
  let nearA7 = 0;
  let nearMin = 0;
  let measured = 0;
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
        violations.push({ x: i % w, y: Math.floor(i / w), rgb: [r, g, b] });
      }
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
    violations,
    binaryAlpha: semi === 0,
  };
}

const BG = { name: "nightDeep (#0a0e16, Palette 1)", rgb: [0x0a, 0x0e, 0x16] };
// PAL[C.emberOrange] = 17 -> 0xa84a21 (Tint des Ember-Trails im Spiel).
const TINT = { name: "emberOrange (0xa84a21)", rgb: [0xa8, 0x4a, 0x21] };

// Trail-Parameter exakt wie CombatSystem.updateProjectiles sie an FxSystem.spawn
// uebergibt (life 0,22, interval 0,05, scaleFrom = Projektil-Skala * 0,8,
// scaleTo 0,15, alphaTo 0, additive false fuer Ember -> NORMAL-Blend).
const PARAMS = {
  before: {
    mode: "before",
    texture: "fx_fire",
    frames: 6,
    alphaFrom: 0.45,
    alphaTo: 0,
    additive: false,
    tint: TINT.rgb,
    life: 0.22,
    trailInterval: 0.05,
    scaleFrom: 0.8,
    scaleTo: 0.15,
  },
  after: {
    mode: "after",
    texture: "fx_ember_trail",
    frames: 1, // statische Textur (keine Frame-Animation)
    alphaFrom: 0.4,
    alphaTo: 0,
    additive: false,
    tint: TINT.rgb,
    life: 0.22,
    trailInterval: 0.05,
    scaleFrom: 0.8,
    scaleTo: 0.15,
  },
};

/** Nearest-Neighbor-Skalierung eines RGBA-Buffers. */
export function nearestScale(rgba, w, h, scale) {
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const out = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const sy = Math.min(h - 1, Math.floor(y / scale));
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(w - 1, Math.floor(x / scale));
      const si = (sy * w + sx) * 4;
      const di = (y * sw + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return { rgba: out, w: sw, h: sh };
}

/**
 * Rendert einen Trail-Puff wie Phaser NORMAL-Blend: Tint multipliziert die
 * Texturfarbe, Alpha mischt ueber den Hintergrund. Ergebnis ist opak;
 * der Footprint wird mitgeliefert (Pixel, die den Hintergrund veraendern).
 */
export function compositeNormal(srcRgba, w, h, { alpha, tint, bg }) {
  const out = new Uint8ClampedArray(w * h * 4);
  const footprint = new Uint8Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    const a = srcRgba[i * 4 + 3] / 255;
    out[i * 4 + 3] = 255;
    if (a === 0) {
      out[i * 4] = bg[0]; out[i * 4 + 1] = bg[1]; out[i * 4 + 2] = bg[2];
      continue;
    }
    const eff = a * alpha;
    for (let c = 0; c < 3; c++) {
      out[i * 4 + c] = Math.round(srcRgba[i * 4 + c] * (tint[c] / 255) * eff + bg[c] * (1 - eff));
    }
    footprint[i] = 1;
    n++;
  }
  return { rgba: out, footprint, footprintPixels: n };
}

/** Zeichnet einen (bereits skalierten) Puff additiv auf einen bestehenden Frame. */
function puffOver(base, w, h, puff, pw, ph, ox, oy) {
  const out = new Uint8ClampedArray(base);
  for (let y = 0; y < ph; y++) {
    const ty = oy + y;
    if (ty < 0 || ty >= h) continue;
    for (let x = 0; x < pw; x++) {
      const tx = ox + x;
      if (tx < 0 || tx >= w) continue;
      const si = (y * pw + x) * 4;
      const a = puff[si + 3] / 255;
      if (a === 0) continue;
      const di = (ty * w + tx) * 4;
      for (let c = 0; c < 3; c++) {
        out[di + c] = Math.round(puff[si + c] * a + out[di + c] * (1 - a));
      }
      out[di + 3] = 255;
    }
  }
  return out;
}

/** Alpha/Skala/Frame eines Puffs im Alter t (life-Interpolation wie FxSystem). */
export function puffAt(params, t) {
  const k = Math.min(1, t / params.life);
  return {
    alpha: params.alphaFrom + (params.alphaTo - params.alphaFrom) * k,
    scale: params.scaleFrom + (params.scaleTo - params.scaleFrom) * k,
    frame: Math.min(params.frames - 1, Math.floor((t * 18) % params.frames)),
  };
}

const outJson = process.argv[2] ?? "shots/m10-ember-trail-before.json";
const outPngBase = process.argv[3] ?? outJson.replace(/\.json$/, "");
const doChaos = process.argv.includes("--chaos");

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let chaos = null;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=77`);
  await page.waitForFunction(() => Boolean(window.__game && window.__lf), { timeout: 15000 });
  await page.waitForFunction(() => window.__game.textures.exists("projectile_ember"), { timeout: 15000 });

  const mode = await page.evaluate(() => (window.__game.textures.exists("fx_ember_trail") ? "after" : "before"));
  const params = PARAMS[mode];
  const trailBase = params.texture;
  const frameKeys = Array.from({ length: params.frames }, (_, i) => (i === 0 ? trailBase : `${trailBase}_${i + 1}`));

  const raw = await page.evaluate((keys) => {
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
    const all = [...keys, "projectile_ember"];
    const textures = {};
    for (const k of all) {
      const d = dump(k);
      if (d) textures[k] = d;
    }
    return textures;
  }, frameKeys);

  // ── Analyse in Node (gleiche Regeln wie m10-ember-readability) ──
  const sourceTextures = {};
  for (const [key, d] of Object.entries(raw)) {
    sourceTextures[key] = analyzeRgba(new Uint8ClampedArray(d.rgba), d.w, d.h);
  }

  // Frisch gespawnter Puff (Alter 0, Skala scaleFrom).
  const perPuff = [];
  for (let f = 0; f < params.frames; f++) {
    const key = frameKeys[f];
    const src = raw[key];
    if (!src) continue;
    const scaled = nearestScale(new Uint8ClampedArray(src.rgba), src.w, src.h, params.scaleFrom);
    const comp = compositeNormal(scaled.rgba, scaled.w, scaled.h, {
      alpha: params.alphaFrom, tint: params.tint, bg: BG.rgb,
    });
    const ana = analyzeRgba(comp.rgba, scaled.w, scaled.h, comp.footprint);
    perPuff.push({
      frame: key,
      renderScale: params.scaleFrom,
      alpha: params.alphaFrom,
      footprintPixels: comp.footprintPixels,
      nearWhiteA7Pct: ana.nearWhiteA7Pct,
      nearWhiteMinRgb200Pct: ana.nearWhiteMinRgb200Pct,
      offPaletteRendered: ana.offPalette,
    });
  }

  // Worst-Case-Stack: maxAlive = ceil(life / interval) Puffs voll ueberlappend,
  // aeltester zuerst gezeichnet (zweiter landet ueber dem ersten).
  const maxAlive = Math.max(1, Math.ceil(params.life / params.trailInterval));
  const STACK_PAD = 2;
  const stackW = 14 + STACK_PAD * 2;
  const stackH = 14 + STACK_PAD * 2;
  let stackRgba = new Uint8ClampedArray(stackW * stackH * 4);
  for (let i = 0; i < stackW * stackH; i++) {
    stackRgba[i * 4] = BG.rgb[0]; stackRgba[i * 4 + 1] = BG.rgb[1];
    stackRgba[i * 4 + 2] = BG.rgb[2]; stackRgba[i * 4 + 3] = 255;
  }
  const stackPuffs = [];
  for (let i = maxAlive - 1; i >= 0; i--) {
    const age = i * params.trailInterval;
    const p = puffAt(params, age);
    const key = frameKeys[p.frame];
    const src = raw[key];
    if (!src) continue;
    const scaled = nearestScale(new Uint8ClampedArray(src.rgba), src.w, src.h, p.scale);
    const comp = compositeNormal(scaled.rgba, scaled.w, scaled.h, {
      alpha: p.alpha, tint: params.tint, bg: BG.rgb,
    });
    const ox = STACK_PAD + Math.floor((stackW - STACK_PAD * 2 - scaled.w) / 2);
    const oy = STACK_PAD + Math.floor((stackH - STACK_PAD * 2 - scaled.h) / 2);
    stackRgba = puffOver(stackRgba, stackW, stackH, comp.rgba, scaled.w, scaled.h, ox, oy);
    stackPuffs.push({ age: +age.toFixed(3), frame: key, alpha: +p.alpha.toFixed(3), scale: +p.scale.toFixed(3), footprintPixels: comp.footprintPixels });
  }
  // Footprint des Stacks: Pixel, die nicht exakt dem Hintergrund entsprechen.
  const stackFootprint = new Uint8Array(stackW * stackH);
  for (let i = 0; i < stackW * stackH; i++) {
    if (stackRgba[i * 4] !== BG.rgb[0] || stackRgba[i * 4 + 1] !== BG.rgb[1] || stackRgba[i * 4 + 2] !== BG.rgb[2]) {
      stackFootprint[i] = 1;
    }
  }
  const stackAna = analyzeRgba(stackRgba, stackW, stackH, stackFootprint);

  const worst = {
    nearWhiteA7Pct: Math.max(...perPuff.map((p) => p.nearWhiteA7Pct), stackAna.nearWhiteA7Pct),
    nearWhiteMinRgb200Pct: Math.max(...perPuff.map((p) => p.nearWhiteMinRgb200Pct), stackAna.nearWhiteMinRgb200Pct),
    footprintPuffMax: Math.max(...perPuff.map((p) => p.footprintPixels), 0),
    footprintStack: stackFootprint.reduce((n, v) => n + v, 0),
  };
  const proj = sourceTextures["projectile_ember"];
  const pass = worst.nearWhiteA7Pct <= 2 && worst.nearWhiteMinRgb200Pct <= 2 &&
    worst.footprintPuffMax <= 60 && worst.footprintStack <= 60;

  const report = {
    lane: "m10-ember-trail",
    generatedAt: new Date().toISOString(),
    gitHead: execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(),
    mode,
    source: "Phaser texture manager (dist build), echte Spieltexturen; Render-Simulation NORMAL-Blend + Tint",
    trailParams: { ...params, tintName: TINT.name, bg: BG.name, maxAliveStack: maxAlive },
    definitions: {
      nearWhiteA7: "r,g,b >= 150 und r >= 235 (ACCEPTANCE A7)",
      nearWhiteMinRgb200: "min(R,G,B) >= 200 (m10-vfx-evo)",
      footprint: "Pixel des gerenderten Schweifs, die gegenueber nightDeep veraendert sind",
      prozentBasis: "Footprint-Pixel ( gerenderter Schweif ); *PctOfFrame auf Frame-Flaeche",
    },
    target: { nearWhitePctMax: 2, footprintPxMax: 60 },
    perPuff,
    stack: {
      puffs: stackPuffs,
      footprintPixels: worst.footprintStack,
      nearWhiteA7Pct: stackAna.nearWhiteA7Pct,
      nearWhiteMinRgb200Pct: stackAna.nearWhiteMinRgb200Pct,
    },
    worst,
    projectileContext: proj
      ? {
          w: proj.w, h: proj.h, opaque: proj.opaque,
          nearWhiteA7Pct: proj.nearWhiteA7Pct, nearWhiteMinRgb200Pct: proj.nearWhiteMinRgb200Pct,
          offPalette: proj.offPalette, binaryAlpha: proj.binaryAlpha,
        }
      : null,
    sourceTextures: Object.fromEntries(Object.entries(sourceTextures).map(([k, v]) => [k, {
      w: v.w, h: v.h, opaque: v.opaque, offPalette: v.offPalette, binaryAlpha: v.binaryAlpha,
      nearWhiteA7Pct: v.nearWhiteA7Pct, nearWhiteMinRgb200Pct: v.nearWhiteMinRgb200Pct,
    }])),
    verdict: pass ? "PASS" : "FAIL",
    jsErrors: errors,
  };
  writeFileSync(outJson, JSON.stringify(report, null, 2));

  // Kontaktblatt 1x/4x: Quellframes + gerenderte Puffs (ueber nightDeep) + Stack.
  const sheetInput = {
    frames: frameKeys.filter((k) => raw[k]).map((key) => ({
      key, w: raw[key].w, h: raw[key].h, rgba: raw[key].rgba,
    })),
    rendered: perPuff.map((p) => {
      const src = raw[p.frame];
      const scaled = nearestScale(new Uint8ClampedArray(src.rgba), src.w, src.h, params.scaleFrom);
      const comp = compositeNormal(scaled.rgba, scaled.w, scaled.h, { alpha: params.alphaFrom, tint: params.tint, bg: BG.rgb });
      return { key: `${p.frame} gerendert a=${params.alphaFrom}`, w: scaled.w, h: scaled.h, rgba: Array.from(comp.rgba) };
    }),
    stack: { key: `stack ${maxAlive} Puffs`, w: stackW, h: stackH, rgba: Array.from(stackRgba) },
  };
  const sheet = await page.evaluate((input) => {
    const draw = (scale) => {
      const all = [...input.frames, ...input.rendered, input.stack];
      const pad = 4;
      const labelH = 10;
      const cellW = Math.max(...all.map((f) => Math.max(f.w * scale, f.key.length * 4 + 4))) + pad * 2;
      const cellH = Math.max(...all.map((f) => f.h)) * scale + pad * 2 + labelH;
      const cols = Math.min(4, all.length);
      const rows = Math.ceil(all.length / cols);
      const c = document.createElement("canvas");
      c.width = cols * cellW;
      c.height = rows * cellH;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#101724";
      ctx.fillRect(0, 0, c.width, c.height);
      all.forEach((f, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = col * cellW + pad, y = row * cellH + pad;
        const tmp = document.createElement("canvas");
        tmp.width = f.w; tmp.height = f.h;
        tmp.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(f.rgba), f.w, f.h), 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, x, y, f.w * scale, f.h * scale);
        ctx.fillStyle = "#d9ddcd";
        ctx.font = "8px monospace";
        ctx.fillText(f.key, x, y + f.h * scale + 8);
      });
      return c.toDataURL("image/png");
    };
    return { "1x": draw(1), "4x": draw(4) };
  }, sheetInput);
  for (const [scale, dataUrl] of Object.entries(sheet)) {
    writeFileSync(`${outPngBase}-${scale}.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
  }

  console.log(`[m10-ember-trail] mode=${mode} -> ${outJson}`);
  console.log(`trail(${params.texture}): worst nearWhiteA7=${worst.nearWhiteA7Pct}% nearWhiteMin200=${worst.nearWhiteMinRgb200Pct}% footprintPuffMax=${worst.footprintPuffMax}px footprintStack=${worst.footprintStack}px`);
  if (proj) console.log(`projectile_ember (Kontext): nearWhiteA7=${proj.nearWhiteA7Pct}% offPalette=${proj.offPalette} binaryAlpha=${proj.binaryAlpha}`);
  console.log(`VERDICT: ${pass ? "PASS" : "FAIL"} (Ziel Near-White <= 2 %, Footprint <= 60 px)`);
  if (errors.length) console.log("JS ERRORS:\n" + errors.join("\n"));

  // ── Chaos-Beleg: 640x360, >= 500 Gegner, 4 Ember-Projektile im Flug ──
  if (doChaos) {
    const chaosJson = outJson.replace(/\.json$/, "-chaos.json");
    const chaosPng = outJson.replace(/\.json$/, "-chaos-640.png");
    await startRun(page);
    const chaosState = await page.evaluate(async () => {
      const lf = window.__lf;
      const run = window.__game.scene.getScene("run");
      lf.god(true);
      lf.autoPlay(false);
      lf.setSuppressLevelUps(true);
      lf.setFxDamping(false);
      lf.addWeapon("ember", 8); // Stufe 8 = 4 Funken je Schuss
      // Nur Ember: Natur-Spawns aus, Bestand rein per spawnEnemy.
      window.__game.registry.set("lf-density", 0);
      run.registry.set("lf-density", 0);
      await lf.teleport(2048, 2048);
      const rand = (() => { let a = 20261127 >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
      const plan = [["bog_rat", 280], ["crow", 220], ["ghoul", 200]];
      for (const [id, count] of plan) {
        const before = run.enemies.active.filter((e) => e.alive).length;
        lf.spawnEnemy(id, count);
        const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
        for (const e of fresh) {
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand()) * 120;
          e.x = 2048 + Math.cos(a) * r;
          e.y = 2048 + Math.sin(a) * r;
          e.vx = 0; e.vy = 0;
          e.hp = 1e9; e.maxHp = 1e9; // Chaos bleibt leben, Ember feuert dauerhaft
          e.damage = 0;
        }
      }
      return run.enemies.active.filter((e) => e.alive).length;
    });
    // Auf >= 4 Ember-Projektile im Flug warten (Schuss-Cooldown 0,5 s).
    await page.waitForFunction(() => {
      const run = window.__game?.scene?.getScene?.("run");
      return Boolean(run?.combat?.projectiles?.active?.filter?.((p) => p.active && p.weaponId === "ember").length >= 4);
    }, { timeout: 10000 });
    await page.waitForTimeout(200); // Schweif sichtbar (t = 0,2 s, Szene laeuft)
    await page.screenshot({ path: chaosPng });
    const chaosMetrics = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const cam = run.cameras.main;
      const enemies = run.enemies.active.filter((e) => e.alive).length;
      const projs = run.combat.projectiles.active
        .filter((p) => p.active && p.weaponId === "ember")
        .map((p) => ({
          x: Math.round(p.x), y: Math.round(p.y),
          screenX: Math.round(p.x - cam.scrollX), screenY: Math.round(p.y - cam.scrollY),
          dist: Math.round(Math.hypot(p.x - run.player.x, p.y - run.player.y)),
          trailTexture: p.trail,
        }));
      const trailFx = run.combat.fx.active.filter((f) => f.active && f.frames?.[0]?.includes("ember_trail")).length;
      const fireFx = run.combat.fx.active.filter((f) => f.active && f.frames?.[0]?.startsWith("fx_fire")).length;
      return {
        enemies,
        projectiles: projs,
        trailFxActive: trailFx,
        fxFireActive: fireFx,
        viewport: { w: 640, h: 360 },
      };
    });
    chaos = { file: chaosPng, json: chaosJson, ...chaosMetrics, jsErrors: errors };
    const chaosReport = {
      lane: "m10-ember-trail",
      generatedAt: new Date().toISOString(),
      screenshot: chaosPng,
      ...chaosMetrics,
      acceptance: { enemiesMin: 500, projectilesMin: 4, jsErrorsMax: 0 },
      jsErrors: errors,
    };
    writeFileSync(chaosJson, JSON.stringify(chaosReport, null, 2));
    const chaosPass = chaosMetrics.enemies >= 500 && chaosMetrics.projectiles.length >= 4 && errors.length === 0;
    console.log(`[m10-ember-trail] chaos -> ${chaosPng} (enemies=${chaosMetrics.enemies}, ember=${chaosMetrics.projectiles.length}, trailFx=${chaosMetrics.trailFxActive}, fx_fire=${chaosMetrics.fxFireActive}, jsErrors=${errors.length})`);
    console.log(`CHAOS VERDICT: ${chaosPass ? "PASS" : "FAIL"}`);
  }
} finally {
  await browser.close();
  server.stop();
}
