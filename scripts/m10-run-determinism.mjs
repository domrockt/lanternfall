#!/usr/bin/env node
/**
 * m10-run-determinism K1: Determinismus-Guard fuer den Sim-Lauf.
 *
 *   node scripts/m10-run-determinism.mjs                    # 3 Seeds x 2 Runs
 *   node scripts/m10-run-determinism.mjs --seeds=101,202    # andere Seeds
 *   node scripts/m10-run-determinism.mjs --seconds=120      # Lauf-Laenge (Sim-Sekunden)
 *   node scripts/m10-run-determinism.mjs --tag=before       # Datei-Suffix
 *
 * Annahme, auf der fullrun-guard / balance-Korridor / perf-Harness fusst:
 *   gleicher Seed + autoPlay => gleicher Lauf.
 *
 * Methode: je Seed werden REPS identische Browser-Laeufe gefahren (gleicher
 * Seed, autoPlay, timeScale 30, keine Eingaben). Die Marken werden EXAKT im
 * Sim-Loop gelesen (prototype-Patch von Run.simulate im Seiten-Kontext, kein
 * Polling): bei jedem Ueberschreiten einer ganzzahligen Sim-Sekunde wird
 * kills/level/xp/hp/enemies/px/py festgehalten, ausserdem bossDefeated-Events
 * und Truhen-Zeiten. Zwei Laeufe mit gleichem Seed muessen bitgleiche
 * Marken-JSONs liefern.
 *
 * Kein FPS-/Echtzeit-Messziel => OHNE flock (die Marken sind sim-exakt und
 * lastunabhaengig; realDt-Clamping aendert nur die Wanduhr, nicht die Marken).
 *
 * Ausgabe: shots/m10-run-det-<seed>-r<rep>.json (je Lauf) und
 *          shots/m10-run-determinism[-<tag>].json (Vergleich + Urteil).
 */
import { mkdirSync, writeFileSync } from "node:fs";
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
const MAX_SECONDS = Number(argOf("seconds", "120"));
const SCALE = Number(argOf("scale", "30"));
const TAG = String(argOf("tag", ""));
const OUT = String(argOf("json", `shots/m10-run-det-verdict${TAG ? `-${TAG}` : ""}.json`));

const CHARACTER = "mira";

ensureBuild();
mkdirSync("shots", { recursive: true });
mkdirSync("docs/lanes", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();

/** Installiert den simulate-Hook und liefert die Trace-Referenz. */
async function armTrace(page, maxSec) {
  return page.evaluate((limit) => {
    const run = window.__game.scene.getScene("run");
    let nextSec = 1;
    const trace = { marks: [], events: [], final: null };
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
          chestsDropped: this.chestsDropped ?? 0,
          bossesSpawned: (this.bossesSpawned ?? []).length,
          px: Math.round(this.posX * 1e4),
          py: Math.round(this.posY * 1e4),
        });
        nextSec += 1;
      }
    };
    run.events.on("bossDefeated", (e) => {
      trace.events.push({ kind: "bossDefeated", index: e.index, at: run.elapsed });
    });
    run.events.on("chestOpen", () => {
      trace.events.push({ kind: "chestOpen", at: run.elapsed });
    });
    return true;
  }, maxSec);
}

/** Ein Lauf: Seite oeffnen, Trace bewaffnen, bis Ende/limit laufen lassen. */
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
    // Zuerst Trace bewaffnen (ab Sim-Sekunde 1 exakt), dann Beschleunigung.
    await armTrace(page, MAX_SECONDS);
    await page.evaluate((scale) => {
      window.__lf.autoPlay(true);
      window.__lf.god(false);
      window.__lf.setTimeScale(scale);
      // m10-run-determinism-fix: Run startet per ?detstart=1 pausiert — jetzt
      // deterministisch fortsetzen (alle Flags sind gesetzt, bevor Schritt 1 laeuft).
      window.__game.scene.getScene("run").resumeRun();
    }, SCALE);

    // Warten bis Szene endet (Tod/Sieg) oder Sim-Limit erreicht ist.
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
      { timeout: 240_000, polling: 120 },
    );

    const trace = await page.evaluate(() => {
      const t = window.__detTrace;
      const results = window.__game?.scene?.getScene("results");
      if (results && results.scene.isActive()) {
        const r = results.result ?? {};
        t.final = { scene: "results", reason: r.reason ?? null, time: r.elapsed ?? 0, kills: r.kills ?? 0, level: r.level ?? 0 };
      } else {
        const run = window.__game?.scene?.getScene("run");
        t.final = { scene: "run", time: run?.elapsed ?? 0, kills: run?.getHudState().kills ?? 0 };
      }
      return t;
    });
    return { seed, rep, marks: trace.marks, events: trace.events, final: trace.final, pageErrors };
  } finally {
    await page.close();
  }
}

