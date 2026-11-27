#!/usr/bin/env node
// #K1 Runtime-Atlas-Audit: prueft, ob der Atlas alle heissen Sprite-Klassen
// vollstaendig enthaelt, ob die Zellen mindestens 2 px Abstand haben und ob
// Nachbarzellen in den Randbereich einbluten.
//
//   node scripts/art/atlas-audit.mjs [--out shots/m10-atlas-audit.json]
//
// Quelle der Wahrheit:
//  - src/gfx/atlas.ts: ATLAS_KEY, ATLAS_PREFIXES, ATLAS_DENY (statisch geparst)
//  - src/gfx/gen-enemies.ts / gen-bosses.ts: Frame-Listen (statisch geparst)
//  - src/data/enemies.ts: spriteKey je Gegner (statisch geparst)
//  - laufendes Spiel (window.__game.textures): tatsaechliche Atlas-Frames + Pixel
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "../harness.mjs";

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}
const outPath = opt("out", "shots/m10-atlas-audit.json");

// ---------------------------------------------------------------- Quellen
const atlasSrc = readFileSync("src/gfx/atlas.ts", "utf8");
const atlasKey = /export const ATLAS_KEY = "([a-z0-9_]+)"/.exec(atlasSrc)?.[1];
if (!atlasKey) throw new Error("ATLAS_KEY nicht in src/gfx/atlas.ts gefunden");

const prefixesBlock = /const ATLAS_PREFIXES = \[([\s\S]*?)\];/.exec(atlasSrc)?.[1] ?? "";
const prefixes = [...prefixesBlock.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);

const denyBlock = /const ATLAS_DENY = new Set\(\[([\s\S]*?)\]\)/.exec(atlasSrc)?.[1] ?? "";
const deny = new Set([...denyBlock.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));

const shouldAtlas = (key) => {
  if (deny.has(key) || key === atlasKey) return false;
  return prefixes.some((p) => key.startsWith(p));
};

/** Liest GEN_ENEMIES/GEN_BOSSES: Key + w/h + Frame-Anzahl. */
function parseGen(file) {
  const src = readFileSync(file, "utf8");
  const entries = new Map();
  const re = /^ {2}([a-z0-9_]+): \{ w: (\d+), h: (\d+), frames: \[/gm;
  let m;
  while ((m = re.exec(src))) {
    const [, key, w, h] = m;
    let i = re.lastIndex;
    let depth = 1;
    let frames = 0;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "[") {
        if (depth === 1) frames++;
        depth++;
      } else if (ch === "]") depth--;
      i++;
    }
    entries.set(key, { w: Number(w), h: Number(h), frames });
  }
  return entries;
}

const genEnemies = parseGen("src/gfx/gen-enemies.ts");
const genBosses = parseGen("src/gfx/gen-bosses.ts");

const enemySrc = readFileSync("src/data/enemies.ts", "utf8");
const spriteKeys = [...enemySrc.matchAll(/spriteKey: "([a-z0-9_]+)"/g)].map((m) => m[1]);
const bossSrc = readFileSync("src/data/bosses.ts", "utf8");
const bossIds = [...bossSrc.matchAll(/id: "([a-z0-9_]+)"/g)].map((m) => m[1]);

const frameKeysFor = (base, count) =>
  Array.from({ length: count }, (_, i) => (i === 0 ? base : `${base}_${i + 1}`));

const expectedEnemyFrames = [];
for (const sk of spriteKeys) {
  const gen = genEnemies.get(sk);
  if (!gen) {
    expectedEnemyFrames.push({ key: sk, missingGen: true, frames: [] });
    continue;
  }
  expectedEnemyFrames.push({ key: sk, frames: frameKeysFor(sk, gen.frames) });
}
const expectedBossFrames = [];
for (const id of bossIds) {
  const gen = genBosses.get(`boss_${id}`);
  if (!gen) {
    expectedBossFrames.push({ key: `boss_${id}`, missingGen: true, frames: [] });
    continue;
  }
  expectedBossFrames.push({ key: `boss_${id}`, frames: frameKeysFor(`boss_${id}`, gen.frames) });
}

