#!/usr/bin/env node
/**
 * m10-boss-dur-determinism K1: Boss-Dauer-Determinismus-Guard.
 *
 *   node scripts/m10-boss-dur-det.mjs                       # 3 Seeds x 2 Laeufe
 *   node scripts/m10-boss-dur-det.mjs --seeds=101,202,404   # andere Seeds
 *   node scripts/m10-boss-dur-det.mjs --seconds=700         # Sim-Limit je Lauf
 *   node scripts/m10-boss-dur-det.mjs --tag=before          # Suffix im Output
 *
 * Bedarfsmeldung m10-balance-corridor-guard (2026-11-28T12:35Z): gleiche Seeds
 * lieferten je Lauf VERSCHIEDENE Boss-Dauern (mira/202: 30,1 s kurz vs. 15,1 s
 * full) — der Dom-Korridor (Boss-Dauer 20-60 s, ACCEPTANCE A5) ist dann nicht
 * verlaesslich abnehmbar.
 *
 * Methode: je Seed REPS identische Browser-Laeufe (gleicher Seed, autoPlay,
 * timeScale 30, detstart + resumeRun wie m10-run-determinism). Die Marken
 * werden EXAKT im Sim-Loop gelesen (prototype-Patch von Run.simulate):
 * bossWarn (Spawn) und bossDefeated je Boss mit sim-exaktem run.elapsed.
 * Boss-Dauer = Defeat.at - Spawn.at je Boss-Index. Zwei Laeufe mit gleichem
 * Seed muessen bitgleiche Boss-Dauern liefern.
 *
 * Kein FPS-/Echtzeit-Messziel => OHNE flock (sim-exakte Marken,
 * lastunabhaengig, wie scripts/m10-run-determinism.mjs).
 *
 * Output: <out> (Vergleich + Urteil), Default
 *   ~/games/.evidence/m10-boss-dur-determinism/m10-boss-dur-det[-<tag>].json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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
const OUT = String(argOf("out",
  `${homedir()}/games/.evidence/m10-boss-dur-determinism/m10-boss-dur-det${TAG ? `-${TAG}` : ""}.json`));
// K2-Probe: --nohitstop patcht Run.bossHitFeedback zum No-op (Hit-Stop ist der
// einzige Code, der sim-Zeit an Wanduhr-Frames verliert). Laeuft der Lauf damit
// deterministisch, ist die Ursache belegt.
const NOHITSTOP = String(argOf("nohitstop", "0")) === "1";
const CHARACTER = "mira";

ensureBuild();
mkdirSync("shots", { recursive: true });
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
          hp: hud.hp,
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
    if (NOHITSTOP) {
      await page.evaluate(() => {
        const run = window.__game.scene.getScene("run");
        run.bossHitFeedback = function () { /* K2-Probe: Hit-Stop aus */ };
      });
    }

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

/** Erste Divergenz zwischen zwei Laeufen. */
function firstDiff(a, b) {
  const da = bossDurations(a.events);
  const db = bossDurations(b.events);
  const n = Math.max(da.length, db.length);
  for (let i = 0; i < n; i++) {
    const x = da[i] ?? null;
    const y = db[i] ?? null;
    if (JSON.stringify(x) !== JSON.stringify(y)) return { where: `bossDurations[${i}]`, a: x, b: y };
  }
  const n2 = Math.max(a.marks.length, b.marks.length);
  for (let i = 0; i < n2; i++) {
    const ma = a.marks[i];
    const mb = b.marks[i];
    if (!ma || !mb) return { where: `mark[${i}] (ein Lauf kuerzer)`, a: ma ?? null, b: mb ?? null };
    if (JSON.stringify(ma) !== JSON.stringify(mb)) {
      const fields = Object.keys(ma).filter((k) => JSON.stringify(ma[k]) !== JSON.stringify(mb[k]));
      return { where: `mark[${i}] (s=${ma.s})`, fields, a: ma, b: mb };
    }
  }
  if (JSON.stringify(a.events) !== JSON.stringify(b.events)) return { where: "events", a: a.events, b: b.events };
  return null;
}

const perSeed = [];
let deterministic = true;

for (const seed of SEEDS) {
  const reps = [];
  for (let rep = 0; rep < REPS; rep++) {
    const r = await runRep(seed, rep);
    r.bossDurations = bossDurations(r.events);
    console.log(`[dur] seed=${seed} rep=${rep}: ${r.marks.length} Marken, ` +
      `Bosse=${r.bossDurations.map((b) => `#${b.index}:${b.duration.toFixed(2)}s`).join(" ")}, ` +
      `JS-Fehler=${r.pageErrors.length}`);
    reps.push(r);
  }
  const diffs = [];
  for (let rep = 1; rep < REPS; rep++) {
    const d = firstDiff(reps[0], reps[rep]);
    if (d) diffs.push({ rep, ...d });
  }
  const maxDev = {};
  for (let rep = 1; rep < REPS; rep++) {
    const da = bossDurations(reps[0].events);
    const db = bossDurations(reps[rep].events);
    for (let i = 0; i < Math.max(da.length, db.length); i++) {
      const x = da[i]?.duration ?? null;
      const y = db[i]?.duration ?? null;
      if (x === null || y === null) { maxDev[i] = "fehlend"; continue; }
      const dev = Math.abs(x - y);
      maxDev[i] = Math.max(maxDev[i] ?? 0, dev);
    }
  }
  const seedDet = diffs.length === 0;
  if (!seedDet) deterministic = false;
  perSeed.push({
    seed,
    deterministic: seedDet,
    bossDurations: reps.map((r) => r.bossDurations.map((b) => Number(b.duration.toFixed(4)))),
    maxDurationDeviation: maxDev,
    diffs,
  });
  console.log(`[dur] seed=${seed}: ${seedDet ? "DETERMINISTISCH" : `DIVERGENT (${diffs[0]?.where})`}`);
}

const verdict = {
  script: "scripts/m10-boss-dur-det.mjs",
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
mkdirSync(OUT.substring(0, OUT.lastIndexOf("/")), { recursive: true });
writeFileSync(OUT, JSON.stringify(verdict, null, 1));
console.log(`[dur] Urteil: ${deterministic ? "DETERMINISTISCH (0 Abweichung)" : "NICHT deterministisch"} -> ${OUT}`);
await browser.close();
process.exit(deterministic ? 0 : 2);
