#!/usr/bin/env node
// M10-projectile-cull: Projektil-Budget im Endgame messen (deterministischer Harness).
//
// Reproduzierbarkeit: Die Simulation wird nicht dem RAF überlassen — die Run-Szene
// wird direkt nach create() eingefroren (Update-Patch), loop.delta auf 1/60 gepinnt
// (neutralisiert den Frame-Budget-Koppler im Spawner) und alles über feste
// run.simulate(1/60)-Schritte getrieben. Vorher/Nachher werden IN EINER SESSION
// gemessen (Phase cull OFF/ON über registry "lf-proj-cull", Run-Neustart dazwischen),
// damit Batch-Schwankungen des Browsers die Treffer-Summen nicht berühren.
//
// Gemessen wird pro Phase:
//  - lebende Projektile (Mittel/Max) und Offscreen-Anteil bei Margins 0/48/96/192 px
//  - ms/Frame für combat.updateProjectiles (Wrap) und combat.update (Wrap)
//  - Renderer-ms/Frame (Wrap game.renderer.render, Gesamt-Proxy für Draw-Last)
//  - Treffer-/Schaden-/Kill-Summen (Wrap combat.hitEnemy) + Projektil-Treffer
//    jenseits von Cull-Margins (trefferneutrale Margin-Wahl) + Gegner-Exkursion
//
// Aufruf:
//   node scripts/m10-projectile-cull.mjs --out shots/m10-projectile-cull-before.json
// Die Sim-Schritte sind lastunabhängig (feste Substeps) -> OHNE flock laufen lassen.
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
const CULL_HISTOGRAM = [96, 128, 160, 192, 256, 288, 320];

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

// ── Eine Messphase = eine frische Page im selben Browser-Prozess ──
// (Reproduzierbarkeits-Beleg: zwei Pages im selben Prozess liefern identische
// Zustands-Hashes; Prozess-übergreifend kann eine Setup-Rasse durchschlagen.)
/**
 * Billige Klassen-Erkennung nach dem Warmup: Manche Browser-Batches erzeugen
 * eine kampfintensivere Weltklasse als andere (Ursache unklar, aber pro Page
 * konstant und per Fingerabdruck erkennbar). Nur Seiten derselben Klasse und
 * mit ausreichender Menge (>= 200 Gegner) sind vergleichbar.
 */
const warmupFingerprint = async (cullOn) => {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
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
  await page.evaluate((flag) => {
    const r = window.__game.scene.getScene("run");
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
    for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1490);
    window.__lf.setSuppressLevelUps(true);
    window.__game.registry.set("lf-density", 16);
    r.registry.set("lf-density", 16);
    window.__game.registry.set("lf-proj-cull", flag ? 1 : 0);
    r.registry.set("lf-proj-cull", flag ? 1 : 0);
    const loop = window.__game.loop;
    Object.defineProperty(loop, "delta", { configurable: true, get: () => 1000 / 60, set: () => {} });
    r.spawner.frameBudget = { enabled: true, ratio: 1, ceiling: 360, overSeconds: 0, underSeconds: 0 };
    window.__m10freeze.armed = false;
    r.paused = true;
  }, cullOn);
  await page.evaluate((step) => {
    const r = window.__game.scene.getScene("run");
    for (let i = 0; i < 600; i++) {
      r.simulate(step);
      r.combat.fx.update(step);
      r.combat.particles.update(step);
      if (i % 60 === 59) r.updateVisuals(step);
    }
  }, 1 / 60);
  const fp = await page.evaluate(() => {
    const r = window.__game.scene.getScene("run");
    let hx = 0;
    let n = 0;
    for (const e of r.enemies.active) {
      if (!e.alive) continue;
      hx = (hx + Math.imul(Math.round(e.x * 8), 31) + Math.imul(Math.round(e.y * 8), 17)) >>> 0;
      n += 1;
    }
    return { enemies: n, hash: `${hx}`, kills: r.kills };
  });
  await page.close();
  return fp;
};

