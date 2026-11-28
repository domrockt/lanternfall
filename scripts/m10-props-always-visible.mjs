#!/usr/bin/env node
// m10-props-always-visible — Repro für den Prop-Flacker-Bug (Dom 2026-11-28):
// Gegnerzahl wird um die Dichte-LOD-Schwellen 150/200 pendeln gelassen
// (spawn/despawn-Schleife) und die Prop-Sichtbarkeit über ~12 s protokolliert.
// Vorher (Dichte-LOD aktiv) erwarten wir Sichtbarkeitswechsel der Props,
// nachher (K2: Tier immer 2) genau 0 Wechsel. Kein FPS-Ziel -> ohne flock.
//   node scripts/m10-props-always-visible.mjs --tag before|after
import { mkdirSync, writeFileSync } from "node:fs";
import {
  androidProxyContext, ensureBuild, loadPlaywright, startServer, startRun,
} from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const OUT = String(argOf("out", `${process.env.HOME}/games/.evidence/m10-props-always-visible/${TAG}.json`));
const DURATION_MS = Number(argOf("duration", 12000));
const SHOT = argOf("shot", null); // optional: Pfad für Abnahme-Screenshot
// --proxy: Android-Ersatzprofil (Galaxy Tab S4, CPU 4x gedrosselt). Misst FPS
// -> nur mit flock /home/ai/games/.lf-perf.lock starten.
const PROXY = argv.includes("--proxy");

function median(xs) {
  const s = [...xs].filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
let page;
let proxyContext = null;
if (PROXY) {
  proxyContext = await androidProxyContext(browser);
  page = proxyContext.page;
} else {
  page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
}
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.autoPlay(true);
  window.__lf.skipTo(1320); // Minute 22: Endgame-Dichte, bosserfahrung wie im Bug-Report
});
await page.waitForFunction(() => window.__lf?.state?.().scene === "run", undefined, { timeout: 15000 });
await page.waitForTimeout(1500);

// Pendel-Schleife im Kontext der Szene: um die Schwellen 150/200 oszillieren.
await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  run.__lfOscTimer = run.time.addEvent({
    delay: 1200,
    loop: true,
    callback: () => {
      const pool = run.enemies;
      if (!pool) return;
      const n = pool.count;
      if (n < 220) {
        window.__lf.spawnEnemy("bog_rat", 60);
      } else if (n > 130) {
        let toRemove = 60;
        for (let i = pool.active.length - 1; i >= 0 && toRemove > 0; i--) {
          const e = pool.active[i];
          if (e && !e.recycled && e.boss !== true) { pool.despawn(e); toRemove--; }
        }
      }
    },
  });
});

// Sampling: je 100 ms Gegnerzahl, Prop-Tier, sichtbare Props/Schatten/Glows.
const samples = [];
await page.evaluate((durationMs) => {
  const run = window.__game.scene.getScene("run");
  const g = run.ground;
  run.__lfSamples = [];
  run.__lfSampler = run.time.addEvent({
    delay: 100,
    loop: true,
    callback: () => {
      let visProps = 0, totProps = 0, visShadows = 0, visGlows = 0;
      for (const entry of g.chunks.values()) {
        for (const p of entry.props) {
          if (p.getData("glow")) { if (p.visible) visGlows++; continue; }
          if (p.getData("isShadow")) { if (p.visible) visShadows++; continue; }
          totProps++;
          if (p.visible) visProps++;
        }
      }
      run.__lfSamples.push({
        t: Math.round(run.time.now),
        enemies: run.enemies?.count ?? 0,
        tier: g.propLodMaxTier,
        visProps, totProps, visShadows, visGlows,
        fps: Math.round(window.__game.loop.actualFps),
      });
    },
  });
}, DURATION_MS + 500);
await page.waitForTimeout(DURATION_MS);
const data = await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  const samples = run.__lfSamples ?? [];
  run.__lfSampler?.remove();
  run.__lfOscTimer?.remove();
  return samples;
});
if (SHOT) {
  mkdirSync(new URL(".", `file://${SHOT}`), { recursive: true });
  await page.screenshot({ path: SHOT });
}
// Belegregel: jeder Perf-Beleg schreibt den WebGL-Renderer-String mit.
const renderer = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl")
    ?? document.createElement("canvas").getContext("experimental-webgl");
  if (!gl) return "no-webgl";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
});
await proxyContext?.context?.close();
await browser.close();
server.stop();

// Auswertung: Prop-Tier-Wechsel und sichtbare Props zwischen Sample-Nachbarn.
const tierChanges = [];
let visChanges = 0;
for (let i = 1; i < data.length; i++) {
  const prev = data[i - 1], cur = data[i];
  if (prev.tier !== cur.tier) tierChanges.push({ t: cur.t, from: prev.tier, to: cur.tier, enemies: cur.enemies });
  if ((prev.visProps > 0) !== (cur.visProps > 0)) visChanges++;
}
const result = {
  tag: TAG,
  date: new Date().toISOString(),
  proxy: PROXY,
  renderer,
  durationMs: DURATION_MS,
  samples: data.length,
  enemiesMin: Math.min(...data.map((d) => d.enemies)),
  enemiesMax: Math.max(...data.map((d) => d.enemies)),
  fpsMedian: median(data.map((d) => d.fps)),
  fpsMin: Math.min(...data.map((d) => d.fps)),
  tierChanges,
  visChanges,
  visPropsMin: Math.min(...data.map((d) => d.visProps)),
  visPropsMax: Math.max(...data.map((d) => d.visProps)),
  visShadowsMin: Math.min(...data.map((d) => d.visShadows)),
  jsErrors: errors,
  data,
};
mkdirSync(new URL(".", `file://${OUT}`), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`[${TAG}] samples=${data.length} enemies=${result.enemiesMin}..${result.enemiesMax} fpsMedian=${result.fpsMedian} fpsMin=${result.fpsMin}`);
console.log(`[${TAG}] renderer=${renderer}`);
console.log(`[${TAG}] tierChanges=${tierChanges.length} visChanges=${visChanges} visProps=${result.visPropsMin}..${result.visPropsMax}`);
console.log(`[${TAG}] -> ${OUT}`);
