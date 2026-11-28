#!/usr/bin/env node
// M10-Elite-Tier-Families: Elites sind im 300-500er-Chaos ihrer Tier-Familie
// zuzuordnen (Faerbe-Klassen je Tier). Dieses Skript belegt Vorher ("before",
// crowd-variety-Stand ohne Tier-Klassen) und Nachher ("after") mit demselben
// Lauf-Aufbau — EIN Lauf pro Stand, kein Tuning-Loop.
//
//   flock -w 240 /home/ai/games/.lf-perf.lock node scripts/m10-elite-tier.mjs --tag=before
//   -> shots/m10-elite-tier-before.json + .png + -crop4x.png
//
// Aufbau (identisch fuer beide Tags):
// - Chaos: ~305 Nicht-Elite-Gegner (Tier-Mix 0-4) in Ring 130-240 um den Spieler.
// - Elite-Cluster: 2 Instanzen je Elite-Typ aller 5 Tiers im Radius 30-75.
// - Full-Shot 960x540 (2x), 4x-nearest-Crop des Elite-Clusters (In-Page-Canvas,
//   imageSmoothingEnabled=false — nie verzerrend).
// - Metrik: Familien-Buckets der Elite-Koerperpixel je Tier (Palettenindex,
//   Klassifikation wie tests/enemy-palette.test.ts), Amber-Rim-Coverage (A10),
//   Burst-FPS ueber 240 rAF-Ticks (Vergleichswert), iGPU-Renderer-String (Pflicht).
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
const OUT_JSON = `shots/m10-elite-tier-${TAG}.json`;
const OUT_PNG = `shots/m10-elite-tier-${TAG}.png`;
const OUT_CROP = `shots/m10-elite-tier-${TAG}-crop4x.png`;
const MINUTE_SEC = Number(argOf("seconds", "730")); // Minute 12: kein Boss (naechster bei 900)
const FPS_FRAMES = Number(argOf("frames", "240")) || 240;

// Chaos-Mix (Nicht-Elite, ~305 Gegner, Tier 0-4 wie im Endgame-Mix).
const CHAOS_MIX = [
  ["bog_rat", 60], ["wisp", 40], ["crow", 30], ["bogzombie", 25], ["mudling", 20],
  ["bat", 20], ["skeleton", 15], ["ghoul", 10], ["wolf", 12], ["banshee", 8],
  ["spider", 10], ["cultist", 6], ["knight", 8], ["lich", 5], ["wraith", 6],
  ["horror", 5], ["centipede", 5], ["gargoyle", 5], ["reaper_bat", 8],
  ["abom", 3], ["voidcaller", 4],
];

// 2 Elite-Instanzen je Typ — Cluster nahe am Spieler (Crop-Region).
const ELITE_TYPES = [
  "bog_rat", "wisp",                     // Tier 0
  "skeleton", "scarecrow",               // Tier 1
  "wolf", "banshee", "golem",            // Tier 2
  "knight", "lich", "wraith", "treant",  // Tier 3
  "horror", "centipede", "gargoyle", "voidcaller", "abom", "reaper_bat", // Tier 4
];

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

