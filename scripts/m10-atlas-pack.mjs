#!/usr/bin/env node
// m10-atlas-pack: Mess-Skript fuer Atlas-Auswirkung (Draw-Calls/Texturen/FPS).
//
// Misst:
//  1. Crowd: 300 Gegner bei 960x540@1 — FPS 10 s UND WebGL-Draw-Calls pro Frame
//     (drawArrays/drawElements-Hook, Median/p95) UND Texturbestand (Keys je
//     Prefix, Atlas-Frames, nicht atlaste Keys).
//  2. Minute 25 (evolutions + passives + skipTo(1490)) je Format:
//     640x360@1 und 780x360@3 — FPS 10 s.
//
// FPS-Messungen immer unter flock /home/ai/games/.lf-perf.lock ausfuehren:
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-atlas-pack.mjs \
//     --out shots/m10-atlas-pack-before.json
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const OUT = String(argOf("out", "shots/m10-atlas-pack.json"));
const CROWD_ENEMIES = Math.max(1, Number(argOf("crowd", "300")) || 300);
const SECONDS = Math.max(3, Number(argOf("seconds", "10")) || 10);

const VIEWS = String(argOf("views", "640x360:1,780x360:3")).split(",").map((spec) => {
  const [wh, dpr] = spec.split(":");
  const [width, height] = wh.split("x").map(Number);
  return { width, height, dpr: Number(dpr) || 1, tag: `${width}x${height}@${dpr || 1}` };
});

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const errors = [];

/** Draw-Call-Zaehler vor dem ersten Spielcode installieren. */
const drawCallInit = () => {
  window.__dc = { total: 0, current: 0 };
  for (const proto of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!proto) continue;
    for (const name of ["drawArrays", "drawElements"]) {
      const orig = proto.prototype[name];
      if (!orig) continue;
      proto.prototype[name] = function (...a) {
        window.__dc.total++;
        window.__dc.current++;
        return orig.apply(this, a);
      };
    }
  }
};

/** 10 s: FPS UND Draw-Calls/Frame (jeweils 1 rAF = 1 Frame). */
const measure = (target, seconds) =>
  page.evaluate(async ({ target, seconds }) => {
    const start = performance.now();
    let frames = 0;
    let last = start;
    let worst = 0;
    let lastSpawn = start;
    const drawCalls = [];
    let dcAtFrameStart = window.__dc.current;
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
        drawCalls.push(window.__dc.current - dcAtFrameStart);
        dcAtFrameStart = window.__dc.current;
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
    drawCalls.sort((a, b) => a - b);
    const at = (q) => drawCalls[Math.min(drawCalls.length - 1, Math.floor(q * drawCalls.length))];
    return {
      fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
      fpsMin: buckets.length ? Math.min(...buckets) : null,
      fpsBuckets: buckets,
      frames,
      elapsedMs: Math.round(elapsed),
      worstFrameMs: Math.round(worst * 10) / 10,
      targetEnemies: target,
      drawCalls: {
        frames: drawCalls.length,
        median: at(0.5),
        p95: at(0.95),
        max: drawCalls[drawCalls.length - 1],
        avg: Math.round((drawCalls.reduce((a, b) => a + b, 0) / drawCalls.length) * 10) / 10,
      },
    };
  }, { target, seconds });

/** Texturbestand: Keys je Prefix + Atlas-Frames. */
const textureInfo = () =>
  page.evaluate(() => {
    const keys = window.__game.textures.getTextureKeys().slice().sort();
    const groups = {};
    for (const k of keys) {
      const m = k.match(/^[a-z]+_[a-z0-9]+?_|^[a-z]+_/);
      const prefix = m ? (m[0].endsWith("_") ? m[0].slice(0, -1) : m[0]) : k;
      groups[prefix] = (groups[prefix] || 0) + 1;
    }
    const atlas = window.__game.textures.exists("runtime_atlas")
      ? { key: "runtime_atlas", frames: Object.keys(window.__game.textures.get("runtime_atlas").frames).length }
      : null;
    const bakedPages = window.__game.textures.getTextureKeys()
      .filter((k) => k.startsWith("baked_page_"))
      .sort()
      .map((k) => {
        const t = window.__game.textures.get(k);
        return { key: k, width: t.width, height: t.height };
      });
    return {
      totalTextures: keys.length,
      groups,
      atlas,
      bakedPages,
      nonAtlasSample: keys.filter((k) => k !== "runtime_atlas").length,
    };
  });

const clearLevelUps = async () => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

let page;
const result = { views: VIEWS.map((v) => v.tag), jsErrors: errors };
try {
  // Phase A: Crowd 300 Gegner, 960x540@1.
  page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(drawCallInit);
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
      window.__lf.addWeapon(id, 8);
    }
    window.__lf.spawnEnemy("bog_rat", 200);
    window.__lf.spawnEnemy("wisp", 50);
    window.__lf.spawnEnemy("bogzombie", 50);
  });
  await page.waitForTimeout(500);
  await clearLevelUps();
  console.error("[m10-atlas-pack] crowd: textures …");
  result.textures = await textureInfo();
  console.error("[m10-atlas-pack] crowd: measure …");
  result.crowd = await measure(CROWD_ENEMIES, SECONDS);
  console.error("[m10-atlas-pack] crowd fertig", result.crowd.fps);
  const crowdState = await page.evaluate(() => window.__lf.stats());
  result.crowd.enemies = crowdState.enemies;
  result.crowd.level = crowdState.level;
  await page.screenshot({ path: OUT.replace(/\.json$/, "-crowd.png") });
  await page.close();
  page = null;

  // Phase B: Minute 25 je Format.
  result.minute25 = {};
  for (const v of VIEWS) {
    page = await browser.newPage({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.addInitScript(drawCallInit);
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
    });
    await page.evaluate(({ evolutions, passives }) => {
      for (const id of evolutions) window.__lf.addWeapon(id, 8);
      for (const id of passives) window.__lf.addPassive(id, 5);
      window.__lf.skipTo(1490);
      window.__lf.setTimeScale(1);
    }, { evolutions: EVOLUTIONS, passives: PASSIVES });
    await page.waitForTimeout(6000);
    await clearLevelUps();
    console.error("[m10-atlas-pack] m25", v.tag, "measure …");
    const natural = await page.evaluate(() => window.__lf.stats());
    const m = await measure(Math.max(300, natural.enemies), SECONDS);
    const state = await page.evaluate(() => window.__lf.stats());
    m.enemies = state.enemies;
    m.level = state.level;
    m.time = state.time;
    m.view = v.tag;
    result.minute25[v.tag] = m;
    await page.screenshot({ path: `${OUT.replace(/\.json$/, "")}-m25-${v.tag.replace(/[@x]/g, "-")}.png` });
    await page.close();
    page = null;
  }
} finally {
  if (page) await page.close().catch(() => {});
  await browser.close();
  server.stop();
}

result.summary = {
  crowdDrawCallsMedian: result.crowd?.drawCalls?.median ?? null,
  crowdDrawCallsP95: result.crowd?.drawCalls?.p95 ?? null,
  crowdFps: result.crowd?.fps ?? null,
  totalTextures: result.textures?.totalTextures ?? null,
  m25: Object.fromEntries(
    Object.entries(result.minute25 || {}).map(([k, v]) => [k, { fps: v.fps, fpsMin: v.fpsMin }]),
  ),
};
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log("SUMMARY " + JSON.stringify(result.summary));
