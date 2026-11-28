#!/usr/bin/env node
// M10-boss-stack-separation: Vorher/Nachher-Probe für Boss-/Elite-Stapel.
//
// Misst in EINEM Szenario (deterministisch, seed=99, late-game Minute 25 mit
// 5 Bossen + Elite-Packs + Horde):
//   1. JS-Frame-Zeit: rAF-Deltas über 10 s (p50/p95/max) — update+render.
//   2. Stapel-Metrik: maximale Paar-Deckung unter Boss/Elite-Entities
//      (coverage = 1 - dist/(r1+r2)); Abnahmegrenze: kein Paar > 80 %.
//   3. WebGL-Renderer-String (Pflicht, AGENTS.md) via window.__lf.rendererInfo().
//   4. Screenshot des Stapels: shots/m10-boss-stack-<tag>.png (Abnahme).
//
// JSON-Beleg geht nach ~/games/.evidence/m10-boss-stack-separation/ (nicht git).
// Aufruf (Frame-Zeit-Messung NUR unter flock):
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-boss-stack.mjs --tag=before
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-boss-stack.mjs --tag=after
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
const EVIDENCE = join(homedir(), "games/.evidence/m10-boss-stack-separation");
const OUT_JSON = join(EVIDENCE, `m10-boss-stack-${TAG}.json`);
const OUT_SHOT = `shots/abnahme/m10-boss-stack-${TAG}.png`;

// Szenario-Konstanten (identisch für before/after).
const SEED = 99;
const SKIP_SECOND = 1500; // Minute 25: Bosse 0-3 natürlich + Chaos-Dichte
const EXTRA_BOSS = 4; // Hexenzirkel zusätzlich (5 Bosse total)
const CONVERGE_REAL_MS = 6000; // Anlauf (timeScale 4), damit sich der Stapel formt
const MEASURE_MS = 10_000; // Frame-Deltas
const HORDE = ["bogzombie", 24];

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

  // Szene auffüllen: 5. Boss + Tank-Horde → Stapel um den stehenden Spieler.
  await page.evaluate((boss) => { window.__lf.spawnBoss(boss); }, EXTRA_BOSS);
  await page.evaluate(([id, n]) => { window.__lf.spawnEnemy(id, n); }, HORDE);

  // Stapel formen lassen (Spieler steht still, Bosse/Elites laufen heran).
  await page.waitForTimeout(CONVERGE_REAL_MS);

  // ── Messphase: 10 s rAF-Deltas, sonst nichts (kein Sampling im Weg). ──
  const frame = await page.evaluate((ms) => new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const tick = (now) => {
      deltas.push(now - last);
      last = now;
      if (now - start >= ms) resolve(deltas);
      else requestAnimationFrame(tick);
    };
    const start = last;
    requestAnimationFrame(tick);
  }), MEASURE_MS);

  const pct = (arr, p) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
  };
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const frameStats = {
    frames: frame.length,
    p50Ms: Math.round(pct(frame, 0.5) * 100) / 100,
    p95Ms: Math.round(pct(frame, 0.95) * 100) / 100,
    maxMs: Math.round(Math.max(...frame) * 100) / 100,
    meanMs: Math.round(mean(frame) * 100) / 100,
  };

  // ── Stapel-Metrik: Boss/Elite-Paar-Deckung (3 Samples, Maximum). ──
  const samples = await page.evaluate(() => new Promise((resolve) => {
    const grab = () => {
      const list = window.__lf.state().enemyList ?? [];
      // Sprite-Deckung: Bosse nutzen die Frame-Halbbreite (56/64/72/80/96/96 px,
      // Muster BossSystem.BOSS_SPRITE_SIZE), Elites den Hit-Radius (Sprite ≈ 2r).
      const BOSS_SPRITE_HALF = [28, 32, 36, 40, 48, 48];
      const heavy = list.filter((e) => e.boss || e.elite)
        .map((e) => ({
          name: e.name, boss: e.boss, elite: e.elite, x: e.x, y: e.y,
          radius: e.boss ? (BOSS_SPRITE_HALF[e.bossIndex] ?? 48) : e.radius,
        }));
      let maxCoverage = 0;
      let pairsOver80 = 0;
      const worst = [];
      for (let i = 0; i < heavy.length; i++) {
        for (let j = i + 1; j < heavy.length; j++) {
          const a = heavy[i];
          const b = heavy[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const sum = a.radius + b.radius;
          const coverage = sum > 0 ? 1 - Math.min(d, sum) / sum : 1;
          if (coverage > maxCoverage) {
            maxCoverage = coverage;
            worst.length = 0;
          }
          if (coverage >= maxCoverage && worst.length < 5) {
            worst.push({ a: a.name, b: b.name, distPx: Math.round(d * 10) / 10, radiiSum: sum, coverage: Math.round(coverage * 1000) / 1000 });
          }
          if (coverage > 0.8) pairsOver80++;
        }
      }
      return {
        heavyCount: heavy.length,
        maxCoverage: Math.round(maxCoverage * 1000) / 1000,
        pairsOver80,
        worst,
      };
    };
    const first = grab();
    setTimeout(() => resolve([first, grab()]), 300);
  }));

  // Zustand einmal sauber für enemies/time.
  const quick = await page.evaluate(() => {    const s = window.__lf.state();
    return { enemies: s.enemies, time: s.time, boss: s.boss };
  });

  await page.screenshot({ path: OUT_SHOT });

  const rendererInfo = await page.evaluate(() => window.__lf.rendererInfo());
  const rendererString = rendererInfo?.renderer ?? "";
  const result = {
    tag: TAG,
    seed: SEED,
    skipSecond: SKIP_SECOND,
    scenario: { extraBoss: EXTRA_BOSS, horde: HORDE, convergeRealMs: CONVERGE_REAL_MS, measureMs: MEASURE_MS },
    viewport: "960x540@1",
    renderer: { context: rendererInfo?.context ?? "none", renderer: rendererString, vendor: rendererInfo?.vendor ?? "" },
    rendererSwiftShader: /swiftshader/i.test(rendererString),
    frame: frameStats,
    stack: { samples, worstMaxCoverage: Math.max(...samples.map((s) => s.maxCoverage)), pairsOver80Max: Math.max(...samples.map((s) => s.pairsOver80)) },
    quick,
    jsErrors: errors,
  };
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`[m10-boss-stack] ${TAG}: p95=${frameStats.p95Ms}ms maxCoverage=${result.stack.worstMaxCoverage} pairsOver80=${result.stack.pairsOver80Max} renderer="${rendererString}"`);
  console.log(`[m10-boss-stack] JSON: ${OUT_JSON}`);
  console.log(`[m10-boss-stack] Shot: ${OUT_SHOT}`);
  if (errors.length) console.log(`[m10-boss-stack] JS-Fehler: ${errors.length}`);
} finally {
  await browser.close();
  server.stop();
}
