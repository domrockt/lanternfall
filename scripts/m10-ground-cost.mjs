#!/usr/bin/env node
// M10-ground-cost — Karte 1: Messung, was Moor-Terrain-Rendering bei 640x360
// in Minute 25 pro Frame kostet. Drei Bedingungen, gleiche Szene, gleiche Dichte:
//   on     : GroundRenderer normal (Chunks, Props, Ripples, Ambient)
//   hidden : alle Ground-Bilder visible=false (keine Draw-Calls, Update laeuft)
//   frozen : zusaetzlich update() deaktiviert (keine Per-Frame-Iteration)
// Attribution: on-hidden = Draw-/Renderpfad, hidden-frozen = Update-Pfad.
// Der Update-Pfad wird zusaetzlich direkt um `ground.update()` gemessen.
// 3 Laeufe x 3 rotierte Messfenster je Bedingung gegen Waerme-/Last-Bias.
// Laeuft unter `flock -w` (Wartezeit-Limit = erwartete Laufzeit + 120 s Puffer):
//   flock -w 300 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs
//   flock -w 520 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs --instrument
// Bei Lock-Timeout (rc != 0): Skriptname + "Sperre /home/ai/games/.lf-perf.lock belegt
// — spaeter erneut versuchen" ausgeben und Exitcode weiterreichen — kein stiller
// Abbruch, kein unbegrenztes Warten.
import { writeFileSync, mkdirSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const VIEWPORT = { width: 640, height: 360 };
const DPR = 1;
const ARGV = process.argv.slice(2);
const argValue = (name) => {
  const i = ARGV.indexOf(`--${name}`);
  return i >= 0 ? ARGV[i + 1] : null;
};
const OUT = argValue("out") || "shots/m10-ground-cost-baseline.json";
const RUNS = 3;
const CYCLES = 4;
const WINDOW_S = 3;
const TARGET_ENEMIES = 300;
const STEPS = ["on", "hidden", "frozen"];

ensureBin();
function ensureBin() {
  ensureBuild();
  mkdirSync("shots", { recursive: true });
}

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

/** Setzt den Ground in den gewuenschten Messzustand (idempotent). */
const setGroundMode = async (page, mode) =>
  page.evaluate((m) => {
    const scene = window.__game.scene.getScene("run");
    const g = scene.ground;
    const imgs = new Set();
    for (const e of g.chunks.values()) {
      imgs.add(e.image);
      for (const p of e.props) imgs.add(p);
      for (const r of e.ripples) imgs.add(r.img);
    }
    for (const r of g.ripples) imgs.add(r.img);
    for (const f of g.fireflies) imgs.add(f.img);
    for (const b of g.fogBanks) imgs.add(b.img);
    if (!g.__origUpdate) {
      g.__origUpdate = g.update;
      // Direkte Messung der Per-Frame-Update-Kosten (nur Debug, kein Verhalten).
      g.__updateSelfMs = 0;
      g.__updateCalls = 0;
      g.update = function (cam, t) {
        const s = performance.now();
        g.__origUpdate.call(g, cam, t);
        g.__updateSelfMs += performance.now() - s;
        g.__updateCalls++;
      };
      g.__patchedUpdate = g.update;
    }
    if (m === "on") {
      for (const i of imgs) i.setVisible(true);
      g.update = g.__patchedUpdate;
    } else if (m === "hidden") {
      for (const i of imgs) i.setVisible(false);
      g.update = g.__patchedUpdate;
    } else {
      for (const i of imgs) i.setVisible(false);
      g.update = () => {};
    }
  }, mode);

/** rAF-Framedauern + Update-Selbstzeit eines Fensters messen, Gegner auffuellen. */
const measure = async (page, seconds) =>
  page.evaluate(async ({ seconds, target }) => {
    const scene = window.__game.scene.getScene("run");
    const g = scene.ground;
    g.__updateSelfMs = 0;
    g.__updateCalls = 0;
    const start = performance.now();
    const deltas = [];
    let last = start;
    let lastSpawn = start;
    const enemies = [];
    await new Promise((resolve) => {
      const tick = (now) => {
        if (now > start) deltas.push(now - last);
        last = now;
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
    const sorted = [...deltas].sort((a, b) => a - b);
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    return {
      frames: deltas.length,
      elapsedMs: Math.round(elapsed),
      fps: Math.round((deltas.length / (elapsed / 1000)) * 10) / 10,
      meanFrameMs: Math.round(mean * 100) / 100,
      medianFrameMs: Math.round(q(0.5) * 100) / 100,
      p95FrameMs: Math.round(q(0.95) * 100) / 100,
      worstFrameMs: Math.round(sorted[sorted.length - 1] * 100) / 100,
      updateSelfMs: Math.round(g.__updateSelfMs * 100) / 100,
      updateCalls: g.__updateCalls,
      updateMsPerFrame: g.__updateCalls ? Math.round((g.__updateSelfMs / g.__updateCalls) * 100) / 100 : 0,
      minEnemies: enemies.length ? Math.min(...enemies) : 0,
      avgEnemies: enemies.length ? Math.round(enemies.reduce((a, b) => a + b, 0) / enemies.length) : 0,
      loadedChunks: g.loadedChunks,
      visibleProps: (() => {
        let n = 0;
        for (const e of g.chunks.values()) for (const p of e.props) if (p.visible) n++;
        return n;
      })(),
      visibleRipples: g.ripples.filter((r) => r.img.visible).length,
    };
  }, { seconds, target: TARGET_ENEMIES });

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

/** Karte 4: Pixelgleichheit — gleiche Szene pausiert, Culling an vs. aus. */
const PIXELCHECK = process.argv.includes("--pixelcheck");
if (PIXELCHECK) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  page.on("pageerror", (e) => errors.push(`pixel: ${e}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`pixel: ${m.text()}`); });
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
      for (const id of ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"]) window.__lf.addWeapon(id, 8);
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
      // Szene pausiert: keine Entity-Bewegung, nur Rendern -> Pixel-Diff misst
      // ausschliesslich den Culling-Effekt auf dem Terrain.
      const s = window.__game.scene.getScene("run");
      s.scene.pause();
      // Props/Chunks genau einmal mit aktueller Zeit positionieren.
      s.ground.update(s.cameras.main, s.time.now);
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: "shots/m10-ground-cost-pixel-culling.png" });
    await page.evaluate(() => {
      const s = window.__game.scene.getScene("run");
      s.ground.debugSetCulling(false);
      s.ground.update(s.cameras.main, s.time.now);
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: "shots/m10-ground-cost-pixel-noculling.png" });
    console.log("pixelcheck: shots/m10-ground-cost-pixel-{culling,noculling}.png geschrieben");
    await page.close();
  } finally {
    await browser.close();
    server.stop();
  }
  process.exit(errors.length === 0 ? 0 : 1);
}

/** Karte 2: Instrumentierung (Zaehler + Klassen-Attribution), nur mit --instrument. */
const INSTRUMENT = process.argv.includes("--instrument");
if (INSTRUMENT) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  page.on("pageerror", (e) => errors.push(`instr: ${e}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`instr: ${m.text()}`); });
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
      for (const id of ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"]) window.__lf.addWeapon(id, 8);
      for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(id, 5);
      window.__lf.setTimeScale(30);
      window.__lf.skipTo(1490);
    });
    for (let i = 0; i < 60; i++) {
      const st = await page.evaluate(() => window.__lf.stats());
      if (st.levelUpOpen) await page.evaluate(() => window.__lf.pickLevelUp(0));
      if (st.time >= 1495) break;
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => window.__lf.setTimeScale(1));
    await page.waitForTimeout(2500);

    // Zaehler 5 s laufen lassen.
    await page.evaluate(() => {
      const g = window.__game.scene.getScene("run").ground;
      g.debugEnableCounters();
    });
    const before = await page.evaluate(() => {
      const g = window.__game.scene.getScene("run").ground;
      return { stats: g.debugStats(), t: performance.now() };
    });
    await page.waitForTimeout(5000);
    const after = await page.evaluate(() => {
      const g = window.__game.scene.getScene("run").ground;
      return { stats: g.debugStats(), t: performance.now() };
    });
    const frames = after.stats.updateCalls - before.stats.updateCalls;
    const perFrame = (k) => Math.round(((after.stats[k] - before.stats[k]) / Math.max(1, frames)) * 100) / 100;
    const counts = {
      seconds: Math.round((after.t - before.t) / 100) / 10,
      updateFrames: frames,
      updateCallsPerFrame: 1,
      chunkBuildsTotal: after.stats.chunkBuilds - before.stats.chunkBuilds,
      chunkRebuildsPerFrame: perFrame("chunkRebuilds"),
      chunkBuildsPerFrame: perFrame("chunkBuilds"),
      workerPostedTotal: after.stats.workerPosted - before.stats.workerPosted,
      workerReceivedTotal: after.stats.workerReceived - before.stats.workerReceived,
      workerMessagesPerFrame: perFrame("workerPosted") + perFrame("workerReceived"),
      readyInstalledTotal: perFrame("readyInstalled"),
      propDepthSetsPerFrame: perFrame("propDepthSets"),
      rippleTextureSetsPerFrame: perFrame("rippleTextureSets"),
      visibleChunksPerFrame: perFrame("sumVisibleChunks"),
      visiblePropsPerFrame: perFrame("sumVisibleProps"),
      visibleRipplesPerFrame: perFrame("sumVisibleRipples"),
      visibleAmbientPerFrame: perFrame("sumVisibleAmbient"),
      distinctVisiblePropTexturesPerFrame: perFrame("sumVisiblePropTextures"),
      loadedChunks: after.stats.loadedChunks,
      drawCallCandidatesPerFrame: Math.round(perFrame("sumVisibleChunks") + perFrame("sumVisibleProps") + perFrame("sumVisibleRipples") + perFrame("sumVisibleAmbient")),
    };

    // Klassen-Attribution: Bedingungen hide-only, je 2 Fenster a 3 s, rotiert.
    const setGroup = async (group) =>
      page.evaluate((grp) => {
        const g = window.__game.scene.getScene("run").ground;
        const chunks = [];
        const props = [];
        const ripples = [];
        const ambient = [];
        for (const e of g.chunks.values()) {
          chunks.push(e.image);
          props.push(...e.props);
        }
        for (const r of g.ripples) ripples.push(r.img);
        for (const f of g.fireflies) ambient.push(f.img);
        for (const b of g.fogBanks) ambient.push(b.img);
        const all = [chunks, props, ripples, ambient];
        const names = ["chunks", "props", "ripples", "ambient"];
        all.forEach((arr, idx) => {
          const hide = grp === "all" || grp === names[idx];
          for (const o of arr) o.setVisible(!hide);
        });
      }, group);
    const measureShort = async (seconds) =>
      page.evaluate(async ({ seconds }) => {
        const start = performance.now();
        const deltas = [];
        let last = start;
        await new Promise((resolve) => {
          const tick = (now) => {
            if (now > start) deltas.push(now - last);
            last = now;
            if (now - start >= seconds * 1000) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const elapsed = performance.now() - start;
        const meanMs = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        return { fps: Math.round((deltas.length / (elapsed / 1000)) * 10) / 10, meanFrameMs: Math.round(meanMs * 100) / 100 };
      }, { seconds });
    const groups = ["on", "chunks", "props", "ripples", "ambient", "all"];
    const acc = Object.fromEntries(groups.map((g) => [g, []]));
    for (let cycle = 0; cycle < 2; cycle++) {
      const order = groups.slice(cycle % groups.length).concat(groups.slice(0, cycle % groups.length));
      for (const grp of order) {
        await setGroup(grp);
        await page.waitForTimeout(250);
        acc[grp].push(await measureShort(3));
        await setGroup("on");
        await page.waitForTimeout(120);
      }
    }
    const breakdown = {};
    for (const grp of groups) {
      breakdown[grp] = {
        fps: Math.round(median(acc[grp].map((x) => x.fps)) * 10) / 10,
        meanFrameMs: Math.round(median(acc[grp].map((x) => x.meanFrameMs)) * 100) / 100,
      };
    }
    breakdown.renderCost = {
      propsMs: Math.round((breakdown.on.meanFrameMs - breakdown.props.meanFrameMs) * 100) / 100,
      chunksMs: Math.round((breakdown.on.meanFrameMs - breakdown.chunks.meanFrameMs) * 100) / 100,
      ripplesMs: Math.round((breakdown.on.meanFrameMs - breakdown.ripples.meanFrameMs) * 100) / 100,
      ambientMs: Math.round((breakdown.on.meanFrameMs - breakdown.all.meanFrameMs) * 100) / 100,
    };
    const drawPayload = {
      card: "m10-ground-cost/2-instrumentierung",
      measuredAt: new Date().toISOString(),
      command: "flock -w 520 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs --instrument",
      viewport: VIEWPORT,
      counts,
      breakdown,
      jsErrors: errors,
      passed: errors.length === 0,
    };
    writeFileSync("shots/m10-ground-cost-drawcalls.json", JSON.stringify(drawPayload, null, 2));
    console.log(JSON.stringify({ counts, breakdown }, null, 2));
    await page.close();
  } finally {
    await browser.close();
    server.stop();
  }
  process.exit(errors.length === 0 ? 0 : 1);
}

const runs = [];
try {
  for (let run = 0; run < RUNS; run++) {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
    page.on("pageerror", (e) => errors.push(`run${run}: ${e}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`run${run}: ${m.text()}`); });
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
    // Level-ups wegklicken, bis wir wirklich in Minute 25 stehen.
    for (let i = 0; i < 60; i++) {
      const st = await page.evaluate(() => window.__lf.stats());
      if (st.levelUpOpen) await page.evaluate(() => window.__lf.pickLevelUp(0));
      if (st.time >= 1495) break;
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => window.__lf.setTimeScale(1));
    await page.waitForTimeout(2500); // Shader-/GC-Waerme, Chunks laden
    for (let i = 0; i < 20; i++) {
      if (!(await page.evaluate(() => window.__lf.stats().levelUpOpen))) break;
      await page.evaluate(() => window.__lf.pickLevelUp(0));
    }
    // Baseline-Screenshot fuer den spaeteren Pixel-Diff (vor dem Fix).
    if (run === 0) await page.screenshot({ path: "shots/m10-ground-cost-before.png" });

    const result = { run: run + 1, cycles: [], modes: {} };
    const windows = { on: [], hidden: [], frozen: [] };
    for (let cycle = 0; cycle < CYCLES; cycle++) {
      const order = STEPS.slice(cycle % STEPS.length).concat(STEPS.slice(0, cycle % STEPS.length));
      const rec = {};
      for (const mode of order) {
        await setGroundMode(page, mode);
        await page.waitForTimeout(300); // Umbau-Frames verwerfen
        const m = await measure(page, WINDOW_S);
        windows[mode].push(m);
        rec[mode] = { fps: m.fps, meanFrameMs: m.meanFrameMs, updateMsPerFrame: m.updateMsPerFrame };
        await setGroundMode(page, "on");
        await page.waitForTimeout(150);
      }
      result.cycles.push({
        order,
        ...rec,
        attribution: {
          renderMsPerFrame: Math.round((rec.on.meanFrameMs - rec.hidden.meanFrameMs) * 100) / 100,
          updateMsPerFrame: Math.round((rec.hidden.meanFrameMs - rec.frozen.meanFrameMs) * 100) / 100,
          groundTotalMsPerFrame: Math.round((rec.on.meanFrameMs - rec.frozen.meanFrameMs) * 100) / 100,
        },
      });
    }
    for (const mode of STEPS) {
      const ws = windows[mode];
      result.modes[mode] = {
        fps: Math.round(median(ws.map((w) => w.fps)) * 10) / 10,
        fpsMin: Math.min(...ws.map((w) => w.fps)),
        meanFrameMs: Math.round(median(ws.map((w) => w.meanFrameMs)) * 100) / 100,
        medianFrameMs: Math.round(median(ws.map((w) => w.medianFrameMs)) * 100) / 100,
        p95FrameMs: Math.round(median(ws.map((w) => w.p95FrameMs)) * 100) / 100,
        updateMsPerFrame: Math.round(mean(ws.map((w) => w.updateMsPerFrame)) * 100) / 100,
        loadedChunks: median(ws.map((w) => w.loadedChunks)),
        visibleProps: median(ws.map((w) => w.visibleProps)),
        visibleRipples: median(ws.map((w) => w.visibleRipples)),
        avgEnemies: Math.round(mean(ws.map((w) => w.avgEnemies))),
        minEnemies: Math.min(...ws.map((w) => w.minEnemies)),
      };
    }
    const on = result.modes.on;
    const hidden = result.modes.hidden;
    const frozen = result.modes.frozen;
    // Gepaarte Attribution: pro Zyklus on/hidden/frozen direkt nacheinander,
    // Median der Zyklus-Deltas ist robust gegen Host-Last zwischen Fenstern.
    result.attribution = {
      renderMsPerFrame: median(result.cycles.map((c) => c.attribution.renderMsPerFrame)),
      updateMsPerFrame: median(result.cycles.map((c) => c.attribution.updateMsPerFrame)),
      updateSelfMsPerFrame: hidden.updateMsPerFrame,
      groundTotalMsPerFrame: median(result.cycles.map((c) => c.attribution.groundTotalMsPerFrame)),
      fpsWithGround: on.fps,
      fpsWithoutGround: frozen.fps,
    };
    runs.push(result);
    console.log(`run ${run + 1}: on ${on.fps} FPS (${on.meanFrameMs} ms) | hidden ${hidden.fps} | frozen ${frozen.fps} | Render ${result.attribution.renderMsPerFrame} ms | Update ${result.attribution.updateMsPerFrame} ms (direkt ${result.attribution.updateSelfMsPerFrame}) | gesamt ${result.attribution.groundTotalMsPerFrame} ms`);
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}

const summary = {
  viewport: VIEWPORT,
  dpr: DPR,
  runs: RUNS,
  cyclesPerMode: CYCLES,
  secondsPerWindow: WINDOW_S,
  targetEnemies: TARGET_ENEMIES,
  fps: {
    onMin: Math.min(...runs.map((r) => r.modes.on.fpsMin)),
    onMedian: median(runs.map((r) => r.modes.on.fps)),
    hiddenMedian: median(runs.map((r) => r.modes.hidden.fps)),
    frozenMedian: median(runs.map((r) => r.modes.frozen.fps)),
  },
  attributionMsPerFrame: {
    renderMedian: Math.round(median(runs.map((r) => r.attribution.renderMsPerFrame)) * 100) / 100,
    updateMedian: Math.round(median(runs.map((r) => r.attribution.updateMsPerFrame)) * 100) / 100,
    updateSelfMedian: Math.round(median(runs.map((r) => r.attribution.updateSelfMsPerFrame)) * 100) / 100,
    totalMedian: Math.round(median(runs.map((r) => r.attribution.groundTotalMsPerFrame)) * 100) / 100,
  },
  hot: median(runs.map((r) => r.attribution.groundTotalMsPerFrame)) >= 2,
};
const payload = {
  card: "m10-ground-cost/1-messung",
  measuredAt: new Date().toISOString(),
  command: "flock -w 300 /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs",
  summary,
  runs,
  jsErrors: errors,
  passed: errors.length === 0,
};
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log(`Ground gesamt ${summary.attributionMsPerFrame.totalMedian} ms/Frame -> hot=${summary.hot}; 0 JS-Fehler: ${errors.length === 0}`);
process.exit(errors.length === 0 ? 0 : 1);
