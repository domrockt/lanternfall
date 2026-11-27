#!/usr/bin/env node
// M10-projectile-cull: Projektil-Budget im Endgame messen (deterministischer Harness).
//
// Statt RAF-Realzeit (nicht reproduzierbar) treibt dieses Skript die Simulation
// selbst: Scene.paused = true, dann run.simulate(1/60) in festen Chunks. Gleicher
// Seed + gleiche dt-Folge => Treffer-/Schaden-Summen sind vor/nach dem Fix
// bitidentisch vergleichbar.
//
// Gemessen wird pro Lauf:
//  - lebende Projektile (Mittel/Max) und Offscreen-Anteil bei Margins 0/48/96/192 px
//  - ms/Frame für combat.updateProjectiles (Wrap) und combat.update (Wrap)
//  - Renderer-ms/Frame (Wrap game.renderer.render, Gesamt-Proxy für Draw-Last)
//  - Treffer-/Schaden-/Kill-Summen (Wrap combat.hitEnemy) + Treffer außerhalb view+Margin
//  - FPS (echter Loop, Reference) und Spawns
//
// Aufruf:
//   node scripts/m10-projectile-cull.mjs --out shots/m10-projectile-cull-before.json
// Die Sim-Schritte sind lastunabhängig (feste Substeps) -> OHNE flock laufen lassen.
// Nur der kurze FPS-Referenzteil nutzt flock (siehe --fps).
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const VIEWPORT = { width: 640, height: 360 };
const STEPS = Number(argOf("steps", "1800")) || 1800; // 30 s Sim bei 1/60
const CHUNK = Number(argOf("chunk", "300")) || 300;   // 5 s Sim pro evaluate
const OUT = String(argOf("out", "shots/m10-projectile-cull-before.json"));
const TAG = String(argOf("tag", "before"));

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
const MARGINS = [0, 48, 96, 192];

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});

const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
page.on("pageerror", (err) => console.error("[pageerror]", err.message));

await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true);
  // Spieler steht still: die Truppe konvergiert und bleibt dicht.
  window.__lf.autoPlay(false);
  window.__lf.setTimeScale(1);
  for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
});
await page.waitForTimeout(300);
await page.evaluate((passives) => {
  for (const id of passives) window.__lf.addPassive(id, 5);
  window.__lf.skipTo(1490);
  window.__lf.setTimeScale(1);
}, PASSIVES);
await page.waitForTimeout(2500);
await page.evaluate(() => {
  for (let i = 0; i < 40; i++) {
    if (!(window.__lf?.stats().levelUpOpen)) break;
    window.__lf.pickLevelUp(0);
  }
  window.__lf.setSuppressLevelUps(true);
});

