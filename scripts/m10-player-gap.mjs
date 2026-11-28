#!/usr/bin/env node
// M10-player-swarm-gap: Vorher/Nachher-Probe für den Spieler-Abstoß-Ring.
//
// Misst in EINEM Szenario (deterministisch, seed=7, late-game Minute 25 mit
// 300-500 Kleingegnern, Spieler steht still):
//   1. Schwarm-Metrik (Samples alle 200 ms über 10 s):
//      - under8: Gegner mit Sprite-Kantenabstand < 8 px zum Spieler
//        (Kante = Zentrierabstand - 6 (Spieler-Hitradius, Run.ts:1249) - e.radius)
//      - pileEdgeP95: p95 der Kantenabstände der je Sample 30 nächsten Gegner
//      - minEdge: kleinster Kantenabstand
//   2. JS-Frame-Zeit: rAF-Deltas über 10 s (p50/p95/max) bei timeScale 1.
//   3. WebGL-Renderer-String (Pflicht, AGENTS.md) via window.__lf.rendererInfo().
//   4. Screenshot: shots/abnahme/m10-player-gap-<tag>.png (+ 3x-Crop um den Spieler).
//
// JSON-Beleg geht nach ~/games/.evidence/m10-player-swarm-gap/ (nicht git).
// Aufruf (Frame-Zeit-Messung NUR unter flock):
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-player-gap.mjs --tag=before
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-player-gap.mjs --tag=after
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline !== undefined) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = String(argOf("tag", "bench"));
const EVIDENCE = join(homedir(), "games/.evidence/m10-player-swarm-gap");
const OUT_JSON = join(EVIDENCE, `m10-player-gap-${TAG}.json`);
const OUT_SHOT = `shots/abnahme/m10-player-gap-${TAG}.png`;
const OUT_CROP = `shots/abnahme/m10-player-gap-${TAG}-crop.png`;