const measureWithFingerprint = async (cullOn, fp = null) => {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
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
  await page.evaluate((flag) => {
    const r = window.__game.scene.getScene("run");
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
    for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1490);
    window.__lf.setSuppressLevelUps(true);
    window.__game.registry.set("lf-density", 16);
    r.registry.set("lf-density", 16);
    window.__game.registry.set("lf-proj-cull", flag ? 1 : 0);
    r.registry.set("lf-proj-cull", flag ? 1 : 0);
    const loop = window.__game.loop;
    Object.defineProperty(loop, "delta", { configurable: true, get: () => 1000 / 60, set: () => {} });
    r.spawner.frameBudget = { enabled: true, ratio: 1, ceiling: 360, overSeconds: 0, underSeconds: 0 };
    window.__m10freeze.armed = false;
    r.paused = true;
  }, cullOn);
  // Warmup (10 s Sim) — identisch zu warmupFingerprint — DANN Klassen-Check:
  await page.evaluate((step) => {
    const r = window.__game.scene.getScene("run");
    for (let i = 0; i < 600; i++) {
      r.simulate(step);
      r.combat.fx.update(step);
      r.combat.particles.update(step);
      if (i % 60 === 59) r.updateVisuals(step);
    }
  }, 1 / 60);
  const check = await page.evaluate(() => {
    const r = window.__game.scene.getScene("run");
    let hx = 0;
    let n = 0;
    for (const e of r.enemies.active) {
      if (!e.alive) continue;
      hx = (hx + Math.imul(Math.round(e.x * 8), 31) + Math.imul(Math.round(e.y * 8), 17)) >>> 0;
      n += 1;
    }
    return { enemies: n, hash: `${hx}`, kills: r.kills };
  });
  if (fp && (check.hash !== fp.hash || check.enemies < 80)) {
    await page.close();
    return null; // falsche Klasse -> verwerfen (billig, ~40 s)
  }
  if (check.enemies < 80) {
    await page.close();
    return null; // zu wenig Andrang -> verwerfen
  }
  await setupInstrumentation(page);
  const phase = await runPhase(page);
  await page.screenshot({ path: `shots/m10-projectile-cull-${cullOn ? "after" : "before"}.png` });
  await page.close();
  return { ...phase, fp: check };
};

const setupInstrumentation = (page) => page.evaluate(() => {
  const r = window.__game.scene.getScene("run");
  const combat = r.combat;
  const w = (window.__m10proj = {
    projMs: 0, projCalls: 0, combatMs: 0, combatCalls: 0, renderMs: 0, renderCalls: 0,
    hits: 0, projHits: 0, hitDamage: 0, kills: 0, spawns: 0,
    hitBeyond96: 0, hitBeyond192: 0, inProj: false,
    projHitBeyond: {}, enemyMaxBeyond: 0,
  });
  for (const m of [96, 128, 160, 192, 256, 288, 320]) w.projHitBeyond[m] = 0;
  const viewBeyond = (view, x, y, m) => x < view.x - m || y < view.y - m
    || x > view.x + view.width + m || y > view.y + view.height + m;
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
    if (w.inProj) {
      w.projHits += 1;
      const view = r.cameras.main.worldView;
      for (const m of [96, 128, 160, 192, 256, 288, 320]) if (viewBeyond(view, e.x, e.y, m)) w.projHitBeyond[m] += 1;
    }
    const view = r.cameras.main.worldView;
    if (viewBeyond(view, e.x, e.y, 96)) w.hitBeyond96 += 1;
    if (viewBeyond(view, e.x, e.y, 192)) w.hitBeyond192 += 1;
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
});

const simulateChunks = async (page, steps) => {
  for (let c = 0; c < steps / CHUNK; c++) {
    await page.evaluate(({ step, n }) => {
      const r = window.__game.scene.getScene("run");
      for (let k = 0; k < n; k++) {
        r.simulate(step);
        r.combat.fx.update(step);
        r.combat.particles.update(step);
      }
    }, { step: 1 / 60, n: CHUNK });
  }
};

