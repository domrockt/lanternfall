#!/usr/bin/env node
// M10-Perf-Recovery: Profil statt Raten.
// Playwright + CDP-Profiler ueber einen 60-s-Burst (500 Gegner, 640x360).
// Zaehlt zusaetzlich Draw-Calls/Frame (gl.drawElements/drawArrays), Blend-/
// Programm-/Texture-Wechsel und aktive GameObjects/Particles/Graphics.
//
// Nutzung:
//   flock /home/ai/games/.lf-perf.lock node scripts/perf-profile.mjs \
//     [--seconds 60] [--viewport 640x360] [--out shots/m10-perf-profile.json]
//
// Ergebnis-JSON: shots/m10-perf-profile*.json, Top-10-Funktionen nach Self-Time,
// Draw-Calls/Frame-Statistik und Objektzaehlung. Doku: docs/lanes/m10-perf-recovery.md
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const SECONDS = Number(argOf("seconds", "60"));
const vp = String(argOf("viewport", "640x360")).split("x").map(Number);
const VIEWPORT = { width: vp[0] || 640, height: vp[1] || 360 };
const OUT = String(argOf("out", "shots/m10-perf-profile.json"));
const SHOT = String(argOf("shot", "shots/m10-perf-profile-640.png"));
// --skip-to <s>: Endgame-Fenster (Minute 25, Evolutionen) statt frischer Lauf.
const SKIP_TO = argOf("skip-to", null);
const TARGET = Number(argOf("target", SKIP_TO ? "300" : "500"));
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
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// GL-Zaehler VOR dem Laden der Seite injizieren: zeichnet Phaser ueber WebGL,
// landen alle drawElements/drawArrays im Zaehler. requestAnimationFrame wird
// umhuellt, damit der Zaehler pro Frame zurueckgesetzt und archiviert wird.
await page.addInitScript(() => {
  const stats = { frames: [], current: { draws: 0, blends: 0, programs: 0, textures: 0 }, total: 0 };
  window.__glStats = stats;
  const wrap = (proto, name, key) => {
    if (!proto || typeof proto[name] !== "function") return;
    const orig = proto[name];
    proto[name] = function (...args) {
      stats.current[key] = (stats.current[key] || 0) + 1;
      if (key === "draws") stats.total++;
      return orig.apply(this, args);
    };
  };
  for (const name of ["WebGLRenderingContext", "WebGL2RenderingContext"]) {
    const proto = window[name]?.prototype;
    if (!proto) continue;
    wrap(proto, "drawElements", "draws");
    wrap(proto, "drawArrays", "draws");
    wrap(proto, "drawElementsInstanced", "draws");
    wrap(proto, "blendFunc", "blends");
    wrap(proto, "blendFuncSeparate", "blends");
    wrap(proto, "useProgram", "programs");
    wrap(proto, "bindTexture", "textures");
  }
  const origRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb) {
    return origRaf.call(window, function (ts) {
      cb(ts);
      const cur = stats.current;
      stats.frames.push({ ts: Math.round(ts), ...cur });
      stats.current = { draws: 0, blends: 0, programs: 0, textures: 0 };
    });
  };
  window.__drawSummary = () => {
    const f = stats.frames;
    if (!f.length) return { frames: 0 };
    const med = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
    };
    const draws = f.map((x) => x.draws);
    const p = (q) => draws[Math.min(draws.length - 1, Math.floor(draws.length * q))];
    return {
      frames: f.length,
      drawsMedian: med(draws),
      drawsMean: Math.round((draws.reduce((a, b) => a + b, 0) / draws.length) * 10) / 10,
      drawsP95: p(0.95),
      drawsMax: Math.max(...draws),
      blendsMedian: med(f.map((x) => x.blends)),
      programsMedian: med(f.map((x) => x.programs)),
      texturesMedian: med(f.map((x) => x.textures)),
      totalDraws: stats.total,
    };
  };
});

