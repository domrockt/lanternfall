#!/usr/bin/env node
/**
 * M10-ember-halo-resight K1 — verbindliche Nachsicht auf aktuellem main:
 * Halo-Überstrahlung Ember (Restpunkt dom-sight-package 2026-11-28).
 *
 * Misst auf EINEM Lauf:
 *   1) Texturen: projectile_ember (Signatur, gen-fx), fx_ember_muzzle (Glow-Klecks),
 *      fx_ember_trail — Near-White-A7, nearWhiteMinRgb200, Off-Palette, Alpha.
 *   2) Glow-Klecks additiv komponiert über nightDeep, einmal mit der realen
 *      Spiel-Alpha (0,55, CombatSystem fireEmber) und Worst-Case 0,95.
 *   3) Einzelprojektil-Szene (640x360, eingefroren): Near-White in Fenstern um
 *      Projektil und Mündung + Zoom-Crops für die art-director-Sichtprüfung.
 *   4) Chaos-Szene: >= 500 Gegner, >= 4 Ember-Projektile (Rezept m10-ember-trail),
 *      eingefroren: Near-White je Projektil-Fenster + Gesamtframe.
 *
 * Kein FPS-/Echtzeitlauf -> keine flock-Sperre.
 * Belege: ~/games/.evidence/m10-ember-halo-resight/ (Parameter 1 = Präfix).
 * Aufruf: node scripts/m10-ember-halo.mjs [baseline|after]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { ensureBuild, loadPlaywright, startServer, startRun } from "./harness.mjs";

const PALETTE_HEX = [
  0x06070c, 0x0a0e16, 0x101724, 0x17202e, 0x1e2a3a, 0x2a3547, 0x3a4a5c, 0x4e5f6e,
  0x6b7c86, 0x8fa0a6, 0xb8c4c2, 0xd9ddcd, 0xf2edd8, 0xfff8e6, 0x2b1410, 0x4d2214,
  0x7a331a, 0xa84a21, 0xcf6b26, 0xef9130, 0xffb84d, 0xffd77a, 0xffeeb0, 0x3d1220,
  0x7a1f2e, 0xb8303f, 0xe4574d, 0xff8a6b, 0x16261e, 0x22382a, 0x3d5a38, 0x6f9b58,
];

const isNearWhiteA7 = (r, g, b) => r >= 150 && g >= 150 && b >= 150 && r >= 235;
const isNearWhiteMin = (r, g, b, min = 200) => Math.min(r, g, b) >= min;
const paletteIndex = (r, g, b) => PALETTE_HEX.indexOf((r << 16) | (g << 8) | b);

function analyzeRgba(rgba, w, h, footprint = null) {
  let opaque = 0, semi = 0, offPalette = 0, nearA7 = 0, nearMin = 0;
  const total = w * h;
  for (let i = 0; i < total; i++) {
    if (footprint && !footprint[i]) continue;
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3];
    if (a === 0) continue;
    if (a !== 255) { semi++; continue; }
    opaque++;
    if (paletteIndex(r, g, b) < 0) offPalette++;
    if (isNearWhiteA7(r, g, b)) nearA7++;
    if (isNearWhiteMin(r, g, b)) nearMin++;
  }
  const pct = (n) => (opaque ? +((100 * n) / opaque).toFixed(2) : 0);
  return {
    w, h, total, opaque, semi, offPalette,
    nearWhiteA7: nearA7, nearWhiteA7Pct: pct(nearA7),
    nearWhiteMinRgb200: nearMin, nearWhiteMinRgb200Pct: pct(nearMin),
    binaryAlpha: semi === 0,
  };
}

/** Additiv (mit Alpha) über nightDeep komponieren + Footprint. */
function compositeAdditive(rgba, w, h, alpha, bg = [0x0a, 0x0e, 0x16]) {
  const out = new Uint8ClampedArray(w * h * 4);
  const footprint = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3];
    if (a === 0) {
      out[i * 4] = bg[0]; out[i * 4 + 1] = bg[1]; out[i * 4 + 2] = bg[2]; out[i * 4 + 3] = 255;
      continue;
    }
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.min(255, Math.round(bg[c] + rgba[i * 4 + c] * alpha));
    out[i * 4 + 3] = 255;
    footprint[i] = 1;
  }
  return { rgba: out, footprint };
}

