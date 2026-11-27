#!/usr/bin/env node
// #K5 Beleg: kontrollierte Render-Szene aus heissen Atlas-Frames.
// - Screenshot derselben Szene (Vorher-/Nachher-Build) fuer Pixel-Diff.
// - Zaehlt echte WebGL-Draw-Calls pro Frame (drawArrays/drawElements) und
//   vergleicht die Batch-/Draw-Call-Zahl zwischen alter und neuer Atlas-Packung.
//
//   node scripts/art/atlas-evidence.mjs --out shots/m10-atlas-before.png --json shots/m10-atlas-before.json
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureBuild, startServer, loadPlaywright } from "../harness.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const outPath = opt("out", "shots/m10-atlas-after.png");
const jsonPath = opt("json", outPath.replace(/\.png$/i, ".json"));

// Statische Render-Szene: heisse Atlas-Frames im Wechsel mit 13 weiteren
// Texturen (Glyphen, die in beiden Builds Einzeltexturen bleiben) und den in
// #K3 neu atlasierten Heiss-Keys. Vorher: 17 distinkte Texturen (> 16
// MultiPipeline-Textureinheiten) => 2 Batches. Nachher: 14 => 1 Batch.
const ATLAS_KEYS = [
  "enemy_wolf", "gem_small", "fx_spark", "enemy_bat", "projectile_ember",
  "enemy_wisp", "fx_fire", "enemy_bog_rat", "gem_medium", "fx_star",
  "enemy_ghoul", "projectile_thorn", "enemy_crow", "fx_bolt",
];
const NEW_ATLAS_KEYS = ["flail_ball", "chain_link", "puddle_poison"];
const OTHER_TEXTURES = [
  "glyph_7_43", "glyph_7_45", "glyph_7_47", "glyph_7_61", "glyph_7_65",
  "glyph_7_66", "glyph_7_67", "glyph_7_68", "glyph_7_69", "glyph_7_70",
  "glyph_7_71", "glyph_7_72", "glyph_7_73",
];
const HOT_SEQUENCE = [];
for (let i = 0; i < OTHER_TEXTURES.length; i++) {
  HOT_SEQUENCE.push(ATLAS_KEYS[i % ATLAS_KEYS.length]);
  HOT_SEQUENCE.push(OTHER_TEXTURES[i]);
  if (i < NEW_ATLAS_KEYS.length) HOT_SEQUENCE.push(NEW_ATLAS_KEYS[i]);
  HOT_SEQUENCE.push(ATLAS_KEYS[(i + 3) % ATLAS_KEYS.length]);
}
HOT_SEQUENCE.push("enemy_skeleton", "gem_large", "fx_halo", "boss_moor_queen", "fx_shock");

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

// WebGL-Draw-Calls zaehlen, bevor Phaser den Kontext erstellt.
await page.addInitScript(() => {
  window.__gl = { draws: 0, frames: 0 };
  const wrap = (proto, fn) => {
    if (!proto || typeof proto[fn] !== "function") return;
    const orig = proto[fn];
    proto[fn] = function (...args) {
      window.__gl.draws++;
      return orig.apply(this, args);
    };
  };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    wrap(C.prototype, "drawArrays");
    wrap(C.prototype, "drawElements");
    wrap(C.prototype, "drawArraysInstanced");
    wrap(C.prototype, "drawElementsInstanced");
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { window.__gl.frames++; return cb(t); });
});

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await page.waitForFunction(() => Boolean(window.__game), { timeout: 10000 });
  await page.waitForFunction(() => window.__game.textures.exists("runtime_atlas"), { timeout: 10000 });

  const info = await page.evaluate((sequence) => {
    const game = window.__game;
    const tm = game.textures;
    const atlas = tm.get("runtime_atlas");
    const atlased = new Set(Object.keys(atlas.frames));

    // Andere Szenen anhalten, eigene statische Szene starten.
    for (const key of ["title", "charselect", "run", "ui"]) {
      if (game.scene.isActive(key)) game.scene.stop(key);
    }
    let shown = [];
    game.scene.add("atlas_showcase", {
      key: "atlas_showcase",
      active: true,
      create() {
        this.cameras.main.setBackgroundColor("#14121c");
        const cols = 8;
        const cell = 44;
        const x0 = 28;
        const y0 = 26;
        sequence.forEach((key, i) => {
          const cx = x0 + (i % cols) * cell;
          const cy = y0 + Math.floor(i / cols) * cell;
          const has = atlased.has(key) && tm.exists("runtime_atlas");
          const img = has
            ? this.add.image(cx, cy, "runtime_atlas", key)
            : (tm.exists(key) ? this.add.image(cx, cy, key) : null);
          if (img) {
            img.setOrigin(0.5, 0.5);
            shown.push({ key, path: has ? "atlas" : "texture" });
          }
        });
      },
    }, true);

    return {
      atlasSize: { width: atlas.source[0].width, height: atlas.source[0].height },
      atlasFrames: Object.keys(atlas.frames).length - 1,
      rendererType: game.renderer.type,
      distinctTextures: [...new Set(shown.map((s) => s.path === "atlas" ? "runtime_atlas" : s.key))].length,
      shown,
      nonAtlasShown: shown.filter((s) => s.path !== "atlas").map((s) => s.key),
    };
  }, HOT_SEQUENCE);

  await page.waitForTimeout(600);

  // Draw-Calls pro Frame messen (statische Szene, keine Update-Bewegung).
  const measure = await page.evaluate(async () => {
    window.__gl.draws = 0;
    window.__gl.frames = 0;
    await new Promise((r) => setTimeout(r, 1200));
    const draws = window.__gl.draws;
    const frames = window.__gl.frames;
    return { draws, frames, drawsPerFrame: frames ? Math.round((draws / frames) * 100) / 100 : null };
  });

  mkdirSync(dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath });

  const report = {
    tool: "scripts/art/atlas-evidence.mjs",
    generatedAt: new Date().toISOString(),
    image: outPath,
    atlasSize: info.atlasSize,
    atlasFrames: info.atlasFrames,
    rendererType: info.rendererType,
    distinctTextures: info.distinctTextures,
    sequenceLength: info.shown.length,
    shown: info.shown,
    nonAtlasShown: info.nonAtlasShown,
    drawCalls: measure,
    jsErrors: errors,
  };
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");

  console.log(`Atlas ${info.atlasSize.width}x${info.atlasSize.height}, ${info.atlasFrames} Frames`);
  console.log(`Szene: ${info.shown.length}/${HOT_SEQUENCE.length} Sprites, nicht-atlased: ${info.nonAtlasShown.length}`);
  console.log(`Draw-Calls: ${measure.draws} in ${measure.frames} Frames = ${measure.drawsPerFrame}/Frame`);
  if (errors.length) console.log(`JS-Fehler: ${errors.join(" | ")}`);
  console.log(`PNG: ${outPath}`);
  console.log(`JSON: ${jsonPath}`);
  process.exit(errors.length ? 1 : 0);
} finally {
  await browser.close();
  server.stop();
}
