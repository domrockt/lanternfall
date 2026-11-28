#!/usr/bin/env node
/**
 * Lane m10-mira-hp-balance-check, K1 (#12905): Ist-Messung des Dom-Balance-Korridors
 * auf dem neuen Mira-HP-Stand (hp 90, m10-charstats-ssot af72458d, gemergt).
 *
 *   node scripts/m10-mira-hp-check.mjs   # Matrix: mira x Seeds 101/202/404 + kael x Seed 101,
 *                                        # volle Laeufe bis Run-Ende (Dawn/Tod) @ setTimeScale(30)
 *
 * Kriterien (Dom A5): mira-Boss-Dauern 20-60 s, Levelband 25-40 (Minute 30 / Run-Ende),
 * kael unveraendert -> kael-Boss-Dauern + Endlevel gegen die committete HP-250-Referenz
 * shots/m10-balance-corridor-full.json mit Toleranz ±10 %.
 *
 * Output: JSON nach ~/games/.evidence/m10-mira-hp-balance-check/m10-mira-hp-<stamp>.json
 * (Belege liegen ausserhalb des Repos, Dom 27.11.). Laeuft OHNE flock (Balance, feste
 * Substeps, lastunabhaengig).
 */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const SCALE = 30;
const SEEDS_MIRA = [101, 202, 404];
const SEED_KAEL = 101;
// Suchlauf-Overrides (Lane K3): MIRA_HP_SEEDS=101,202 MIRA_HP_KAEL=0 beschränken die Matrix.
const MIRA_SEEDS = process.env.MIRA_HP_SEEDS ? process.env.MIRA_HP_SEEDS.split(",").map(Number) : SEEDS_MIRA;
const RUN_KAEL = process.env.MIRA_HP_KAEL !== "0";
const VIEWPORT = { width: 960, height: 540 };
const DPR = 1;

/** Dom-Korridor (verbindlich, ACCEPTANCE A5). */
const ENDLEVEL_CORRIDOR = [25, 40];
const BOSS_CORRIDOR = [20, 60];
const NO_DEATH_BEFORE_MINUTE = 15;
const KAEL_TOLERANCE = 0.1;

const WALL_LIMIT_MS = 240000;
const BOSS_NAMES = ["Moorkönigin", "Knochenfürst", "Der Fahle Hirte", "Glockenturm-Golem", "Hexenzirkel", "Der Hohle König"];

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const jsErrors = [];

