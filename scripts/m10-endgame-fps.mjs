#!/usr/bin/env node
// M10-endgame-fps: Minute-25-Attribution bei 640x360 (3 Laeufe) ohne Renderer-Raten.
// Ersetzt das defekte profile-minute25.mjs (Syntaxfehler) durch eine messbare,
// reproduzierbare Bucket-Instrumentierung der Run-Systeme.
//
// Aufruf (-w 240 = erwartete Laufzeit ~120 s + 120 s Puffer):
//   flock -w 240 /home/ai/games/.lf-perf.lock node scripts/m10-endgame-fps.mjs \
//     --viewport 640x360 --dpr 1 --runs 3 --out shots/m10-endgame-fps-attribution.json
// Bei Lock-Timeout (rc != 0): "m10-endgame-fps: Sperre /home/ai/games/.lf-perf.lock belegt — spaeter erneut versuchen"
// ausgeben und Exitcode weiterreichen — kein stiller Abbruch, kein unbegrenztes Warten.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const [w, h] = String(argOf("viewport", "640x360")).split("x").map(Number);
const VIEWPORT = { width: w || 640, height: h || 360 };
const DPR = Number(argOf("dpr", "1")) || 1;
const RUNS = Number(argOf("runs", "3")) || 3;
const SECONDS = Number(argOf("seconds", "6")) || 6;
const TARGET_ENEMIES = Number(argOf("enemies", "300")) || 300;
const OUT = String(argOf("out", "shots/m10-endgame-fps-attribution.json"));

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

const loadAvg = () => readFileSync("/proc/loadavg", "utf8").trim().split(" ").slice(0, 3).join(" ");

// Reihenfolge: erst die teuren Blatt-Systeme, dann die Container (simulate / update).
const BUCKETS = [
  ["ground.update", (r) => r.ground],
  ["updateVisuals", (r) => r],
  ["updateEnemies", (r) => r],
  ["movePlayer", (r) => r],
  ["spawner.update", (r) => r.spawner],
  ["combat.update", (r) => r.combat],
  ["combat.fx.update", (r) => r.combat?.fx],
  ["combat.particles.update", (r) => r.combat?.particles],
  ["damageNumbers.update", (r) => r.combat?.damageNumbers],
  ["pickups.update", (r) => r.pickups],
  ["enemyShots.update", (r) => r.enemyShots],
  ["hazards.update", (r) => r.hazards],
  ["bosses.update", (r) => r.bosses],
  ["chests.update", (r) => r.chests],
  ["collectKills", (r) => r],
  ["touchDamage", (r) => r],
  ["simulate", (r) => r],
];

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
    "--js-flags=--expose-gc",
  ],
});

const clearLevelUps = async (page) => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

const setup = async (page) => {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
    window.__lf.spawnEnemy("bog_rat", 400);
    window.__lf.spawnEnemy("wisp", 50);
    window.__lf.spawnEnemy("bogzombie", 50);
  });
  await page.waitForTimeout(500);
  await page.evaluate(({ evolutions, passives }) => {
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1490);
    window.__lf.setTimeScale(1);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });
  await page.waitForTimeout(6000);
  await clearLevelUps(page);
  await page.waitForTimeout(400);
};

const installBuckets = async (page) => {
  await page.evaluate((bucketNames) => {
    const r = window.__game.scene.getScene("run");
    const acc = {};
    for (const [label] of bucketNames) acc[label] = { ms: 0, calls: 0 };
    const resolve = (r, label) => {
      if (label === "combat.fx.update") return r.combat?.fx;
      if (label === "combat.particles.update") return r.combat?.particles;
      if (label === "damageNumbers.update") return r.combat?.damageNumbers;
      if (label === "ground.update") return r.ground;
      if (label === "spawner.update") return r.spawner;
      if (label === "combat.update") return r.combat;
      if (label === "updateEnemies" || label === "movePlayer" || label === "updateVisuals" ||
          label === "collectKills" || label === "touchDamage" || label === "simulate") return r;
      if (label === "pickups.update") return r.pickups;
      if (label === "enemyShots.update") return r.enemyShots;
      if (label === "hazards.update") return r.hazards;
      if (label === "bosses.update") return r.bosses;
      if (label === "chests.update") return r.chests;
      return null;
    };
    const methodOf = (label) => label.split(".").pop();
    window.__lfM10Buckets = acc;
    for (const [label] of bucketNames) {
      const target = resolve(r, label);
      const name = methodOf(label);
      if (!target || typeof target[name] !== "function") continue;
      const orig = target[name].bind(target);
      target[name] = (...args) => {
        const t0 = performance.now();
        const out = orig(...args);
        acc[label].ms += performance.now() - t0;
        acc[label].calls++;
        return out;
      };
    }
  }, BUCKETS.map(([label]) => [label]));
};

