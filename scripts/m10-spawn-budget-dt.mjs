#!/usr/bin/env node
// m10-spawn-budget-dt: Determinismus-Probe fuer die Spawn-Zuteilung.
//
// Bedarfsmeldung m10-pause-freeze (#7505): der Spawner verteilte das
// Spawn-Budget je ECHTEM Frame (frame-count-abhaengig) — zwei Kontrolllaeufe
// mit gleichem Seed divergieren in den Spawn-Marken, sobald ein Budget-
// Rueckstau existiert (z. B. Frame-Hitch bei timeScale 30).
//
// Aufbau: headless Spawner (echtes src/systems/Spawner.ts, per rolldown
// gebuendelt; Phaser und EnemyPool per Plugin-Stub). Kein Renderer, kein
// Server -> OHNE flock (reine Logik, feste Sim-Schritte).
//
// Szenarien: gleicher Seed (mulberry32), gleiche Sim-Zeit (170 s), gleiche
// Substep-Folge (SIM_MAX_STEP = 1/20, Grid 0,05 s aligniert) — nur die
// ECHTZEIT-Frame-Grenzen variieren (60 fps / 30 fps / Jitter) plus zwei
// sim-alignierte Hitches von 60 Sim-Sekunden (Sim 30-90 und 90-150), die
// einen Budget-Rueckstau erzeugen.
//
// Akzeptanz (VOR dem Fix festgelegt): gleicher Seed + gleiche Sim-Zeit ->
// identische Spawn-Marken (t/id/elite, FNV-1a-Hash) ueber ALLE Szenarien;
// Gesamt-Spawn-Zahl je Welle bleibt ~ integral(rate) (Konservierung).
//
//   node scripts/m10-spawn-budget-dt.mjs --tag=before
//   node scripts/m10-spawn-budget-dt.mjs --tag=after --expect-identical
//
// JSON geht nach shots/m10-spawnbudget-<tag>.json. Bei --expect-identical
// endet das Skript mit rc=1, wenn die Szenarien nicht bitgleich sind.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { rolldown } from "rolldown";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const EXPECT_IDENTICAL = argv.includes("--expect-identical");
const OUT = String(argOf("json", `shots/m10-spawnbudget-${TAG}.json`));
const SRC = resolve("src");
const WORK = join(tmpdir(), "m10-spawn-budget-dt");
mkdirSync(WORK, { recursive: true });
mkdirSync("shots", { recursive: true });

const SEED = 20261128;
const TIME_SCALE = 30;
const SIM_END = 170;
const SIM_MAX_STEP = 1 / 20;
// Sim-alignierte Hitches: [Start, Laenge] in Sim-Sekunden. Ein Hitch ist ein
// echtes Frame von realDt = len/timeScale — alle Szenarien decken exakt
// dasselbe Sim-Intervall ab (Ende des Vorframes wird auf den Hitch-Start
// zugeschnitten), damit nur die Frame-Grenzen variieren.
const HITCHES = [
  { at: 30, len: 60 },
  { at: 90, len: 60 },
];

// ── Stubs (Phaser + EnemyPool) ────────────────────────────────────────
const STUB_PHASER = `
const Clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export default { Math: { Clamp }, GameObjects: {} };
`;
const STUB_POOL = `
export class EnemyPool {
  constructor() {
    this.count = 0;
    this.active = [];
  }
  spawn(def, x, y, hpScale, damageScale, phase, options = {}) {
    return { def, x, y, hpScale, damageScale, phase, elite: !!options.elite, alive: true };
  }
  despawn(enemy) {
    enemy.alive = false;
  }
}
`;

