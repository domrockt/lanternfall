#!/usr/bin/env node
// Lane m10-loading-screen (K4): Geraetemessung auf Doms Tablet ueber die Geraete-Bruecke.
//
//   node scripts/m10-loading-screen-device.mjs [--out <evidence-dir>] [--bridge http://172.17.0.1:5181]
//
// Voraussetzung: frisch gepackte APK MIT Loading-Szene auf dem Geraet
// (POST /install des APK-Builds ist Lead-Sache, siehe Briefing K4). Dieses
// Skript misst dann per CDP gegen die laufende APK:
//  - Zeit bis "bereit" (App-Start -> erster gerendertes Titel-Frame, Ziel < 3 s),
//  - Screenshot-Serie (CDP-Screencast) Boot- und Run-Fenster,
//  - 0 Pop-in (Textur-/Glyphen-Zuwachs nach dem Titel = 0),
//  - erster Run-Frame ohne Ruckler (gfxinfo Janky-Frames nach Run-Start, K3-Gate).
// Vorlage: ~/games/.evidence/device/device-probe.mjs (Bridge + CDP-Muster).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}
const bridge = opt("bridge", "http://172.17.0.1:5181");
const outDir = opt("out", join(process.env.HOME ?? "/home/ai", "games/.evidence/m10-loading-screen"));
mkdirSync(outDir, { recursive: true });

const { chromium } = require("playwright");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) Frischer App-Start (geraet); Startzeit = jetzt.
const t0 = Date.now();
await fetch(`${bridge}/launch?q=debug=1&seed=123`, { method: "POST" });
await sleep(2500);

// 2) CDP verbinden, Screencast starten (echte Frames mit Zeitstempeln).
const browser = await chromium.connectOverCDP("http://172.17.0.1:9333");
const page = browser.contexts()[0].pages()[0];
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on("Page.screencastFrame", async (f) => {
  frames.push({ data: f.data, ts: f.metadata.timestamp });
  try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch { /* egal */ }
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 6, maxWidth: 640, maxHeight: 400 });

await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000, polling: "raf" });
const readyMs = Date.now() - t0;
const atTitle = await page.evaluate(() => ({
  loadingDone: window.__bootTimings?.loadingDone ?? null,
  loadingStart: window.__bootTimings?.loadingStart ?? null,
  hasLoadingScene: Boolean(window.__bootTimings?.loadingStart),
  textures: window.__game.textures.getTextureKeys().length,
  atlas: window.__game.textures.exists("runtime_atlas"),
  glyphCalls: window.__lfText?.ensureGlyphCalls ?? -1,
}));
if (!atTitle.hasLoadingScene) {
  console.error("[device] APK enthaelt KEINE Loading-Szene (window.__bootTimings.loadingStart fehlt) — bitte frische APK installieren (Lead).");
  await browser.close();
  process.exit(1);
}
await sleep(2000);
const settled = await page.evaluate(() => ({
  textures: window.__game.textures.getTextureKeys().length,
  glyphCalls: window.__lfText?.ensureGlyphCalls ?? -1,
}));

// 3) Run starten (Tastatur: Titel -> CharSelect -> Run) + gfxinfo-Fenster.
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__lf.state().scene === "run", null, { timeout: 10000 });
await fetch(`${bridge}/gfxinfo/reset`, { method: "POST" });
const runImmediate = await page.evaluate(() => {
  const s = window.__lf.state();
  return { time: s.time, enemies: s.enemies, paused: window.__game.scene.getScene("run").paused };
});
await sleep(3000);
const g = await (await fetch(`${bridge}/gfxinfo`)).text();
const pick = (re) => (g.match(re) || [])[1];
const gfx = {
  frames: pick(/Total frames rendered: (\d+)/),
  janky: pick(/Janky frames: ([^\n]+)/),
  p90: pick(/90th percentile: (\S+)/),
  p99: pick(/99th percentile: (\S+)/),
};

// 4) Frames speichern (Boot-Fenster bis Titel+3 s, dann Run-Fenster).
const titleTs = frames.length ? frames[frames.length - 1].ts : 0;
let boot = 0; let run = 0;
for (const f of frames) {
  const offset = Math.round((f.ts - (t0 / 1000)) * 1000);
  if (offset < 0) continue;
  if (offset <= readyMs + 3000) {
    writeFileSync(join(outDir, `device-boot-${String(Math.round(offset / 100)).padStart(3, "0")}.jpg`), Buffer.from(f.data, "base64"));
    boot++;
  } else if (offset <= readyMs + 12000) {
    writeFileSync(join(outDir, `device-run-${String(Math.round(offset / 100)).padStart(3, "0")}.jpg`), Buffer.from(f.data, "base64"));
    run++;
  }
}
await cdp.send("Page.stopScreencast").catch(() => {});

const summary = {
  generatedAt: new Date().toISOString(),
  gate: { readyTargetMs: 3000, popinGrowthAllowed: 0 },
  readyMs,
  loading: atTitle,
  popin: {
    textureGrowth: settled.textures - atTitle.textures,
    glyphGrowth: settled.glyphCalls - atTitle.glyphCalls,
  },
  atlas: atTitle.atlas,
  runStartImmediate: runImmediate,
  gfxinfoFirst3s: gfx,
  seriesFrames: { boot, run },
  jsErrors: errors,
};
const jsonPath = join(outDir, "m10-loading-screen-device.json");
writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
console.log("[device]", JSON.stringify(summary, null, 2));
await browser.close();
