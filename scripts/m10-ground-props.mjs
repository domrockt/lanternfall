#!/usr/bin/env node
// M10-ground-props-batch — Vorher-/Nachher-Messung des Ground-Prop-/Ripple-Draw-Pfads.
// Misst in einem Lauf 640x360@1 und 780x360@3, Minute 25 (skipTo(1490), timeScale 1),
// 10-s-Fenster mit ~300 Gegnern (Top-up wie m10-ground-cost). Je Kondition ein JSON:
// FPS-Median/Min, Draw-Call-Kandidaten (batch-bewusst, wenn der Renderer Container
// meldet) und Blend-Wechsel in Tiefen-Sortierung.
// Messlauf: IMMER unter flock starten:
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-ground-props.mjs --tag before --runs 1
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-ground-props.mjs --tag after --runs 3 --png
import { writeFileSync, mkdirSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const CONDITIONS = [
  { name: "640", viewport: { width: 640, height: 360 }, dpr: 1 },
  { name: "780", viewport: { width: 780, height: 360 }, dpr: 3 },
];
const ARGV = process.argv.slice(2);
const argValue = (name) => {
  const i = ARGV.indexOf(`--${name}`);
  return i >= 0 ? ARGV[i + 1] : null;
};
const TAG = argValue("tag") || "before";
const RUNS = Math.max(1, Number(argValue("runs") || 1));
const WINDOW_S = 10;
const TARGET_ENEMIES = 300;
const PNG = ARGV.includes("--png");

ensureBuild();
mkdirSync("shots", { recursive: true });

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--enable-precise-memory-info",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const errors = [];

/** Minute-25-Szene: Endgame-Build, skipTo(1490), Level-Ups weg, timeScale 1. */
const setup = async (page) => {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"]) {
      window.__lf.addWeapon(id, 8);
    }
    for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) {
      window.__lf.addPassive(id, 5);
    }
    window.__lf.setTimeScale(30);
    window.__lf.skipTo(1490);
  });
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => window.__lf.stats());
    if (st.levelUpOpen) await page.evaluate(() => window.__lf.pickLevelUp(0));
    if (st.time >= 1495) break;
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => {
    window.__lf.setTimeScale(1);
  });
  await page.waitForTimeout(2500); // Waerme + Chunk-Aufbau
  for (let i = 0; i < 20; i++) {
    if (!(await page.evaluate(() => window.__lf.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

/** Sichtbare Ground-Renderables sammeln, nach Tiefe sortiert Blend-Wechte zaehlen. */
const blendProbe = () => {
  const g = window.__game.scene.getScene("run").ground;
  const out = [];
  const push = (img) => {
    if (!img || !img.visible) return;
    // Im Container gilt die Container-Tiefe (feste Layer), sonst die eigene.
    const depth = img.parentContainer ? img.parentContainer.depth : img.depth;
    out.push({ depth, blend: img.blendMode });
  };
  for (const e of g.chunks.values()) {
    push(e.image);
    for (const p of e.props) push(p);
  }
  for (const r of g.ripples) push(r.img);
  for (const f of g.fireflies) push(f.img);
  for (const b of g.fogBanks) push(b.img);
  out.sort((a, b) => a.depth - b.depth);
  let switches = 0;
  for (let i = 1; i < out.length; i++) {
    if (out[i].blend !== out[i - 1].blend) switches++;
  }
  return { visibleRenderables: out.length, blendSwitches: switches };
};

/** Ein 10-s-Fenster: Framedauern, Gegner-Top-up, Ground-Zaehler. */
const measure = async (page) =>
  page.evaluate(async ({ seconds, target }) => {
    const scene = window.__game.scene.getScene("run");
    const g = scene.ground;
    g.debugEnableCounters?.();
    const before = { stats: g.debugStats?.(), t: performance.now() };
    const start = performance.now();
    const deltas = [];
    const buckets = [];
    let bucketFrames = 0;
    let bucketStart = start;
    let last = start;
    let lastSpawn = start;
    const enemies = [];
    await new Promise((resolve) => {
      const tick = (now) => {
        if (now > last) deltas.push(now - last);
        last = now;
        bucketFrames++;
        if (now - bucketStart >= 1000) {
          buckets.push((bucketFrames * 1000) / (now - bucketStart));
          bucketFrames = 0;
          bucketStart = now;
        }
        if (now - lastSpawn >= 50) {
          lastSpawn = now;
          const active = window.__lf.stats().enemies;
          const deficit = target - active;
          if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
          enemies.push(active);
        }
        if (now - start >= seconds * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    const after = { stats: g.debugStats?.(), t: performance.now() };
    const sorted = [...deltas].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    const frames = Math.max(1, after.stats.updateCalls - before.stats.updateCalls);
    const perFrame = (k) => Math.round(((after.stats[k] - before.stats[k]) / frames) * 100) / 100;
    const batches = typeof g.debugBatchStats === "function" ? g.debugBatchStats() : null;
    // Batch-bewusste Draw-Call-Kandidaten: Chunks einzeln; Props/Ripples/Ambient
    // als Container-Batches, wenn der Renderer Layer meldet, sonst einzeln.
    const propCandidates = batches ? batches.propBatches + batches.shadowBatches + batches.glowBatches : perFrame("sumVisibleProps");
    const rippleCandidates = batches ? batches.rippleBatches : perFrame("sumVisibleRipples");
    const candidates = Math.round(perFrame("sumVisibleChunks") + propCandidates + rippleCandidates + perFrame("sumVisibleAmbient"));
    return {
      frames: deltas.length,
      elapsedMs: Math.round(elapsed),
      fps: Math.round((deltas.length / (elapsed / 1000)) * 10) / 10,
      fpsMin: Math.round(Math.min(...buckets) * 10) / 10,
      medianFrameMs: Math.round(q(0.5) * 100) / 100,
      p95FrameMs: Math.round(q(0.95) * 100) / 100,
      worstFrameMs: Math.round(sorted[sorted.length - 1] * 100) / 100,
      drawCallCandidatesPerFrame: candidates,
      candidatesBreakdown: {
        chunks: Math.round(perFrame("sumVisibleChunks")),
        props: Math.round(propCandidates),
        ripples: Math.round(rippleCandidates),
        ambient: Math.round(perFrame("sumVisibleAmbient")),
      },
      visiblePropsPerFrame: Math.round(perFrame("sumVisibleProps")),
      visibleRipplesPerFrame: Math.round(perFrame("sumVisibleRipples")),
      distinctPropTexturesPerFrame: Math.round(perFrame("sumVisiblePropTextures")),
      chunkRebuildsPerFrame: perFrame("chunkRebuilds"),
      updateMsPerFrame: g.__updateCalls
        ? Math.round((g.__updateSelfMs / g.__updateCalls) * 100) / 100
        : perFrame("updateCalls"),
      batches,
      avgEnemies: enemies.length ? Math.round(enemies.reduce((a, b) => a + b, 0) / enemies.length) : 0,
      minEnemies: enemies.length ? Math.min(...enemies) : 0,
      levelUpOpen: window.__lf.stats().levelUpOpen,
    };
  }, { seconds: WINDOW_S, target: TARGET_ENEMIES });

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const results = [];
try {
  for (const cond of CONDITIONS) {
    const runs = [];
    for (let run = 0; run < RUNS; run++) {
      const page = await browser.newPage({ viewport: cond.viewport, deviceScaleFactor: cond.dpr });
      page.on("pageerror", (e) => errors.push(`${cond.name} r${run + 1}: ${e}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${cond.name} r${run + 1}: ${m.text()}`); });
      try {
        await setup(page);
        const m = await measure(page);
        m.blend = await page.evaluate(blendProbe);
        const runNo = run + 1;
        const suffix = RUNS > 1 ? `-${runNo}` : "";
        writeFileSync(`shots/m10-ground-props-${TAG}-${cond.name}${suffix}.json`, JSON.stringify({
          card: "m10-ground-props-batch",
          tag: TAG,
          condition: cond.name,
          viewport: cond.viewport,
          dpr: cond.dpr,
          run: runNo,
          windowSeconds: WINDOW_S,
          targetEnemies: TARGET_ENEMIES,
          measuredAt: new Date().toISOString(),
          command: `flock /home/ai/games/.lf-perf.lock node scripts/m10-ground-props.mjs --tag ${TAG} --runs ${RUNS}${PNG ? " --png" : ""}`,
          result: m,
          jsErrors: errors.slice(),
        }, null, 2));
        if (PNG) await page.screenshot({ path: `shots/m10-ground-props-${TAG}-${cond.name}${suffix}.png` });
        runs.push(m);
        console.log(`${TAG} ${cond.name} run${runNo}: ${m.fps} FPS (min ${m.fpsMin}, median ${m.medianFrameMs} ms, p95 ${m.p95FrameMs} ms) | Kandidaten ${m.drawCallCandidatesPerFrame}/Frame | Blend ${m.blend.blendSwitches} | Props sichtbar ${m.visiblePropsPerFrame}, Batches ${JSON.stringify(m.batches)}`);
      } finally {
        await page.close();
      }
    }
    results.push({
      condition: cond.name,
      fpsMedian: median(runs.map((r) => r.fps)),
      fpsMinMedian: median(runs.map((r) => r.fpsMin)),
      medianFrameMsMedian: median(runs.map((r) => r.medianFrameMs)),
      drawCallCandidatesMedian: median(runs.map((r) => r.drawCallCandidatesPerFrame)),
      blendSwitchesMedian: median(runs.map((r) => r.blend.blendSwitches)),
    });
  }
} finally {
  await browser.close();
  server.stop();
}

const summary = {
  tag: TAG,
  runs: RUNS,
  windowSeconds: WINDOW_S,
  conditions: results,
  jsErrors: errors,
  passed: errors.length === 0,
};
writeFileSync(`shots/m10-ground-props-${TAG}-summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(errors.length === 0 ? 0 : 1);
