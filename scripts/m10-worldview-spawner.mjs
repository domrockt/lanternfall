#!/usr/bin/env node
/**
 * m10-worldview-anchor-spawner: Ganzketten-E2E-Determinismus (K4).
 *
 *   node scripts/m10-worldview-spawner.mjs                       # 3 Seeds x 2 Laeufe
 *   node scripts/m10-worldview-spawner.mjs --seeds=101,202,404
 *   node scripts/m10-worldview-spawner.mjs --seconds=700 --scale=30
 *   node scripts/m10-worldview-spawner.mjs --tag=after           # Suffix im Output
 *
 * Bedarf: m10-boss-dur-determinism K2 — camera.worldView wird nur in
 * Camera.preRender gesetzt, der Sim läuft in festen SIM_MAX_STEP-Teilschritten.
 * ALLE DREI Sim-Pfad-Leser sind inzwischen auf den deterministischen Sim-Anker
 * umgestellt (mid = scroll + width/2, logischer Screen GAME_WIDTH x GAME_HEIGHT):
 *   - Spawner.outsideView          (m10-spawn-view-anchor, Commit 0910f360)
 *   - ProjectilePool.view          (m10-worldview-anchor-pools, K1)
 *   - EnemyProjectilePool.refreshView (m10-worldview-anchor-pools, K1)
 * Diese Lane weist den KOMPLETTEN Lauf nach: Spawn-Marken UND Boss-Dauern
 * müssen bei gleichem Seed über 2 Läufe bitgleich sein.
 *
 * Methode: je Seed REPS identische Browser-Läufe (gleicher Seed, autoPlay,
 * timeScale 30, detstart + resumeRun wie scripts/m10-run-determinism.mjs).
 * Marken werden sim-exakt gelesen (prototype-Patch von Run.simulate):
 *   - je Sim-Sekunde: kills/hp/pos (Aggregat) + Spawn-Buckets je Sekunde
 *     (UID/Position JEDES frischen Spawns ueber Spawner.spawnAt)
 *   - Boss-Ereignisse bossWarn/bossDefeated -> Boss-Dauer je Index
 * Kein FPS-/Echtzeit-Messziel => OHNE flock (sim-exakte Marken, lastunabhängig).
 *
 * Output: ~/games/.evidence/m10-worldview-anchor-spawner/
 *   m10-worldview-spawner[-<tag>].json (inkl. WebGL-Renderer-String).
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
  `${homedir()}/games/.evidence/m10-worldview-anchor-spawner/m10-worldview-spawner${TAG ? `-${TAG}` : ""}.json`));
const CHARACTER = "mira";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();

/** Sim-exakte Marken: Aggregat je Sekunde + Spawn-Buckets + Boss-Ereignisse. */
async function armTrace(page, maxSec) {
  return page.evaluate(([limit]) => {
    const run = window.__game.scene.getScene("run");
    // Spawn-Marken: ALLE Spawns laufen ueber Spawner.spawnAt -> Position/UID
    // des frischen Spawns je Sim-Sekunde buendeln (bitgleicher Vergleich).
    const rec = { calls: 0, bySec: {} };
    window.__spawnRec = rec;
    const spProto = Object.getPrototypeOf(run.spawner);
    const origSpawnAt = spProto.spawnAt;
    spProto.spawnAt = function (def, x, y, opts) {
      const e = origSpawnAt.call(this, def, x, y, opts);
      rec.calls += 1;
      const s = Math.floor(run.elapsed);
      (rec.bySec[s] = rec.bySec[s] || []).push(`${e.uid},${Math.round(e.x * 100)},${Math.round(e.y * 100)}`);
      return e;
    };
    const trace = { marks: [], events: [] };
    window.__detTrace = trace;
    run.events.on("bossWarn", (e) => trace.events.push({ kind: "bossWarn", index: e.index, at: run.elapsed }));
    run.events.on("bossDefeated", (e) => trace.events.push({ kind: "bossDefeated", index: e.index, at: run.elapsed }));
    let nextSec = 1;
    const proto = Object.getPrototypeOf(run);
    const orig = proto.simulate;
    proto.simulate = function (dt) {
      orig.call(this, dt);
      while (nextSec <= limit && this.elapsed >= nextSec) {
        const hud = this.getHudState();
        trace.marks.push({
          s: nextSec,
          kills: hud.kills,
          hp: hud.hp,
          px: Math.round(this.posX * 1e4),
          py: Math.round(this.posY * 1e4),
          spawns: rec.bySec[nextSec - 1] ?? [],
          // Spawn-Aufrufe BIS zu dieser Marke: Spawns nach dem Limit (elapsed >= limit)
          // liegen außerhalb des deterministischen Fensters und duerfen den
          // Gesamt-Zaehler nicht verfaelschen (Timing-Artefakt beim Seitenauslesen).
          calls: rec.calls,
        });
        nextSec += 1;
      }
    };
    return true;
  }, [maxSec]);
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
      { timeout: 600_000, polling: 200 },
    );

    const trace = await page.evaluate(() => window.__detTrace);
    const callsAtLimit = trace.marks.length ? trace.marks[trace.marks.length - 1].calls : 0;
    const spawns = await page.evaluate(() => ({ calls: window.__spawnRec.calls }));
    const renderer = await page.evaluate(() => {
      const g = window.__game;
      const gl = g?.renderer?.gl;
      if (!gl) return "unknown";
      // Abnahme-Pflicht: echter GPU-Renderer (SwiftShader = ungültig).
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    }).catch(() => "unknown");
    return { seed, rep, marks: trace.marks, events: trace.events, spawnCalls: spawns.calls, callsAtLimit, pageErrors, renderer };
  } finally {
    await page.close();
  }
}