const clearLevelUps = async () => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    window.__lf.setSuppressLevelUps(true);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
      window.__lf.addWeapon(id, 8);
    }
    // 500 Gegner: Schwarm plus Spezialisten, wie im Abnahme-Burst.
    window.__lf.spawnEnemy("bog_rat", 400);
    window.__lf.spawnEnemy("wisp", 50);
    window.__lf.spawnEnemy("bogzombie", 50);
  });
  if (SKIP_TO) {
    await page.evaluate(({ evolutions, passives, skipTo }) => {
      for (const id of evolutions) window.__lf.addWeapon(id, 8);
      for (const id of passives) window.__lf.addPassive(id, 5);
      window.__lf.skipTo(Number(skipTo));
      window.__lf.setTimeScale(1);
    }, { evolutions: EVOLUTIONS, passives: PASSIVES, skipTo: SKIP_TO });
    await page.waitForTimeout(6000);
    await clearLevelUps();
  }
  await page.waitForTimeout(500);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
  await cdp.send("Profiler.start");

  // 60 s Burst: Gegner unter 500 nachspawnen, Frame-Zaehler laufen mit.
  const run = await page.evaluate(async ({ seconds, target }) => {
    const startFrame = window.__game.loop.frame;
    const start = performance.now();
    let lastSpawn = start;
    const samples = [];
    await new Promise((resolve) => {
      const spawnTimer = setInterval(() => {
        const active = window.__lf.stats().enemies;
        if (active < target) window.__lf.spawnEnemy("bog_rat", target - active);
        samples.push(active);
        if (performance.now() - lastSpawn >= 5000) {
          lastSpawn = performance.now();
          window.__lf.god(true); // God bei Bedarf erneuern
        }
      }, 50);
      setTimeout(() => {
        clearInterval(spawnTimer);
        resolve();
      }, seconds * 1000);
    });
    const elapsed = performance.now() - start;
    const frames = window.__game.loop.frame - startFrame;
    return {
      fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
      frames,
      elapsedMs: Math.round(elapsed),
      target,
      minEnemies: samples.length ? Math.min(...samples) : 0,
      avgEnemies: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : 0,
      finalEnemies: window.__lf.stats().enemies,
    };
  }, { seconds: SECONDS, target: TARGET });

  const { profile } = await cdp.send("Profiler.stop");

  // Objektzaehlung direkt aus der Run-Szene (auch Container-Kinder).
  const objects = await page.evaluate(() => {
    const scene = window.__game.scene.getScene("run");
    const counts = {};
    let visible = 0;
    let total = 0;
    const walk = (obj) => {
      const t = obj?.type ?? obj?.constructor?.name ?? "unknown";
      counts[t] = (counts[t] || 0) + 1;
      total++;
      if (obj?.visible !== false) visible++;
      if (Array.isArray(obj?.list)) obj.list.forEach(walk);
    };
    for (const child of scene.children.list) walk(child);
    const lod = window.__lf.stats().lod;
    return {
      displayList: scene.children.list.length,
      total,
      visible,
      counts,
      graphics: counts.Graphics ?? 0,
      images: counts.Image ?? 0,
      sprites: counts.Sprite ?? 0,
      lod,
      stats: window.__lf.stats(),
    };
  });

  const draw = await page.evaluate(() => window.__drawSummary());

  // Top-Funktionen nach Self-Time (CDP-Samples mit timeDeltas).
  const nodeById = new Map(profile.nodes.map((n) => [n.id, n]));
  const selfUs = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    const dt = profile.timeDeltas[i] ?? 0;
    selfUs.set(id, (selfUs.get(id) ?? 0) + dt);
  }
  const byFn = new Map();
  let idleUs = 0;
  let gcUs = 0;
  for (const [id, us] of selfUs) {
    const node = nodeById.get(id);
    const cf = node?.callFrame ?? {};
    const fn = cf.functionName || "(anonymous)";
    if (fn === "(idle)") { idleUs += us; continue; }
    if (fn === "(garbage collector)") { gcUs += us; continue; }
    const url = String(cf.url || "").replace(/^https?:\/\/[^/]+\//, "");
    const key = `${fn} @ ${url}:${cf.lineNumber ?? 0}`;
    byFn.set(key, (byFn.get(key) ?? 0) + us);
  }
  const totalUs = profile.endTime - profile.startTime;
  const top = [...byFn.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([key, us]) => ({
      fn: key,
      selfMs: Math.round(us / 100) / 10,
      percent: Math.round((us / totalUs) * 1000) / 10,
    }));

  await page.screenshot({ path: SHOT });
  await clearLevelUps();

  result = {
    generatedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    seconds: SECONDS,
    run,
    draw,
    objects,
    cpu: {
      totalMs: Math.round(totalUs / 1000),
      idlePercent: Math.round((idleUs / totalUs) * 1000) / 10,
      gcPercent: Math.round((gcUs / totalUs) * 1000) / 10,
      top,
    },
    jsErrors: errors,
    passed: run.fps >= 55 && run.minEnemies >= Math.max(200, Math.floor(TARGET * 0.9)) && errors.length === 0,
  };
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

if (result) writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result && result.passed ? 0 : 1);
