#!/usr/bin/env node
/**
 * Lane m10-balance-corridor-guard: dauerhafter Balance-Korridor-Guard (Dom-Kriterium).
 *
 *   node scripts/m10-balance-corridor.mjs short   # 3 Seeds x mira/kael, kurzskaliert bis Boss 3 (15 min)
 *   node scripts/m10-balance-corridor.mjs full    # 30-min-Referenz: 6/6 Laeufe bis Run-Ende (Dawn/Tod)
 *
 * DOM-KRITERIUM (ACCEPTANCE A5, Dom-Zustimmung 2026-11-28 06:00Z):
 *   - Endlevel 25-40 (6/6 Laeufe, 30-min-Referenz)
 *   - Boss-Dauer 20-60 s (jeder Boss mit messbarer Dauer)
 *   - kein Tod vor Minute 15
 *
 * Output (committete Marken, Muster shots/m10-golden-frame-*):
 *   shots/m10-balance-corridor-short.json  (Kurz-Matrix, guard-taeglich)
 *   shots/m10-balance-corridor-full.json   (30-min-Referenz, nur bei Rebaseline/Balance-Merges)
 *
 * GRENZE: Der Guard prueft den KORRIDOR (stochastisch, 3 Seeds x 2 Charaktere),
 * NICHT bitgenauen Determinismus — dafuer existiert der Golden-Frame-Guard.
 * Laeuft OHNE flock (Balance mit festen Substeps, lastunabhaengig).
 */
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const MODE = process.argv[2] === "full" ? "full" : "short";
const SCALE = 30;
/** Seed-Matrix wie Dom-Referenz shots/m10-balance-kael-final.json (lane m10-balance-kael). */
const SEEDS = [101, 202, 404];
const CHARS = ["mira", "kael"];
const VIEWPORT = { width: 960, height: 540 };
const DPR = 1;

/** Dom-Korridor (verbindlich, ACCEPTANCE A5). */
const ENDLEVEL_CORRIDOR = [25, 40];
const BOSS_CORRIDOR = [20, 60];
const NO_DEATH_BEFORE_MINUTE = 15;

/** Wandzeit-Limit je Lauf: short bis Boss 3 (~16 Sim-min @30x), full 30 Sim-min @30x (~65 s) + Endboss-Puffer. */
const WALL_LIMIT_MS = MODE === "full" ? 200000 : 120000;

