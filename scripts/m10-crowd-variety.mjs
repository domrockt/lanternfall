#!/usr/bin/env node
// M10-Crowd-Variety-Messung: 500 Gegner in Minute 30 rendern und zaehlen,
// wie viele UNTERSCHIEDLICHE Sprite-Texture-Keys im Frame sichtbar sind.
//
// Befund (Dom 21:45Z): "Gegnermasse Minute 30 = einfarbiger dunkler Block
// gleicher Sprites". Diese Messung belegt das Vorher ("before") bzw. den
// Fix ("after") mit demselben Skript — EIN Lauf pro Stand, kein Tuning-Loop.
//
//   node scripts/m10-crowd-variety.mjs --tag=before
//   -> shots/m10-crowd-variety-before.json + .png
//
// FPS-Anteil (Burst ueber 240 Frames) nur mit flock starten:
//   flock -w 240 /home/ai/games/.lf-perf.lock node scripts/m10-crowd-variety.mjs --tag=before
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
const TAG = String(argOf("tag", "before"));
const OUT_JSON = `shots/m10-crowd-variety-${TAG}.json`;
const OUT_PNG = `shots/m10-crowd-variety-${TAG}.png`;
// Minute 30 = Endgame-Masse (skipTo arbeitet in Ticks: 30*60-10).
const MINUTE = Number(argOf("minute", "1790")) || 1790;
const FPS_FRAMES = Number(argOf("frames", "240")) || 240;

// Minute-30-Mischung (Tier 0/1 dominieren die Horde).
const MIX = [
  ["bog_rat", 120], ["wisp", 80], ["crow", 70], ["bogzombie", 60],
  ["mudling", 50], ["bat", 50], ["skeleton", 40], ["ghoul", 30],
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

  result = await page.evaluate(async ({ mix, minute, seedSrc, fpsFrames }) => {
    // eslint-disable-next-line no-eval
    eval(seedSrc);
    const run = window.__game.scene.getScene("run");
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.skipTo(minute);
    window.__lf.setTimeScale(1);
    window.__game.registry.set("lf-density", 0);
    run.registry.set("lf-density", 0);
    for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
    await new Promise((r) => setTimeout(r, 250));

    const rand = mulberry32(20261127);
    const px = 2048;
    const py = 2048;
    window.__lf.teleport(px, py);
    const total = 500;
    const sum = mix.reduce((a, b) => a + b[1], 0);
    let spawned = 0;
    const uids = [];
    for (const [id, n] of mix) {
      const count = Math.max(1, Math.round((n / sum) * total));
      const before = run.enemies.active.filter((e) => e.alive).length;
      window.__lf.spawnEnemy(id, count);
      const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
      for (const e of fresh) {
        // Horde: dichte Streuung um den Spieler (Radius 140), wie Minute 30.
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 140;
        e.x = px + Math.cos(a) * r;
        e.y = py + Math.sin(a) * r;
        e.vx = 0;
        e.vy = 0;
        e.hp = 1e9;
        e.maxHp = 1e9;
        e.damage = 0;
        uids.push(e.uid);
      }
      spawned += fresh.length;
    }

    // Burst-FPS ueber fpsFrames rAF-Ticks (reiner Vergleichswert, kein Tor).
    const deltas = [];
    let last = performance.now();
    let seen = 0;
    await new Promise((resolve) => {
      const tick = (now) => {
        if (seen > 0) deltas.push(now - last);
        last = now;
        seen++;
        if (seen >= fpsFrames + 1) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    // Distinct-Texture-Keys im Frame: je Typ (def.spriteKey) die Menge der
    // aktuell angezeigten Sprite-Texture-Keys unter den lebenden Instanzen.
    const perType = {};
    let distinctTotal = new Set();
    let aliveCount = 0;
    for (const e of run.enemies.active) {
      if (!e.alive || !uids.includes(e.uid)) continue;
      aliveCount++;
      // currentFrame-Äquivalent (frame.name): Atlas-Frames tragen den
      // Original-Key als Frame-Namen, texture.key wäre immer "runtime_atlas".
      const key = e.sprite.frame?.name ?? e.sprite.texture?.key ?? "?";
      const type = e.def.spriteKey;
      (perType[type] ??= new Set()).add(key);
      distinctTotal.add(key);
    }
    const perTypeOut = Object.fromEntries(
      Object.entries(perType).map(([k, v]) => [k, { distinctKeys: v.size, keys: [...v].sort(), instances: run.enemies.active.filter((e) => e.alive && uids.includes(e.uid) && e.def.spriteKey === k).length }]),
    );
    const d = deltas.slice().sort((a, b) => a - b);
    const medianFps = d.length ? Math.round(1000 / d[Math.floor(d.length / 2)]) : null;
    const meanFps = d.length ? Math.round(1000 / (d.reduce((a, b) => a + b, 0) / d.length)) : null;
    // GL-Renderer (Mesa Intel iGPU erwartet).
    let renderer = "";
    try {
      const gl = window.__game.renderer?.gl ?? window.__game.renderer?.canvas?.getContext("webgl2") ?? null;
      const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
      renderer = (dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || (gl ? gl.getParameter(gl.RENDERER) : "") || "";
    } catch { renderer = "unbekannt"; }
    return {
      spawned,
      aliveCount,
      distinctKeysTotal: distinctTotal.size,
      perType: perTypeOut,
      medianFps,
      meanFps,
      renderer,
      minute: Math.floor(minute / 60),
    };
  }, { mix: MIX, minute: MINUTE, seedSrc: SEED_FN, fpsFrames: FPS_FRAMES });

  await page.screenshot({ path: OUT_PNG });
} finally {
  await browser.close();
  server.stop();
}

const json = {
  generatedAt: new Date().toISOString(),
  method: "500 gespawnte Gegner (Minute-30-Mix) um den Spieler, Distinct-Sprite-Texture-Keys im Frame je def.spriteKey; Burst-FPS = Median/Mittel ueber 240 rAF-Ticks (Vergleichswert)",
  tag: TAG,
  minute: Math.floor(MINUTE / 60),
  renderer: result.renderer,
  spawned: result.spawned,
  aliveCount: result.aliveCount,
  distinctKeysTotal: result.distinctKeysTotal,
  perType: result.perType,
  burstFps: { median: result.medianFps, mean: result.meanFps, frames: FPS_FRAMES },
  jsErrors: errors,
};
writeFileSync(OUT_JSON, JSON.stringify(json, null, 2));
console.log(JSON.stringify(json, null, 2));