/** Erste Divergenz zwischen zwei Läufen (Marken/Ereignisse bitgleich?). */
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
  if (JSON.stringify(a.events) !== JSON.stringify(b.events)) {
    return { where: "bossEvents", a: a.events, b: b.events };
  }
  return null;
}

/** Boss-Dauern (Defeat - Warn) je Index — die Abnahme-Metrik des Korridors A5. */
function bossDurations(events) {
  const spawnAt = {};
  const out = [];
  for (const e of events) {
    if (e.kind === "bossWarn") spawnAt[e.index] = e.at;
    else if (e.kind === "bossDefeated" && spawnAt[e.index] !== undefined) {
      out.push({ index: e.index, duration: Number((e.at - spawnAt[e.index]).toFixed(4)) });
    }
  }
  return out;
}

const perSeed = [];
let deterministic = true;

for (const seed of SEEDS) {
  const reps = [];
  for (let rep = 0; rep < REPS; rep++) {
    const r = await runRep(seed, rep);
    console.log(`[wvs] seed=${seed} rep=${rep}: ${r.marks.length} Sekunden-Marken, ${r.spawnCalls} Spawns, Boss-Ereignisse=${r.events.length}, JS-Fehler=${r.pageErrors.length}`);
    reps.push(r);
  }
  const diffs = [];
  for (let rep = 1; rep < REPS; rep++) {
    const d = firstDiff(reps[0], reps[rep]);
    if (d) diffs.push({ rep, ...d });
  }
  const durations = reps.map((r) => bossDurations(r.events));
  const durationsEqual = REPS < 2 || JSON.stringify(durations[0]) === JSON.stringify(durations[1]);
  const seedDet = diffs.length === 0 && durationsEqual;
  if (!seedDet) deterministic = false;
  perSeed.push({
    seed,
    deterministic: seedDet,
    marksPerRep: reps.map((r) => r.marks.length),
    spawnCallsPerRep: reps.map((r) => r.spawnCalls),
    spawnCallsAtLimitPerRep: reps.map((r) => r.callsAtLimit),
    bossDurationsPerRep: durations,
    rendererPerRep: reps.map((r) => r.renderer),
    diffs,
  });
  console.log(`[wvs] seed=${seed}: ${seedDet ? "DETERMINISTISCH" : `DIVERGENT (${diffs[0]?.where ?? "Boss-Dauern"})`}`);
}

const verdict = {
  script: "scripts/m10-worldview-spawner.mjs",
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
console.log(`[wvs] Urteil: ${deterministic ? "DETERMINISTISCH (0 Abweichung)" : "NICHT deterministisch"} -> ${OUT}`);
await browser.close();
process.exit(deterministic ? 0 : 2);