/** Erste Divergenz zwischen zwei Laeufen als lesbaren Befund. */
function firstDiff(a, b) {
  const n = Math.max(a.marks.length, b.marks.length);
  for (let i = 0; i < n; i++) {
    const ma = a.marks[i];
    const mb = b.marks[i];
    if (!ma || !mb) return { where: `mark[${i}]`, a: ma ?? null, b: mb ?? null };
    if (JSON.stringify(ma) !== JSON.stringify(mb)) {
      const fields = Object.keys(ma).filter((k) => JSON.stringify(ma[k]) !== JSON.stringify(mb[k]));
      return { where: `mark[${i}] (s=${ma.s})`, fields, a: ma, b: mb };
    }
  }
  if (JSON.stringify(a.events) !== JSON.stringify(b.events)) return { where: "events", a: a.events, b: b.events };
  if (JSON.stringify(a.final) !== JSON.stringify(b.final)) return { where: "final", a: a.final, b: b.final };
  return null;
}

const perSeed = [];
let allIdentical = true;

for (const seed of SEEDS) {
  const reps = [];
  for (let rep = 0; rep < REPS; rep++) {
    const r = await runRep(seed, rep);
    writeFileSync(`shots/m10-run-det-${seed}-r${rep}.json`, JSON.stringify(r, null, 1));
    console.log(`[det] seed=${seed} rep=${rep}: ${r.marks.length} Marken, ${r.events.length} Events, final=${JSON.stringify(r.final)}`);
    reps.push(r);
  }
  const diffs = [];
  const fields = {};
  let divergingMarks = 0;
  const n = Math.max(...reps.map((r) => r.marks.length));
  for (let rep = 1; rep < REPS; rep++) {
    const d = firstDiff(reps[0], reps[rep]);
    if (d && diffs.length === 0) diffs.push({ rep, ...d });
    // Diff-Statistik ueber alle Rep-Paare gegen rep 0.
    for (let i = 0; i < n; i++) {
      const ma = reps[0].marks[i];
      const mb = reps[rep].marks[i];
      if (!ma || !mb) { divergingMarks += 1; continue; }
      const df = Object.keys(ma).filter((k) => JSON.stringify(ma[k]) !== JSON.stringify(mb[k]));
      if (df.length) { divergingMarks += 1; for (const f of df) fields[f] = (fields[f] ?? 0) + 1; }
    }
  }
  const pageErrorCount = reps.reduce((s, r) => s + r.pageErrors.length, 0);
  const identical = diffs.length === 0 && pageErrorCount === 0;
  if (!identical) allIdentical = false;
  perSeed.push({
    seed,
    identical,
    pageErrorCount,
    divergingMarks: divergingMarks / Math.max(1, REPS - 1),
    totalMarks: n,
    divergingFields: fields,
    firstDiff: diffs[0] ?? null,
  });
  console.log(`[det] seed=${seed}: ${identical ? "IDENTISCH" : "DIVERGENT"}${diffs.length ? ` — erster Diff: ${JSON.stringify(diffs[0].where)} ${diffs[0].fields ? `Felder ${diffs[0].fields.join(",")}` : ""}` : ""}`);
}

await browser.close();
server.stop();

const verdict = { generatedAt: new Date().toISOString(), seeds: SEEDS, reps: REPS, maxSeconds: MAX_SECONDS, scale: SCALE, character: CHARACTER, deterministic: allIdentical, perSeed };
writeFileSync(OUT, JSON.stringify(verdict, null, 1));
console.log(`[det] URTEIL: ${allIdentical ? "DETERMINISTISCH (alle Marken bitgleich)" : "NICHTDETERMINISMUS BELEGT"} — ${OUT}`);
process.exit(0);
