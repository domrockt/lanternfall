#!/usr/bin/env node
// M10-Separation-Crowd-Probe: 500 Gegner dicht gedraengt in der Mitte.
// Misst ueber 300 Frames: Anteil Gegner-Paare < 4 px, mittlerer
// Naechster-Nachbar-Abstand, Gegner im 32-px-Kreis um den Spieler,
// FPS min/median. Schreibt shots/m10-separation-<tag>.json und
// einen Chaos-Frame bei Minute 25 als shots/m10-separation-<tag>.png.
//
// FPS-Messung nur mit flock starten:
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-crowd-probe.mjs --tag=before
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "probe"));
const FRAMES = Number(argOf("frames", "300")) || 300;
const OUT_JSON = String(argOf("json", `shots/m10-separation-${TAG}.json`));
const OUT_PNG = String(argOf("png", `shots/m10-separation-${TAG}.png`));
// Minute 25: voller Gegner-Deckel (500), damit der Screenshot die Endgame-Last zeigt.
const MINUTE = Number(argOf("minute", "1490")) || 1490;

// Mischung aus mehreren Stufen, damit der Chaos-Frame unterschiedliche Silhouetten zeigt.
const MIX = [
  ["bog_rat", 90], ["wisp", 70], ["bogzombie", 60], ["crow", 70], ["skeleton", 60],
  ["bat", 60], ["ghoul", 40], ["spider", 50],
];

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

