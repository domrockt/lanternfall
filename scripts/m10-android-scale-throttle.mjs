#!/usr/bin/env node
/**
 * M10-android-scale-floor-r2 (K4): Qualitaetsstufe wechselt statt Aufloesung.
 *
 * Galaxy-Tab-S4-Emulation + CDP `Emulation.setCPUThrottlingRate 4` (Android-
 * Ersatz test, Praxisregel 9), Last per Gegner-Spawn (bog_rat-Schwarm).
 * Samplet alle 2 s: FPS, quality-Tier (__lf.state().quality), Canvas-Size.
 *
 * Erwartung (Abnahme): Tier wechselt (high -> medium -> low) und der
 * Renderbuffer bleibt dabei durchgehend auf der logischen Aufloesung
 * (640x360) — niemals 320x180. Renderer-String im JSON.
 *
 *   node scripts/m10-android-scale-throttle.mjs [--seconds=45] [--no-build]
 *
 * Beleg: ~/games/.evidence/m10-android-scale-floor-r2/m10-android-scale-throttle.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const SECONDS = Number((process.argv.find((a) => a.startsWith("--seconds=")) ?? "--seconds=45")
  .split("=")[1]) || 45;
const EVIDENCE_DIR = `${homedir()}/games/.evidence/m10-android-scale-floor-r2`;

const doBuild = !process.argv.includes("--no-build");
if (doBuild) ensureBuild();
else mkdirSync("shots", { recursive: true });
mkdirSync(EVIDENCE_DIR, { recursive: true });

const pw = await loadPlaywright();
const { chromium } = pw;
const server = await startServer();
const browser = await chromium.launch();

const ctx = await browser.newContext(pw.devices["Galaxy Tab S4 landscape"]);
// Synthetische CPU-Last (deterministisch): rAF-Deltas werden auf >= 33,4 ms
// gestreckt (= ~30 FPS, als waere das Geraet zu langsam) — kombiniert mit
// CDP-Throttle 4x. Auf der iGPU bleibt das Spiel sonst vsync-60 und der
// Regler haette nichts zu tun. Getestet wird die WIRKUNG: FPS-Eingang ->
// stepQuality -> QUALITY -> State; der Renderbuffer bleibt voll.
await ctx.addInitScript(() => {
  const orig = window.requestAnimationFrame.bind(window);
  let last = 0;
  window.requestAnimationFrame = (cb) => orig((t) => {
    const now = last + 33.4 > t ? last + 33.4 : t;
    last = now;
    cb(now);
  });
});
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));

await page.goto(`http://127.0.0.1:${server.port}/?debug=1`);
await page.waitForFunction(() => Boolean(window.__lf), { timeout: 15000 });
await waitForScene(page, "title");
await page.keyboard.press("Enter");
await waitForScene(page, "charselect");
await page.keyboard.press("Enter");
await waitForScene(page, "run");
await page.evaluate(() => window.__lf.god(true));
await page.evaluate(() => window.__lf.autoPlay(true));

// CPU-Throttle 4x (Ersatztest, Praxisregel 9) — erst NACH dem Run-Start.
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

// Last: Dauer-Spawns + hohe Zeitskalierung (mehr Sim-Substeps je Frame).
// Ziel: FPS dauerhaft < 45, damit der Stufenregler greift (K3-Hysterese).
await page.evaluate(() => window.__lf.setTimeScale(5));
await page.evaluate(() => window.__lf.spawnEnemy("bog_rat", 200));
const spawner = setInterval(() => {
  page.evaluate(() => window.__lf.spawnEnemy("bog_rat", 120)).catch(() => {});
}, 1500);

const samples = [];
const t0 = Date.now();
while ((Date.now() - t0) / 1000 < SECONDS) {
  await new Promise((r) => setTimeout(r, 500));
  const s = await page.evaluate(() => {
    const stats = window.__lf.stats();
    const dbg = window.__rbDbg ?? {};
    const st = window.__lf.state();
    return {
      fps: stats.fps ?? null,
      quality: st.quality ?? null,
      qualityTimer: dbg.qualityState ?? null,
      canvasW: dbg.afterW ?? null,
      logicalW: dbg.sw ?? null,
      enemies: stats.enemies ?? null,
    };
  });
  s.tSec = Math.round((Date.now() - t0) / 1000);
  samples.push(s);
  console.log(JSON.stringify(s));
}

const info = await page.evaluate(() => {
  const r = window.__lf.rendererInfo();
  return { renderer: r.renderer, ctx: r.context, dpr: devicePixelRatio };
});
await ctx.close();
await browser.close();
server.stop();
clearInterval(spawner);

const tiers = [...new Set(samples.map((s) => s.quality))];
const minCanvasW = Math.min(...samples.map((s) => s.canvasW ?? Infinity));
const logicalW = samples.find((s) => s.logicalW)?.logicalW ?? null;
const verdict = {
  tiers,
  tierChanged: tiers.length > 1,
  minCanvasW,
  logicalW,
  neverBelowLogical: logicalW !== null && minCanvasW >= logicalW,
  renderer: info.renderer,
  errs,
};
const json = `${EVIDENCE_DIR}/m10-android-scale-throttle.json`;
writeFileSync(json, `${JSON.stringify({ verdict, samples }, null, 2)}\n`);
console.log(JSON.stringify(verdict, null, 2));
console.log(`\nBeleg: ${json}`);