const prefix = process.argv[2] ?? "baseline";
const outDir = `${homedir()}/games/.evidence/m10-ember-halo-resight`;
mkdirSync(outDir, { recursive: true });

ensureBuild();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const server = await startServer();
const errors = [];
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

/** Dekodiert einen Screenshot-PNG pixelgenau (ffmpeg -> rawvideo RGBA). */
function decodeShot(pngPath, w = 640, h = 360) {
  const raw = execFileSync("ffmpeg", ["-loglevel", "error", "-i", pngPath, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1e8 });
  if (raw.length !== w * h * 4) throw new Error(`decodeShot: ${pngPath} liefert ${raw.length} B, erwartet ${w * h * 4}`);
  return { w, h, data: raw };
}

/** Zoom-Crops (nearest) aus einem Screenshot-PNG via ffmpeg. */
function cropShots(pngPath, crops, base) {
  for (const [name, { x, y, s = 20, zoom = 4 }] of Object.entries(crops)) {
    const cx = Math.max(0, Math.min(640 - s, Math.round(x - s / 2)));
    const cy = Math.max(0, Math.min(360 - s, Math.round(y - s / 2)));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", pngPath, "-vf", `crop=${s}:${s}:${cx}:${cy},scale=${s * zoom}:${s * zoom}:flags=neighbor`, base + `-${name}.png`], { stdio: "ignore" });
  }
}

/** Near-White in einem Fenster (Seitenlänge s) um (x,y) im Frame. */
function windowNearWhite(frame, cx, cy, s = 25) {
  const x0 = Math.max(0, cx - Math.floor(s / 2));
  const y0 = Math.max(0, cy - Math.floor(s / 2));
  let opaque = 0, a7 = 0, min200 = 0;
  for (let y = y0; y < Math.min(frame.h, y0 + s); y++) {
    for (let x = x0; x < Math.min(frame.w, x0 + s); x++) {
      const i = (y * frame.w + x) * 4;
      const r = frame.data[i], g = frame.data[i + 1], b = frame.data[i + 2];
      if (r === 0 && g === 0 && b === 0) continue;
      opaque++;
      if (isNearWhiteA7(r, g, b)) a7++;
      if (isNearWhiteMin(r, g, b)) min200++;
    }
  }
  const pct = (n) => (opaque ? +((100 * n) / opaque).toFixed(2) : 0);
  return { opaque, nearWhiteA7: a7, nearWhiteA7Pct: pct(a7), nearWhiteMinRgb200: min200, nearWhiteMinRgb200Pct: pct(min200) };
}