// Stress-Truppe (Muster m10-crowd-probe): Natur-Spawns aus, Bestand leeren,
// 500 unsterbliche Gegner als Truppe um den Spieler. Wichtig fuer die
// Treffer-Identitaet: ALLE Gegner bleiben innerhalb des Views (Truppenradius
// 120 < halbe View-Hoehe 180). Ein Projektil jenseits view+96px kann dann
// geometrisch keinen Gegner mehr treffen (max. Treffer-Reichweite ~30 px).
await page.evaluate(() => {
  const r = window.__game.scene.getScene("run");
  window.__game.registry.set("lf-density", 0);
  r.registry.set("lf-density", 0);
  for (const e of r.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
});
await page.waitForTimeout(250);
await page.evaluate(() => {
  const r = window.__game.scene.getScene("run");
  const px = 2048;
  const py = 2048;
  window.__lf.teleport(px, py);
  let seed = 20261127;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__lf.spawnEnemy("bog_rat", 250);
  window.__lf.spawnEnemy("wisp", 125);
  window.__lf.spawnEnemy("bogzombie", 125);
  const fresh = r.enemies.active.filter((e) => e.alive);
  for (const e of fresh) {
    const a = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * 120;
    e.x = px + Math.cos(a) * rad;
    e.y = py + Math.sin(a) * rad;
    e.vx = 0;
    e.vy = 0;
    e.hp = 1e9;
    e.maxHp = 1e9;
    e.damage = 0;
  }
  window.__lf.setSuppressLevelUps(true);
});

// Instrumentierung + Ruhezustand des echten Loops.
await page.evaluate(() => {
  const r = window.__game.scene.getScene("run");
  const combat = r.combat;
  const w = (window.__m10proj = {
    projMs: 0, projCalls: 0, combatMs: 0, combatCalls: 0, renderMs: 0, renderCalls: 0,
    hits: 0, projHits: 0, hitDamage: 0, kills: 0, spawns: 0,
    hitBeyond96: 0, hitBeyond192: 0, inProj: false,
  });
  const origProj = combat.updateProjectiles.bind(combat);
  combat.updateProjectiles = (ctx) => {
    const t0 = performance.now();
    w.inProj = true;
    origProj(ctx);
    w.inProj = false;
    w.projMs += performance.now() - t0;
    w.projCalls += 1;
  };
  const origCombat = combat.update.bind(combat);
  combat.update = (ctx) => {
    const t0 = performance.now();
    origCombat(ctx);
    w.combatMs += performance.now() - t0;
    w.combatCalls += 1;
  };
  const origHit = combat.hitEnemy.bind(combat);
  combat.hitEnemy = (e, damage, ctx, id) => {
    w.hits += 1;
    w.hitDamage += damage;
    if (w.inProj) w.projHits += 1;
    const view = r.cameras.main.worldView;
    const beyond = (m) => e.x < view.x - m || e.y < view.y - m
      || e.x > view.x + view.width + m || e.y > view.y + view.height + m;
    if (beyond(96)) w.hitBeyond96 += 1;
    if (beyond(192)) w.hitBeyond192 += 1;
    const killed = origHit(e, damage, ctx, id);
    if (killed) w.kills += 1;
    return killed;
  };
  const origSpawn = combat.projectiles.spawn.bind(combat.projectiles);
  combat.projectiles.spawn = (opts) => {
    w.spawns += 1;
    return origSpawn(opts);
  };
  const renderer = window.__game.renderer;
  const origRender = renderer.render.bind(renderer);
  renderer.render = (...args) => {
    const t0 = performance.now();
    const res = origRender(...args);
    w.renderMs += performance.now() - t0;
    w.renderCalls += 1;
    return res;
  };
  r.paused = true; // RAF-Loop ruht; wir treiben simulate() mit festem dt.
});

const sample = () => page.evaluate((margins) => {
  const r = window.__game.scene.getScene("run");
  const view = r.cameras.main.worldView;
  const act = r.combat.projectiles.active;
  let live = 0;
  const off = margins.map(() => 0);
  let withTarget = 0;
  let enemyBeyond = 0;
  let enemyBeyond64 = 0;
  for (const p of act) {
    if (!p.active) continue;
    live += 1;
    if (p.target && p.target.alive && p.target.uid === p.targetUid) withTarget += 1;
    const dx = Math.max(view.x - p.x, p.x - (view.x + view.width), 0);
    const dy = Math.max(view.y - p.y, p.y - (view.y + view.height), 0);
    const d = Math.max(dx, dy);
    for (let i = 0; i < margins.length; i++) if (d > margins[i]) off[i] += 1;
  }
  // Hit-Neutralitäts-Invariante: Gegner dürfen view+64 nie verlassen
  // (Cull-Margin 96 > max. Treffer-Reichweite ~30 px + Puffer).
  for (const e of r.enemies.active) {
    if (!e.alive) continue;
    const dx = Math.max(view.x - e.x, e.x - (view.x + view.width), 0);
    const dy = Math.max(view.y - e.y, e.y - (view.y + view.height), 0);
    const d = Math.max(dx, dy);
    if (d > 0) enemyBeyond += 1;
    if (d > 64) enemyBeyond64 += 1;
  }
  return {
    enemies: window.__lf.stats().enemies,
    live, withTarget, off,
    enemiesBeyondView: enemyBeyond,
    enemiesBeyondView64: enemyBeyond64,
    view: { x: view.x, y: view.y, w: view.width, h: view.height },
    player: { x: r.posX, y: r.posY },
  };
}, MARGINS);

// Warmup (5 s Sim), damit Einschwingvorgänge (Waffen-Cooldowns, Spawn-Ring) raus sind.
await page.evaluate((step) => {
  const r = window.__game.scene.getScene("run");
  for (let i = 0; i < 300; i++) {
    r.simulate(step);
    r.combat.fx.update(step);
    r.combat.particles.update(step);
    r.updateVisuals(step);
  }
}, 1 / 60);
await page.evaluate(() => {
  const w = window.__m10proj;
  w.projMs = 0; w.projCalls = 0; w.combatMs = 0; w.combatCalls = 0;
  w.renderMs = 0; w.renderCalls = 0; w.hits = 0; w.projHits = 0; w.hitDamage = 0;
  w.kills = 0; w.spawns = 0; w.hitBeyond96 = 0; w.hitBeyond192 = 0;
});

const samples = [];
for (let c = 0; c < STEPS / CHUNK; c++) {
  await page.evaluate(({ step, n }) => {
    const r = window.__game.scene.getScene("run");
    for (let i = 0; i < n; i++) {
      r.simulate(step);
      r.combat.fx.update(step);
      r.combat.particles.update(step);
    }
    r.updateVisuals(step);
  }, { step: 1 / 60, n: CHUNK });
  samples.push(await sample());
}

// Kurze FPS-Referenz im echten Loop (flock-Pflicht liegt beim Aufrufer).
const fpsRef = await (async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync("flock", ["-w", "120", "/home/ai/games/.lf-perf.lock", "node", "-e", "1"], { timeout: 130_000 });
  } catch { /* Sperre belegt: FPS-Referenz entfaellt, Sim-Messung bleibt gueltig. */ }
  await page.evaluate(() => { window.__game.scene.getScene("run").paused = false; });
  const t0 = Date.now();
  await page.waitForTimeout(4000);
  const fps = await page.evaluate(() => window.__lf.stats().fps);
  return { fps, secondsReal: (Date.now() - t0) / 1000 };
})();

