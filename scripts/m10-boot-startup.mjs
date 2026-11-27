#!/usr/bin/env node
// Lane m10-boot-startup (K1/K3): Kaltstart bis Titel-Szene sichtbar messen.
//
//   node scripts/m10-boot-startup.mjs [--out shots/m10-boot-startup-baseline.json]
//                                     [--runs 3] [--shot shots/m10-boot-startup-baseline.png]
//                                     [--tag baseline|after]
//
// Misst pro Lauf: navigationStart -> Titel-Szene aktiv (window.__lf.state().scene),
// Anzahl erzeugter Texturen zu diesem Zeitpunkt und JS-Fehler im Boot.
// Kein flock: kein FPS-/Echtzeit-Langlauf, nur Boot-Messung (Regel aus lanes/common.md).
// Pro Lauf ein frischer Browser-Context = kalter Cache (echter Kaltstart).
import { writeFileSync, mkdirSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright } from "./harness.mjs";

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

const out = opt("out", "shots/m10-boot-startup-baseline.json");
const runs = Number(opt("runs", "3"));
const shotOut = argv.includes("--shot") ? argv[argv.indexOf("--shot") + 1] : null;
const tag = opt("tag", out.includes("after") ? "after" : "baseline");

ensureBuild();
mkdirSync("shots", { recursive: true });
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
    const probe = await page.evaluate(() => ({
      ms: performance.now(),
      textures: window.__game ? window.__game.textures.getTextureKeys().length : -1,
      atlas: window.__game ? window.__game.textures.exists("runtime_atlas") : false,
      bootTimings: window.__bootTimings ?? null,
    }));
    // Metrik "Titel sichtbar": erster gerendertes Titel-Frame (titleRendered aus
    // window.__bootTimings). Der State-Poll allein ist im Nachher-Lauf verfaelscht,
    // weil der Warmup-Makrotask den naechsten rAF-Poll verzögert.
    const titleMs = Math.round(probe.bootTimings?.titleRendered ?? probe.ms);
    if (i === 0 && shotOut) {
      await page.screenshot({ path: shotOut });
    }
    // Warmup-Probe: Nach kurzer Frist müssen alle Texturen + Atlas vollständig sein.
    await page.waitForTimeout(800);
    const settled = await page.evaluate(() => ({
      textures: window.__game ? window.__game.textures.getTextureKeys().length : -1,
      atlas: window.__game ? window.__game.textures.exists("runtime_atlas") : false,
      bootTimings: window.__bootTimings ?? null,
    }));
    await context.close();

    results.push({
      run: i + 1, titleMs, pollMs: Math.round(probe.ms), textures: probe.textures, atlas: probe.atlas,
      bootTimings: probe.bootTimings,
      afterWarmup: { textures: settled.textures, atlas: settled.atlas },
    });
    if (probe.bootTimings?.warmStart !== undefined
      && (settled.atlas !== true || settled.bootTimings?.warmDone === undefined)) {
      errors.push(`warmup unvollständig: atlas=${settled.atlas}, warmDone=${settled.bootTimings?.warmDone}`);
    }
    jsErrors = jsErrors.concat(errors);
    console.log(`[m10-boot-startup] Lauf ${i + 1}: ${Math.round(probe.ms)} ms, Texturen: ${probe.textures}, Atlas: ${probe.atlas}, Fehler: ${errors.length}`);
  }
} finally {
  await browser.close();
  server.stop();
}

const times = results.map((r) => r.titleMs);
const summary = {
  tag,
  date: new Date().toISOString(),
  runs,
  avgMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
  maxMs: Math.max(...times),
  minMs: Math.min(...times),
  results,
  texturesAtTitle: results[0]?.bootTimings?.titleTextureCount ?? results[0]?.textures ?? null,
  jsErrors,
};
writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
console.log(`[m10-boot-startup] ${tag}: avg ${summary.avgMs} ms, max ${summary.maxMs} ms, Texturen bis Titel: ${summary.texturesAtTitle}, JS-Fehler: ${jsErrors.length} -> ${out}`);
if (jsErrors.length > 0) process.exitCode = 1;