const measureRun = async (page, label) => {
  const res = await page.evaluate(async ({ label, seconds, target }) => {
    const start = performance.now();
    let frames = 0;
    let worst = 0;
    let last = start;
    let lastSpawn = start;
    const samples = [];
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        if (frames > 0) worst = Math.max(worst, dt);
        last = now;
        frames++;
        if (now - lastSpawn >= 50) {
          lastSpawn = now;
          const active = window.__lf.stats().enemies;
          if (active < target) window.__lf.spawnEnemy("bog_rat", target - active);
          samples.push(window.__lf.stats().enemies);
        }
        if (now - start >= seconds * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    const buckets = {};
    const acc = window.__lfM10Buckets ?? {};
    for (const k of Object.keys(acc)) {
      const b = acc[k];
      buckets[k] = {
        calls: b.calls,
        totalMs: Math.round(b.ms * 10) / 10,
        msPerFrame: frames ? Math.round((b.ms / frames) * 1000) / 1000 : 0,
        msPerCall: b.calls ? Math.round((b.ms / b.calls) * 1000) / 1000 : 0,
      };
    }
    return {
      label,
      fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
      frames,
      elapsedMs: Math.round(elapsed),
      worstFrameMs: Math.round(worst * 10) / 10,
      minEnemies: samples.length ? Math.min(...samples) : 0,
      avgEnemies: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : 0,
      levelUpOpen: window.__lf.stats().levelUpOpen,
      lod: window.__lf.stats().lod?.level,
      buckets,
    };
  }, { label, seconds: SECONDS, target: TARGET_ENEMIES });
  // Buckets fuer den naechsten Lauf zuruecksetzen.
  await page.evaluate(() => {
    for (const b of Object.values(window.__lfM10Buckets ?? {})) {
      b.ms = 0;
      b.calls = 0;
    }
  });
  return res;
};

const runs = [];
try {
  for (let i = 0; i < RUNS; i++) {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    const loadBefore = loadAvg();
    await setup(page);
    await installBuckets(page);
    const res = await measureRun(page, `minute25-${i + 1}`);
    res.jsErrors = errors;
    res.loadAvgBefore = loadBefore;
    res.loadAvgAfter = loadAvg();
    const view = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const rect = canvas.getBoundingClientRect();
      return { internal: [window.__game.scale.width, window.__game.scale.height], css: [Math.round(rect.width), Math.round(rect.height)], dpr: window.devicePixelRatio };
    });
    res.view = view;
    runs.push(res);
    console.log("RUN", JSON.stringify(res));
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}

const summary = {
  command: `flock -w 240 /home/ai/games/.lf-perf.lock node scripts/m10-endgame-fps.mjs --viewport ${VIEWPORT.width}x${VIEWPORT.height} --dpr ${DPR} --runs ${RUNS} --out ${OUT}`,
  viewport: VIEWPORT,
  dpr: DPR,
  secondsPerRun: SECONDS,
  targetEnemies: TARGET_ENEMIES,
  note: "Minute-25-Director-Dichte (300 Gegner + 6 Evolutionen), 640x360. profile-minute25.mjs ist syntaktisch defekt; dieses Skript ist die lauffaehige Attribution.",
  runs,
};
writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log("SUMMARY", JSON.stringify({ out: OUT, fps: runs.map((r) => r.fps), frames: runs.map((r) => r.frames) }));
