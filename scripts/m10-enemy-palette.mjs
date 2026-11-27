#!/usr/bin/env node
// M10-Enemy-Palette: Vorher/Nachher-Beleg der Gegner-Palette.
//
// Rendert (headless, echtes Spiel):
//  1. Kontaktbogen aller 30 Gegner-Typen (Frame 0, 3x nearest) →
//     shots/m10-enemy-palette-<tag>-sheet.png
//  2. Chaos-Frame mit 500 Gegnern (Mischung mehrerer Stufen/Biome) über die
//     sichtbare Fläche verteilt → shots/m10-enemy-palette-<tag>.png
//  3. Familien-Zählung aus den ECHTEN Sprite-Pixeln (Texturen, nicht vom
//     Screenshot): Hue/Sat/Lum-Cluster je Pixel, Familie zählt wenn >= 5 %
//     Pixelanteil. plus iGPU-Renderer-String → shots/m10-enemy-palette-<tag>.json
//
// Läuft OHNE flock (keine FPS-Messung, Screenshots + Pixelstatistik).
//   node scripts/m10-enemy-palette.mjs --tag=before
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
const MINUTE = Number(argOf("minute", "1490")) || 1490;
const OUT_PNG = `shots/m10-enemy-palette-${TAG}.png`;
const OUT_SHEET = `shots/m10-enemy-palette-${TAG}-sheet.png`;
const OUT_JSON = `shots/m10-enemy-palette-${TAG}.json`;

// Mischung über Biome/Stufen (Mid-/Late-Game-Masse): bewusst mehrere Familien-vertretende Typen.
const MIX = [
  ["bog_rat", 70], ["wisp", 40], ["mudling", 40], ["crow", 50], ["bogzombie", 40],
  ["toad", 20], ["skeleton", 40], ["bat", 50], ["ghoul", 30], ["witchling", 25],
  ["slime", 30], ["scarecrow", 10], ["wolf", 25], ["spider", 25], ["cultist", 15],
  ["golem", 10], ["bomber", 10], ["banshee", 10], ["knight", 5], ["wraith", 5],
];

// Die 30 Gegner-IDs (spriteKey = "enemy_<id>", Frame-Namen im Runtime-Atlas).
const ENEMY_IDS = [
  "bog_rat", "wisp", "mudling", "crow", "bogzombie", "toad",
  "skeleton", "bat", "ghoul", "witchling", "slime", "scarecrow",
  "wolf", "banshee", "golem", "spider", "cultist", "bomber",
  "knight", "harpy", "lich", "wraith", "treant", "imp",
  "horror", "centipede", "gargoyle", "reaper_bat", "abom", "voidcaller",
];

