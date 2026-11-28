#!/usr/bin/env node
// Lane m10-atlas-gutter — Runtime-Atlas-Audit (baut auf m10-atlas-gaps auf).
//
// Prueft den echten Runtime-Atlas im laufenden Spiel:
//   (a) Coverage: alle heissen Sprite-Klassen (ATLAS_PREFIXES + Enemy-/Boss-
//       Frames) sind als Atlas-Frames vorhanden — je Prefix erfasst/abgelehnt.
//   (b) Gutter: Abstand zwischen Nachbar-Zellen >= ATLAS_GUTTER (2 px).
//   (c) Pixel-Bleed: der 2-px-Ring ausserhalb jeder Frame-Zelle ist either
//       transparent ODER Pixel-identisch zur eigenen Frame-Kante (Replika).
//       Fremdinhalt (Nachbar-Pixel) im Ring ist ein Bleed-Fall. Ausserdem:
//       jedes Frame-Inhaltspixel im Atlas muss pixelidentisch zur Quelle sein.
//
//   node scripts/art/atlas-audit.mjs [--out shots/m10-atlas-gutter-before.json]
//                                     [--shot shots/m10-atlas-gutter-zoom.png]
//                                     [--shot-key ring_frost]
//
// Ohne --shot-key wird der kritischste Frame gewaehlt (meiste opake Randpixel).
// Quelle der Wahrheit:
//  - src/gfx/atlas.ts: ATLAS_KEY, ATLAS_PREFIXES, ATLAS_DENY (statisch geparst)
//  - src/gfx/gen-enemies.ts / gen-bosses.ts: Frame-Listen (statisch geparst)
//  - src/data/enemies.ts / bosses.ts: spriteKey/id je Gegner (statisch geparst)
//  - laufendes Spiel (window.__game.textures): Atlas-Frames + echte Pixel
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "../harness.mjs";

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}
const hasFlag = (name) => argv.includes(`--${name}`);
const outPath = opt("out", "shots/m10-atlas-audit.json");
const shotPath = hasFlag("shot") ? opt("shot", "shots/m10-atlas-gutter-zoom.png") : "";
const shotKeyOpt = opt("shot-key", "");

// ---------------------------------------------------------------- Quellen
const atlasSrc = readFileSync("src/gfx/atlas.ts", "utf8");
const atlasKey = /export const ATLAS_KEY = "([a-z0-9_]+)"/.exec(atlasSrc)?.[1];
if (!atlasKey) throw new Error("ATLAS_KEY nicht in src/gfx/atlas.ts gefunden");

const prefixesBlock = /const ATLAS_PREFIXES = \[([\s\S]*?)\];/.exec(atlasSrc)?.[1] ?? "";
const prefixes = [...prefixesBlock.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);