// ── Probe-Einstieg (TS) ───────────────────────────────────────────────
const ENTRY = join(WORK, "probe-entry.ts");
const entryTs = `
import { Spawner } from "${SRC}/systems/Spawner.ts";
import { mulberry32 } from "${SRC}/logic/rng.ts";
import { spawnRateForMinute } from "${SRC}/logic/waves.ts";
import { spawnRateFactor } from "${SRC}/logic/scaling.ts";

export const VIEW = { width: 640, height: 360 };
export const PLAYER = { x: 2048, y: 2048 };
export const WORLD = 4096;

export function makeSpawner(seed: number) {
  const registryData = new Map<string, unknown>();
  const camera = {
    width: VIEW.width,
    height: VIEW.height,
    scrollX: PLAYER.x - VIEW.width / 2,
    scrollY: PLAYER.y - VIEW.height / 2,
    worldView: {
      x: PLAYER.x - VIEW.width / 2,
      y: PLAYER.y - VIEW.height / 2,
      right: PLAYER.x + VIEW.width / 2,
      bottom: PLAYER.y + VIEW.height / 2,
    },
  };
  const scene = {
    cameras: { main: camera },
    registry: {
      set: (k: string, v: unknown) => registryData.set(k, v),
      get: (k: string) => registryData.get(k),
    },
    game: { loop: { frame: 0, delta: 16.7 } },
  };
  const pool = { count: 0, active: [], spawn: (def: any, x: number, y: number, hp: number, dmg: number, phase: number, options: any) => ({ def, x, y, elite: !!options?.elite }), despawn: () => {} };
  const rng = { next: mulberry32(seed), pick: (arr: any[]) => arr[Math.floor(mulberry32(seed ^ 0x9e37)() * arr.length)] };
  const spawner = new Spawner(scene as never, pool as never, rng as never);
  return { spawner, scene, registry: registryData, rng };
}

export function hashMarks(marks: { t: number; id: string; elite: boolean }[]): string {
  let h = 0x811c9dc5;
  for (const m of marks) {
    const s = m.t.toFixed(6) + "|" + m.id + "|" + (m.elite ? 1 : 0) + "\\n";
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export { Spawner, spawnRateForMinute, spawnRateFactor };
export const PROBE_TIME_SCALE = ${TIME_SCALE};
`;
writeFileSync(ENTRY, entryTs);

// ── Buendeln ──────────────────────────────────────────────────────────
const bundle = await rolldown({
  input: ENTRY,
  plugins: [
    {
      name: "headless-stubs",
      resolveId(id) {
        if (id === "phaser") return "virtual:stub-phaser";
        if (id.endsWith("EnemyPool")) return "virtual:stub-pool";
        return null;
      },
      load(id) {
        if (id === "virtual:stub-phaser") return STUB_PHASER;
        if (id === "virtual:stub-pool") return STUB_POOL;
        return null;
      },
    },
  ],
});
const outFile = join(WORK, `probe-bundle-${TAG}.mjs`);
await bundle.write({ file: outFile, format: "esm" });
await bundle.close();
const probe = await import(outFile);
const { makeSpawner, hashMarks, spawnRateForMinute, spawnRateFactor, PROBE_TIME_SCALE: TS_EXPORT } = probe;

// ── Szenarien ─────────────────────────────────────────────────────────
// Alle Frame-Zeiten erzeugen scaledDt = realDt*timeScale als Vielfaches von
// SIM_MAX_STEP -> das Substep-Grid bleibt ueberall an 0,05 s aligniert; nur
// die Zahl der echten Frames (und damit vor dem Fix die Allowance) variiert.
const JITTER = [1 / 120, 1 / 60, 1 / 40, 1 / 30, 1 / 20];
const jitterDt = (frame) => JITTER[(frame * 2654435761) % JITTER.length | 0];
const SCENARIOS = [
  { name: "60fps+hitch", realDt: (frame) => 1 / 60 },
  { name: "30fps+hitch", realDt: (frame) => 1 / 30 },
  { name: "jitter+hitch", realDt: (frame) => jitterDt(frame) },
  { name: "60fps-ohne-hitch", realDt: (frame) => 1 / 60, noHitch: true },
];

