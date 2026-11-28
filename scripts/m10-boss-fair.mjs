#!/usr/bin/env node
// M10-Boss-Lure-Fairness: Verfolgungs-/Aggro-Verhalten der 6 Bosse unter
// AutoPlay + 500 Gegnern messen (K1 Vorher / K4 Nachher, gleiche Matrix).
//
// Pro Boss (6) x Seed (101/202/404):
//  - Distanzverlauf Boss -> Spieler (mean/max),
//  - Distanz zur Spawn-Zone (Leash-Beobachtung) + Leash-Verletzungen
//    (Boss ausserhalb 320 px der Spawn-Zone, SPIELER aber noch darin),
//  - Offscreen-Anteil + laengste zusammenhaengende Offscreen-Zeit,
//  - Schadensereignisse (Hazard-Trigger damage > 0) ohne vorherige
//    Sichtbarkeit des Warnbereichs im Kamera-View.
//
// Keine FPS-Messung -> ohne flock. AutoPlay + god; elapsed startet bei 180 s,
// damit keine natuerlichen Boss-Spawns dazwischenfunken (Flags hart gesetzt).
//
//   node scripts/m10-boss-fair.mjs --tag=before --out=shots/m10-bossfair-before.json
import { writeFileSync, mkdirSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  return fallback;
};
const TAG = String(argOf("tag", "before"));
const OUT_JSON = String(argOf("out", `shots/m10-bossfair-${TAG}.json`));
const SEEDS = String(argOf("seeds", "101,202,404")).split(",").map(Number);
const SIM_S = Number(argOf("sim", "30")) || 30; // Sim-Sekunden je Boss
const TIME_SCALE = Number(argOf("timescale", "3")) || 3;
const SAMPLE_MS = Number(argOf("sample", "120")) || 120;
const CROWD = Number(argOf("crowd", "500")) || 500;

// Fairness-Schwellen (vor der Messung festgelegt, K1/K4 identisch):
const LEASH_RADIUS = 320;      // px von der Spawn-Zone
const CATCHUP_AFTER_S = 2;     // laenger offscreen/fern als das = Abdrift-Ereignis
const VIEW_MARGIN = 8;         // px Toleranz fuer "im View"

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