const denyBlock = /const ATLAS_DENY = new Set\(\[([\s\S]*?)\]\)/.exec(atlasSrc)?.[1] ?? "";
const deny = new Set([...denyBlock.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));

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
  // Der Atlas wird erst im Boot-Warmup hinter dem ersten Titel-Frame gebaut.
  await page.waitForFunction(
    (k) => Boolean(window.__game?.textures?.exists?.(k)),
    atlasKey,
    { timeout: 15000 },
  );

  result = await page.evaluate(({ atlasKey, prefixes, deny }) => {
    const tm = window.__game.textures;
    if (!tm.exists(atlasKey)) return { error: `Atlas "${atlasKey}" existiert nicht` };
    const atlas = tm.get(atlasKey);
    const source = atlas.getSourceImage();
    const sctx = source.getContext("2d");
    const img = sctx.getImageData(0, 0, source.width, source.height);
    const at = (x, y) => {
      if (x < 0 || y < 0 || x >= source.width || y >= source.height) return [-1, 0, 0, 0];
      const i = (y * source.width + x) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
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
    const prefixKeys = allKeys.filter(shouldAtlas);

    // ---- Per-Prefix-Coverage: erfasste vs. abgelehnte Keys je Prefix.
    const prefixStats = prefixes.map((p) => {
      const existing = allKeys.filter((k) => k.startsWith(p) && !deny.includes(k) && k !== atlasKey);
      const inAtlas = existing.filter((k) => present.has(k));
      return {
        prefix: p,
        existing: existing.length,
        inAtlas: inAtlas.length,
        uncovered: existing.filter((k) => !present.has(k)),
      };
    });

    // ---- Quelldaten je Frame (fuer Identitaets-/Replika-Pruefung).
    const srcData = new Map();
    for (const r of rects) {
      const tex = tm.get(r.key);
      if (!tex) continue;
      const s = tex.getSourceImage();
      if (!s || typeof s.getContext !== "function") continue;
      const c = s.getContext("2d");
      if (!c) continue;
      const f = tex.get();
      try {
        srcData.set(r.key, {
          w: s.width,
          h: s.height,
          data: c.getImageData(0, 0, s.width, s.height).data,
          fx: f.cutX ?? f.x,
          fy: f.cutY ?? f.y,
          fw: f.cutWidth ?? f.width,
          fh: f.cutHeight ?? f.height,
        });
      } catch {
        /* Quelle nicht lesbar (z. B. Bild ohne Canvas) -> ueberspringen */
      }
    }
    const srcPx = (d, x, y) => {
      const i = (y * d.w + x) * 4;
      return [d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]];
    };
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

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

    // ---- Bleed/Ring: 2-px-Ring ausserhalb jeder Frame-Zelle. Klassifikation
    // je opakem Pixel: transparent (ok) | eigene Replika (ok) | Fremdinhalt
    // (Bleed-Fall). Replika = pixelidentisch zur geklemmten eigenen Kante.
    const bleedCases = [];
    const edgeContent = [];
    let replicaPixels = 0;
    let ringPixels = 0;
    let transparentRingPixels = 0;
    for (const r of rects) {
      const d = srcData.get(r.key);
      let foreign = 0;
      let replicas = 0;
      let selfEdgePixels = 0;
      for (let y = r.y - 2; y < r.y + r.h + 2; y++) {
        for (let x = r.x - 2; x < r.x + r.w + 2; x++) {
          const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
          const [ar, ag, ab, aa] = at(x, y);
          if (inside) {
            const edge = x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1;
            if (edge && aa > 0) selfEdgePixels++;
            continue;
          }
          ringPixels++;
          if (aa === 0) {
            transparentRingPixels++;
            continue;
          }
          if (d && r.w === d.fw && r.h === d.fh) {
            // Geklemmte eigene Quelle: naechstliegender Eigenpixel.
            const sx = Math.min(Math.max(x - r.x, 0), d.fw - 1) + d.fx;
            const sy = Math.min(Math.max(y - r.y, 0), d.fh - 1) + d.fy;
            if (same([ar, ag, ab, aa], srcPx(d, sx, sy))) {
              replicas++;
              continue;
            }
          }
          foreign++;
        }
      }
      if (foreign > 0) bleedCases.push({ key: r.key, foreignPx: foreign, replicaPx: replicas });
      if (selfEdgePixels > 0) edgeContent.push({ key: r.key, edgePixels: selfEdgePixels });
      if (d) replicaPixels += replicas;
    }

    // ---- Frame-Inhalt pixelidentisch zur Quelle?
    const contentMismatches = [];
    let contentCheckedFrames = 0;
    for (const r of rects) {
      const d = srcData.get(r.key);
      if (!d || r.w !== d.fw || r.h !== d.fh) continue;
      contentCheckedFrames++;
      let mismatches = 0;
      for (let y = 0; y < r.h && mismatches === 0; y++) {
        for (let x = 0; x < r.w; x++) {
          if (!same(at(r.x + x, r.y + y), srcPx(d, d.fx + x, d.fy + y))) {
            mismatches++;
            break;
          }
        }
      }
      if (mismatches > 0) contentMismatches.push({ key: r.key, mismatches });
    }

    // ---- Kritischster Frame fuer den Zoom-Shot: meiste opake Randpixel.
    let critical = edgeContent[0]?.key ?? rects[0]?.key ?? "";
    let criticalEdge = 0;
    for (const e of edgeContent) {
      if (e.edgePixels > criticalEdge) {
        criticalEdge = e.edgePixels;
        critical = e.key;
      }
    }

    return {
      atlasKey,
      atlasSize: { width: source.width, height: source.height },
      frameCount: rects.length,
      rects,
      present: [...present],
      allTextureKeys: allKeys,
      prefixKeys,
      prefixStats,
      criticalFrame: critical,
      minGapPx: minGap === Infinity ? null : minGap,
      gutterViolations,
      bleedCases,
      ringPixels,
      transparentRingPixels,
      replicaPixels,
      contentMismatches,
      contentCheckedFrames,
      edgeContent,
      srcFramesReadable: srcData.size,
    };
  }, { atlasKey, prefixes, deny: [...deny] });

  // ---- 4x-Zoom-Shot eines kritischen Frames (Nachbar-Kontext im Atlas).
  if (shotPath && result && !result.error) {
    const dataUrl = await page.evaluate(({ atlasKey, shotKeyOpt, critical }) => {
      const atlas = window.__game.textures.get(atlasKey);
      const src = atlas.getSourceImage();
      const rects = Object.entries(atlas.frames)
        .filter(([n]) => n !== "__BASE")
        .map(([name, f]) => ({
          key: name,
          x: f.cutX ?? f.x, y: f.cutY ?? f.y,
          w: f.cutWidth ?? f.width, h: f.cutHeight ?? f.height,
        }));
      const key = shotKeyOpt && rects.some((r) => r.key === shotKeyOpt) ? shotKeyOpt : critical;
      const r = rects.find((x) => x.key === key);
      if (!r) return null;
      const Z = 4;
      const cx = 6; // Kontext: 6 px Atlas-Umgebung um die Zelle
      const sx = Math.max(0, r.x - cx);
      const sy = Math.max(0, r.y - cx);
      const sw = Math.min(src.width - sx, r.w + 2 * cx);
      const sh = Math.min(src.height - sy, r.h + 2 * cx);
      const c = document.createElement("canvas");
      c.width = sw * Z;
      c.height = sh * Z;
      const ctx = c.getContext("2d");
      // Schachbrett-Hintergrund: Transparenz im Gutter sichtbar machen.
      for (let y = 0; y < sh; y += 4) {
        for (let x = 0; x < sw; x += 4) {
          ctx.fillStyle = ((x / 4 + y / 4) | 0) % 2 === 0 ? "#242424" : "#2e2e2e";
          ctx.fillRect(x * Z, y * Z, 4 * Z, 4 * Z);
        }
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw * Z, sh * Z);
      // Frame-Rechteck markieren (rot, 1 Atlas-px = 4 Zoom-px).
      ctx.strokeStyle = "#ff2222";
      ctx.lineWidth = 2;
      ctx.strokeRect((r.x - sx) * Z + 1, (r.y - sy) * Z + 1, r.w * Z - 2, r.h * Z - 2);
      return c.toDataURL("image/png");
    }, { atlasKey, shotKeyOpt, critical: result.criticalFrame });
    if (dataUrl) {
      mkdirSync(dirname(shotPath), { recursive: true });
      writeFileSync(shotPath, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
      result.shotSaved = shotPath;
      result.shotFrame = shotKeyOpt && result.rects.some((r) => r.key === shotKeyOpt)
        ? shotKeyOpt : result.criticalFrame;
    }
  }
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
const hotKeyPatterns = prefixes.map((p) => new RegExp(`^${p}`));
const hotKeys = result.allTextureKeys.filter((k) =>
  hotKeyPatterns.some((re) => re.test(k)) && !deny.has(k) && k !== atlasKey);
const uncoveredHot = hotKeys.filter((k) => !present.has(k));

const coveragePct = expectedKeys.length === 0 ? 0
  : Math.round((10000 * (expectedKeys.length - missing.length)) / expectedKeys.length) / 100;

const report = {
  tool: "scripts/art/atlas-audit.mjs",
  lane: "m10-atlas-gutter",
  generatedAt: new Date().toISOString(),
  atlasKey: result.atlasKey,
  atlasSize: result.atlasSize,
  frameCount: result.frameCount,
  frames: result.rects.map((r) => ({ key: r.key, w: r.w, h: r.h })),
  expected: {
    enemyFrames: expectedEnemyFrames.map((e) => ({ base: e.key, frames: e.frames.length, missingGen: !!e.missingGen })),
    bossFrames: expectedBossFrames.map((e) => ({ base: e.key, frames: e.frames.length, missingGen: !!e.missingGen })),
    enemyFrameKeys: expectedEnemyKeys.length,
    bossFrameKeys: expectedBossKeys.length,
    prefixKeys: expectedPrefixKeys.length,
    total: expectedKeys.length,
  },
  prefixes: result.prefixStats,
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
    ringPixels: result.ringPixels,
    transparentRingPixels: result.transparentRingPixels,
    replicaPixels: result.replicaPixels,
    contentCheckedFrames: result.contentCheckedFrames,
    contentMismatches: result.contentMismatches,
    edgeContentAdvisory: result.edgeContent,
    ok: result.bleedCases.length === 0 && result.contentMismatches.length === 0,
  },
  criticalFrame: result.criticalFrame,
  shot: result.shotSaved ? { path: result.shotSaved, frame: result.shotFrame } : undefined,
  jsErrors,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

const pass = report.coverage.complete && report.gutter.ok && report.bleed.ok && jsErrors.length === 0;
console.log(`Atlas: ${result.atlasKey} ${result.atlasSize.width}x${result.atlasSize.height}, ${result.frameCount} Frames (${result.srcFramesReadable} Quellen lesbar)`);
console.log(`Coverage: ${report.coverage.present}/${report.coverage.total} (${coveragePct}%)` +
  (missing.length ? `  fehlend: ${missing.join(", ")}` : ""));
if (uncoveredHot.length) console.log(`Nicht atlased (heiss): ${uncoveredHot.join(", ")}`);
const pu = result.prefixStats.filter((p) => p.uncovered.length > 0);
console.log(`Prefixes: ${result.prefixStats.length}, mit Luecken: ${pu.length}` +
  (pu.length ? ` -> ${pu.map((p) => `${p.prefix}(${p.uncovered.length})`).join(", ")}` : ""));
console.log(`Gutter: min ${report.gutter.minGapPx}px, Verstoesse ${report.gutter.violations.length}`);
console.log(`Bleed: ${report.bleed.count} Fremd-Faelle, ${result.replicaPixels} Replika-Pixel, ` +
  `${result.contentMismatches.length} Inhalts-Differenzen (${result.contentCheckedFrames} Frames geprueft)`);
if (report.bleed.count) console.log(`  Faelle: ${report.bleed.cases.slice(0, 8).map((c) => `${c.key}(${c.foreignPx})`).join(", ")}${report.bleed.count > 8 ? ", …" : ""}`);
if (report.bleed.edgeContentAdvisory.length) {
  console.log(`Hinweis: ${report.bleed.edgeContentAdvisory.length} Frames mit opakem Randpixel (kritischster: ${result.criticalFrame})`);
}
if (result.shotSaved) console.log(`Zoom-Shot: ${result.shotSaved} (Frame ${result.shotFrame})`);
if (jsErrors.length) console.log(`JS-Fehler: ${jsErrors.join(" | ")}`);
console.log(`JSON: ${outPath}`);
console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
