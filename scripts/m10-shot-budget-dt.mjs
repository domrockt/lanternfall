#!/usr/bin/env node
// M10-shot-budget-dt K1/K4: Determinismus-Probe fuer das Gegner-Schuss-Budget.
//
// Befundklasse "frame-abhaengiges Budget" (Bedarfsmeldung m10-pause-freeze #7505):
// der EnemyProjectilePool verteilt launchBudgetPerFrame je UPDATE-AUFRUF (Karte
// #7491, Merge b90c229). Bei unterschiedlichen Echtzeit-Frame-Zeiten (60 vs 30
// FPS) bekommen gleiche Seeds Telegraphen/Schuesse zu unterschiedlichen
// Sim-Zeiten — die Abnahme-Maschinerie (fullrun-guard, Balance-Korridor) ist
// nur aggregiert belastbar.
//
// Diese Probe fuert den ECHTEN EnemyProjectilePool headless (node
// --experimental-strip-types, phaser/atlas per Loader-Stub) und vergleicht
// drei dt-Folgen mit gleichem Seed und gleicher Versuch-Folge:
//
//   seq60sparse : update(dt=1/60), Versuche am 1/30-Raster
//   seq30       : update(dt=1/30), Versuche am 1/30-Raster  (gleiche Versuch-
//                 Sim-Zeiten wie seq60sparse -> Marken MUSSSEN identisch sein)
//   seq60dense  : update(dt=1/60), Versuche am 1/60-Raster (Referenz fuer
//                 Bitgleichheit mit dem #7491-Stand bei festen 16,67-ms-Frames)
//
// Marken je Lauf: Telegraph-Zuteilungen {t, n} (je Versuch-Schritt) und
// Launch-Ereignisse {t, n, ids} (Ursprungs-Identitaet der neuen Schuesse;
// alle Versuche sind stationaer, vx=vy=0 -> Ursprung = Identitaet).
//
//   node --experimental-strip-types scripts/m10-shot-budget-dt.mjs --tag=before
//   node --experimental-strip-types scripts/m10-shot-budget-dt.mjs --tag=after \
//        --baseline=shots/m10-shotbudget-dt-before.json
//
// Ausgabe: shots/m10-shotbudget-dt-<tag>.json
//   deterministic          = seq60sparse- und seq30-Marken bitgleich (Akzeptanz)
//   denseMatchesBaseline   = seq60dense bitgleich zur Before-Baseline (#7491)
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { register } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline !== undefined) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};

const TAG = String(argOf("tag", "probe"));
const OUT = String(argOf("out", `shots/m10-shotbudget-dt-${TAG}.json`));
const BASELINE = argOf("baseline", null);
const SIM_SECONDS = Number(argOf("seconds", "8")) || 8;
const SEED = Number(argOf("seed", "7505"));
const SPOTS = Number(argOf("spots", "40"));
const ATTEMPTS_PER_STEP = Number(argOf("attempts", "9")) || 9;