async function openSeedRun(seed) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${seed}`);
  await startRun(page);
  await page.evaluate((seedSrc) => {
    // eslint-disable-next-line no-eval
    eval(seedSrc);
    const game = window.__game;
    const run = game.scene.getScene("run");
    run.registry.set("lf-density", 0);
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.setSuppressFx(true);
    window.__lf.skipTo(180);
    window.__lf.setTimeScale(3);
    // Keine natuerlichen Boss-Spawns waehrend der Matrix: Flags hart setzen.
    run.bossFlags = [true, true, true, true, true, true];
  }, SEED_FN);
  return { page, errors };
}

async function topUpCrowd(page) {
  return page.evaluate(({ crowd, seedSrc }) => {
    // eslint-disable-next-line no-eval
    eval(seedSrc);
    const run = window.__game.scene.getScene("run");
    const rand = mulberry32(777);
    const MIX = ["bog_rat", "wisp", "crow", "skeleton", "bat", "spider"];
    for (let round = 0; round < 8; round++) {
      const alive = run.enemies.active.filter((e) => e.alive).length;
      const need = crowd - alive;
      if (need <= 0) break;
      const id = MIX[round % MIX.length];
      const before = run.enemies.active.filter((e) => e.alive).length;
      window.__lf.spawnEnemy(id, need);
      const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
      for (const e of fresh) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 300;
        e.x = run.posX + Math.cos(a) * r;
        e.y = run.posY + Math.sin(a) * (r * 0.56);
        e.vx = 0; e.vy = 0;
        e.hp = 1e9; e.maxHp = 1e9; e.damage = 0;
      }
    }
    return run.enemies.active.filter((e) => e.alive).length;
  }, { crowd: CROWD, seedSrc: SEED_FN });
}

/** Sampler im Seitenkontext installieren (Beobachtung je Tick). */
async function installSampler(page) {
  return page.evaluate(() => {
    const st = { samples: [], events: [], seen: new Map() };
    window.__fair = st;
    const inRect = (x, y, v, m) =>
      x >= v.x - m && y >= v.y - m && x <= v.x + v.width + m && y <= v.y + v.height + m;
    const hazardInView = (h, v) => {
      if (h.kind === "beam") {
        // HazardRuntime-Beam: x/y = Startpunkt, x2/y2 = Endpunkt.
        return inRect(h.x, h.y, v, h.radius) || inRect(h.x2, h.y2, v, h.radius) ||
          inRect((h.x + h.x2) / 2, (h.y + h.y2) / 2, v, h.radius);
      }
      return inRect(h.x, h.y, v, h.radius);
    };
    window.__fairTimer = setInterval(() => {
      const run = window.__game.scene.getScene("run");
      if (!run || run.finished) return;
      const cam = run.cameras.main;
      const v = cam.worldView;
      const boss = run.bosses.living()[0] ?? null;
      const s = {
        t: Math.round(run.elapsed * 100) / 100,
        px: Math.round(run.posX * 10) / 10,
        py: Math.round(run.posY * 10) / 10,
        bx: boss ? Math.round(boss.x * 10) / 10 : null,
        by: boss ? Math.round(boss.y * 10) / 10 : null,
        bossHp: boss ? Math.round(boss.hp) : null,
        view: [Math.round(v.x), Math.round(v.y), Math.round(v.width), Math.round(v.height)],
      };
      if (boss) {
        s.bossInView = inRect(boss.x, boss.y, v, 8);
        s.distPlayer = Math.round(Math.hypot(boss.x - run.posX, boss.y - run.posY));
      }
      for (const h of run.hazards.active) {
        if (h.damage <= 0) continue;
        let rec = st.seen.get(h);
        if (!rec) {
          rec = { src: h.source, launchedT: Math.round(run.elapsed * 100) / 100, everInView: false, done: false,
            diag: [] };
          st.seen.set(h, rec);
        }
        if (rec.diag.length < 6) {
          rec.diag.push([rec.launchedT, Math.round(h.x), Math.round(h.y), Math.round(h.warn * 100) / 100,
            Math.round(v.x), Math.round(v.y), Math.round(v.width), Math.round(v.height),
            Math.round(run.posX), Math.round(run.posY)]);
        }
        if (!h.triggered && hazardInView(h, v)) rec.everInView = true;
        if (h.triggered && !rec.done) {
          rec.done = true;
          st.events.push({ t: Math.round(run.elapsed * 100) / 100, src: rec.src, launchedT: rec.launchedT, everInView: rec.everInView });
        }
      }
      st.samples.push(s);
    }, 120);
  });
}

async function stopSampler(page) {
  return page.evaluate(() => {
    clearInterval(window.__fairTimer);
    const st = window.__fair;
    return { samples: st.samples, events: st.events };
  });
}

async function clearBossAndHazards(page) {
  return page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    run.hazards.clear();
    for (const agent of run.bosses.bosses) {
      agent.enemy.alive = false;
      agent.enemy.hp = 0;
      agent.enemy.sprite.setVisible(false).setActive(false);
    }
    run.bosses.bosses.length = 0;
    return true;
  });
}

function r1(v) { return Math.round(v * 10) / 10; }
function r2(v) { return Math.round(v * 100) / 100; }

/** Auswertung je Boss/Seed aus den gesammelten Samples. */
function analyse(samples, events, spawn) {
  let dpSum = 0, dpMax = 0, dsSum = 0, dsMax = 0, n = 0;
  let offSamples = 0;
  let offRun = 0, maxOffRun = 0, driftEvents = 0;
  let leashSamples = 0, leashRun = 0, maxLeashRun = 0;
  for (const s of samples) {
    if (s.bx === null) continue;
    n++;
    const dp = Math.hypot(s.bx - s.px, s.by - s.py);
    const ds = Math.hypot(s.bx - spawn.x, s.by - spawn.y);
    dpSum += dp; dpMax = Math.max(dpMax, dp);
    dsSum += ds; dsMax = Math.max(dsMax, ds);
    const off = s.bossInView === false;
    if (off) {
      offSamples++;
      offRun += SAMPLE_MS / 1000;
      if (offRun > maxOffRun) maxOffRun = offRun;
      if (offRun > CATCHUP_AFTER_S && Math.abs(offRun - SAMPLE_MS / 1000 - CATCHUP_AFTER_S) < 1e-6) driftEvents++;
    } else {
      offRun = 0;
    }
    // Leash-Verletzung: Boss weit ausserhalb der Spawn-Zone, Spieler aber
    // noch (fast) darin - die Arena ist verlassen, obwohl sie relevant bleibt.
    const playerInZone = Math.hypot(s.px - spawn.x, s.py - spawn.y) <= LEASH_RADIUS + 40;
    if (ds > LEASH_RADIUS && playerInZone) {
      leashSamples++;
      leashRun += SAMPLE_MS / 1000;
      if (leashRun > maxLeashRun) maxLeashRun = leashRun;
    } else {
      leashRun = 0;
    }
  }
  const noVis = events.filter((e) => !e.everInView);
  return {
    samples: n,
    distPlayer: { mean: n ? r1(dpSum / n) : null, max: n ? r1(dpMax) : null },
    distSpawn: { mean: n ? r1(dsSum / n) : null, max: n ? r1(dsMax) : null },
    offscreenFraction: n ? r2(offSamples / n) : null,
    maxConsecOffscreenS: r1(maxOffRun),
    driftEvents,
    leashViolations: leashSamples,
    maxLeashViolationS: r1(maxLeashRun),
    hazardTriggers: events.length,
    damageWithoutVisibility: noVis.length,
    noVisDetail: noVis.slice(0, 8),
  };
}

const perSeed = [];
let totalNoVis = 0;
let totalLeash = 0;
for (const seed of SEEDS) {
  const { page, errors } = await openSeedRun(seed);
  await topUpCrowd(page);
  const bosses = [];
  for (let index = 0; index < 6; index++) {
    await clearBossAndHazards(page);
    await topUpCrowd(page);
    const spawn = await page.evaluate((i) => {
      window.__lf.spawnBoss(i);
      const b = window.__game.scene.getScene("run").bosses.living()[0];
      return b ? { x: Math.round(b.x), y: Math.round(b.y) } : null;
    }, index);
    if (!spawn) { console.log(`[warn] Boss ${index} Seed ${seed}: kein Spawn`); continue; }
    await installSampler(page);
    // Sim-Zeit SIM_S bei TIME_SCALE abwarten (kein sleep-Polling: fester Realzeit-Block).
    const realMs = Math.ceil((SIM_S / TIME_SCALE + 1.5) * 1000);
    await page.evaluate(({ simS }) => {
      window.__fairStart = window.__game.scene.getScene("run").elapsed;
      window.__fairTarget = window.__fairStart + simS;
    }, { simS: SIM_S });
    await page.waitForFunction(
      () => window.__game.scene.getScene("run").elapsed >= window.__fairTarget,
      { timeout: realMs, polling: 250 },
    ).catch(() => console.log(`[warn] Timeout Boss ${index} Seed ${seed} (Sim-Ziel nicht erreicht)`));
    const { samples, events } = await stopSampler(page);
    const res = analyse(samples, events, spawn);
    res.seed = seed; res.index = index; res.spawn = spawn;
    res.simCovered = samples.length ? r1(samples[samples.length - 1].t - samples[0].t) : 0;
    res.diag = await page.evaluate(() => {
      const st = window.__fair;
      return [...st.seen.values()].filter((r) => !r.everInView).slice(0, 3).map((r) => ({ src: r.src, diag: r.diag }));
    });
    bosses.push(res);
    totalNoVis += res.damageWithoutVisibility;
    totalLeash += res.leashViolations;
    console.log(`[boss] seed ${seed} #${index}: distPlayer max ${res.distPlayer.max} distSpawn max ${res.distSpawn.max} offscreen ${(res.offscreenFraction * 100).toFixed(0)}% maxOff ${res.maxConsecOffscreenS}s leash ${res.leashViolations} noVis ${res.damageWithoutVisibility}/${res.hazardTriggers}`);
  }
  await page.close();
  perSeed.push({ seed, bosses, jsErrors: errors.length });
}

