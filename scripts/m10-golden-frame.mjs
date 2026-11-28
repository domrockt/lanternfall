#!/usr/bin/env node
/**
 * Lane m10-golden-frame-guard, K1 (#10311): Golden-Frame-Regressionsschutz.
 *
 * Ziel: gleicher Seed = bitgleiche Simulation ist seit m10-run-determinism /
 * m10-pause-freeze / m10-ai-stream-cadence-r2 ein haltbarer Vertrag. Dieses
 * Skript friert den simulierten Spielstand nach N Ticks pro Seed ein (Hash
 * ueber sim-exakte Marken), sodass jede verhaltensaendernde Merge-Welle beim
 * ersten Guard-Lauf auffaellt statt erst in der naechsten Abnahme.
 *
 *   node scripts/m10-golden-frame.mjs                    # Guard: 3 Seeds x 2 Laeufe, gegen Baseline
 *   node scripts/m10-golden-frame.mjs --write-baseline   # Baseline (NEU) schreiben — bewusster Schritt!
 *   node scripts/m10-golden-frame.mjs --seeds=101,202    # andere Seeds
 *   node scripts/m10-golden-frame.mjs --ticks=600        # Sim-Ticks (1 Tick = SIM_MAX_STEP = 1/20 s)
 *
 * Methode (Muster scripts/m10-run-determinism.mjs):
 *   - Playwright + dist-Build, ?debug=1&seed=<s>&detstart=1 (Run startet pausiert),
 *     autoPlay + timeScale gesetzt, BEVOR Schritt 1 laeuft (detstart-Gate).
 *   - Marken werden SIM-EXAKT im simulate-Hook gelesen (prototype-Patch, kein
 *     Polling): alle MARK_EVERY_Ticks (Default 60 = 3 Sim-Sekunden) wird
 *     elapsed/kills/level/xp/hp/Gegnerzahl/Spielerposition festgehalten plus
 *     ein Gegner-Marker (UID + auf 0,1 px gerundete Position, sortiert) und der
 *     UID-Allokationszaehler (Spawn-UIDs). 600 Ticks = 30 Sim-Sekunden.
 *   - Golden-Hash je Lauf = SHA-256 ueber {marks, events, final} (Node crypto).
 *   - Je Seed 2 identische Laeufe: Hashes muessen bitgleich sein (0 Divergenz).
 *   - Gegen Baseline (shots/m10-golden-frame-baseline.json): Hash-Gleichheit.
 *     Divergenz = FAIL (Exit 1). Baseline NIE stillschweigend neu schreiben —
 *     --write-baseline ist ein bewusster Schritt (siehe docs/lanes/
 *     m10-golden-frame-guard.md, Rebaseline-Anleitung).
 *
 * Kein FPS-/Echtzeit-Messziel => OHNE flock (sim-exakte Marken sind
 * lastunabhaengig). Renderer-String wird ins Verdict-JSON geschrieben
 * (iGPU-Pflicht: Belege mit SwiftShader sind ungueltig).
 *
 * Ausgaben:
 *   shots/m10-golden-frame-baseline.json  (Hashes + Marken je Seed, committet)
 *   shots/m10-golden-frame-verdict.json   (Urteil + Renderer + JS-Fehler, committet)
 *   ~/games/.evidence/m10-golden-frame-guard/<ts>/  (Rohe Marken je Lauf, nicht in git)
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const argOf = (name, fallback) => {
  const argv = process.argv.slice(2);
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};
const hasFlag = (name) => process.argv.slice(2).includes(`--${name}`);

const SEEDS = String(argOf("seeds", "101,202,404")).split(",").map(Number).filter(Number.isFinite);
const TICKS = Number(argOf("ticks", "600"));
const REPS = Number(argOf("reps", "2"));
const SCALE = Number(argOf("scale", "30"));
const MARK_EVERY_TICKS = Number(argOf("mark-every", "60"));
const WRITE_BASELINE = hasFlag("write-baseline");
const CHARACTER = "mira";

// src/config.ts: SIM_MAX_STEP = 1/20 — 1 Sim-Tick = 1/20 s.
const SIM_MAX_STEP = 1 / 20;
const MAX_SECONDS = TICKS * SIM_MAX_STEP; // 600 Ticks = 30 s Sim-Zeit

const BASELINE_PATH = "shots/m10-golden-frame-baseline.json";
const VERDICT_PATH = "shots/m10-golden-frame-verdict.json";
const EVIDENCE_DIR = `${homedir()}/games/.evidence/m10-golden-frame-guard`;

const sha = (obj) => createHash("sha256").update(JSON.stringify({ marks: obj.marks, events: obj.events, final: obj.final })).digest("hex");

ensureBuild();
mkdirSync("shots", { recursive: true });
mkdirSync(EVIDENCE_DIR, { recursive: true });
const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
const pw = await loadPlaywright();
const { chromium } = pw;
// Serverstart mit Retry: parallele Lanes belegen Ports im Harness-Bereich.
let server = null;
for (let i = 0; i < 8 && !server; i++) {
  server = await startServer().catch(() => null);
  if (!server) await new Promise((r) => setTimeout(r, 700));
}
if (!server) throw new Error("Statischer Server nach 8 Versuchen nicht gestartet");
const browser = await chromium.launch();

/** WebGL-Renderer-String (iGPU-Pflicht: SwiftShader = ungueltiger Beleg). */
async function rendererString(page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "(kein WebGL-Kontext)";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
  });
}