async function runOnce(seed, character) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(m.text()); });
  const started = Date.now();
  const trace = { seed, character, outcome: null, endSecond: null };
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${seed}`);
    await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
    await waitForScene(page, "title");
    trace.renderer = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return null;
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    });
    await page.keyboard.press("Enter");
    await waitForScene(page, "charselect");
    await page.keyboard.press(character === "kael" ? "2" : "1");
    await page.keyboard.press("Enter");
    await waitForScene(page, "run");
    await page.evaluate((scale) => {
      window.__lf.autoPlay(true);
      window.__lf.god(false);
      window.__lf.setTimeScale(scale);
      const run = window.__game.scene.getScene("run");
      window.__corridorTrace = { bossDeaths: [] };
      run.events.on("bossDefeated", (e) => {
        window.__corridorTrace.bossDeaths.push({ index: e.index, at: run.elapsed });
      });
    }, SCALE);

    let last = null;
    let lastRun = null;
    const lastSeenByBoss = {};
    while (Date.now() - started < WALL_LIMIT_MS) {
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => {
        const game = window.__game;
        const run = game?.scene?.getScene("run");
        if (run && run.scene.isActive()) {
          const hud = run.getHudState();
          return {
            scene: "run", time: hud.time, level: hud.level, kills: hud.kills, enemies: hud.enemies, dawn: hud.dawn,
            boss: hud.boss ? { index: hud.boss.index } : null,
            bossesSpawned: (run.bossesSpawned ?? []).slice(),
            bossDeaths: [...(window.__corridorTrace?.bossDeaths ?? [])],
          };
        }
        const results = game?.scene?.getScene("results");
        if (results && results.scene.isActive()) {
          const r = results.result ?? {};
          return { scene: "results", reason: r.reason ?? null, time: r.elapsed ?? 0, level: r.level ?? 0, kills: r.kills ?? 0, god: r.god ?? null, character: r.character ?? null };
        }
        return { scene: "other", time: 0 };
      });
      last = s;
      if (s.scene === "run") lastRun = s;
      if (s.boss) lastSeenByBoss[s.boss.index] = s.time;
      if (s.scene === "results") {
        trace.outcome = s.reason === "dawn" ? "dawn" : s.reason === "giveup" ? "giveup" : "death";
        trace.endSecond = Math.round(s.time * 10) / 10;
        trace.endLevel = s.level;
        trace.result = { reason: s.reason, level: s.level, kills: s.kills, god: s.god, character: s.character };
        break;
      }
      if (s.scene !== "run") break;
    }
    trace.bossesSpawned = lastRun?.bossesSpawned ?? [];
    trace.bossDeaths = lastRun?.bossDeaths ?? [];
    trace.lastSeenByBoss = lastSeenByBoss;
    if (!trace.outcome && last) {
      trace.outcome = "timeout";
      trace.endSecond = Math.round((last.time ?? 0) * 10) / 10;
      trace.endLevel = last.level ?? null;
    }
  } finally {
    trace.pageErrors = pageErrors;
    trace.wallSeconds = Math.round((Date.now() - started) / 100) / 10;
    await page.close();
  }
  trace.endMinute = Math.round(((trace.endSecond ?? 0) / 60) * 100) / 100;
  jsErrors.push(...pageErrors.map((e) => `${character}/${seed}: ${e}`));
  return trace;
}

function bossDurations(trace) {
  const spawned = trace.bossesSpawned ?? [];
  const lastSeen = trace.lastSeenByBoss ?? {};
  const deaths = trace.bossDeaths ?? [];
  const rows = [];
  for (const spawn of spawned) {
    const i = spawn.index;
    const death = deaths.find((d) => d.index === i);
    const end = death ? death.at : lastSeen[i];
    const duration = Number.isFinite(end) && Number.isFinite(spawn.at) ? Math.round((end - spawn.at) * 10) / 10 : null;
    rows.push({
      index: i,
      name: BOSS_NAMES[i] ?? `boss${i}`,
      spawnSecond: Number.isFinite(spawn.at) ? Math.round(spawn.at) : null,
      durationSec: duration,
      defeated: Boolean(death),
      aliveAtEnd: !death && Number.isFinite(lastSeen[i]),
      inCorridor: duration != null && duration >= BOSS_CORRIDOR[0] && duration <= BOSS_CORRIDOR[1],
    });
  }
  return rows;
}

const runs = [];
for (const seed of MIRA_SEEDS) runs.push(await runOnce(seed, "mira"));
if (RUN_KAEL) for (const seed of [SEED_KAEL]) runs.push(await runOnce(seed, "kael"));
for (const r of runs) {
  console.log(`[m10-mira-hp-check] ${r.character}/${r.seed} -> ${r.outcome} @ ${r.endMinute} min, Level ${r.endLevel ?? "?"}, ${r.wallSeconds}s wall`);
}

// Kael-Referenz aus der committeten HP-250-Referenz (gemessen vor m10-charstats-ssot).
let kaelRef = null;
try {
  const base = JSON.parse(readFileSync(new URL("../shots/m10-balance-corridor-full.json", import.meta.url), "utf8"));
  const refRun = base.runs.find((r) => r.character === "kael" && r.seed === SEED_KAEL);
  if (refRun) {
    const refBosses = bossDurations(refRun);
    kaelRef = { source: "shots/m10-balance-corridor-full.json", endLevel: refRun.endLevel, endMinute: refRun.endMinute, bosses: refBosses };
  }
} catch { /* Referenz fehlt -> kael-Vergleich entfaellt, Urteil meldet das */ }

const bossRows = runs.map((r) => ({ character: r.character, seed: r.seed, bosses: bossDurations(r) }));
const bossFlat = bossRows.flatMap((row) => row.bosses.map((b) => ({ ...b, character: row.character, seed: row.seed })));
const miraBosses = bossFlat.filter((b) => b.character === "mira" && b.durationSec != null);
const kaelBosses = bossFlat.filter((b) => b.character === "kael" && b.durationSec != null);

const violations = [];
// mira: JEDE gemessene Boss-Dauer im Korridor.
for (const b of miraBosses) {
  if (!b.inCorridor) violations.push({ type: "bossDuration", character: "mira", seed: b.seed, bossIndex: b.index, name: b.name, durationSec: b.durationSec, corridor: BOSS_CORRIDOR });
}
// mira: Levelband nur fuer vollstaendige Laeufe; Tod vor Minute 15 ist immer eine Verletzung.
for (const r of runs.filter((r) => r.character === "mira")) {
  if (r.outcome === "dawn" || r.outcome === "death") {
    if (r.endLevel == null || r.endLevel < ENDLEVEL_CORRIDOR[0] || r.endLevel > ENDLEVEL_CORRIDOR[1]) {
      violations.push({ type: "endLevel", character: "mira", seed: r.seed, endLevel: r.endLevel ?? null, corridor: ENDLEVEL_CORRIDOR });
    }
  }
  if ((r.endSecond ?? Infinity) < NO_DEATH_BEFORE_MINUTE * 60) {
    violations.push({ type: "deathBefore15", character: "mira", seed: r.seed, deathMinute: r.endMinute, limitMinute: NO_DEATH_BEFORE_MINUTE });
  }
}
// kael (unveraendert, HP 130): Dauern + Endlevel gegen Referenz, Toleranz ±10 %.
const kaelChecks = [];
if (kaelRef) {
  for (const b of kaelBosses) {
    const ref = kaelRef.bosses.find((x) => x.index === b.index && x.durationSec != null);
    if (!ref) continue;
    const delta = Math.abs(b.durationSec - ref.durationSec) / ref.durationSec;
    kaelChecks.push({ bossIndex: b.index, name: b.name, newSec: b.durationSec, refSec: ref.durationSec, deltaPct: Math.round(delta * 1000) / 10, inTolerance: delta <= KAEL_TOLERANCE });
    if (delta > KAEL_TOLERANCE) violations.push({ type: "kaelDurationDelta", character: "kael", seed: SEED_KAEL, bossIndex: b.index, name: b.name, newSec: b.durationSec, refSec: ref.durationSec, deltaPct: Math.round(delta * 1000) / 10, tolerancePct: 10 });
  }
} else {
  violations.push({ type: "kaelReferenceMissing", detail: "shots/m10-balance-corridor-full.json ohne kael/101" });
}

const summary = {
  lane: "m10-mira-hp-balance-check",
  generatedAt: new Date().toISOString(),
  miraHpStand: 90,
  miraHpSource: "src/data/characters.ts (m10-charstats-ssot af72458d)",
  parameters: { scale: SCALE, seedsMira: MIRA_SEEDS, seedKael: RUN_KAEL ? SEED_KAEL : null, mode: "full", viewport: [VIEWPORT.width, VIEWPORT.height], dpr: DPR, autoPlay: true, god: false },
  corridor: { endLevel: ENDLEVEL_CORRIDOR, bossDurationSec: BOSS_CORRIDOR, noDeathBeforeMinute: NO_DEATH_BEFORE_MINUTE, kaelTolerancePct: 10 },
  renderer: runs.map((r) => r.renderer)[0] ?? null,
  rendererOk: Boolean(runs[0]?.renderer) && !/swiftshader/i.test(runs[0]?.renderer ?? "SwiftShader"),
  runs,
  bossRuns: bossRows,
  kaelReference: kaelRef,
  kaelChecks,
  violations,
  accepted: violations.length === 0 && jsErrors.length === 0,
  jsErrors,
};

const outDir = `${homedir()}/games/.evidence/m10-mira-hp-balance-check`;
mkdirSync(outDir, { recursive: true });
const out = `${outDir}/m10-mira-hp-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  accepted: summary.accepted,
  renderer: summary.renderer,
  rendererOk: summary.rendererOk,
  miraBossDurations: miraBosses.map((b) => `${b.seed} ${b.name}: ${b.durationSec ?? "?"}s (defeated=${b.defeated})`),
  kaelDurations: kaelBosses.map((b) => `${b.name}: ${b.durationSec ?? "?"}s`),
  kaelChecks,
  violations,
  jsErrors,
  evidence: out,
}, null, 2));

await browser.close();
server.stop();
process.exit(summary.accepted ? 0 : 1);
