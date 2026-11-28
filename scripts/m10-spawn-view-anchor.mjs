// m10-spawn-view-anchor: Spawn-Platzierungs-Marken ueber 3 Seeds x 2 Laeufe.
//
// Misst fuer jeden Lauf die Marken ALLER frischen Spawns (Position/UID, gebuendelt
// je Sim-Sekunde) plus Boss-Warn/-Defeat-Zeiten und vergleicht die zwei Laeufe je
// Seed bitgleich. Vorher (Basis, outsideView liest camera.worldView) divergieren die
// Marken frame-abhaengig; nach dem Sim-Anker-Fix muessen sie bitgleich sein.
// Ursachen-Kontext: docs/lanes/m10-boss-dur-determinism.md K2 (worldView wird nur in
// Camera.preRender gesetzt, der Sim laeuft in SIM_MAX_STEP-Teilschritten).
//
// Aufruf: node scripts/m10-spawn-view-anchor.mjs [--tag before|after] [--out <pfad>]
//   [--seeds 101,202,404] [--reps 2] [--limit 700]
// Exit 0 = alle Seeds bitgleich (deterministisch), Exit 2 = divergent.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const EVIDENCE_DIR = `${homedir()}/games/.evidence/m10-spawn-view-anchor`;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const TAG = arg("--tag", "before");
const OUT = arg("--out", `${EVIDENCE_DIR}/marks-${TAG}.json`);
const SEEDS = (arg("--seeds", "101,202,404")).split(",").map(Number);
const REPS = Number(arg("--reps", "2"));
const MAX_SECONDS = Number(arg("--limit", "700"));

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();

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
    await page.keyboard.press("1");
    await page.keyboard.press("Enter");
    await waitForScene(page, "run");
    await page.evaluate(([maxSec]) => {
      const run = window.__game.scene.getScene("run");
      // Spawn-Marken: ALLE Spawns laufen ueber Spawner.spawnAt -> Position/UID
      // des frischen Spawns je Sim-Sekunde buendeln (bitgleicher Vergleich).
      // Zustand am window (nicht in Closures) — robust ueber Scene-Restarts.
      const rec = { calls: 0, bySec: {}, first: null };
      window.__spawnRec = rec;
      const proto = Object.getPrototypeOf(run.spawner);
      const origSpawnAt = proto.spawnAt;
      proto.spawnAt = function (def, x, y, opts) {
        const e = origSpawnAt.call(this, def, x, y, opts);
        rec.calls += 1;
        const s = Math.floor(run.elapsed);
        if (!rec.first) rec.first = { s, uid: e?.uid, elapsed: run.elapsed };
        (rec.bySec[s] = rec.bySec[s] || []).push(`${e.uid},${Math.round(e.x * 100)},${Math.round(e.y * 100)}`);
        return e;
      };
      let nextSec = 1;
      const trace = { spawns: [], events: [] };
      window.__probe = trace;
      const runProto = Object.getPrototypeOf(run);
      const origSim = runProto.simulate;
      runProto.simulate = function (dt) {
        origSim.call(this, dt);
        while (nextSec <= maxSec && this.elapsed >= nextSec) {
          const arr = rec.bySec[nextSec];
          trace.spawns.push(arr ? arr.join(";") : "");
          nextSec += 1;
        }
      };
      run.events.on("bossWarn", (e) => trace.events.push({ kind: "bossWarn", index: e.index, at: run.elapsed }));
      run.events.on("bossDefeated", (e) => trace.events.push({ kind: "bossDefeated", index: e.index, at: run.elapsed }));
    }, [MAX_SECONDS]);
    await page.evaluate(() => {
      window.__lf.autoPlay(true);
      window.__lf.god(false);
      window.__lf.setTimeScale(30);
      window.__game.scene.getScene("run").resumeRun();
    });
    await page.waitForFunction(
      (limit) => {
        const g = window.__game;
        if (!g) return false;
        const run = g.scene.getScene("run");
        if (run && run.scene.isActive()) {
          const t = window.__probe;
          return Boolean(t && t.spawns.length >= limit);
        }
        return g.scene.isActive("results");
      },
      MAX_SECONDS, { timeout: 300_000, polling: 200 },
    );
    const trace = await page.evaluate(() => {
      const rec = window.__spawnRec;
      return { ...window.__probe, recCalls: rec?.calls ?? -1, recFirst: rec?.first ?? null };
    });
    return { seed, rep, trace, pageErrors };
  } finally {
    await page.close();
  }
}

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
    r.durs = bossDurations(r.trace.events);
    const spawnTotal = r.trace.spawns.reduce((n, b) => n + (b ? b.split(";").length : 0), 0);
    console.log(`[${TAG}] seed=${seed} rep=${rep}: Spawn-Marken=${spawnTotal} (calls=${r.trace.recCalls} first=${JSON.stringify(r.trace.recFirst)}) ` +
      `Bosse=${r.durs.map((b) => `#${b.index}:${b.duration}s`).join(" ")} errors=${r.pageErrors.length}`);
    reps.push(r);
  }
  let first = null;
  let divergentSeconds = 0;
  const n = Math.max(reps[0].trace.spawns.length, reps[1].trace.spawns.length);
  for (let k = 0; k < n; k++) {
    const a = reps[0].trace.spawns[k] ?? "";
    const b = reps[1].trace.spawns[k] ?? "";
    if (a !== b) {
      if (!first) first = { s: k + 1, a: a.slice(0, 200), b: b.slice(0, 200) };
      divergentSeconds += 1;
    }
  }
  const dursEqual = JSON.stringify(reps[0].durs) === JSON.stringify(reps[1].durs);
  const det = !first && dursEqual;
  if (!det) deterministic = false;
  console.log(`[${TAG}] seed=${seed}: ${det ? "SPAWN-MARKEN BITGLEICH" :
    `DIVERGENT ab s=${first?.s} (${divergentSeconds} Sekunden differieren) dursEqual=${dursEqual}`}`);
  perSeed.push({ seed, deterministic: det, spawnCounts: reps.map((r) =>
    r.trace.spawns.reduce((n2, b) => n2 + (b ? b.split(";").length : 0), 0)),
    bossDurations: reps.map((r) => r.durs), firstDivergence: first, divergentSeconds });
}
mkdirSync(EVIDENCE_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify({
  probe: `m10-spawn-view-anchor Spawn-Marken (Position/UID frischer Spawns je Sim-Sekunde), tag=${TAG}`,
  seeds: SEEDS, reps: REPS, limitSeconds: MAX_SECONDS, deterministic, perSeed,
}, null, 1));
console.log(`[spawn-view-anchor] Urteil (${TAG}): ${deterministic ?
  "DETERMINISTISCH — Spawn-Marken bitgleich" : "DIVERGENT"} -> ${OUT}`);
await browser.close();
process.exit(deterministic ? 0 : 2);