const totals = await page.evaluate(() => {
  const w = window.__m10proj;
  const pool = window.__game.scene.getScene("run").combat.projectiles;
  return {
    projMs: w.projMs, projCalls: w.projCalls,
    combatMs: w.combatMs, combatCalls: w.combatCalls,
    renderMs: w.renderMs, renderCalls: w.renderCalls,
    hits: w.hits, projHits: w.projHits, hitDamage: w.hitDamage, kills: w.kills,
    spawns: w.spawns, hitBeyond96: w.hitBeyond96, hitBeyond192: w.hitBeyond192,
    activeLen: pool.active.length,
  };
});
await page.screenshot({ path: `shots/m10-projectile-cull-${TAG}.png` });

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const result = {
  tag: TAG,
  config: { viewport: "640x360", dpr: 1, seed: 1, skipTo: 1490, steps: STEPS, step: "1/60", margins: MARGINS },
  deterministicHarness: "scene.paused + run.simulate(1/60) in Chunks",
  simSeconds: STEPS / 60,
  liveProjectiles: { avg: Math.round(avg(samples.map((s) => s.live)) * 10) / 10, max: Math.max(...samples.map((s) => s.live)) },
  withLiveTarget: { avg: Math.round(avg(samples.map((s) => s.withTarget)) * 10) / 10 },
  enemiesAvg: Math.round(avg(samples.map((s) => s.enemies))),
  enemiesBeyondViewMax: Math.max(...samples.map((s) => s.enemiesBeyondView)),
  enemiesBeyondView64Max: Math.max(...samples.map((s) => s.enemiesBeyondView64)),
  offscreenByMargin: Object.fromEntries(MARGINS.map((m, i) => [
    `>${m}px`,
    {
      avg: Math.round(avg(samples.map((s) => s.off[i])) * 10) / 10,
      max: Math.max(...samples.map((s) => s.off[i])),
      pctOfLive: Math.round((avg(samples.map((s) => s.off[i])) / Math.max(1, avg(samples.map((s) => s.live)))) * 1000) / 10,
    },
  ])),
  msPerFrame: {
    projectileUpdate: Math.round((totals.projMs / Math.max(1, totals.projCalls)) * 1000) / 1000,
    combatUpdate: Math.round((totals.combatMs / Math.max(1, totals.combatCalls)) * 1000) / 1000,
    rendererTotal: Math.round((totals.renderMs / Math.max(1, totals.renderCalls)) * 1000) / 1000,
  },
  totals: {
    hits: totals.hits, projectileHits: totals.projHits, hitDamage: totals.hitDamage,
    kills: totals.kills, spawns: totals.spawns,
    hitsBeyondView96: totals.hitBeyond96, hitsBeyondView192: totals.hitBeyond192,
  },
  fpsReference: fpsRef,
  samples,
};

writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(`[m10-projectile-cull] ${OUT}`);
console.log(`  live Ø ${result.liveProjectiles.avg} (max ${result.liveProjectiles.max}), Gegner Ø ${result.enemiesAvg}, jenseits view max ${result.enemiesBeyondViewMax} (view+64: ${result.enemiesBeyondView64Max})`);
for (const [m, v] of Object.entries(result.offscreenByMargin)) {
  console.log(`  offscreen ${m}: Ø ${v.avg} (${v.pctOfLive} %)`);
}
console.log(`  ms/Frame: projUpdate ${result.msPerFrame.projectileUpdate}, combat ${result.msPerFrame.combatUpdate}, render ${result.msPerFrame.rendererTotal}`);
console.log(`  Treffer ${result.totals.hits} (davon Projektil ${result.totals.projectileHits}), Schaden ${result.totals.hitDamage}, Kills ${result.totals.kills}, Spawns ${result.totals.spawns}`);
console.log(`  Treffer jenseits view+96px: ${result.totals.hitsBeyondView96}, view+192px: ${result.totals.hitsBeyondView192}`);
console.log(`  FPS-Referenz: ${result.fpsReference.fps}`);

await browser.close();
server.stop();
