#!/usr/bin/env node
/**
 * m10-det-e2e-guard K2: E2E-Determinismus-Guard ueber die komplette
 * worldView-Anker-Kette.
 *
 *   node scripts/m10-det-e2e.mjs                 # 3 Seeds x 2 Laeufe, 700 Sim-Sekunden
 *   node scripts/m10-det-e2e.mjs --seeds=101,202,404
 *   node scripts/m10-det-e2e.mjs --seconds=700
 *   node scripts/m10-det-e2e.mjs --tag=custom    # Suffix im Output
 *
 * Prueft END-TO-END (echte Browser-Laeufe), dass die drei Sim-Anker-Teile
 * zusammenhalten und kein stochastischer Rest in den Sim greift:
 *   1. ProjectilePool.ts/EnemyProjectiles.ts -> m10-worldview-anchor-pools
 *   2. Spawner.ts outsideView                -> m10-spawn-view-anchor
 *   3. Boss-Sim-View (Rezept aus m10-boss-dur-determinism K2:
 *      Anker mid = scroll + width/2 statt camera.worldView)
 *
 * Methode wie scripts/m10-boss-dur-det.mjs (sim-exakte Marken via
 * prototype-Patch von Run.simulate): je Seed REPS identische Browser-Laeufe
 * (gleicher Seed, autoPlay, timeScale 30, detstart + resumeRun). Zwei Laeufe
 * mit gleichem Seed muessen BITGLEICH sein in:
 *   - allen Sekunden-Marken (elapsed/kills/level/xp/hp/enemies/px/py),
 *   - dem kompletten Event-Strom (bossWarn/bossDefeated, sim-exakt),
 *   - den Boss-Dauern je Index (Defeat.at - Spawn.at).
 * Urteil deterministic:true <=> alle Seeds bitgleich. Exit 0 / 2.
 *
 * ROLLE: Lange Browser-Laeufe laufen NICHT in der Testsuite. Dieses Skript ist
 * der E2E-Teil des Guards (dokumentierter Aufruf, siehe
 * docs/lanes/m10-det-e2e-guard.md); der Suite-Teil ist der sim-level-Check in
 * tests/run-determinism.test.ts ("m10-det-e2e-guard"-Block), der die von
 * diesem Skript committeten JSONs unter shots/ schraenkt:
 *   - shots/m10-det-e2e-<seed>-r<rep>.json (je Lauf: marks/events/bossDurations)
 *   - shots/m10-det-e2e-verdict.json       (Urteil + Metadaten)
 * Nach einer Code-Aenderung am Sim den Skript-Lauf erneuern und die JSONs
 * committen — divergiert der Guard, zeigt der Test die erste Divergenz.
 *
 * Kein FPS-/Echtzeit-Messziel => OHNE flock (sim-exakte Marken,
 * lastunabhaengig, wie scripts/m10-run-determinism.mjs).
 */
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const argOf = (name, fallback) => {
  const argv = process.argv.slice(2);
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const SEEDS = String(argOf("seeds", "101,202,404")).split(",").map(Number).filter(Number.isFinite);
const REPS = Number(argOf("reps", "2"));
const MAX_SECONDS = Number(argOf("seconds", "700"));
const SCALE = Number(argOf("scale", "30"));
const TAG = String(argOf("tag", ""));
const CHARACTER = "mira";
const outPath = (name) => `shots/m10-det-e2e-${name}${TAG ? `-${TAG}` : ""}.json`;

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();

/** Installiert den simulate-Hook und liefert die Trace-Referenz. */
async function armTrace(page, maxSec) {
  return page.evaluate((limit) => {
    const run = window.__game.scene.getScene("run");
    let nextSec = 1;
    const trace = { marks: [], events: [] };
    window.__detTrace = trace;
    const proto = Object.getPrototypeOf(run);
    const orig = proto.simulate;
    proto.simulate = function (dt) {
      orig.call(this, dt);
      while (nextSec <= limit && this.elapsed >= nextSec) {
        const hud = this.getHudState();
        trace.marks.push({
          s: nextSec,
          elapsed: this.elapsed,
          kills: hud.kills,
          level: hud.level,
          xp: hud.xp,
          hp: hud.hp,
          enemies: hud.enemies,
          px: Math.round(this.posX * 1e4),
          py: Math.round(this.posY * 1e4),
        });
        nextSec += 1;
      }
    };
    run.events.on("bossWarn", (e) => {
      trace.events.push({ kind: "bossWarn", index: e.index, at: run.elapsed });
    });
    run.events.on("bossDefeated", (e) => {
      trace.events.push({ kind: "bossDefeated", index: e.index, at: run.elapsed });
    });
    return true;
  }, maxSec);
}

/** Ein Lauf: Seite oeffnen, Trace bewaffnen, bis Limit/Ende laufen lassen. */
async function runRep(seed, rep) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${seed}&detstart=1`);
    await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
    await waitForScene(page, "title");
    await page.keyboard.press("Enter");
    await waitForScene(page, "charselect");
    await page.keyboard.press(CHARACTER === "kael" ? "2" : "1");
    await page.keyboard.press("Enter");
    await waitForScene(page, "run");
    await armTrace(page, MAX_SECONDS);
    await page.evaluate((scale) => {
      window.__lf.autoPlay(true);
      window.__lf.god(false);
      window.__lf.setTimeScale(scale);
      window.__game.scene.getScene("run").resumeRun();
    }, SCALE);

    await page.waitForFunction(
      (limit) => {
        const g = window.__game;
        if (!g) return false;
        const run = g.scene.getScene("run");
        if (run && run.scene.isActive()) {
          const t = window.__detTrace;
          return Boolean(t && t.marks.length >= limit);
        }
        return g.scene.isActive("results");
      },
      MAX_SECONDS,
      { timeout: 300_000, polling: 200 },
    );

    const trace = await page.evaluate(() => window.__detTrace);
    return { seed, rep, marks: trace.marks, events: trace.events, pageErrors };
  } finally {
    await page.close();
  }
}

/** Boss-Dauern je Index: Spawn(bossWarn) -> Defeat(bossDefeated). */
function bossDurations(events) {
  const spawnAt = {};
  const out = [];
  for (const e of events) {
    if (e.kind === "bossWarn") spawnAt[e.index] = e.at;
    else if (e.kind === "bossDefeated" && spawnAt[e.index] !== undefined) {
      out.push({ index: e.index, spawnAt: spawnAt[e.index], defeatAt: e.at, duration: e.at - spawnAt[e.index] });
    }
  }
  return out;
}

/** Erste Divergenz zwischen zwei Laeufen (Marks, Events, Boss-Dauern). */
function firstDiff(a, b) {
  const n = Math.max(a.marks.length, b.marks.length);
  for (let i = 0; i < n; i++) {
    const ma = a.marks[i];
    const mb = b.marks[i];
    if (!ma || !mb) return { where: `mark[${i}] (ein Lauf kuerzer)`, a: ma ?? null, b: mb ?? null };
    if (JSON.stringify(ma) !== JSON.stringify(mb)) {
      const fields = Object.keys(ma).filter((k) => JSON.stringify(ma[k]) !== JSON.stringify(mb[k]));
      return { where: `mark[${i}] (s=${ma.s})`, fields, a: ma, b: mb };
    }
  }
  if (JSON.stringify(a.events) !== JSON.stringify(b.events)) return { where: "events", a: a.events, b: b.events };
  const da = bossDurations(a.events);
  const db = bossDurations(b.events);
  const n2 = Math.max(da.length, db.length);
  for (let i = 0; i < n2; i++) {
    const x = da[i] ?? null;
    const y = db[i] ?? null;
    if (JSON.stringify(x) !== JSON.stringify(y)) return { where: `bossDurations[${i}]`, a: x, b: y };
  }
  return null;
}

const perSeed = [];
let deterministic = true;

for (const seed of SEEDS) {
  const reps = [];
  for (let rep = 0; rep < REPS; rep++) {
    const r = await runRep(seed, rep);
    r.bossDurations = bossDurations(r.events);
    console.log(`[det] seed=${seed} rep=${rep}: ${r.marks.length} Marken, ` +
      `Events=${r.events.length}, ` +
      `Bosse=${r.bossDurations.map((b) => `#${b.index}:${b.duration.toFixed(2)}s`).join(" ")}, ` +
      `JS-Fehler=${r.pageErrors.length}`);
    if (r.pageErrors.length > 0) deterministic = false;
    // Je-Lauf-Beleg nach shots/ (wird vom Suite-Test geschraenkt).
    writeFileSync(outPath(`${seed}-r${rep}`), JSON.stringify(r, null, 1));
    reps.push(r);
  }
  const diffs = [];
  for (let rep = 1; rep < REPS; rep++) {
    const d = firstDiff(reps[0], reps[rep]);
    if (d) diffs.push({ rep, ...d });
  }
  let divergingMarks = 0;
  for (let i = 0; i < Math.max(...reps.map((r) => r.marks.length)); i++) {
    const first = JSON.stringify(reps[0].marks[i]);
    if (reps.some((r) => JSON.stringify(r.marks[i]) !== first)) divergingMarks++;
  }
  const seedDet = diffs.length === 0;
  if (!seedDet) deterministic = false;
  perSeed.push({
    seed,
    identical: seedDet,
    marks: reps[0].marks.length,
    divergingMarks: seedDet ? 0 : divergingMarks,
    bossDurations: reps.map((r) => r.bossDurations.map((b) => Number(b.duration.toFixed(4)))),
    diffs,
  });
  console.log(`[det] seed=${seed}: ${seedDet ? "BITGLEICH" : `DIVERGENT (${diffs[0]?.where})`}`);
}

const verdict = {
  script: "scripts/m10-det-e2e.mjs",
  tag: TAG || null,
  seeds: SEEDS,
  reps: REPS,
  limitSeconds: MAX_SECONDS,
  timeScale: SCALE,
  character: CHARACTER,
  deterministic,
  perSeed,
  measuredAt: new Date().toISOString(),
};
writeFileSync(outPath("verdict"), JSON.stringify(verdict, null, 1));
console.log(`[det] Urteil: ${deterministic ? "DETERMINISTISCH (0 Abweichung)" : "NICHT deterministisch"} -> ${outPath("verdict")}`);
await browser.close();
process.exit(deterministic ? 0 : 2);
