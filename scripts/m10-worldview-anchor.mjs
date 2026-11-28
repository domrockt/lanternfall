#!/usr/bin/env node
/**
 * m10-worldview-anchor-pools: Determinismus-Guard für die Schuss-Pfade.
 *
 *   node scripts/m10-worldview-anchor.mjs                       # 3 Seeds x 2 Laeufe
 *   node scripts/m10-worldview-anchor.mjs --seeds=101,202,404
 *   node scripts/m10-worldview-anchor.mjs --seconds=700 --scale=30
 *   node scripts/m10-worldview-anchor.mjs --tag=before          # Suffix im Output
 *
 * Bedarf: m10-boss-dur-determinism K2 (requests.md 13:4xZ) — camera.worldView
 * wird nur in Camera.preRender gesetzt, der Sim läuft aber in festen
 * SIM_MAX_STEP-Teilschritten. Die Sim-Pfad-Leser
 *   - ProjectilePool.view()        (Offscreen-Culling eigener Projektile)
 *   - EnemyProjectilePool.refreshView() (Gegner-Schüsse)
 * sehen daher einen frame-abhängigen View → RNG-Divergenz.
 *
 * Methode: je Seed REPS identische Browser-Läufe (gleicher Seed, autoPlay,
 * timeScale 30, detstart + resumeRun wie scripts/m10-run-determinism.mjs).
 * Schuss-bezogene Marken werden EXAKT im Sim-Loop gelesen (prototype-Patch
 * von Run.simulate): je Sekunde die kumulativen Zähler des Spieler-
 * Projektil-Pools (spawned/culled/stolen, ProjectilePool.stats) und der
 * Gegner-Schüsse (attempted/fired/hits, EnemyProjectilePool.stats) plus
 * Position. Zwei Läufe mit gleichem Seed müssen bitgleich sein.
 *
 * Kein FPS-/Echtzeit-Messziel => OHNE flock (sim-exakte Marken,
 * lastunabhängig, wie m10-run-determinism / m10-boss-dur-det).
 *
 * Output: Default ~/games/.evidence/m10-worldview-anchor-pools/
 *   m10-worldview-anchor[-<tag>].json (inkl. WebGL-Renderer-String).
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
  `${homedir()}/games/.evidence/m10-worldview-anchor-pools/m10-worldview-anchor${TAG ? `-${TAG}` : ""}.json`));
const CHARACTER = "mira";
// Isolation-Probe (K4): patcht NUR den dritten, fremden Leser
// Spawner.outsideView zur Laufzeit auf den Sim-Anker (exakt Patch 1 aus
// ~/tmp/m10-boss-dur-determinism/probe-fix.mjs). Bitgleich damit => die
// beiden hiesigen Leser (ProjectilePool.view, EnemyProjectiles.refreshView)
// sind leckfrei; die Rest-Divergenz ohne Patch ist der Spawner-Leser.
const PATCH_SPAWNER = String(argOf("patch-spawner", "0")) === "1";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();

/** Sim-exakte Schuss-Marken: Pool-Stats + Enemy-Shot-Stats je Sekunde. */
async function armTrace(page, maxSec, patchSpawner) {
  return page.evaluate(([limit, patchSpawnerArg]) => {
    const run = window.__game.scene.getScene("run");
    if (patchSpawnerArg) {
      // Isolation: dritter Leser (Spawner.outsideView, fremde Lane) -> Sim-Anker.
      const gw = 640; // GAME_WIDTH (logischer Screen, config.ts)
      const spProto = Object.getPrototypeOf(run.spawner);
      spProto.outsideView = function (x, y, margin = 16) {
        const cam = this.camera;
        const s = Math.max(1, Math.round(gw / (cam.width || gw)));
        const w = cam.width * s;
        const h = cam.height * s;
        const vx = cam.scrollX + cam.width / 2 - w / 2;
        const vy = cam.scrollY + cam.height / 2 - h / 2;
        return x < vx - margin || x > vx + w + margin || y < vy - margin || y > vy + h + margin;
      };
    }
    let nextSec = 1;
    const trace = { marks: [] };
    window.__detTrace = trace;
    const snap = () => {
      const pj = run.combat.projectiles.stats;
      const es = run.enemyShots.stats;
      return {
        spawned: pj.spawned, culled: pj.culled, stolen: pj.stolen,
        attempted: es.attempted, fired: es.fired, hits: es.hits,
      };
    };
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
          ...snap(),
        });
        nextSec += 1;
      }
    };
    return true;
  }, [maxSec, patchSpawner]);
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
    await armTrace(page, MAX_SECONDS, PATCH_SPAWNER);
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
    const renderer = await page.evaluate(() => {
      const g = window.__game;
      const gl = g?.renderer?.gl;
      if (!gl) return "unknown";
      // Abnahme-Pflicht: echter GPU-Renderer (SwiftShader = ungültig).
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    }).catch(() => "unknown");
    return { seed, rep, marks: trace.marks, pageErrors, renderer };
  } finally {
    await page.close();
  }
}

/** Erste Divergenz zwischen zwei Läufen (Schuss-Marken bitgleich?). */
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
  return null;
}

const perSeed = [];
let deterministic = true;

for (const seed of SEEDS) {
  const reps = [];
  for (let rep = 0; rep < REPS; rep++) {
    const r = await runRep(seed, rep);
    console.log(`[wva] seed=${seed} rep=${rep}: ${r.marks.length} Marken, JS-Fehler=${r.pageErrors.length}`);
    reps.push(r);
  }
  const diffs = [];
  for (let rep = 1; rep < REPS; rep++) {
    const d = firstDiff(reps[0], reps[rep]);
    if (d) diffs.push({ rep, ...d });
  }
  const seedDet = diffs.length === 0;
  if (!seedDet) deterministic = false;
  perSeed.push({
    seed,
    deterministic: seedDet,
    marksPerRep: reps.map((r) => r.marks.length),
    rendererPerRep: reps.map((r) => r.renderer),
    diffs,
  });
  console.log(`[wva] seed=${seed}: ${seedDet ? "DETERMINISTISCH" : `DIVERGENT (${diffs[0]?.where})`}`);
}

const verdict = {
  script: "scripts/m10-worldview-anchor.mjs",
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
console.log(`[wva] Urteil: ${deterministic ? "DETERMINISTISCH (0 Abweichung)" : "NICHT deterministisch"} -> ${OUT}`);
await browser.close();
process.exit(deterministic ? 0 : 2);
