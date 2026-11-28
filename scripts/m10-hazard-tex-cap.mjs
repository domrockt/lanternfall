#!/usr/bin/env node
// m10-hazard-tex-cap K1: Zaehlt erstellte Hazard-Canvas-Texturen (hazard_*) ueber einen
// 10-min-Lauf mit fullrun-Settings (AutoPlay + God + 6 Evolutionen + 30x). Beleg fuer die
// Bedarfsmeldung m10-heap-regression-fix: hazard_disc/ring/beam-Keys werden pro Radius bzw.
// Laenge gebacken und nie freigegeben — ungebundener Heap-Wachstumshebel.
//
// Aufruf (Echtzeit-Lauf -> flock-Pflicht):
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-hazard-tex-cap.mjs [dauerSekunden] [output.json]
//
// Output: { renderer, durationSec, pollSec, hazardKeysUnique, addedKeys, samples }.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const DURATION_S = Number(process.argv[2] ?? "600") || 600;
const OUT = process.argv[3] ?? "shots/m10-hazard-tex-cap-before.json";
const POLL_MS = 20000;

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=99`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"]) window.__lf.addWeapon(id, 8);
    for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(id, 5);
    window.__lf.setTimeScale(30);
  });

  const renderer = await page.evaluate(() => {
    const canvas = window.__game?.canvas ?? document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!gl) return "unbekannt";
    // ANGLE maskiert RENDERER ("WebKit WebGL") — echten GPU-String ueber die Debug-Extension holen.
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  });

  // Zaehlt NEUE Keys je Poll: einmal gesehene Keys bleiben im Set, Differenz = Zuwachs.
  const hazardSnapshot = () => page.evaluate(() => {
    const keys = window.__game.textures.getTextureKeys();
    const hazard = keys.filter((k) => k.startsWith("hazard_"));
    return { total: keys.length, hazard, hazardCount: hazard.length };
  });

  const seen = new Set();
  const added = [];
  const samples = [];
  const snap0 = await hazardSnapshot();
  for (const k of snap0.hazard) seen.add(k);
  samples.push({ t: 0, totalTextures: snap0.total, hazardCount: snap0.hazardCount, hazardNew: 0 });
  const started = Date.now();
  while ((Date.now() - started) / 1000 < DURATION_S) {
    await page.waitForTimeout(POLL_MS);
    const snap = await hazardSnapshot();
    let hazardNew = 0;
    for (const k of snap.hazard) {
      if (!seen.has(k)) { seen.add(k); added.push(k); hazardNew++; }
    }
    samples.push({
      t: Math.round((Date.now() - started) / 1000),
      totalTextures: snap.total,
      hazardCount: snap.hazardCount,
      hazardNew,
    });
    console.log(`[t=${samples.at(-1).t}s] textures=${snap.total} hazard=${snap.hazardCount} (+${hazardNew})`);
  }

  const result = {
    renderer,
    durationSec: Math.round((Date.now() - started) / 1000),
    pollMs: POLL_MS,
    hazardKeysUnique: seen.size,
    addedKeys: added,
    samples,
    jsErrors: errors,
  };
  writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`[m10-hazard-tex-cap] renderer=${renderer}`);
  console.log(`[m10-hazard-tex-cap] ${DURATION_S}s: hazardKeysUnique=${seen.size}, neu waehrend des Laufs=${added.length} -> ${OUT}`);
  console.log(`[m10-hazard-tex-cap] jsErrors=${errors.length}`);
} finally {
  await browser.close();
  server.stop();
}
