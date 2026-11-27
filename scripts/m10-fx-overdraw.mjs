#!/usr/bin/env node
// M10-FX-Overdraw: Attribution (FX aus / Partikel-Cap 25 % / voll) und
// Abnahme-Nachmessung bei Minute 25 im 780x360@3-View (2340x1080 = 2,5 Mio px).
// Start IMMER unter `flock /home/ai/games/.lf-perf.lock`.
//
// Attribution (3 Varianten x 3 Laeufe, je 10 s, 780x360@3):
//   node scripts/m10-fx-overdraw.mjs --suite attribution
// Nachmessung nach dem Fix (780@3 + 640@1, je 3 Laeufe):
//   node scripts/m10-fx-overdraw.mjs --suite after
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const num = (name, fallback) => {
  const v = Number(argOf(name, fallback));
  return Number.isFinite(v) ? v : fallback;
};

const SUITE = String(argOf("suite", "attribution"));
const RUNS = Math.max(1, Math.floor(num("runs", 3)));
const SECONDS = Math.max(1, num("seconds", 10));
const OUT = String(
  argOf("out", `shots/m10-fx-overdraw-${SUITE}.json`),
);
const SHOT = argOf("shot", "");

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--enable-precise-memory-info",
    "--js-flags=--expose-gc",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const clearLevelUps = async (page) => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

/** 1-s-Buckets: avg/min FPS; Gegner unter target werden nachgespawnt (Worst Case). */
const measure = async (page, target, seconds) =>
  page.evaluate(async ({ target, seconds }) => {
    const start = performance.now();
    let frames = 0;
    let last = start;
    let worst = 0;
    let lastSpawn = start;
    const buckets = [];
    let bucketFrames = 0;
    let bucketStart = start;
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        if (frames > 0) worst = Math.max(worst, dt);
        last = now;
        frames++;
        bucketFrames++;
        if (now - lastSpawn >= 50) {
          lastSpawn = now;
          const active = window.__lf.stats().enemies;
          const deficit = target - active;
          if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
        }
        if (now - bucketStart >= 1000) {
          buckets.push(Math.round((bucketFrames / ((now - bucketStart) / 1000)) * 10) / 10);
          bucketFrames = 0;
          bucketStart = now;
        }
        if (now - start >= seconds * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    return {
      fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
      fpsMin: buckets.length ? Math.min(...buckets) : null,
      fpsBuckets: buckets,
      frames,
      elapsedMs: Math.round(elapsed),
      worstFrameMs: Math.round(worst * 10) / 10,
      targetEnemies: target,
    };
  }, { target, seconds });

/** Run bis Minute 25 hochziehen (gemeinsame Basis fuer alle Varianten). */
async function setupMinute25(page, { evolutions, passives }) {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  await page.evaluate(({ evolutions, passives }) => {
    const run = window.__lf;
    run.god(true);
    run.autoPlay(true);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) run.addWeapon(id, 8);
    for (const id of evolutions) run.addWeapon(id, 8);
    for (const id of passives) run.addPassive(id, 5);
    run.skipTo(1490);
    run.setTimeScale(1);
  }, { evolutions, passives });
  await page.waitForTimeout(6000);
  await clearLevelUps(page);
  return page.evaluate(() => window.__lf.stats());
}

/**
 * Interleaved-A/B: EINE Minute-25-Session, dann je Zyklus alle drei Varianten
 * nacheinander (Reihenfolge rotiert). Gleiche Gegner-/Spielerlage fuer alle,
 * damit der FX-Anteil nicht in Run-zu-Run-Streuung untergeht.
 */
