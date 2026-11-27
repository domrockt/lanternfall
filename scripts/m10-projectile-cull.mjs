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
// Run-Szene einfrieren, BEVOR ihr erstes Update läuft: nach create() ist der
// Zustand rein konstruiert und damit deterministisch (keine RAF-Ticks davor).
await page.waitForFunction(() => Boolean(window.__game?.scene?.getScene("run")));
await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  const orig = run.update.bind(run);
  window.__m10freeze = { orig, armed: true };
  run.update = (_t, _d) => {
    if (window.__m10freeze.armed) return;
    return orig(_t, _d);
  };
});
await startRun(page);

// Komplette Vorbereitung in EINEM evaluate: keine RAF-Sim-Ticks dazwischen.
await page.evaluate(() => {
  const r = window.__game.scene.getScene("run");
  window.__lf.god(true);
  // Autoplay: der Bot kite't durch die Menge — genau der Endgame-Fall, in dem
  // Projektil-Ziele sterben und geradlinige Geschosse offscreen weiterfliegen.
  window.__lf.autoPlay(true);
  for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
  for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(id, 5);
  window.__lf.skipTo(1490);
  window.__lf.setSuppressLevelUps(true);
  window.__game.registry.set("lf-density", 16);
  r.registry.set("lf-density", 16);
  // Frame-Budget-Koppler an Echtzeit neutralisieren: loop.delta pinnen (Spawner
  // frisst sonst reale Frame-Zeiten -> nicht reproduzierbar) und Regler auf ratio 1.
  const loop = window.__game.loop;
  Object.defineProperty(loop, "delta", {
    configurable: true,
    get: () => 1000 / 60,
    set: () => {},
  });
  r.spawner.frameBudget = { enabled: true, ratio: 1, ceiling: 360, overSeconds: 0, underSeconds: 0 };
  window.__m10freeze.armed = false; // Update-Patch aus, Szene bleibt via paused ruhig
  r.paused = true;
});

// Instrumentierung + Ruhezustand des echten Loops.
await page.evaluate(() => {
  const r = window.__game.scene.getScene("run");
  const combat = r.combat;
  const w = (window.__m10proj = {
    projMs: 0, projCalls: 0, combatMs: 0, combatCalls: 0, renderMs: 0, renderCalls: 0,
    hits: 0, projHits: 0, hitDamage: 0, kills: 0, spawns: 0,
    hitBeyond96: 0, hitBeyond192: 0, inProj: false,
    projHitBeyond: { 96: 0, 128: 0, 160: 0, 192: 0, 256: 0, 288: 0, 320: 0 },
    enemyMaxBeyond: 0,
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
    if (w.inProj) {
      // Welche Cull-Margins wären trefferneutral? Ein Projektil-Treffer jenseits
      // der Margin wäre im Nachher-Lauf durch Recycling verloren.
      for (const m of [96, 128, 160, 192, 256]) if (beyond(m)) w.projHitBeyond[m] += 1;
    }
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

// Warmup (10 s Sim) über feste Schritte: füllt die Menge Richtung Cap und
// lässt Waffen-Einschwingvorgänge aus dem Vergleich fallen.
await page.evaluate((step) => {
  const r = window.__game.scene.getScene("run");
  for (let i = 0; i < 600; i++) {
    r.simulate(step);
    r.combat.fx.update(step);
    r.combat.particles.update(step);
    if (i % 60 === 59) r.updateVisuals(step);
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
    const w = window.__m10proj;
    for (let i = 0; i < n; i++) {
      r.simulate(step);
      // Maximale Gegner-Exkursion jenseits des Views (jeder Schritt) — Grundlage
      // fuer die trefferneutrale Cull-Margin; rein lesend.
      const view = r.cameras.main.worldView;
      const act = r.enemies.active;
      for (let k = 0; k < act.length; k++) {
        const e = act[k];
        if (!e.alive) continue;
        const dx = Math.max(view.x - e.x, e.x - (view.x + view.width), 0);
        const dy = Math.max(view.y - e.y, e.y - (view.y + view.height), 0);
        const d = dx > dy ? dx : dy;
        if (d > w.enemyMaxBeyond) w.enemyMaxBeyond = d;
      }
      r.combat.fx.update(step);
      r.combat.particles.update(step);
    }
    r.updateVisuals(step);
  }, { step: 1 / 60, n: CHUNK });
  samples.push(await sample());
}

// Kurze FPS-Referenz im echten Loop: loop.delta entpinnen (echte Frame-Zeiten),
// Szene laufen lassen. Nur informativ; flock-Pflicht liegt beim Aufrufer.
const fpsRef = await (async () => {
  await page.evaluate(() => {
    const loop = window.__game.loop;
    Object.defineProperty(loop, "delta", {
      configurable: true, writable: true, value: 16.6666667,
    });
    window.__game.scene.getScene("run").paused = false;
  });
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
    projHitBeyond: w.projHitBeyond,
    enemyMaxBeyond: Math.round(w.enemyMaxBeyond * 10) / 10,
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
    projectileHitsBeyondMargin: totals.projHitBeyond,
    enemyMaxBeyondView: totals.enemyMaxBeyond,
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
console.log(`  Projektil-Treffer jenseits Margin: ${JSON.stringify(result.totals.projectileHitsBeyondMargin)}`);
console.log(`  FPS-Referenz: ${result.fpsReference.fps}`);

await browser.close();
server.stop();