/** Kurzmodus endet nach dem 3. Boss (Index 2, "Der Fahle Hirte", 15:00). */
const SHORT_LAST_BOSS_INDEX = 2;

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
      // Kurzmodus: nach dem besiegten Boss 3 abbrechen (Level zu diesem Zeitpunkt als Marke mitnehmen).
      const boss3Dead = MODE === "short" && (lastRun?.bossDeaths ?? []).some((d) => d.index === SHORT_LAST_BOSS_INDEX);
      if (boss3Dead) {
        trace.outcome = "boss3";
        trace.endSecond = Math.round((lastRun?.time ?? 0) * 10) / 10;
        trace.endLevel = lastRun?.level ?? null;
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

/** Boss-Dauern (erster Auftritt je Boss) aus Spawn-/Todeszeiten + letzter Sichtung. */
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
for (const character of CHARS) {
  for (const seed of SEEDS) {
    console.log(`[m10-balance-corridor] ${MODE}-Run ${character} seed ${seed} ...`);
    const t = await runOnce(seed, character);
    console.log(`[m10-balance-corridor]   -> ${t.outcome} @ ${t.endMinute} min, Level ${t.endLevel ?? "?"}, ${t.wallSeconds}s wall`);
    runs.push(t);
  }
}

/**
 * Bekannte, dokumentierte Korridor-Abweichungen (Whitelist mit Grund + Beleg).
 * JEDE neuerliche Abweichung, die hier nicht abgedeckt ist, laesst den Guard FAILen.
 * Aenderungen an dieser Liste NUR mit Begruendung in docs/lanes/m10-balance-corridor-guard.md.
 *
 * m10-mira-dps-corridor (2026-11-28, K3): der mira-Eintrag (bossDuration < 20 s) wurde
 * ENTFERNT — Ursache behoben (phoenix L8 Direktschaden 4×30/0,48 = 250 DPS → 2×30/1,1 =
 * 54,5 DPS; inkl. fixer Explosion ~109 DPS gegen Einzelziel), neue Baselines committed;
 * alle mira/kael-Boss-Dauern in [20, 60] s. Befund + Zahlen:
 * docs/lanes/m10-mira-dps-corridor.md.
 */
const KNOWN_VIOLATIONS = [];

/** Strukturierte Abweichung gegen den Dom-Korridor. */
function violation(type, detail) {
  return { type, ...detail };
}

/** Ist eine Abweichung durch die dokumentierte Whitelist gedeckt? */
function isKnown(v) {
  return KNOWN_VIOLATIONS.some((k) => {
    if (k.type !== v.type || k.character !== v.character) return false;
    if (k.type === "bossDuration") return k.bossIndex === v.bossIndex && v.durationSec < k.maxDurationSec;
    return false;
  });
}

const bossRows = runs.map((r) => ({ character: r.character, seed: r.seed, bosses: bossDurations(r) }));
const bossFlat = bossRows.flatMap((row) => row.bosses.map((b) => ({ ...b, character: row.character, seed: row.seed })));
const bossMeasured = bossFlat.filter((b) => b.durationSec != null);

// Dom-Kriterium: kein Tod vor Minute 15 (Tod SELBST ist im Kurzmodus Abbruch, in full erlaubt ab Minute 15).
const deaths = runs.filter((r) => r.outcome === "death");
const deathBefore15 = deaths.filter((r) => (r.endSecond ?? Infinity) < NO_DEATH_BEFORE_MINUTE * 60);

// Endlevel-Korridor gilt fuer vollstaendige Laeufe (full: dawn/death; short: bis Boss 3 erreicht).
const completed = runs.filter((r) => (MODE === "full" ? r.outcome === "dawn" || r.outcome === "death" : r.outcome === "boss3" || r.outcome === "dawn" || r.outcome === "death"));
const endLevels = completed.map((r) => r.endLevel);

const renderers = [...new Set(runs.map((r) => r.renderer))];
const rendererOk = renderers.length === 1 && renderers[0] != null && !/swiftshader/i.test(renderers[0]);

// Strukturierte Dom-Korridor-Pruefung (strict — Whitelist greift erst danach).
const violations = [];
for (const r of completed) {
  if (r.endLevel == null || r.endLevel < ENDLEVEL_CORRIDOR[0] || r.endLevel > ENDLEVEL_CORRIDOR[1]) {
    violations.push(violation("endLevel", { character: r.character, seed: r.seed, endLevel: r.endLevel ?? null, corridor: ENDLEVEL_CORRIDOR }));
  }
}
for (const b of bossMeasured) {
  if (!b.inCorridor) {
    violations.push(violation("bossDuration", { character: b.character, seed: b.seed, bossIndex: b.index, name: b.name, durationSec: b.durationSec, corridor: BOSS_CORRIDOR }));
  }
}
for (const r of deathBefore15) {
  violations.push(violation("deathBefore15", { character: r.character, seed: r.seed, deathMinute: r.endMinute, limitMinute: NO_DEATH_BEFORE_MINUTE }));
}
if (completed.length !== runs.length) {
  violations.push(violation("incomplete", { corridor: MODE, runs: runs.filter((r) => !completed.includes(r)).map((r) => `${r.character}/${r.seed}:${r.outcome}`) }));
}

const knownViolations = violations.filter((v) => isKnown(v)).map((v) => ({ ...v, reason: KNOWN_VIOLATIONS.find((k) => isKnown(v))?.reason }));
const unknownViolations = violations.filter((v) => !isKnown(v));

const summary = {
  lane: "m10-balance-corridor-guard",
  mode: MODE,
  generatedAt: new Date().toISOString(),
  parameters: { scale: SCALE, seeds: SEEDS, characters: CHARS, viewport: [VIEWPORT.width, VIEWPORT.height], dpr: DPR, autoPlay: true, god: false, shortLastBossIndex: MODE === "short" ? SHORT_LAST_BOSS_INDEX : null },
  corridor: { endLevel: ENDLEVEL_CORRIDOR, bossDurationSec: BOSS_CORRIDOR, noDeathBeforeMinute: NO_DEATH_BEFORE_MINUTE },
  renderer: renderers[0] ?? null,
  rendererOk,
  runCount: runs.length,
  completedCount: completed.length,
  runs,
  endLevels,
  bossRuns: bossRows,
  violations,
  knownViolations,
  unknownViolations,
  accepted: unknownViolations.length === 0 && jsErrors.length === 0 && completedCountOk(),
  jsErrors,
};
function completedCountOk() {
  return completed.length === runs.length;
}
const out = `shots/m10-balance-corridor-${MODE}.json`;
writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  mode: MODE, renderer: renderers[0], runCount: runs.length, completedCount: completed.length,
  endLevels, accepted: summary.accepted, unknownViolations, knownViolations, jsErrors,
  bossDurations: bossFlat.map((b) => `${b.character}/${b.seed} ${b.name}: ${b.durationSec ?? "?"}s (defeated=${b.defeated})`),
}, null, 2));

await browser.close();
server.stop();
process.exit(summary.accepted ? 0 : 1);
