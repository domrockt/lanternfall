#!/usr/bin/env node
// Lane m10-warmup-chunk-fine (K1/K3): Warmup-Chunking messen.
//
//   node scripts/m10-warmup-chunk.mjs [--out shots/m10-warmup-chunk-before.json]
//                                     [--runs 3] [--tag before|after]
//
// Pro Lauf (frischer Browser-Context = kalter Cache): Anzahl Warmup-Chunks,
// je-Chunk-Dauer (window.__bootTimings.tasks, von src/scenes/Loading.ts
// protokolliert — keine Szenen-Aenderung noetig), laengster Einzel-Chunk
// (groesster Frame-Stall vor dem Titel), Summe aller Chunks (Gesamt-Warmup)
// und Zeit bis interaktiv (erster gerendertes Titel-Frame, titleRendered).
//
// Kein flock: kein FPS-/Echtzeit-Langlauf, nur Boot-Messung (Regel lanes/common.md).
// Metrik-Definition (vor der Messung festgelegt, Lane-Briefing K3):
//   - "First-Chunk-Wartezeit" = laengster Einzel-Chunk (maxChunkMs) — der
//     derived-atlas-Sammelchunk ist vorher der groesste Stall.
//   - Regressionsschwelle: sumChunkMs nachher <= vorher * 1,05 (Chunk-Overhead).
import { writeFileSync, mkdirSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright } from "./harness.mjs";

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

const out = opt("out", "shots/m10-warmup-chunk-before.json");
const runs = Number(opt("runs", "3"));
const tag = opt("tag", out.includes("after") ? "after" : "before");

ensureBuild();
const server = await startServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();

const results = [];
let jsErrors = [];
try {
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(`http://127.0.0.1:${server.port}/?run=${i + 1}`, { waitUntil: "commit" });
    await page.waitForFunction(
      () => Boolean(window.__lf) && window.__lf.state().scene === "title",
      null,
      { timeout: 15000, polling: "raf" },
    );
    const probe = await page.evaluate(() => {
      const bt = window.__bootTimings ?? {};
      const tasks = (bt.tasks ?? []).map((t) => ({ label: t.label, ms: Math.round(t.ms * 1000) / 1000 }));
      const durs = tasks.map((t) => t.ms);
      return {
        loadingStart: bt.loadingStart ?? null,
        loadingDone: bt.loadingDone ?? null,
        titleRendered: bt.titleRendered ?? null,
        tasks,
        chunkCount: tasks.length,
        maxChunkMs: durs.length ? Math.max(...durs) : -1,
        sumChunkMs: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) * 1000) / 1000 : -1,
        textures: window.__game ? window.__game.textures.getTextureKeys().length : -1,
        atlas: window.__game ? window.__game.textures.exists("runtime_atlas") : false,
      };
    });
    await context.close();

    jsErrors.push(...errors);
    results.push({
      run: i + 1,
      chunkCount: probe.chunkCount,
      maxChunkMs: probe.maxChunkMs,
      sumChunkMs: probe.sumChunkMs,
      titleRenderedMs: probe.titleRendered != null ? Math.round(probe.titleRendered) : null,
      warmupMs: probe.loadingDone != null && probe.loadingStart != null
        ? Math.round(probe.loadingDone - probe.loadingStart) : null,
      textures: probe.textures,
      atlas: probe.atlas,
      tasks: probe.tasks,
    });
    if (probe.atlas !== true) errors.push("runtime_atlas fehlt nach Warmup");
    if (errors.length) console.error(`[run ${i + 1}] Fehler:`, errors);
  }
} finally {
  await browser.close();
  await server.stop();
}

const maxChunk = results.map((r) => r.maxChunkMs);
const sumChunk = results.map((r) => r.sumChunkMs);
const title = results.map((r) => r.titleRenderedMs);
const summary = {
  tag,
  runs: results.length,
  medianMaxChunkMs: median(maxChunk),
  medianSumChunkMs: median(sumChunk),
  medianTitleRenderedMs: median(title),
  results,
};
writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
console.log(`[m10-warmup-chunk] ${tag}: ${results.length} Läufe -> ${out}`);
console.log(`  Chunks: ${results[0]?.chunkCount}  maxChunk (median): ${summary.medianMaxChunkMs} ms  sumChunk (median): ${summary.medianSumChunkMs} ms  titleRendered (median): ${summary.medianTitleRenderedMs} ms`);

function median(arr) {
  if (!arr.length || arr.some((v) => v == null)) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 1000) / 1000;
}