const flat = (arr) => arr.flatMap((e) => e.frames);

// ---------------------------------------------------------------- Runtime
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") jsErrors.push(m.text()); });

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await page.waitForFunction(() => Boolean(window.__game), { timeout: 10000 });
  await waitForScene(page, "title");

  result = await page.evaluate(({ atlasKey, prefixes, deny }) => {
    const tm = window.__game.textures;
    if (!tm.exists(atlasKey)) return { error: `Atlas "${atlasKey}" existiert nicht` };
    const atlas = tm.get(atlasKey);
    const source = atlas.getSourceImage();
    const ctx = source.getContext("2d");
    const img = ctx.getImageData(0, 0, source.width, source.height);
    const alphaAt = (x, y) => {
      if (x < 0 || y < 0 || x >= source.width || y >= source.height) return -1;
      return img.data[(y * source.width + x) * 4 + 3];
    };

    const shouldAtlas = (key) => {
      if (deny.includes(key) || key === atlasKey) return false;
      return prefixes.some((p) => key.startsWith(p));
    };

    const rects = [];
    for (const [name, frame] of Object.entries(atlas.frames)) {
      if (name === "__BASE") continue;
      rects.push({
        key: name,
        x: frame.cutX ?? frame.x,
        y: frame.cutY ?? frame.y,
        w: frame.cutWidth ?? frame.width,
        h: frame.cutHeight ?? frame.height,
      });
    }
    const present = new Set(rects.map((r) => r.key));
    const allKeys = tm.getTextureKeys();

    // Erwartete Prefix-Keys: alle existierenden Texturen, die laut Definition
    // in den Atlas gehoeren muessten (inkl. neuer heisser Klassen).
    const prefixKeys = allKeys.filter(shouldAtlas);

    // ---- Gutter: kleinster Abstand zwischen zwei Frame-Rechtecken.
    let minGap = Infinity;
    const gutterViolations = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
        const gap = Math.max(dx, dy);
        if (gap < minGap) minGap = gap;
        if (gap < 2) gutterViolations.push({ a: a.key, b: b.key, gapPx: gap });
      }
    }

    // ---- Bleed: 2-px-Ring ausserhalb jeder Frame-Zelle muss transparent sein.
    // Ein opaker Pixel dort bedeutet, dass die Nachbarzelle in den Puffer
    // hineinragt (GPU-Sampling kann ihn treffen).
    const bleedCases = [];
    const edgeContent = [];
    for (const r of rects) {
      let bleedPixels = 0;
      let selfEdgePixels = 0;
      for (let y = r.y - 2; y < r.y + r.h + 2; y++) {
        for (let x = r.x - 2; x < r.x + r.w + 2; x++) {
          const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
          const a = alphaAt(x, y);
          if (inside) {
            const edge = x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1;
            if (edge && a > 0) selfEdgePixels++;
          } else if (a > 0) {
            bleedPixels++;
          }
        }
      }
      if (bleedPixels > 0) bleedCases.push({ key: r.key, pixels: bleedPixels });
      if (selfEdgePixels > 0) edgeContent.push({ key: r.key, edgePixels: selfEdgePixels });
    }

    return {
      atlasKey,
      atlasSize: { width: source.width, height: source.height },
      frameCount: rects.length,
      rects,
      present: [...present],
      allTextureKeys: allKeys,
      prefixKeys,
      minGapPx: minGap === Infinity ? null : minGap,
      gutterViolations,
      bleedCases,
      edgeContent,
    };
  }, { atlasKey, prefixes, deny: [...deny] });
} finally {
  await browser.close();
  server.stop();
}

if (!result || result.error) {
  console.error(result?.error ?? "Audit ohne Ergebnis");
  process.exit(1);
}