// --- Loader-Stubs: phaser (nur BlendModes zur Laufzeit) + gfx/atlas (Canvas) ---
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier === "phaser") {
    return { url: "data:text/javascript," + encodeURIComponent(
      "export default { BlendModes: { NORMAL: 0, ADD: 1 } };"), shortCircuit: true, format: "module-typescript" };
  }
  if (specifier.endsWith("gfx/atlas")) {
    const src = "const chain = () => { const o = {}; for (const m of " +
      "['setDepth','setBlendMode','setScale','setAlpha','setTint','clearTint'," +
      "'setRotation','setVisible','setActive','setPosition','setTexture']) o[m] = () => o; return o; }; " +
      "export const makeImage = () => chain(); export const applyTexture = () => {};";
    return { url: "data:text/javascript," + encodeURIComponent(src), shortCircuit: true, format: "module" };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !specifier.endsWith(".ts") &&
      context.parentURL && context.parentURL.startsWith("file:")) {
    const base = new URL(specifier, context.parentURL);
    for (const cand of [base.href + ".ts", base.href + "/index.ts"]) {
      if (existsSync(fileURLToPath(cand))) return { url: cand, shortCircuit: true, format: "module-typescript" };
    }
  }
  return next(specifier, context);
};`;
register("data:text/javascript," + encodeURIComponent(hooks), import.meta.url);

const here = new URL(".", import.meta.url).href;
const { EnemyProjectilePool } = await import(new URL("../src/systems/EnemyProjectiles.ts", here).href);
const { mulberry32 } = await import(new URL("../src/logic/rng.ts", here).href);

const VIEW = { x: 0, y: 0, width: 640, height: 360 };
const EPS = 1e-9;
/** Fenster-Quantisierung der Marken: 1/60-Raster (beide dt-Folgen liegen darauf). */
const r60 = (t) => Math.round(t * 60) / 60;
const TEXTURES = ["enemy_shot_spit", "enemy_shot_bone", "enemy_shot_shadow", "enemy_shot_fire"];

/** 40 fixe Schuetzen-Plaetze im View (wie tests/shot-budget-cap shooter()). */
function spotAt(i) {
  return { x: 30 + (i % 8) * 60, y: 30 + Math.floor(i / 8) * 50 };
}

function fakeScene() {
  const scene = {
    textures: { exists: () => true, addCanvas: () => {} },
    add: { image: () => { throw new Error("Probe erzeugt keine Images aus scene.add"); } },
    cameras: { main: { worldView: { ...VIEW } } },
    tweens: { add: () => {} },
    enemies: { active: [] },
  };
  return scene;
}

/**
 * Ein Lauf: Versuche werden seed-abhaengig an festen SIM-ZEITEN (1/step-Raster)
 * erzeugt — nicht je Frame — damit beide dt-Folgen an denselben Sim-Zeiten
 * dieselben Versuche sehen. Alle Versuche stationaer (vx=vy=0), damit die
 * Ursprungs-Identitaet eines Schusses = Platz-Index ist.
 */
function run({ dt, attemptStep }) {
  const scene = fakeScene();
  const pool = new EnemyProjectilePool(scene);
  const spots = Array.from({ length: SPOTS }, (_, i) => spotAt(i));
  scene.enemies.active = spots.map((s) => ({ x: s.x, y: s.y, alive: true }));
  const rng = mulberry32(SEED);
  const telegraphMarks = [];
  const launchMarks = [];
  let simTime = 0;
  let nextAttempt = 0;
  let prevFired = 0;
  let activeIds = new Map(); // Platz-Index -> Anzahl aktiver Schuesse am Platz
  const steps = Math.round(SIM_SECONDS / attemptStep);

  const drain = (t) => {
    const before = pool.statSnapshot().pending;
    for (let k = 0; k < ATTEMPTS_PER_STEP; k++) {
      const idx = Math.floor(rng() * SPOTS) % SPOTS;
      const s = spots[idx];
      pool.spawn({
        x: s.x, y: s.y, vx: 0, vy: 0, damage: 1,
        texture: TEXTURES[Math.floor(rng() * TEXTURES.length) % TEXTURES.length],
        life: 0.5,
      });
    }
    const after = pool.statSnapshot().pending;
    telegraphMarks.push({ t: r60(t), n: after - before });
  };

  const frames = Math.round(SIM_SECONDS / dt);
  for (let f = 0; f < frames; f++) {
    while (nextAttempt <= simTime + EPS && nextAttempt <= SIM_SECONDS + EPS) {
      drain(nextAttempt);
      nextAttempt += attemptStep;
    }
    pool.update(dt, -9999, -9999, () => {});
    simTime += dt;
    const fired = pool.statSnapshot().fired;
    if (fired !== prevFired) {
      const now = new Map();
      for (const shot of pool.active) {
        const idx = spots.findIndex((s) => s.x === shot.x && s.y === shot.y);
        now.set(idx, (now.get(idx) ?? 0) + 1);
      }
      const newIds = [];
      for (const [idx, c] of now) {
        const prevC = activeIds.get(idx) ?? 0;
        for (let k = 0; k < c - prevC; k++) newIds.push(idx);
      }
      newIds.sort((a, b) => a - b);
      launchMarks.push({ t: r60(simTime), n: fired - prevFired, ids: newIds });
      activeIds = now;
      prevFired = fired;
    }
  }

  return {
    dt,
    attemptStep,
    telegraphMarks,
    launchMarks,
    stats: pool.statSnapshot(),
    budget: pool.budgetSnapshot(),
  };
}

const marksOf = (r) => JSON.stringify({ tg: r.telegraphMarks, lm: r.launchMarks });

const seq60sparse = run({ dt: 1 / 60, attemptStep: 1 / 30 });
const seq30 = run({ dt: 1 / 30, attemptStep: 1 / 30 });
const seq60dense = run({ dt: 1 / 60, attemptStep: 1 / 60 });

const deterministic = marksOf(seq60sparse) === marksOf(seq30);
let denseMatchesBaseline = null;
if (BASELINE && existsSync(BASELINE)) {
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));
  denseMatchesBaseline =
    marksOf(seq60dense) === marksOf(base.runs.seq60dense);
}

const out = {
  meta: {
    lane: "m10-shot-budget-dt",
    tag: TAG,
    seed: SEED,
    simSeconds: SIM_SECONDS,
    spots: SPOTS,
    attemptsPerStep: ATTEMPTS_PER_STEP,
    akzeptanz: "gleicher Seed + gleiche Sim-Zeit -> identische Schuss-/Telegraph-Marken unabhaengig von der dt-Folge",
    note: "Probe ist Werkzeug (Argus 27.11.); Beleg ist dieses JSON. Echter EnemyProjectilePool, phaser/atlas gestubbt.",
  },
  runs: { seq60sparse, seq30, seq60dense },
  deterministic,
  denseMatchesBaseline,
  divergenz: deterministic
    ? null
    : {
        firstTelegraphDivergence: (() => {
          const a = seq60sparse.telegraphMarks, b = seq30.telegraphMarks;
          for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return { i, seq60sparse: a[i], seq30: b[i] };
          }
          return null;
        })(),
        firstLaunchDivergence: (() => {
          const a = seq60sparse.launchMarks, b = seq30.launchMarks;
          for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return { i, seq60sparse: a[i], seq30: b[i] };
          }
          return null;
        })(),
      },
};

mkdirSync("shots", { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`[${TAG}] deterministic=${deterministic} denseMatchesBaseline=${denseMatchesBaseline}`);
console.log(`  seq60sparse: fired=${seq60sparse.stats.fired} cancelledBudgetRotation=${seq60sparse.budget.cancelledBudgetRotation}`);
console.log(`  seq30:       fired=${seq30.stats.fired} cancelledBudgetRotation=${seq30.budget.cancelledBudgetRotation}`);
console.log(`  seq60dense:  fired=${seq60dense.stats.fired} cancelledBudgetRotation=${seq60dense.budget.cancelledBudgetRotation}`);
if (!deterministic) console.log(`  erste Divergenz: ${JSON.stringify(out.divergenz)}`);
console.log(`  -> ${OUT}`);
if (TAG !== "before" && !deterministic) process.exitCode = 1;