async function runInterleaved({ width, height, dpr, seconds }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const rows = [];
  try {
    await setupMinute25(page, { evolutions: EVOLUTIONS, passives: PASSIVES });
    const natural = await page.evaluate(() => window.__lf.stats());
    const target = Math.max(300, natural.enemies);
    const variants = ["full", "fx-off", "particle-25"];
    const originalCap = await page.evaluate(() => window.__game.scene.getScene("run").combat.particles.maxActive);
    for (let cycle = 0; cycle < RUNS; cycle++) {
      // Reihenfolge rotieren: kein systematischer Warm-up-/Order-Bias.
      const order = [...variants.slice(cycle % 3), ...variants.slice(0, cycle % 3)];
      for (const variant of order) {
        const applied = await page.evaluate(({ variant, originalCap }) => {
          const run = window.__game.scene.getScene("run");
          const combat = run.combat;
          const w = window;
          // Jede Variante startet von "voll".
          if (w.__lfOrigFxSpawn) {
            combat.fx.spawn = w.__lfOrigFxSpawn;
            combat.particles.spawn = w.__lfOrigParticleSpawn;
            w.__lfOrigFxSpawn = null;
            w.__lfOrigParticleSpawn = null;
          }
          combat.fx.enabled = true;
          combat.particles.enabled = true;
          combat.particles.setMaxActive(originalCap);
          const budget = combat.particles.glowBudget ?? combat.fx.glowBudget;
          if (budget) budget.setCap(72);
          const info = {
            variant,
            particlesBefore: combat.particles.active.length,
            fxBefore: combat.fx.active.length,
            particleCap: combat.particles.maxActive,
            fxCap: combat.fx.maxActive,
            glowCap: budget?.cap ?? null,
          };
          if (variant === "fx-off") {
            // Kein Quellcode-Schalter in Karte 1: Spawns direkt am Pool abschalten.
            if (!w.__lfOrigFxSpawn) {
              w.__lfOrigFxSpawn = combat.fx.spawn;
              w.__lfOrigParticleSpawn = combat.particles.spawn;
            }
            combat.fx.spawn = () => null;
            combat.particles.spawn = () => null;
            combat.fx.active.length = 0;
            combat.particles.active.length = 0;
          } else if (variant === "particle-25") {
            combat.particles.setMaxActive(Math.round(360 * 0.25));
            if (budget) budget.setCap(Math.round(72 * 0.25));
          }
          return info;
        }, { variant, originalCap });
        const measured = await measure(page, target, seconds);
        const state = await page.evaluate(() => {
          const run = window.__game.scene.getScene("run");
          const combat = run.combat;
          return {
            enemies: run.enemies.count,
            particles: combat.particles.active.length,
            fx: combat.fx.active.length,
            glowUsed: combat.particles.glowBudget?.current ?? null,
            kills: run.kills,
            level: run.xpState.level,
          };
        });
        rows.push({ cycle: cycle + 1, variant, ...measured, state, setup: applied });
        console.log(`[interleaved] cycle ${cycle + 1} ${variant}: ${measured.fps} fps, min ${measured.fpsMin}, ${msPerFrame(measured.fps)} ms/frame`);
      }
    }
  } finally {
    await page.close();
  }
  return { page: null, rows, errors };
}

/** Ein Lauf: Run bis Minute 25 hochziehen, Variante schalten, 10 s messen. */
async function runOnce({ width, height, dpr, variant }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await startRun(page);
    await page.evaluate(({ evolutions, passives }) => {
      const run = window.__lf;
      run.god(true);
      run.autoPlay(true);
      for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) run.addWeapon(id, 8);
      for (const id of evolutions) run.addWeapon(id, 8);
      for (const id of passives) run.addPassive(id, 5);
      run.skipTo(1490);
      run.setTimeScale(1);
    }, { evolutions: EVOLUTIONS, passives: PASSIVES });
    await page.waitForTimeout(6000);
    await clearLevelUps(page);
    const natural = await page.evaluate(() => window.__lf.stats());

    // Schalter direkt am Szenen-Objekt: kein Spielcode geaendert, nur Messung.
    const applied = await page.evaluate(({ variant }) => {
      const run = window.__game.scene.getScene("run");
      const combat = run.combat;
      const info = {
        variant,
        particlesBefore: combat.particles.active.length,
        fxBefore: combat.fx.active.length,
        particleCapBefore: combat.particles.maxActive,
        fxCapBefore: combat.fx.maxActive,
        glowBudgetBefore: combat.particles.glowBudget?.cap ?? combat.fx.glowBudget?.cap ?? null,
      };
      if (variant === "fx-off") {
        combat.fx.enabled = false;
        combat.particles.enabled = false;
        combat.fx.active.length = 0;
        combat.particles.active.length = 0;
      } else if (variant === "particle-25") {
        combat.particles.setMaxActive(Math.round(360 * 0.25));
        const budget = combat.particles.glowBudget ?? combat.fx.glowBudget;
        if (budget) budget.setCap(Math.round(72 * 0.25));
      }
      return info;
    }, { variant });

    const measured = await measure(page, Math.max(300, natural.enemies), SECONDS);
    const state = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const combat = run.combat;
      const scale = window.__game.scale;
      const canvas = document.querySelector("canvas");
      const rect = canvas.getBoundingClientRect();
      return {
        enemies: run.enemies.count,
        particles: combat.particles.active.length,
        particleCap: combat.particles.maxActive,
        fx: combat.fx.active.length,
        fxCap: combat.fx.maxActive,
        glowBudget: combat.particles.glowBudget?.cap ?? combat.fx.glowBudget?.cap ?? null,
        glowUsed: combat.particles.glowBudget?.current ?? null,
        level: run.xpState.level,
        kills: run.kills,
        internal: [scale.width, scale.height],
        css: [Math.round(rect.width), Math.round(rect.height)],
        dpr: window.devicePixelRatio,
      };
    });
    if (SHOT && variant === "full") await page.screenshot({ path: SHOT });
    return { ...measured, state, setup: applied, jsErrors: errors };
  } finally {
    await page.close();
  }
}