/**
 * Sim-exakter Marken-Hook (prototype-Patch von Run.simulate, kein Polling):
 * alle MARK_EVERY_TICKS*SIM_MAX_STEP Sekunden eine Marke, inkl. Gegner-Marker
 * (UID + 0,1-px-Positionen, sortiert) und UID-Allokationszaehler.
 */
async function armTrace(page, maxSec) {
  return page.evaluate(({ limit, markEveryTicks }) => {
    const SIM_MAX_STEP = 1 / 20;
    const MARK_SECONDS = markEveryTicks * SIM_MAX_STEP;
    const run = window.__game.scene.getScene("run");
    let nextMark = MARK_SECONDS;
    const trace = { marks: [], events: [], final: null };
    window.__goldenTrace = trace;
    const proto = Object.getPrototypeOf(run);
    const orig = proto.simulate;
    proto.simulate = function (dt) {
      orig.call(this, dt);
      if (nextMark > limit && trace.final === null) {
        const hud = this.getHudState();
        trace.final = { scene: "run", time: this.elapsed, kills: hud.kills, level: hud.level };
      }
      while (nextMark <= limit && this.elapsed >= nextMark) {
        const hud = this.getHudState();
        // Gegner-Marker: UID + auf 0,1 px gerundete logische Position, sortiert
        // nach UID (Reihenfolge der Pool-Liste ist nicht garantiert stabil).
        const marker = this.enemies.active
          .filter((e) => e.alive)
          .map((e) => [e.uid, Math.round(e.x * 10), Math.round(e.y * 10)])
          .sort((a, b) => a[0] - b[0]);
        trace.marks.push({
          s: Math.round(nextMark * 20), // Tick-Index der Marke (1 Tick = 1/20 s)
          elapsed: this.elapsed,
          kills: hud.kills,
          level: hud.level,
          xp: hud.xp,
          hp: hud.hp,
          enemies: hud.enemies,
          px: Math.round(this.posX * 1e4),
          py: Math.round(this.posY * 1e4),
          nextUid: this.enemies.nextUid,
          marker,
        });
        nextMark += MARK_SECONDS;
      }
    };
    run.events.on("bossDefeated", (e) => {
      trace.events.push({ kind: "bossDefeated", index: e.index, at: run.elapsed });
    });
    run.events.on("chestOpen", () => {
      trace.events.push({ kind: "chestOpen", at: run.elapsed });
    });
    return true;
  }, { limit: maxSec, markEveryTicks: MARK_EVERY_TICKS });
}