// Szenario-Konstanten (identisch für before/after).
const SEED = 7;
const SKIP_SECOND = 1500; // Minute 25: Chaos-Dichte + natürliche Nachspawns
const PLAYER_HIT_RADIUS = 6; // Run.ts:1249 — Kontakt bei dist < e.radius + 6
const HORDES = [["bogzombie", 150], ["bat", 150]];
const CONVERGE_REAL_MS = 6000; // Anlauf (timeScale 4), damit sich der Schwarm formt
const MEASURE_MS = 10_000; // Frame-Deltas + Schwarm-Samples
const SAMPLE_MS = 200;

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);

  // Level-Ups abräumen, God-Modus, FX-Dämpfung, Beschleunigung, late-game.
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
  await page.evaluate((skip) => {
    window.__lf.god(true);
    window.__lf.setFxDamping(true);
    window.__lf.setTimeScale(4);
    window.__lf.skipTo(skip);
  }, SKIP_SECOND);
  await page.waitForTimeout(1500);

  // Szene auffüllen: Chaser + schnelle Schwärmer spawnen am Spieler → Klumpen.
  for (const [id, n] of HORDES) {
    await page.evaluate(([eid, count]) => { window.__lf.spawnEnemy(eid, count); }, [id, n]);
  }

  // Schwarm formen lassen; Level-ups nebenbei abräumen (sonst friert die Zeit).
  const convergeStart = Date.now();
  while (Date.now() - convergeStart < CONVERGE_REAL_MS) {
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (window.__lf?.stats().levelUpOpen) window.__lf.pickLevelUp(0); });
  }
  const preCount = await page.evaluate(() => window.__lf.stats().enemies);

  // ── Messphase: timeScale 1, 10 s rAF-Deltas + Schwarm-Samples. ──
  await page.evaluate(() => { window.__lf.setTimeScale(1); });
  const statsBefore = await page.evaluate(() => window.__lf.stats());
  const result = await page.evaluate(([ms, sampleMs, playerR]) => new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const tick = (now) => {
      deltas.push(now - last);
      last = now;
      if (now - start < ms) requestAnimationFrame(tick);
    };
    const start = performance.now();
    requestAnimationFrame(tick);

    const samples = [];
    const sampler = setInterval(() => {
      const s = window.__lf.state();
      if (!s.enemyList) return;
      const px = s.playerX;
      const py = s.playerY;
      const edges = s.enemyList.map((e) => Math.hypot(e.x - px, e.y - py) - e.radius - playerR);
      edges.sort((a, b) => a - b);
      const nearest = edges.slice(0, 30);
      const p95 = nearest.length ? nearest[Math.min(nearest.length - 1, Math.floor(0.95 * nearest.length))] : null;
      samples.push({
        enemies: edges.length,
        under8: edges.filter((d) => d < 8).length,
        under2: edges.filter((d) => d < 2).length,
        minEdge: edges[0] ?? null,
        pileEdgeP95: p95,
      });
    }, sampleMs);

    setTimeout(() => {
      clearInterval(sampler);
      const quant = (arr, q) => {
        if (!arr.length) return null;
        const s = arr.slice().sort((a, b) => a - b);
        return s[Math.min(s.length - 1, Math.floor(q * s.length))];
      };
      resolve({
        frameP50: quant(deltas, 0.5),
        frameP95: quant(deltas, 0.95),
        frameMax: deltas.length ? Math.max(...deltas) : null,
        frames: deltas.length,
        sampleCount: samples.length,
        under8Mean: samples.reduce((a, s) => a + s.under8, 0) / samples.length,
        under8Max: samples.reduce((a, s) => Math.max(a, s.under8), 0),
        under2Mean: samples.reduce((a, s) => a + s.under2, 0) / samples.length,
        minEdgeWorst: samples.reduce((a, s) => Math.min(a, s.minEdge ?? -1e9), 1e9),
        pileEdgeP95Mean: samples.reduce((a, s) => a + (s.pileEdgeP95 ?? 0), 0) / samples.length,
        enemiesMean: samples.reduce((a, s) => a + s.enemies, 0) / samples.length,
        lastState: window.__lf.state(),
      });
    }, ms);
  }), [MEASURE_MS, SAMPLE_MS, PLAYER_HIT_RADIUS]);
  const statsAfter = await page.evaluate(() => window.__lf.stats());

  // Screenshots: Vollframe + 3x-Crop um den Spieler (nearest, nicht verzerrt).
  // Crop: page.screenshot mit Clip (WebGL-Canvas ist via drawImage nicht lesbar),
  // Kamera folgt dem Spieler ⇒ Spieler in Screen-Mitte; dann convert 3x nearest.
  const cropRaw = join(homedir(), "tmp/m10-player-swarm-gap");
  mkdirSync(cropRaw, { recursive: true });
  const rawCrop = join(cropRaw, `m10-player-gap-${TAG}-raw.png`);
  await page.screenshot({ path: rawCrop, clip: { x: 480 - 110, y: 270 - 70, width: 220, height: 140 } });
  await page.screenshot({ path: OUT_SHOT });
  try {
    execFileSync("convert", [rawCrop, "-filter", "point", "-scale", "300%", OUT_CROP], { stdio: "ignore" });
  } catch {
    // Kein ImageMagick: unskalierten Crop als Beleg behalten.
    execFileSync("cp", [rawCrop, OUT_CROP]);
  }

  const renderer = await page.evaluate(() => window.__lf.rendererInfo());
  const json = {
    tag: TAG,
    scenario: { seed: SEED, skipSecond: SKIP_SECOND, hordes: HORDES, convergeRealMs: CONVERGE_REAL_MS, measureMs: MEASURE_MS, sampleMs: SAMPLE_MS, playerHitRadius: PLAYER_HIT_RADIUS, playerStanding: true },
    enemiesPreMeasure: preCount,
    metrics: {
      under8Mean: result.under8Mean,
      under8Max: result.under8Max,
      under2Mean: result.under2Mean,
      minEdgeWorst: result.minEdgeWorst,
      pileEdgeP95Mean: result.pileEdgeP95Mean,
      enemiesMean: result.enemiesMean,
    },
    frames: { p50: result.frameP50, p95: result.frameP95, max: result.frameMax, count: result.frames },
    kills: { before: statsBefore.kills, after: statsAfter.kills },
    xp: { before: statsBefore.xp, after: statsAfter.xp },
    time: { before: statsBefore.time, after: statsAfter.time },
    renderer: { renderer: renderer.renderer, vendor: renderer.vendor, context: renderer.context, ok: !/swiftshader/i.test(renderer.renderer) },
    jsErrors: errors,
    generatedAt: new Date().toISOString(),
  };
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(json, null, 2));
  console.log(JSON.stringify({ tag: TAG, under8Mean: json.metrics.under8Mean, under2Mean: json.metrics.under2Mean, minEdgeWorst: json.metrics.minEdgeWorst, pileEdgeP95Mean: json.metrics.pileEdgeP95Mean, frameP95: json.frames.p95, enemiesMean: json.metrics.enemiesMean, renderer: json.renderer.renderer, rendererOk: json.renderer.ok, errors: errors.length }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