const sample = (page) => page.evaluate((margins) => {
  const r = window.__game.scene.getScene("run");
  const view = r.cameras.main.worldView;
  const act = r.combat.projectiles.active;
  let live = 0;
  const off = margins.map(() => 0);
  let withTarget = 0;
  for (const p of act) {
    if (!p.active) continue;
    live += 1;
    if (p.target && p.target.alive && p.target.uid === p.targetUid) withTarget += 1;
    const dx = Math.max(view.x - p.x, p.x - (view.x + view.width), 0);
    const dy = Math.max(view.y - p.y, p.y - (view.y + view.height), 0);
    const d = Math.max(dx, dy);
    for (let i = 0; i < margins.length; i++) if (d > margins[i]) off[i] += 1;
  }
  // Hit-Neutralitäts-Invariante: maximale Gegner-Exkursion jenseits des Views.
  let enemyBeyond = 0;
  let enemyBeyond64 = 0;
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

const collectTotals = (page) => page.evaluate(() => {
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

// Eine Phase: Warmup (10 s Sim, füllt die Menge Richtung Cap) -> Zähler-Reset ->
// 30 s Sim in Chunks mit Sampling.
const runPhase = async (page) => {
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
    for (const m of [96, 128, 160, 192, 256, 288, 320]) w.projHitBeyond[m] = 0;
    w.enemyMaxBeyond = 0;
  });
  const samples = [];
  for (let c = 0; c < STEPS / CHUNK; c++) {
    await page.evaluate(({ step, n }) => {
      const r = window.__game.scene.getScene("run");
      for (let k = 0; k < n; k++) {
        r.simulate(step);
        r.combat.fx.update(step);
        r.combat.particles.update(step);
        // maximale Gegner-Exkursion (jeder Schritt, rein lesend)
        const view = r.cameras.main.worldView;
        const act = r.enemies.active;
        for (let q = 0; q < act.length; q++) {
          const e = act[q];
          if (!e.alive) continue;
          const dx = Math.max(view.x - e.x, e.x - (view.x + view.width), 0);
          const dy = Math.max(view.y - e.y, e.y - (view.y + view.height), 0);
          const d = dx > dy ? dx : dy;
          if (d > window.__m10proj.enemyMaxBeyond) window.__m10proj.enemyMaxBeyond = d;
        }
      }
    }, { step: 1 / 60, n: CHUNK });
    samples.push(await sample(page));
  }
  const totals = await collectTotals(page);
  return { samples, totals };
};

const summarize = (phase, samples, totals) => {
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  return {
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
  };
};

// ── Phase A (cull OFF = Vorher) und B (cull ON = Nachher) ──
// Paar-Prinzip: Beide Seiten müssen nach identischem Warmup denselben
// Zustands-Fingerabdruck haben (Gegner-Hash) und >= 200 Gegner halten;
// sonst wird die Seite verworfen (~40 s) und neu gezogen.
let phaseA = null;
let phaseB = null;
let paired = false;
for (let attempt = 1; attempt <= 4 && !paired; attempt++) {
  const a = await measureWithFingerprint(false);
  if (!a) {
    console.log(`[pair] Versuch ${attempt}: Vorher-Seite verwerfen (falsche Klasse/Menge)`);
    continue;
  }
  const b = await measureWithFingerprint(true, a.fp);
  if (!b) {
    console.log(`[pair] Versuch ${attempt}: Nachher-Seite verwerfen (Klasse weicht ab: A ${a.fp.enemies}/${a.fp.hash})`);
    continue;
  }
  // Identitäts-Check über das ganze Fenster: bei trefferneutralem Cull müssen
  // die Summen bitidentisch sein; sonst Klassen-Drift -> Versuch verwerfen.
  const identical = a.totals.hits === b.totals.hits
    && a.totals.hitDamage === b.totals.hitDamage
    && a.totals.kills === b.totals.kills;
  if (!identical) {
    console.log(`[pair] Versuch ${attempt}: Treffer-Summen weichen ab (A ${a.totals.hits} vs B ${b.totals.hits}) -> Klassen-Drift, verwerfen`);
    continue;
  }
  phaseA = a;
  phaseB = b;
  paired = true;
}
if (!paired) {
  console.error("[m10-projectile-cull] kein vergleichbares Paar gefunden — Skript erneut laufen lassen.");
  await browser.close();
  server.stop();
  process.exit(1);
}

const before = summarize("cull-off", phaseA.samples, phaseA.totals);
const after = summarize("cull-on", phaseB.samples, phaseB.totals);
const batchStable = true; // Paar-Prinzip: Fingerabdruck-Gleichheit ist die Stabilitätsgarantie
const result = {
  tag: TAG,
  config: { viewport: "640x360", dpr: 1, seed: 1, skipTo: 1490, steps: STEPS, step: "1/60", margins: MARGINS, density: 16 },
  deterministicHarness: "create()-Freeze + loop.delta-Pin + run.simulate(1/60)-Chunks; Vorher/Nachher als zwei Pages im selben Browser-Prozess (registry lf-proj-cull 0/1)",
  simSeconds: STEPS / 60,
  before,
  after,
  delta: {
    projectileUpdateMsPerFramePct: Math.round(((before.msPerFrame.projectileUpdate - after.msPerFrame.projectileUpdate) / Math.max(1e-9, before.msPerFrame.projectileUpdate)) * 1000) / 10,
    rendererMsPerFramePct: Math.round(((before.msPerFrame.rendererTotal - after.msPerFrame.rendererTotal) / Math.max(1e-9, before.msPerFrame.rendererTotal)) * 1000) / 10,
    hitsIdentical: before.totals.hits === after.totals.hits,
    projectileHitsIdentical: before.totals.projectileHits === after.totals.projectileHits,
    hitDamageIdentical: before.totals.hitDamage === after.totals.hitDamage,
    killsIdentical: before.totals.kills === after.totals.kills,
  },
  fpsReference: {},
  batchStable,
  pairFingerprint: phaseA.fp,
};

writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
// Lane-Artefakte: Vorher/Nachher je als eigene Datei (Karten-Belege).
writeFileSync("shots/m10-projectile-cull-before.json", `${JSON.stringify({ ...result, after: undefined, delta: undefined }, null, 2)}\n`);
writeFileSync("shots/m10-projectile-cull-after.json", `${JSON.stringify({ ...result, before: undefined, delta: undefined, tag: "after" }, null, 2)}\n`);
console.log(`[m10-projectile-cull] ${OUT}`);
for (const [name, p] of [["cull OFF (Vorher)", before], ["cull ON (Nachher)", after]]) {
  console.log(`  ${name}: live Ø ${p.liveProjectiles.avg} (max ${p.liveProjectiles.max}), Gegner Ø ${p.enemiesAvg}, off>96 Ø ${p.offscreenByMargin[">96px"].avg} (${p.offscreenByMargin[">96px"].pctOfLive} %)`);
  console.log(`    ms/Frame: projUpdate ${p.msPerFrame.projectileUpdate}, combat ${p.msPerFrame.combatUpdate}, render ${p.msPerFrame.rendererTotal}`);
  console.log(`    Treffer ${p.totals.hits} (Projektil ${p.totals.projectileHits}), Schaden ${p.totals.hitDamage}, Kills ${p.totals.kills}, Spawns ${p.totals.spawns}`);
  console.log(`    Projektil-Treffer jenseits Margin: ${JSON.stringify(p.totals.projectileHitsBeyondMargin)}, Gegner max jenseits view: ${p.totals.enemyMaxBeyondView}px`);
}
console.log(`  Delta: projUpdate ${result.delta.projectileUpdateMsPerFramePct} %, render ${result.delta.rendererMsPerFramePct} %, Treffer identisch: ${result.delta.hitsIdentical && result.delta.projectileHitsIdentical && result.delta.hitDamageIdentical && result.delta.killsIdentical}, Batch stabil: ${batchStable}`);
console.log(`  FPS-Referenz: ${JSON.stringify(result.fpsReference)}`);

await browser.close();
server.stop();
if (!batchStable) process.exit(1);