function frameNearWhite(frame) {
  let opaque = 0, a7 = 0, min200 = 0;
  const total = frame.w * frame.h;
  for (let i = 0; i < total; i++) {
    const r = frame.data[i * 4], g = frame.data[i * 4 + 1], b = frame.data[i * 4 + 2];
    if (isNearWhiteA7(r, g, b)) a7++;
    if (isNearWhiteMin(r, g, b)) min200++;
    opaque++;
  }
  const pct = (n) => +((100 * n) / total).toFixed(3);
  return { opaque, nearWhiteA7: a7, nearWhiteA7Pct: pct(a7), nearWhiteMinRgb200: min200, nearWhiteMinRgb200Pct: pct(min200) };
}

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=77`);
  await page.waitForFunction(() => Boolean(window.__game && window.__lf), { timeout: 15000 });
  await page.waitForFunction(() => window.__game.textures.exists("projectile_ember"), { timeout: 15000 });

  const rendererInfo = await page.evaluate(() => window.__lf.rendererInfo?.() ?? null);
  const renderer = rendererInfo?.renderer ?? "";
  if (/swiftshader/i.test(renderer)) {
    console.error(`GUARD FAIL: SwiftShader-Renderer "${renderer}" — Beleg ungültig (Regel iGPU-Renderer).`);
    process.exit(2);
  }

  // ── 1) Texturen + 2) additiver Glow-Kleck ──────────────────────────
  const raw = await page.evaluate(() => {
    const mgr = window.__game.textures;
    const dump = (key) => {
      if (!mgr.exists(key)) return null;
      const src = mgr.get(key).getSourceImage();
      const w = src.width ?? src.naturalWidth, h = src.height ?? src.naturalHeight;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, 0, 0);
      return { w, h, rgba: Array.from(ctx.getImageData(0, 0, w, h).data) };
    };
    const keys = ["projectile_ember", "fx_ember_muzzle", "fx_ember_trail"];
    const out = {};
    for (const k of keys) { const d = dump(k); if (d) out[k] = d; }
    return out;
  });

  const textures = {};
  for (const [key, d] of Object.entries(raw)) textures[key] = analyzeRgba(new Uint8ClampedArray(d.rgba), d.w, d.h);

  const muzzle = raw.fx_ember_muzzle ?? null;
  const glowComposites = {};
  if (muzzle) {
    for (const alpha of [0.55, 0.95]) {
      const comp = compositeAdditive(new Uint8ClampedArray(muzzle.rgba), muzzle.w, muzzle.h, alpha);
      glowComposites[`alpha${String(alpha).replace(".", ",")}`] = {
        texture: "fx_ember_muzzle", additiveAlpha: alpha, background: "#0a0e16 (nightDeep)",
        footprintPixels: comp.footprint.reduce((n, v) => n + v, 0),
        ...analyzeRgba(comp.rgba, muzzle.w, muzzle.h, comp.footprint),
      };
    }
  }

  // Kontaktblatt 1x/4x der drei Texturen (Schachbrett für Alpha).
  const sheet = await page.evaluate((frames) => {
    const draw = (scale) => {
      const pad = 4, labelH = 10;
      const cellW = Math.max(...frames.map((f) => Math.max(f.w * scale, f.key.length * 4 + 4))) + pad * 2;
      const cellH = Math.max(...frames.map((f) => f.h)) * scale + pad * 2 + labelH;
      const c = document.createElement("canvas");
      c.width = frames.length * cellW; c.height = cellH;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#101724";
      ctx.fillRect(0, 0, c.width, c.height);
      frames.forEach((f, i) => {
        const x = i * cellW + pad, y = pad;
        for (let yy = 0; yy < f.h * scale; yy += 2 * scale) {
          for (let xx = 0; xx < f.w * scale; xx += 2 * scale) {
            ctx.fillStyle = ((xx / scale + yy / scale) & 1) ? "#1e2a3a" : "#17202e";
            ctx.fillRect(x + xx, y + yy, 2 * scale, 2 * scale);
          }
        }
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
  }, Object.entries(raw).map(([key, d]) => ({ key, w: d.w, h: d.h, rgba: d.rgba })));
  for (const [scale, dataUrl] of Object.entries(sheet)) {
    writeFileSync(`${outDir}/m10-ember-halo-${prefix}-sheet-${scale}.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
  }

  // ── 3) Einzelprojektil ─────────────────────────────────────────────
  await startRun(page);
  await page.evaluate(async () => {
    const lf = window.__lf;
    const run = window.__game.scene.getScene("run");
    lf.god(true); lf.autoPlay(false); lf.setSuppressLevelUps(true); lf.setFxDamping(false);
    window.__game.registry.set("lf-density", 0);
    run.registry.set("lf-density", 0);
    await lf.teleport(2048, 2048);
    lf.addWeapon("ember", 1);
    lf.spawnEnemy("bog_rat", 3);
    const fresh = run.enemies.active.filter((e) => e.alive);
    for (const e of fresh) {
      const a = (e.uid % 3) * 2.1 + 0.4;
      e.x = 2048 + Math.cos(a) * 300; e.y = 2048 + Math.sin(a) * 300;
      e.vx = 0; e.vy = 0; e.hp = 1e9; e.maxHp = 1e9; e.damage = 0;
    }
  });
  await page.waitForFunction(() => {
    const run = window.__game?.scene?.getScene?.("run");
    return Boolean(run?.combat?.projectiles?.active?.some?.((p) => p.active && p.weaponId === "ember"));
  }, { timeout: 10000, polling: 16 });
  await page.evaluate(() => window.__lf.setTimeScale(0));
  await page.waitForTimeout(100);
  const singleState = await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const cam = run.cameras.main;
    return {
      player: { x: Math.round(run.player.x), y: Math.round(run.player.y), screenX: Math.round(run.player.x - cam.scrollX), screenY: Math.round(run.player.y - cam.scrollY) },
      projectiles: run.combat.projectiles.active.filter((p) => p.active && p.weaponId === "ember")
        .map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), screenX: Math.round(p.x - cam.scrollX), screenY: Math.round(p.y - cam.scrollY) })),
      // Ember-Muendungsglut: aktive fx-Sprites an ihrer echten Position
      // (VFX-Sprite-Regel: alpha >= 0,6 + im Viewport, sonst kein Beweis).
      muzzleBlobs: run.combat.fx.active.filter((f) => f.active && (f.frames?.[0]?.includes("ember_muzzle") || f.texture === "fx_ember_muzzle") && f.sprite.alpha >= 0.6)
        .map((f) => ({ screenX: Math.round(f.x - cam.scrollX), screenY: Math.round(f.y - cam.scrollY), alpha: +f.sprite.alpha.toFixed(2) })),
      enemies: run.enemies.active.filter((e) => e.alive).length,
      time: window.__lf.stats().time,
    };
  });
  const singleCrops = {};
  singleState.projectiles.forEach((p, i) => { singleCrops[`proj${i}`] = { x: p.screenX, y: p.screenY }; });
  singleCrops.player = { x: singleState.player.screenX, y: singleState.player.screenY, s: 40 };
  const singlePng = `${outDir}/m10-ember-halo-${prefix}-single-640.png`;
  await page.screenshot({ path: singlePng });
  const singleFrame = decodeShot(singlePng);
  cropShots(singlePng, singleCrops, `${outDir}/m10-ember-halo-${prefix}-single-zoom`);
  const singleWindows = singleState.projectiles.map((p, i) => ({ proj: i, at: { x: p.screenX, y: p.screenY }, ...windowNearWhite(singleFrame, p.screenX, p.screenY) }));
  singleWindows.push(...singleState.muzzleBlobs.map((m, i) => ({ proj: `muzzle${i}`, alpha: m.alpha, at: { x: m.screenX, y: m.screenY }, ...windowNearWhite(singleFrame, m.screenX, m.screenY) })));
  // Referenz ohne Ember-Anteil: Heldelicht (light_radius ADD) + Held-Sprite —
  // bewusst NICHT im Ember-Urteil (Confounder, Run.ts light_radius).
  singleWindows.push({ proj: "player(heroLight-ref)", at: { x: singleState.player.screenX, y: singleState.player.screenY }, ...windowNearWhite(singleFrame, singleState.player.screenX, singleState.player.screenY, 41) });
  const singleEmberWindows = singleWindows.filter((w) => !String(w.proj).includes("ref"));

  // ── 4) Chaos: >= 500 Gegner, >= 4 Ember-Projektile ─────────────────
  const chaosState = await page.evaluate(async () => {
    const lf = window.__lf;
    const run = window.__game.scene.getScene("run");
    lf.setTimeScale(1);
    // Trails im Chaos sichtbar pinnen (Endgame-LOD schaltet sie ab; nur Messlauf).
    Object.defineProperty(run.combat.fx, "trailsEnabled", { get: () => true, set: () => {}, configurable: true });
    lf.addWeapon("ember", 8);
    const rand = (() => { let a = 20261127 >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    for (const [id, count] of [["bog_rat", 280], ["crow", 220], ["ghoul", 200]]) {
      const before = run.enemies.active.filter((e) => e.alive).length;
      lf.spawnEnemy(id, count);
      const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
      for (const e of fresh) {
        const a = rand() * Math.PI * 2;
        const r = 160 + Math.sqrt(rand()) * 160;
        e.x = 2048 + Math.cos(a) * r; e.y = 2048 + Math.sin(a) * r;
        e.vx = 0; e.vy = 0; e.hp = 1e9; e.maxHp = 1e9; e.damage = 0;
      }
    }
    return run.enemies.active.filter((e) => e.alive).length;
  });
  // Welle kommt per 50-ms-Top-up (queueEnemyWave): erst auf >= 500 Gegner warten.
  await page.waitForFunction(() => {
    const run = window.__game?.scene?.getScene?.("run");
    return (run?.enemies.active.filter((e) => e.alive).length ?? 0) >= 500;
  }, { timeout: 30000, polling: 100 });
  // Gegner sind in 30 s an den Spieler herangewandert -> Ring wiederherstellen
  // (Rezept m10-ember-trail: Projektile muessen 160+ px Flugraum haben, sonst
  // sterben sie am Pierce-Verbrauch, bevor der Freeze greift).
  await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const rand = (() => { let a = 20261128 >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    for (const e of run.enemies.active) {
      if (!e.alive) continue;
      const a = rand() * Math.PI * 2;
      const r = 160 + Math.sqrt(rand()) * 160;
      e.x = 2048 + Math.cos(a) * r; e.y = 2048 + Math.sin(a) * r;
      e.vx = 0; e.vy = 0;
    }
  });
  await page.waitForFunction(() => {
    const run = window.__game?.scene?.getScene?.("run");
    return Boolean(run?.combat?.projectiles?.active?.filter?.((p) => p.active && p.weaponId === "ember").length >= 4);
  }, { timeout: 10000, polling: 16 });
  await page.evaluate(() => window.__lf.setTimeScale(0));
  await page.waitForTimeout(100);
  const chaosProj = await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const cam = run.cameras.main;
    return {
      enemies: run.enemies.active.filter((e) => e.alive).length,
      projectiles: run.combat.projectiles.active.filter((p) => p.active && p.weaponId === "ember")
        .map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), screenX: Math.round(p.x - cam.scrollX), screenY: Math.round(p.y - cam.scrollY) })),
      player: { screenX: Math.round(run.player.x - cam.scrollX), screenY: Math.round(run.player.y - cam.scrollY) },
      muzzleBlobs: run.combat.fx.active.filter((f) => f.active && (f.frames?.[0]?.includes("ember_muzzle") || f.texture === "fx_ember_muzzle") && f.sprite.alpha >= 0.6)
        .map((f) => ({ screenX: Math.round(f.x - cam.scrollX), screenY: Math.round(f.y - cam.scrollY), alpha: +f.sprite.alpha.toFixed(2) })),
      trailFxActive: run.combat.fx.active.filter((f) => f.active && f.frames?.[0]?.includes("ember_trail")).length,
      time: window.__lf.stats().time,
    };
  });
  const chaosCrops = {};
  chaosProj.projectiles.forEach((p, i) => { chaosCrops[`proj${i}`] = { x: p.screenX, y: p.screenY }; });
  chaosCrops.player = { x: chaosProj.player.screenX, y: chaosProj.player.screenY, s: 40 };
  const chaosPng = `${outDir}/m10-ember-halo-${prefix}-chaos-640.png`;
  await page.screenshot({ path: chaosPng });
  const chaosFrame = decodeShot(chaosPng);
  cropShots(chaosPng, chaosCrops, `${outDir}/m10-ember-halo-${prefix}-chaos-zoom`);
  const chaosWindows = chaosProj.projectiles.map((p, i) => ({ proj: i, at: { x: p.screenX, y: p.screenY }, ...windowNearWhite(chaosFrame, p.screenX, p.screenY) }));
  chaosWindows.push(...chaosProj.muzzleBlobs.map((m, i) => ({ proj: `muzzle${i}`, alpha: m.alpha, at: { x: m.screenX, y: m.screenY }, ...windowNearWhite(chaosFrame, m.screenX, m.screenY) })));
  chaosWindows.push({ proj: "player(heroLight-ref)", at: { x: chaosProj.player.screenX, y: chaosProj.player.screenY }, ...windowNearWhite(chaosFrame, chaosProj.player.screenX, chaosProj.player.screenY, 41) });
  const chaosEmberWindows = chaosWindows.filter((w) => !String(w.proj).includes("ref"));
  const chaosFrameA7 = frameNearWhite(chaosFrame);

  const worst = (arr, key) => arr.reduce((m, w) => Math.max(m, w[key]), 0);
  const texVals = Object.values(textures);
  const glowVals = Object.values(glowComposites);
  const report = {
    lane: "m10-ember-halo-resight",
    card: prefix,
    generatedAt: new Date().toISOString(),
    gitHead: execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(),
    renderer: rendererInfo,
    source: "640x360 @ rbscale=1, Szene eingefroren (timeScale 0), echte Spieltexturen",
    definitions: {
      nearWhiteA7: "r,g,b >= 150 und r >= 235 (ACCEPTANCE A7 / final-vfx-readability)",
      nearWhiteMinRgb200: "min(R,G,B) >= 200 (m10-vfx-evo)",
      offPalette: "opake RGB-Pixel, die keiner der 32 Palettenfarben exakt entsprechen (nur Quelltexturen)",
      binaryAlpha: "alle Alpha-Werte sind 0 oder 255",
    },
    target: { nearWhitePctMax: 4.16, offPaletteMax: 0, binaryAlpha: true, jsErrorsMax: 0, artDirectorMin: "4/5" },
    textures, glowComposites,
    single: { state: singleState, frameNearWhite: frameNearWhite(singleFrame), emberWindows: singleEmberWindows, windows: singleWindows },
    chaos: { enemies: chaosState, ...chaosProj, frameNearWhite: chaosFrameA7, emberWindows: chaosEmberWindows, windows: chaosWindows },
    jsErrors: errors,
  };

  const pass =
    texVals.every((t) => t.nearWhiteA7Pct <= 4.16 && t.nearWhiteMinRgb200Pct <= 4.16 && t.offPalette === 0 && t.binaryAlpha) &&
    glowVals.every((g) => g.nearWhiteA7Pct <= 4.16 && g.nearWhiteMinRgb200Pct <= 4.16) &&
    worst(singleEmberWindows, "nearWhiteA7Pct") <= 4.16 && worst(singleEmberWindows, "nearWhiteMinRgb200Pct") <= 4.16 &&
    worst(chaosEmberWindows, "nearWhiteA7Pct") <= 4.16 && worst(chaosEmberWindows, "nearWhiteMinRgb200Pct") <= 4.16 &&
    chaosFrameA7.nearWhiteA7Pct <= 4.16 && chaosFrameA7.nearWhiteMinRgb200Pct <= 4.16 &&
    chaosProj.enemies >= 500 && chaosProj.projectiles.length >= 4 &&
    errors.length === 0;

  const outJson = `${outDir}/m10-ember-halo-${prefix}.json`;
  writeFileSync(outJson, JSON.stringify(report, null, 2));
  console.log(`[m10-ember-halo] renderer=${renderer}`);
  for (const [k, t] of Object.entries(textures)) console.log(`tex ${k}: A7=${t.nearWhiteA7Pct}% min200=${t.nearWhiteMinRgb200Pct}% offPal=${t.offPalette} binAlpha=${t.binaryAlpha}`);
  for (const [k, g] of Object.entries(glowComposites)) console.log(`glow ${k} (additiv): A7=${g.nearWhiteA7Pct}% min200=${g.nearWhiteMinRgb200Pct}% footprint=${g.footprintPixels}px`);
  console.log(`single: projs=${singleState.projectiles.length} muzzleBlobs=${singleState.muzzleBlobs.length} worstEmberWindow A7=${worst(singleEmberWindows, "nearWhiteA7Pct")}% min200=${worst(singleEmberWindows, "nearWhiteMinRgb200Pct")}%`);
  console.log(`chaos: enemies=${chaosProj.enemies} projs=${chaosProj.projectiles.length} muzzleBlobs=${chaosProj.muzzleBlobs.length} trailFx=${chaosProj.trailFxActive} worstEmberWindow A7=${worst(chaosEmberWindows, "nearWhiteA7Pct")}% min200=${worst(chaosEmberWindows, "nearWhiteMinRgb200Pct")}% frame A7=${chaosFrameA7.nearWhiteA7Pct}% min200=${chaosFrameA7.nearWhiteMinRgb200Pct}%`);
  console.log(`jsErrors=${errors.length}`);
  console.log(`VERDICT: ${pass ? "PASS" : "FAIL"} (Ziel Near-White <= 4,16 % Textur + Chaos, Off-Palette 0, binaeres Alpha, 0 JS-Fehler)`);
} finally {
  await browser.close();
  server.stop();
}