/** Ein Lauf: Seite oeffnen, Trace bewaffnen, bis Tick-Limit laufen lassen. */
async function runRep(seed, rep) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${seed}&detstart=1`);
    await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
    const renderer = await rendererString(page);
    await waitForScene(page, "title");
    await page.keyboard.press("Enter");
    await waitForScene(page, "charselect");
    await page.keyboard.press(CHARACTER === "kael" ? "2" : "1");
    await page.keyboard.press("Enter");
    await waitForScene(page, "run");
    // Zuerst Trace bewaffnen (ab Marke 1 exakt), dann Beschleunigung.
    await armTrace(page, MAX_SECONDS);
    await page.evaluate((scale) => {
      window.__lf.autoPlay(true);
      window.__lf.god(false);
      window.__lf.setTimeScale(scale);
      // detstart-Gate: Run startet pausiert — jetzt deterministisch fortsetzen.
      window.__game.scene.getScene("run").resumeRun();
    }, SCALE);

    await page.waitForFunction(
      (limit) => {
        const g = window.__game;
        if (!g) return false;
        const run = g.scene.getScene("run");
        if (run && run.scene.isActive()) {
          const t = window.__goldenTrace;
          return Boolean(t && t.marks.length >= limit);
        }
        return g.scene.isActive("results");
      },
      Math.ceil(MAX_SECONDS / (MARK_EVERY_TICKS * SIM_MAX_STEP)),
      { timeout: 240_000, polling: 120 },
    );

    const trace = await page.evaluate(() => {
      const t = window.__goldenTrace;
      const results = window.__game?.scene?.getScene("results");
      if (results && results.scene.isActive()) {
        if (t.final === null || t.final?.scene !== "run") {
          const r = results.result ?? {};
          t.final = { scene: "results", reason: r.reason ?? null, time: r.elapsed ?? 0, kills: r.kills ?? 0, level: r.level ?? 0 };
        }
      }
      return t;
    });
    return { seed, rep, marks: trace.marks, events: trace.events, final: trace.final, pageErrors, renderer };
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
      return { where: `mark[${i}] (tick=${ma.s})`, fields, a: ma, b: mb };
    }
  }
  if (JSON.stringify(a.events) !== JSON.stringify(b.events)) return { where: "events", a: a.events, b: b.events };
  if (JSON.stringify(a.final) !== JSON.stringify(b.final)) return { where: "final", a: a.final, b: b.final };
  return null;
}

const startedAt = Date.now();
const perSeed = [];
let deterministic = true; // 2 Laeufe je Seed bitgleich
let baselineExists = existsSync(BASELINE_PATH);
let baseline = baselineExists ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : null;
let matchesBaseline = baselineExists;
let renderer = null;
let jsErrorCount = 0;

for (const seed of SEEDS) {
  const reps = [];
  for (let rep = 0; rep < REPS; rep++) {
    const r = await runRep(seed, rep);
    // Rohe Marken nach .evidence (Belege ausserhalb des Repos).
    const safeStamp = `${runStamp}_seed${seed}_r${rep}`;
    writeFileSync(`${EVIDENCE_DIR}/${safeStamp}.json`, JSON.stringify(r, null, 1));
    console.log(`[golden] seed=${seed} rep=${rep}: ${r.marks.length} Marken, ${r.pageErrors.length} JS-Fehler, hash=${sha(r).slice(0, 16)}`);
    reps.push(r);
  }
  const hashes = reps.map((r) => sha(r));
  renderer = reps[0].renderer;
  jsErrorCount += reps.reduce((s, r) => s + r.pageErrors.length, 0);
  const seedIdentical = hashes.every((h) => h === hashes[0]) && reps.every((r) => r.pageErrors.length === 0);
  if (!seedIdentical) {
    deterministic = false;
    const d = firstDiff(reps[0], reps[1]);
    console.log(`[golden] seed=${seed}: DIVERGENZ — ${d ? d.where : `JS-Fehler (${reps.map((r) => r.pageErrors.length).join("/")})`}`);
    if (d) console.log(JSON.stringify(d, null, 1).slice(0, 2000));
  }
  const last = reps[0].marks.at(-1) ?? null;
  let seedMatchesBaseline = null;
  if (baselineExists) {
    const b = baseline.perSeed?.[String(seed)];
    if (!b) {
      seedMatchesBaseline = false;
      matchesBaseline = false;
      console.log(`[golden] seed=${seed}: FEHLT in Baseline (${BASELINE_PATH})`);
    } else {
      seedMatchesBaseline = b.hash === hashes[0];
      if (!seedMatchesBaseline) {
        matchesBaseline = false;
        console.log(`[golden] seed=${seed}: BASELINE-DIVERGENZ — baseline=${b.hash.slice(0, 16)} ist=${hashes[0].slice(0, 16)}`);
        if (b.final && reps[0].final) console.log(`[golden]   baseline-final=${JSON.stringify(b.final)} ist-final=${JSON.stringify(reps[0].final)}`);
      }
    }
  }
  perSeed.push({
    seed,
    identical: seedIdentical,
    matchesBaseline: seedMatchesBaseline,
    hash: hashes[0],
    marks: reps[0].marks.length,
    final: reps[0].final,
    lastMark: last ? { s: last.s, kills: last.kills, level: last.level, enemies: last.enemies } : null,
    firstDiff: seedIdentical ? null : firstDiff(reps[0], reps[1]),
  });
}

await browser.close();
server.stop();

const runtimeMs = Date.now() - startedAt;

if (WRITE_BASELINE) {
  baseline = {
    name: "m10-golden-frame-baseline",
    generatedAt: new Date().toISOString(),
    note: "Golden-Frame-Baseline (Lane m10-golden-frame-guard #10311). NIE stillschweigend neu schreiben: nur mit --write-baseline nach GEWOLLTER Verhaltensaenderung, Begruendung im Commit (siehe docs/lanes/m10-golden-frame-guard.md).",
    seeds: SEEDS,
    reps: REPS,
    ticks: TICKS,
    tickSeconds: SIM_MAX_STEP,
    simSeconds: MAX_SECONDS,
    scale: SCALE,
    character: CHARACTER,
    markEveryTicks: MARK_EVERY_TICKS,
    hashAlgorithm: "sha256(JSON.stringify({marks, events, final}))",    perSeed: Object.fromEntries(perSeed.map((p) => [
      String(p.seed), { hash: p.hash, marks: p.marks, final: p.final, lastMark: p.lastMark },
    ])),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 1));
  console.log(`[golden] Baseline NEU geschrieben: ${BASELINE_PATH} (${SEEDS.length} Seeds, ${TICKS} Ticks)`);
  baselineExists = true;
  matchesBaseline = true;
}

// Renderer + JS-Fehler: Muss-Felder im committeten Verdict (iGPU-Pflicht).
const verdict = {
  name: "m10-golden-frame-verdict",
  generatedAt: new Date().toISOString(),
  runtimeMs,
  seeds: SEEDS,
  reps: REPS,
  ticks: TICKS,
  simSeconds: MAX_SECONDS,
  scale: SCALE,
  character: CHARACTER,
  deterministic,
  baselinePresent: baselineExists,
  matchesBaseline,
  jsErrorCount,
  renderer,
  rendererOk: renderer ? !/swiftshader|llvmpipe|software/i.test(renderer) : false,
  passed: false,
  perSeed,
};
verdict.passed = deterministic && matchesBaseline && jsErrorCount === 0 && verdict.rendererOk;
writeFileSync(VERDICT_PATH, JSON.stringify(verdict, null, 1));

const gate = verdict.passed;
console.log(`[golden] URTEIL: ${gate ? "PASS" : "FAIL"} — deterministic=${deterministic} matchesBaseline=${matchesBaseline} jsErrors=${jsErrorCount} renderer="${renderer}" (${VERDICT_PATH})`);
if (!baselineExists) {
  console.log("[golden] HINWEIS: keine Baseline vorhanden — erstmals mit --write-baseline erzeugen.");
  process.exit(2);
}
process.exit(gate ? 0 : 1);