/** Deterministischer PRNG im Page-Kontext (mulberry32). */
const SEED_FN = `
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
`;

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);

  // Phase 1: 500 Gegner als dichte Traube in der Weltmitte, Spieler mittendrin.
  const prep = await page.evaluate(async ({ mix, minute, seedSrc, frames }) => {
    // eslint-disable-next-line no-eval
    eval(seedSrc);
    const run = window.__game.scene.getScene("run");
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.skipTo(minute);
    window.__lf.setTimeScale(1);
    // Natur-Spawns fuer die Messung aus, sonst pendelt der Bestand ueber 500.
    window.__game.registry.set("lf-density", 0);
    run.registry.set("lf-density", 0);
    for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
    // Recycle-Runde abwarten, damit der Pool wirklich leer ist.
    await new Promise((r) => setTimeout(r, 250));

    const len = mix.length;
    const total = 500;
    const per = mix.map(([, n]) => Math.max(1, Math.round((n / mix.reduce((a, b) => a + b[1], 0)) * total)));
    const rand = mulberry32(20261127);
    const px = 2048;
    const py = 2048;
    window.__lf.teleport(px, py);
    let spawned = 0;
    const uids = [];
    for (let i = 0; i < len; i++) {
      const [id, _n] = mix[i];
      const count = per[i];
      const before = run.enemies.active.filter((e) => e.alive).length;
      window.__lf.spawnEnemy(id, count);
      const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
      for (const e of fresh) {
        // Dichte Traube: Radius 40 px um die Weltmitte, deutlich unter dem
        // doppelten Gegnerradius -> massives Ueberlappen als Baseline-Stress.
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 40;
        e.x = px + Math.cos(a) * r;
        e.y = py + Math.sin(a) * r;
        e.vx = 0;
        e.vy = 0;
        // Ueberleben sichern: die Probe misst Separation, nicht Kampf.
        e.hp = 1e9;
        e.maxHp = 1e9;
        e.damage = 0;
        uids.push(e.uid);
      }
      spawned += fresh.length;
    }
    // Frame-Sampler: 300 rAF-Ticks, je Frame dt mitschreiben.
    const deltas = [];
    let last = performance.now();
    let seen = 0;
    await new Promise((resolve) => {
      const tick = (now) => {
        if (seen > 0) deltas.push(now - last);
        last = now;
        seen++;
        if (seen >= frames + 1) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { spawned, uids, alive: run.enemies.active.filter((e) => e.alive && uids.includes(e.uid)).length, deltas };  }, { mix: MIX, minute: MINUTE, seedSrc: SEED_FN, frames: FRAMES });

  // Metriken am Ende der 300 Frames aus den echten Runtime-Positionen.
  const metrics = await page.evaluate(({ uids }) => {
    const run = window.__game.scene.getScene("run");
    const alive = run.enemies.active.filter((e) => e.alive && uids.includes(e.uid));
    const n = alive.length;
    let closePairs = 0;
    let pairs = 0;
    let sumNearest = 0;
    let finite = true;
    for (let i = 0; i < n; i++) {
      const a = alive[i];
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) finite = false;
      let nearest = Infinity;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const b = alive[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < nearest) nearest = d;
        if (j > i) {
          pairs++;
          if (d < 4) closePairs++;
        }
      }
      if (nearest !== Infinity) sumNearest += nearest;
    }
    const inside32 = alive.filter((e) => Math.hypot(e.x - run.player.x, e.y - run.player.y) <= 32).length;
    return {
      alive: n,
      pairs,
      closePairs,
      closePairRatio: pairs > 0 ? Math.round((closePairs / pairs) * 10000) / 10000 : 0,
      meanNearestNeighbor: n > 1 ? Math.round((sumNearest / n) * 100) / 100 : null,
      enemiesWithin32px: inside32,
      positionsFinite: finite,
    };
  }, { uids: prep.uids });

  const deltas = prep.deltas.filter((d) => d > 0);
  const sorted = [...deltas].sort((a, b) => a - b);
  const medianMs = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const maxMs = sorted.length ? sorted[sorted.length - 1] : 0;
  const toFps = (ms) => (ms > 0 ? Math.round((1000 / ms) * 10) / 10 : 0);
  const fps = deltas.map(toFps);

  // Phase 2: Chaos-Frame bei Minute 25 (echte Kamera, 500 lebende Gegner).
  await page.evaluate(async ({ mix, minute, seedSrc }) => {
    // eslint-disable-next-line no-eval
    eval(seedSrc);
    const run = window.__game.scene.getScene("run");
    const rand = mulberry32(90210);
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    // Bestehende Probe-Gegner aufraeumen, damit der Frame nicht nur eine Traube zeigt.
    for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
    window.__lf.skipTo(minute);
    window.__lf.setTimeScale(1);
    const px = 2048;
    const py = 2048;
    window.__lf.teleport(px, py);
    let spawned = 0;
    for (const [id, count] of mix) {
      const before = run.enemies.active.filter((e) => e.alive).length;
      window.__lf.spawnEnemy(id, count);
      const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
      for (const e of fresh) {
        // Ueber die sichtbare Flaeche verteilt (480x270 intern), rechts mehr Dichte,
        // damit der Art-Check "Typen rechts unterscheidbar" pruefbar ist.
        const side = rand() < 0.62 ? 1 : -1;
        e.x = px + side * (10 + rand() * 210);
        e.y = py + (rand() - 0.5) * 240;
        e.hp = 1e9;
        e.maxHp = 1e9;
        e.damage = 0;
      }
      spawned += fresh.length;
    }
    window.__lf.spawnBoss(0);
    return spawned;
  }, { mix: MIX, minute: MINUTE, seedSrc: SEED_FN });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT_PNG });

  result = {
    tag: TAG,
    generatedAt: new Date().toISOString(),
    seed: 1,
    frames: FRAMES,
    spawned: prep.spawned,
    ...metrics,
    fpsMin: sorted.length ? toFps(maxMs) : null,
    fpsMedian: sorted.length ? toFps(medianMs) : null,
    worstFrameMs: Math.round(maxMs * 100) / 100,
    medianFrameMs: Math.round(medianMs * 100) / 100,
    jsErrors: errors,
  };
} finally {
  await browser.close();
  server.stop();
}

writeFileSync(OUT_JSON, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
process.exit(result && result.jsErrors.length === 0 && result.alive > 0 ? 0 : 1);