await browser.close();
await server.stop();

mkdirSync("shots", { recursive: true });
const all = perSeed.flatMap((s) => s.bosses);
const summary = {
  tag: TAG,
  generatedAt: new Date().toISOString(),
  matrix: { bosses: 6, seeds: SEEDS, simSecondsPerBoss: SIM_S, timeScale: TIME_SCALE, crowd: CROWD },
  thresholds: { leashRadius: LEASH_RADIUS, catchupAfterS: CATCHUP_AFTER_S, viewMargin: VIEW_MARGIN },
  totals: {
    runs: all.length,
    damageWithoutVisibility: totalNoVis,
    leashViolations: totalLeash,
    meanOffscreenFraction: all.length ? r2(all.reduce((a, r) => a + r.offscreenFraction, 0) / all.length) : null,
    maxConsecOffscreenS: all.length ? Math.max(...all.map((r) => r.maxConsecOffscreenS)) : null,
    maxDistPlayer: all.length ? Math.max(...all.map((r) => r.distPlayer.max ?? 0)) : null,
    hazardTriggers: all.reduce((a, r) => a + r.hazardTriggers, 0),
  },
  jsErrors: perSeed.reduce((a, s) => a + s.jsErrors, 0),
  perSeed,
};
writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
console.log(`[done] ${OUT_JSON}`);
console.log(`[summary] runs=${summary.totals.runs} noVis=${totalNoVis} leashViolations=${totalLeash} meanOffscreen=${(summary.totals.meanOffscreenFraction * 100).toFixed(1)}% maxOffRun=${summary.totals.maxConsecOffscreenS}s maxDistPlayer=${summary.totals.maxDistPlayer} jsErrors=${summary.jsErrors}`);
if (summary.jsErrors) { console.error("[js-errors] vorhanden"); process.exitCode = 2; }