const SEED_FN = `
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
`;

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);

  result = await page.evaluate(async ({ chaosMix, eliteTypes, minuteSec, seedSrc, fpsFrames, palHex }) => {
    // eslint-disable-next-line no-eval
    eval(seedSrc);
    const run = window.__game.scene.getScene("run");
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.skipTo(minuteSec);
    window.__lf.setTimeScale(1);
    window.__game.registry.set("lf-density", 0);
    run.registry.set("lf-density", 0);
    // Bestand raeumen (skipTo hat Wellen-Gegner aufgebaut).
    for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
    await new Promise((r) => setTimeout(r, 250));

    const rand = mulberry32(20261128);
    const px = 380; // weit weg vom 600s-Boss (spawnt an der Skip-Position)
    const py = 380;
    window.__lf.teleport(px, py);

    // 1) Chaos-Ring (Nicht-Elite).
    const uids = [];
    const total = chaosMix.reduce((a, b) => a + b[1], 0);
    for (const [id, n] of chaosMix) {
      const count = Math.max(1, Math.round((n / total) * 305));
      const fresh = run.spawner.spawnEnemy(id, count, px, py, false);
      for (const e of fresh) {
        const a = rand() * Math.PI * 2;
        const r = 130 + Math.sqrt(rand()) * 110;
        e.x = px + Math.cos(a) * r;
        e.y = py + Math.sin(a) * r;
        e.vx = 0; e.vy = 0;
        e.hp = 1e9; e.maxHp = 1e9; e.damage = 0;
        uids.push(e.uid);
      }
    }

    // 2) Elite-Cluster (Rim-Def via Spawner-Elite-Pfad) Radius 30-75.
    const elitesPerTier = {};
    for (const id of eliteTypes) {
      const fresh = run.spawner.spawnEnemy(id, 2, px, py, true);
      for (const e of fresh) {
        const a = rand() * Math.PI * 2;
        const r = 30 + rand() * 45;
        e.x = px + Math.cos(a) * r;
        e.y = py + Math.sin(a) * r;
        e.vx = 0; e.vy = 0;
        e.hp = 1e9; e.maxHp = 1e9; e.damage = 0;
        elitesPerTier[e.def.tier] = (elitesPerTier[e.def.tier] ?? 0) + 1;
        uids.push(e.uid);
      }
    }
    await new Promise((r) => setTimeout(r, 400));

    // Beleg-Aufraeumen (nur Darstellung, kein Gameplay-Eingriff): der bei 600 s
    // gespawnte Boss und XP-Gems gehoeren nicht ins Elite-Cluster-Crop.
    for (const b of run.bosses?.bosses ?? []) {
      b.sprite?.setVisible(false);
      if (b.enemy?.sprite) b.enemy.sprite.setVisible(false);
    }
    for (const g of run.pickups?.gems ?? []) g.sprite?.setVisible(false);

    // 3) Familien-Metrik aus den ECHTEN Elite-Texturen (Original-Canvas
    //    bleibt laut atlas.ts erhalten; Palettenindex-Klassifikation wie
    //    tests/enemy-palette.test.ts).
    const familyOf = (c) => {
      if (c <= 0) return "kontur";
      if (c <= 2) return "dunkel-neutral";
      if (c <= 7) return "blau";
      if (c <= 9) return "mittel-neutral";
      if (c <= 13) return "hell-neutral";
      if (c <= 19) return "glut-braun";
      if (c <= 22) return "gold";
      if (c <= 27) return "blut-rot";
      return "gruen";
    };
    const PAL_SET = new Map(palHex.map((h, i) => [h, i]));
    const tex = run.textures;
    let eliteSeen = 0; let texMiss = 0;
    const rimCoverage = {};
    const tierBuckets = {}; // tier -> family -> Innenpixel-Count ueber alle Elite-Typen des Tiers
    for (const e of run.enemies.active) {
      if (!e.alive || !uids.includes(e.uid) || !e.elite) continue;
      eliteSeen++;
      const key = `${e.def.spriteKey}_rim`;
      if (!tex.exists(key)) { texMiss++; continue; }
      const source = tex.get(key).getSourceImage();
      const w = source.width; const h = source.height;
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const c2 = cv.getContext("2d");
      c2.drawImage(source, 0, 0);
      const data = c2.getImageData(0, 0, w, h).data;
      const idxAt = (x, y) => {
        const rgb = (data[(y * w + x) * 4] << 16) | (data[(y * w + x) * 4 + 1] << 8) | data[(y * w + x) * 4 + 2];
        return PAL_SET.get(rgb) ?? -1;
      };
      const filled = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 0;
      let boundary = 0, amber = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!filled(x, y)) continue;
          const isB = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
          if (!isB) continue;
          boundary++;
          if (idxAt(x, y) === 20) amber++;
        }
      }
      rimCoverage[e.def.spriteKey] = { tier: e.def.tier, boundary, amberShare: boundary ? +(amber / boundary).toFixed(3) : 0 };
      // Innenpixel -> Familien-Buckets je Tier.
      const t = e.def.tier;
      tierBuckets[t] ??= {};
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!filled(x, y)) continue;
          const isB = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
          if (isB) continue;
          const idx = idxAt(x, y);
          if (idx === 0 || idx === 13 || idx < 0) continue; // Kontur/Augen/Off-Palette unangetastet
          const f = familyOf(idx);
          tierBuckets[t][f] = (tierBuckets[t][f] ?? 0) + 1;
        }
      }
    }
    const tierFamilies = {};
    for (const [t, buckets] of Object.entries(tierBuckets)) {
      const sum = Object.values(buckets).reduce((a, b) => a + b, 0);
      const shares = Object.fromEntries(Object.entries(buckets).map(([f, k]) => [f, +(k / sum).toFixed(3)]));
      const dom = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "?";
      tierFamilies[t] = { dominantFamily: dom, shares };
    }
    const distinctDominantFamilies = new Set(Object.values(tierFamilies).map((v) => v.dominantFamily)).size;
    const amberShareMin = Math.min(...Object.values(rimCoverage).map((v) => v.amberShare));

    // 4) Burst-FPS (Vergleichswert, beide Tags unter flock).
    const deltas = [];
    let last = performance.now();
    let seen = 0;
    await new Promise((resolve) => {
      const tick = (now) => {
        if (seen > 0) deltas.push(now - last);
        last = now;
        seen++;
        if (seen >= fpsFrames + 1) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const d = deltas.slice().sort((a, b) => a - b);
    const medianFps = d.length ? Math.round(1000 / d[Math.floor(d.length / 2)]) : null;
    const meanFps = d.length ? Math.round(1000 / (d.reduce((a, b) => a + b, 0) / d.length)) : null;

    // 5) 4x-nearest-Crop des Elite-Clusters (In-Page, nie verzerrend).
    const cam = run.cameras.main;
    const gameCanvas = window.__game.canvas;
    const scale = gameCanvas.width / 480; // Canvas-Pixel pro Spielpixel
    const cw = 110; const ch = 80;        // Crop in Spielpixeln um den Spieler
    const sx = Math.round((px - cw / 2 - cam.scrollX) * scale);
    const sy = Math.round((py - ch / 2 - cam.scrollY) * scale);
    const crop = document.createElement("canvas");
    crop.width = cw * 4; crop.height = ch * 4;
    const cctx = crop.getContext("2d");
    cctx.imageSmoothingEnabled = false;
    cctx.drawImage(gameCanvas, sx, sy, Math.round(cw * scale), Math.round(ch * scale), 0, 0, cw * 4, ch * 4);
    crop.style.cssText = `position:fixed;top:0;left:0;z-index:9999;image-rendering:pixelated;width:${cw * 4}px;height:${ch * 4}px;background:#06070c;`;
    crop.id = "crop4x";
    // Erst NACH dem Full-Shot einfuegen (zweites evaluate), damit das
    // Vollbild nicht vom Crop verdeckt wird.
    window.__cropCanvas = crop;

    // GL-Renderer (Mesa Intel iGPU erwartet — Pflicht im Beleg).
    let renderer = "";
    try {
      const gl = window.__game.renderer?.gl ?? window.__game.renderer?.canvas?.getContext("webgl2") ?? null;
      const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
      renderer = (dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || (gl ? gl.getParameter(gl.RENDERER) : "") || "";
    } catch { renderer = "unbekannt"; }

    const alive = run.enemies.active.filter((e) => e.alive && uids.includes(e.uid)).length;
    return {
      alive,
      eliteSeen,
      texMiss,
      elitesPerTier,
      rimCoverage,
      tierFamilies,
      distinctDominantFamilies,
      amberShareMin,
      medianFps,
      meanFps,
      renderer,
    };
  }, {
    chaosMix: CHAOS_MIX,
    eliteTypes: ELITE_TYPES,
    minuteSec: MINUTE_SEC,
    seedSrc: SEED_FN,
    fpsFrames: FPS_FRAMES,
    palHex: [0x06070c, 0x0a0e16, 0x101724, 0x17202e, 0x1e2a3a, 0x2a3547, 0x3a4a5c, 0x4e5f6e, 0x6b7c86, 0x8fa0a6, 0xb8c4c2, 0xd9ddcd, 0xf2edd8, 0xfff8e6, 0x2b1410, 0x4d2214, 0x7a331a, 0xa84a21, 0xcf6b26, 0xef9130, 0xffb84d, 0xffd77a, 0xffeeb0, 0x3d1220, 0x7a1f2e, 0xb8303f, 0xe4574d, 0xff8a6b, 0x16261e, 0x22382a, 0x3d5a38, 0x6f9b58],
  });

  await page.screenshot({ path: OUT_PNG });
  await page.evaluate(() => document.body.appendChild(window.__cropCanvas));
  await page.screenshot({ path: OUT_CROP, clip: { x: 0, y: 0, width: 440, height: 320 } });
} finally {
  await browser.close();
  server.stop();
}

const json = {
  generatedAt: new Date().toISOString(),
  method: "Chaos (305 Nicht-Elites, Tier-Mix) + Elite-Cluster (2 je Typ, alle 5 Tiers, Radius 30-75); Familien-Buckets der Elite-Rim-Innenpixel je Tier (Palettenindex-Klassifikation wie tests/enemy-palette.test.ts); Amber-Rim-Coverage = Randpixel-Anteil PAL 20 (A10-Vertrag); Burst-FPS = Median/Mittel ueber 240 rAF-Ticks (unter flock gemessen)",
  tag: TAG,
  minuteSec: MINUTE_SEC,
  renderer: result.renderer,
  alive: result.alive,
  eliteSeen: result.eliteSeen,
  texMiss: result.texMiss,
  elitesPerTier: result.elitesPerTier,
  amberShareMin: result.amberShareMin,
  rimCoverage: result.rimCoverage,
  tierFamilies: result.tierFamilies,
  distinctDominantFamilies: result.distinctDominantFamilies,
  burstFps: { median: result.medianFps, mean: result.meanFps, frames: FPS_FRAMES },
  jsErrors: errors,
};
writeFileSync(OUT_JSON, JSON.stringify(json, null, 2));
console.log(JSON.stringify(json, null, 2));