function runScenario(scenario) {
  const { spawner, scene, registry } = makeSpawner(SEED);
  const marks = [];
  let sim = 0;
  let frame = 0;
  const hitchesLeft = scenario.noHitch ? [] : HITCHES.map((h) => ({ ...h }));
  while (sim < SIM_END - 1e-9) {
    frame += 1;
    scene.game.loop.frame = frame;
    const normal = scenario.realDt(frame);
    const next = hitchesLeft[0];
    let realDt = normal;
    if (next) {
      const step = normal * TIME_SCALE;
      if (sim < next.at - 1e-9 && sim + step >= next.at - 1e-9) {
        realDt = (next.at - sim) / TIME_SCALE; // Vorframe endet exakt am Hitch-Start
      } else if (sim >= next.at - 1e-9) {
        realDt = next.len / TIME_SCALE; // Hitch-Frame deckt exakt [at, at+len] ab
        hitchesLeft.shift();
      }
    }
    scene.game.loop.delta = realDt * 1000;
    let remaining = realDt * TIME_SCALE;
    while (remaining > 1e-4) {
      const dt = Math.min(SIM_MAX_STEP, remaining);
      remaining -= dt;
      sim += dt;
      registry.set("lf-elapsed", sim);
      const spawned = spawner.update(sim, dt, probe.PLAYER.x, probe.PLAYER.y);
      for (const e of spawned) {
        marks.push({ t: Number(sim.toFixed(6)), id: e.def.id, elite: !!e.elite });
      }
    }
  }
  const perMinute = {};
  for (const m of marks) {
    const minute = Math.floor(m.t / 60);
    perMinute[minute] = (perMinute[minute] ?? 0) + 1;
  }
  const expected = {};
  let integral = 0;
  for (let minute = 0; minute < Math.ceil(SIM_END / 60); minute++) {
    const span = Math.min(SIM_END, (minute + 1) * 60) - minute * 60;
    expected[minute] = span * spawnRateForMinute(minute) * spawnRateFactor(640, 360);
    integral += expected[minute];
  }
  const conserved = marks.length + spawner.budget;
  return {
    name: scenario.name,
    frames: frame,
    marks: marks.length,
    hash: hashMarks(marks),
    marksList: marks,
    perMinute,
    perMinuteExpected: Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, Number(v.toFixed(3))])),
    budgetRest: Number(spawner.budget.toFixed(9)),
    conservedVsIntegralDelta: Number((conserved - integral).toFixed(6)),
  };
}

// ── Ausfuehren ────────────────────────────────────────────────────────
const results = SCENARIOS.map(runScenario);
const reference = results[0];
const diverged = [];
for (const r of results.slice(1)) {
  const a = reference.marksList;
  const b = r.marksList;
  let firstDiff = null;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ma = a[i];
    const mb = b[i];
    if (!ma || !mb || ma.t !== mb.t || ma.id !== mb.id || ma.elite !== mb.elite) {
      firstDiff = { index: i, a: ma ?? null, b: mb ?? null };
      break;
    }
  }
  diverged.push({ scenario: r.name, identical: firstDiff === null, firstDiff });
}

const identical = diverged.every((d) => d.identical);
const conservedOk = results.every((r) => Math.abs(r.conservedVsIntegralDelta) < 1e-6);

const report = {
  name: `m10-spawnbudget-${TAG}`,
  generatedAt: new Date().toISOString(),
  seed: SEED,
  timeScale: TIME_SCALE,
  simSeconds: SIM_END,
  simMaxStep: SIM_MAX_STEP,
  hitches: HITCHES,
  acceptance: "gleicher Seed + gleiche Sim-Zeit -> identische Spawn-Marken (t/id/elite) unabhaengig von der Echtzeit-Frame-Folge; Gesamt-Spawn-Zahl je Welle bleibt integral(rate)",
  scenarios: results.map(({ marksList, ...rest }) => rest),
  marksLists: Object.fromEntries(results.map((r) => [r.name, r.marksList])),
  comparison: diverged,
  identical,
  totalsConserved: conservedOk,
  verdict: EXPECT_IDENTICAL
    ? identical && conservedOk
      ? "PASS: Spawn-Marken bitgleich ueber alle Frame-Folgen, Gesamt-Spawn-Zahl je Welle konserviert"
      : "FAIL: Szenarien divergieren oder Gesamt-Spawn-Zahl nicht konserviert"
    : identical
      ? "HINWEIS: bereits vor dem Fix bitgleich (Rueckstau-Szenarium greift nicht) — Probe schaerfen"
      : "Erwartet fuer BEFORE: Frame-Folgen divergieren in den Spawn-Marken (frame-count-abhaengige Zuteilung)",
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`scenarios=${results.length} identical=${identical} totalsConserved=${conservedOk}`);
for (const r of results) console.log(`  ${r.name}: frames=${r.frames} marks=${r.marks} hash=${r.hash} perMinute=${JSON.stringify(r.perMinute)} budgetRest=${r.budgetRest}`);
for (const d of diverged) console.log(`  vs ${reference.name}: ${d.scenario} identical=${d.identical}${d.firstDiff ? ` firstDiff=${JSON.stringify(d.firstDiff)}` : ""}`);
console.log(`verdict: ${report.verdict}`);
if (EXPECT_IDENTICAL && !(identical && conservedOk)) process.exit(1);