// ---------------------------------------------------------------- Auswertung
const expectedEnemyKeys = [...new Set(flat(expectedEnemyFrames))];
const expectedBossKeys = [...new Set(flat(expectedBossFrames))];
const expectedPrefixKeys = [...new Set(result.prefixKeys)];
const expectedKeys = [...new Set([...expectedEnemyKeys, ...expectedBossKeys, ...expectedPrefixKeys])];
const present = new Set(result.present);
const missing = expectedKeys.filter((k) => !present.has(k));

// Heisse Klassen, die zwar als Textur existieren, aber (noch) nicht im Atlas
// liegen und auch nicht explizit erwartet werden, sind ein Coverage-Loch.
const hotKeyPatterns = [
  /^enemy_/, /^boss_/, /^gem_/, /^fx_/, /^projectile_/, /^orb_/,
  /^enemy_shot_/, /^telegraph_/, /^ring_/, /^chest_/, /^arrow_chest/,
  /^elite_aura/, /^water_ripple_/, /^flail_/, /^chain_/, /^bone_/,
  /^puddle_/,
];
const hotKeys = result.allTextureKeys.filter((k) =>
  hotKeyPatterns.some((re) => re.test(k)) && !deny.has(k) && k !== atlasKey);
const uncoveredHot = hotKeys.filter((k) => !present.has(k));

const coveragePct = expectedKeys.length === 0 ? 0
  : Math.round((10000 * (expectedKeys.length - missing.length)) / expectedKeys.length) / 100;

const report = {
  tool: "scripts/art/atlas-audit.mjs",
  generatedAt: new Date().toISOString(),
  atlasKey: result.atlasKey,
  atlasSize: result.atlasSize,
  frameCount: result.frameCount,
  expected: {
    enemyFrames: expectedEnemyFrames.map((e) => ({ base: e.key, frames: e.frames.length, missingGen: !!e.missingGen })),
    bossFrames: expectedBossFrames.map((e) => ({ base: e.key, frames: e.frames.length, missingGen: !!e.missingGen })),
    enemyFrameKeys: expectedEnemyKeys.length,
    bossFrameKeys: expectedBossKeys.length,
    prefixKeys: expectedPrefixKeys.length,
    total: expectedKeys.length,
  },
  coverage: {
    present: expectedKeys.length - missing.length,
    total: expectedKeys.length,
    percent: coveragePct,
    missing,
    uncoveredHotKeys: uncoveredHot,
    complete: missing.length === 0 && uncoveredHot.length === 0,
  },
  gutter: {
    requiredPx: 2,
    minGapPx: result.minGapPx,
    violations: result.gutterViolations,
    ok: (result.minGapPx ?? 0) >= 2 && result.gutterViolations.length === 0,
  },
  bleed: {
    bufferPx: 2,
    cases: result.bleedCases,
    count: result.bleedCases.length,
    edgeContentAdvisory: result.edgeContent,
    ok: result.bleedCases.length === 0,
  },
  jsErrors,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

const pass = report.coverage.complete && report.gutter.ok && report.bleed.ok && jsErrors.length === 0;
console.log(`Atlas: ${result.atlasKey} ${result.atlasSize.width}x${result.atlasSize.height}, ${result.frameCount} Frames`);
console.log(`Coverage: ${report.coverage.present}/${report.coverage.total} (${coveragePct}%)` +
  (missing.length ? `  fehlend: ${missing.join(", ")}` : ""));
if (uncoveredHot.length) console.log(`Nicht atlased (heiss): ${uncoveredHot.join(", ")}`);
console.log(`Gutter: min ${report.gutter.minGapPx}px, Verstoesse ${report.gutter.violations.length}`);
console.log(`Bleed: ${report.bleed.count} Faelle` + (report.bleed.count ? ` (${report.bleed.cases.slice(0, 8).map((c) => c.key).join(", ")}${report.bleed.count > 8 ? ", …" : ""})` : ""));
if (report.bleed.edgeContentAdvisory.length) {
  console.log(`Hinweis: ${report.bleed.edgeContentAdvisory.length} Frames mit opakem Randpixel (durch Padding abgesichert)`);
}
if (jsErrors.length) console.log(`JS-Fehler: ${jsErrors.join(" | ")}`);
console.log(`JSON: ${outPath}`);
console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