// Hue/Sat/Lum-Familienklassifikation, im Page-Kontext ausgeführt.
const FAMILY_SRC = `
  function lfFamily(r, g, b) {
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
    const l = (mx + mn) / 2;
    if (l < 0.055) return "kontur";
    const d = mx - mn;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (s < 0.22) return l < 0.3 ? "dunkel-neutral" : (l > 0.62 ? "hell-neutral" : "mittel-neutral");
    let h = 0;
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    if (h >= 340 || h < 14) return "blut-rot";
    if (h < 45) return "glut-braun";
    if (h < 70) return "gold";
    if (h < 200) return "gruen";
    return "blau";
  }
  function lfFramePixels(game, texKey, frameName) {
    const tex = game.textures.get(texKey);
    const src = tex.source[0].image;
    const f = tex.frames[frameName] ?? tex.frames.__BASE;
    const c = document.createElement("canvas");
    c.width = f.width; c.height = f.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, f.cutX, f.cutY, f.width, f.height, 0, 0, f.width, f.height);
    return ctx.getImageData(0, 0, f.width, f.height);
  }
  /** Texture+Frame-Ort eines Sprite-Keys ("enemy_<id>") über alle Texturen. */
  function lfLocate(game, keys) {
    const loc = {};
    for (const key of keys) {
      for (const tk of game.textures.getTextureKeys()) {
        if (game.textures.get(tk).frames[key]) { loc[key] = { texKey: tk, frameName: key }; break; }
      }
    }
    return loc;
  }
  function lfFamilyStats(game, loc) {
    const FAMS = ["blut-rot", "glut-braun", "gold", "gruen", "blau", "hell-neutral", "mittel-neutral", "dunkel-neutral", "kontur"];
    const perType = {};
    const totals = Object.fromEntries(FAMS.map((f) => [f, 0]));
    let grand = 0;
    for (const [key, { texKey, frameName }] of Object.entries(loc)) {
      const img = lfFramePixels(game, texKey, frameName);
      const counts = Object.fromEntries(FAMS.map((f) => [f, 0]));
      let n = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i + 3] < 128) continue;
        const f = lfFamily(img.data[i], img.data[i + 1], img.data[i + 2]);
        counts[f]++; totals[f]++; n++; grand++;
      }
      let dom = "kontur", best = -1;
      for (const f of FAMS) if (counts[f] > best) { best = counts[f]; dom = f; }
      const shares = Object.fromEntries(FAMS.filter((f) => counts[f] > 0).map((f) => [f, Math.round((counts[f] / n) * 1000) / 1000]));
      perType[key] = { w: img.width, h: img.height, n, dominant: dom, shares };
    }
    const frameShares = Object.fromEntries(FAMS.filter((f) => totals[f] > 0).map((f) => [f, Math.round((totals[f] / grand) * 1000) / 1000]));
    const distinct = Object.keys(frameShares).length;
    const counted = Object.keys(frameShares).filter((f) => frameShares[f] >= 0.05).length;
    return { perType, frameShares, distinctFamilies: distinct, countedFamilies: counted };
  }
  function lfRendererName(game) {
    const gl = game.renderer?.gl ?? null;
    if (!gl) return null;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? null) : null;
  }
`;

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);

  // ── 1) Kontaktbogen aller 30 Typen (Frame 0) ─────────────────────────────
  const sheetInfo = await page.evaluate(async ({ familySrc, ids }) => {
    // eslint-disable-next-line no-eval
    eval(familySrc);
    const game = window.__game;
    const keys = ids.map((id) => `enemy_${id}`);
    const loc = lfLocate(game, keys);
    const missing = keys.filter((k) => !loc[k]);
    if (missing.length) throw new Error("Kontaktboegen: fehlende Frames " + missing.join(","));
    const CELL = 100; // 32 px * 3 + Rand
    const COLS = 6;
    const ROWS = Math.ceil(keys.length / COLS);
    const canvas = document.createElement("canvas");
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#1a2321"; // dunkler Moor-Ton als Beleg-Hintergrund
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    keys.forEach((key, i) => {
      const img = lfFramePixels(game, loc[key].texKey, loc[key].frameName);
      const cnv = document.createElement("canvas");
      cnv.width = img.width; cnv.height = img.height;
      cnv.getContext("2d").putImageData(img, 0, 0);
      const scale = 3;
      const dw = img.width * scale;
      const dh = img.height * scale;
      const cx = (i % COLS) * CELL + (CELL - dw) / 2;
      const cy = Math.floor(i / COLS) * CELL + (CELL - dh) / 2;
      ctx.drawImage(cnv, cx, cy, dw, dh);
    });
    canvas.id = "lf-palette-sheet";
    canvas.style.cssText = "position:fixed;left:0;top:0;z-index:99999;image-rendering:pixelated;";
    document.body.appendChild(canvas);
    // Familien-Statistik JETZT (vor skipTo): spaeter rebakt der Runtime-Atlas
    // (Chunks/Glyphs kommen hinzu) und die Frame-Pixel sind nicht mehr verlaesslich.
    const fam = lfFamilyStats(game, loc);
    return { keys, loc, fam };
  }, { familySrc: FAMILY_SRC, ids: ENEMY_IDS });
  await page.locator("#lf-palette-sheet").screenshot({ path: OUT_SHEET });
  await page.evaluate(() => document.getElementById("lf-palette-sheet")?.remove());

  // ── 2) Chaos-Frame: 500 Gegner über die sichtbare Fläche ─────────────────
  await page.evaluate(async ({ mix, minute, familySrc }) => {
    // eslint-disable-next-line no-eval
    eval(familySrc);
    const run = window.__game.scene.getScene("run");
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.setTimeScale(1);
    // Natur-Spawns aus, sonst pendelt der Bestand.
    window.__game.registry.set("lf-density", 0);
    run.registry.set("lf-density", 0);
    window.__lf.skipTo(minute);
    // Level-Ups abräumen (skipTo erzeugt XP → Menü würde den Chaos-Frame verdecken).
    for (let i = 0; i < 30 && run.levelUpOpen; i++) window.__lf.pickLevelUp(1);
    run.xpState.pendingLevelUps = 0;
    // Boss + Banner + Boss-HUD aus dem Beleg halten (skipTo löst Boss-Spawns aus).
    if (Array.isArray(run.bossFlags)) run.bossFlags = [true, true, true, true, true, true];
    run.bosses?.clear?.();
    const ui = window.__game.scene.getScene("ui");
    ui?.bannerGroup?.setVisible(false)?.setAlpha?.(0);
    ui?.bossGroup?.setVisible(false);
    for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
    await new Promise((r) => setTimeout(r, 250));
    const px = 2048;
    const py = 2048;
    window.__lf.teleport(px, py);
    let seed = 20261127;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const total = 500;
    const sum = mix.reduce((a, b) => a + b[1], 0);
    for (const [id, n] of mix) {
      const count = Math.max(1, Math.round((n / sum) * total));
      const before = run.enemies.active.filter((e) => e.alive).length;
      window.__lf.spawnEnemy(id, count);
      const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
      for (const e of fresh) {
        // Gleichmaessig ueber die sichtbare Flaeche (~440x250 intern) verteilt.
        e.x = px + (rand() - 0.5) * 440;
        e.y = py + (rand() - 0.5) * 250;
        e.vx = 0;
        e.vy = 0;
        e.hp = 1e9;
        e.maxHp = 1e9;
        e.damage = 0;
      }
    }
    return run.enemies.active.filter((e) => e.alive).length;
  }, { mix: MIX, minute: MINUTE, familySrc: FAMILY_SRC });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT_PNG });

  // ── 3) Familien-Zählung: Pixel aus dem frischen Atlas (vor skipTo), ───────
  //     gewichtet mit der Chaos-Mischung (gleiche Gewichte wie beim Spawn).
  const weighted = {};
  let wsum = 0;
  for (const [id, n] of MIX) {
    const key = `enemy_${id}`;
    const per = sheetInfo.fam.perType[key];
    if (!per) continue;
    wsum += n;
    for (const [f, s] of Object.entries(per.shares)) weighted[f] = (weighted[f] ?? 0) + s * n;
  }
  for (const f of Object.keys(weighted)) weighted[f] = Math.round((weighted[f] / wsum) * 1000) / 1000;
  const countedFamilies = Object.keys(weighted).filter((f) => weighted[f] >= 0.05).length;

  const stats = await page.evaluate(({ familySrc }) => {
    // eslint-disable-next-line no-eval
    eval(familySrc);
    const run = window.__game.scene.getScene("run");
    const alive = run.enemies.active.filter((e) => e.alive);
    const byType = {};
    for (const e of alive) {
      const fn = String(e.sprite?.frame?.name ?? "");
      if (!fn.startsWith("enemy_")) continue;
      byType[fn.replace(/_?\d+$/, "").replace(/_rim$/, "")] = (byType[fn.replace(/_?\d+$/, "").replace(/_rim$/, "")] ?? 0) + 1;
    }
    const game = window.__game;
    return {
      aliveCount: alive.length,
      mixTypes: byType,
      rendererName: lfRendererName(game),
      rendererInfo: window.__lf?.rendererInfo?.() ?? null,
    };
  }, { familySrc: FAMILY_SRC });

  result = {
    tag: TAG,
    generatedAt: new Date().toISOString(),
    seed: 1,
    minute: MINUTE,
    sheetKeys: sheetInfo.keys,
    ...stats,
    perType: sheetInfo.fam.perType,
    frameShares: weighted,
    distinctFamilies: Object.keys(weighted).length,
    countedFamilies,
    jsErrors: errors,
  };
} finally {
  await browser.close();
  server.stop();
}

writeFileSync(OUT_JSON, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({
  tag: TAG,
  aliveCount: result.aliveCount,
  distinctFamilies: result.distinctFamilies,
  countedFamilies: result.countedFamilies,
  frameShares: result.frameShares,
  rendererName: result.rendererName,
  jsErrors: result.jsErrors,
}, null, 2));
process.exit(result && result.jsErrors.length === 0 && result.aliveCount > 400 ? 0 : 1);