/** ms/Frame aus mittlerer FPS (1 s Buckets). */
const msPerFrame = (fps) => Math.round((1000 / Math.max(0.1, fps)) * 100) / 100;

let result;
try {
  const runs = [];
  if (SUITE === "attribution") {
    const variants = ["fx-off", "particle-25", "full"];
    const inter = await runInterleaved({ width: 780, height: 360, dpr: 3, seconds: SECONDS });
    for (const row of inter.rows) runs.push({ design: "interleaved", ...row, msPerFrame: msPerFrame(row.fps) });
    const summary = {};
    for (const variant of variants) {
      const rows = runs.filter((x) => x.variant === variant);
      const avg = (k) => rows.reduce((a, b) => a + (b[k] ?? 0), 0) / rows.length;
      const med = (k) => {
        const v = rows.map((b) => b[k]).sort((a, b) => a - b);
        return v[Math.floor(v.length / 2)];
      };
      summary[variant] = {
        fps: Math.round(avg("fps") * 10) / 10,
        fpsMedian: Math.round(med("fps") * 10) / 10,
        fpsMin: Math.min(...rows.map((x) => x.fpsMin ?? 999)),
        msPerFrame: msPerFrame(avg("fps")),
        particles: Math.round(rows.reduce((a, b) => a + b.state.particles, 0) / rows.length),
        fx: Math.round(rows.reduce((a, b) => a + b.state.fx, 0) / rows.length),
      };
    }
    result = {
      suite: "attribution",
      design: "interleaved (eine M25-Session, 3 Zyklen, rotierende Reihenfolge)",
      viewport: { width: 780, height: 360, dpr: 3 },
      seconds: SECONDS,
      runsPerVariant: RUNS,
      summary,
      // FX-Anteil in ms/Frame: (c) voll minus (a) FX komplett aus.
      fxDeltaMsPerFrame: Math.round((summary.full.msPerFrame - summary["fx-off"].msPerFrame) * 100) / 100,
      particleDeltaMsPerFrame: Math.round((summary.full.msPerFrame - summary["particle-25"].msPerFrame) * 100) / 100,
      fxRevenuePercent: Math.round(((summary.full.msPerFrame - summary["fx-off"].msPerFrame) / summary.full.msPerFrame) * 1000) / 10,
      targetFps: 50,
      runs,
      jsErrors: inter.errors,
    };
  } else {
    const configs = [
      { name: "m25-780@3", width: 780, height: 360, dpr: 3 },
      { name: "m25-640@1", width: 640, height: 360, dpr: 1 },
    ];
    for (const cfg of configs) {
      for (let r = 0; r < RUNS; r++) {
        const m = await runOnce({ width: cfg.width, height: cfg.height, dpr: cfg.dpr, variant: "full" });
        runs.push({ config: cfg.name, run: r + 1, ...m, msPerFrame: msPerFrame(m.fps) });
        console.log(`[after] ${cfg.name} run ${r + 1}: ${m.fps} fps, min ${m.fpsMin}, ${msPerFrame(m.fps)} ms/frame`);
      }
    }
    const summary = {};
    for (const cfg of configs) {
      const rows = runs.filter((x) => x.config === cfg.name);
      const fpsMin = Math.min(...rows.map((x) => x.fpsMin ?? 999));
      const fpsAvg = rows.reduce((a, b) => a + b.fps, 0) / rows.length;
      summary[cfg.name] = {
        fps: Math.round(fpsAvg * 10) / 10,
        fpsMin,
        msPerFrame: msPerFrame(fpsAvg),
        particles: Math.round(rows.reduce((a, b) => a + b.state.particles, 0) / rows.length),
        passed: fpsMin >= 50,
      };
    }
    result = {
      suite: "after",
      seconds: SECONDS,
      runsPerConfig: RUNS,
      targetFps: 50,
      summary,
      passed: Object.values(summary).every((s) => s.passed),
      runs,
      jsErrors: runs.flatMap((r) => r.jsErrors),
    };
  }
} finally {
  await browser.close();
  server.stop();
}

mkdirSync("shots", { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.summary ?? result, null, 2));
process.exit(result && result.jsErrors.length === 0 ? 0 : 1);
