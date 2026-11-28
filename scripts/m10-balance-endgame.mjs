#!/usr/bin/env node
/**
 * Lane m10-balance-endgame: Endzeit-Messung (Vorher/Nachher, gleiche Parameter).
 * Lane m10-balance-band-verify: Verifikation auf main NACH dem Merge
 * (Renderer-String-Pflicht + Boss-Dauern ergaenzt, Spielparameter unveraendert).
 *
 *   node scripts/m10-balance-endgame.mjs before   # -> shots/m10-balance-band-before.json
 *   node scripts/m10-balance-endgame.mjs after    # -> shots/m10-balance-band-after.json
 *
 * Parameter (in beiden Messungen identisch): autoPlay, KEIN god, timeScale 30,
 * Seeds 101/7/42, Charaktere mira+kael, Viewport 960x540 @dpr 1 (wie balance.mjs).
 *
 * Zielmetrik (VOR der Vorher-Messung festgelegt, siehe docs/lanes/m10-balance-endgame.md):
 *   - ALLE Laeufe: Endzeit (Tod oder Morgendaemmerung) in [25, 40] Sim-Minuten.
 *   - Streuung max-min ueber alle Laeufe <= 4 min.
 *
 * Laeuft OHNE flock (Balance mit festen Substeps, siehe lanes/common.md).
 * Genutzt werden nur die gemeinsamen Harness-Helfer (scripts/harness.mjs, fremde Datei nur benutzt).
 */
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const PHASE = (process.argv[2] ?? "before") === "after" ? "after" : "before";
const SCALE = 30;
const SEEDS = [101, 7, 42];
const CHARS = ["mira", "kael"];
const VIEWPORT = { width: 960, height: 540 };
const DPR = 1;
/** Endzeit-Fenster in Sim-Minuten. */
const WINDOW = [25, 40];
/** Erlaubte Streuung (max-min) in Sim-Minuten. */
const SPREAD_MAX = 4;
/** Hartes Wandzeit-Limit je Lauf (30x: 30 Sim-min ~ 65 s; Puffer fuer Level-ups/Truhen). */
const WALL_LIMIT_MS = 170000;
/** Boss-Dauerkorridor (erster Auftritt je Boss), siehe docs/lanes/m10-balance-band-verify.md. */
const BOSS_CORRIDOR = [20, 60];
/** Boss-Namen wie src/data/bosses.ts (fuer lesbare Ausgabe). */
const BOSS_NAMES = ["Moorkönigin", "Knochenfürst", "Der Fahle Hirte", "Glockenturm-Golem", "Hexenzirkel", "Der Hohle König"];

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];

async function runOnce(seed, character) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(m.text()); });
  const started = Date.now();
  const trace = { seed, character, outcome: null, endMinute: null, endSecond: null };
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${seed}`);
    await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
    await waitForScene(page, "title");
    // K1 (m10-balance-band-verify): WebGL-Renderer-String VOR jedem Lauf belegen.
    // SwiftShader-Belege sind ungueltig (Dom 19:20Z) und werden unten markiert.
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
      // K3 (m10-balance-band-verify): exakte Boss-Todeszeiten (Poll allein hat ~0,5 s Poll-Aufloesung).
      const run = window.__game.scene.getScene("run");
      window.__bandTrace = { bossDeaths: [] };
      run.events.on("bossDefeated", (e) => {
        window.__bandTrace.bossDeaths.push({ index: e.index, at: run.elapsed });
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
            bossDeaths: [...(window.__bandTrace?.bossDeaths ?? [])],
          };
        }
        const results = game?.scene?.getScene("results");
        if (results && results.scene.isActive()) {
          const r = results.result ?? {};
          return { scene: "results", reason: r.reason ?? null, time: r.elapsed ?? 0, level: r.level ?? 0, kills: r.kills ?? 0, character: r.character ?? null, god: r.god ?? null };
        }
        return { scene: "other", time: 0 };
      });
      last = s;
      if (s.scene === "run") lastRun = s;
      if (s.boss) lastSeenByBoss[s.boss.index] = s.time;
      if (s.scene === "results") {
        trace.outcome = s.reason === "dawn" ? "dawn" : s.reason === "giveup" ? "giveup" : "death";
        trace.endSecond = Math.round(s.time * 10) / 10;
        trace.result = { reason: s.reason, level: s.level, kills: s.kills, god: s.god, character: s.character };
        break;
      }
      if (s.scene !== "run") break;
    }
    // K3: Spawn-/Todeszeiten des letzten Run-Samples + Sichtungsenden je Boss mitnehmen.
    trace.bossesSpawned = lastRun?.bossesSpawned ?? [];
    trace.bossDeaths = lastRun?.bossDeaths ?? [];
    trace.lastSeenByBoss = lastSeenByBoss;
    if (!trace.outcome && last) {
      // Wandzeit-Limit oder Szenen-Verlust: ehrlich als Timeout melden, nicht als Ergebnis.
      trace.outcome = "timeout";
      trace.endSecond = Math.round((last.time ?? 0) * 10) / 10;
    }
  } finally {
    trace.pageErrors = pageErrors;
    trace.wallSeconds = Math.round((Date.now() - started) / 100) / 10;
    await page.close();
  }
  trace.endMinute = Math.round((trace.endSecond / 60) * 100) / 100;
  errors.push(...pageErrors.map((e) => `${character}/${seed}: ${e}`));
  return trace;
}

/** K3: Boss-Dauern (erster Auftritt je Boss) aus Spawn-/Todeszeiten + letzter Sichtungs. */
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
    console.log(`[m10-balance-endgame] Run ${character} seed ${seed} (${PHASE}) ...`);
    const t = await runOnce(seed, character);
    console.log(`[m10-balance-endgame]   -> ${t.outcome} @ ${t.endMinute} min, Level ${t.result?.level ?? "?"}, ${t.wallSeconds}s wall`);
    runs.push(t);
  }
}

const valid = runs.filter((r) => r.outcome === "dawn" || r.outcome === "death");
const endMinutes = valid.map((r) => r.endMinute);
const spread = endMinutes.length ? Math.round((Math.max(...endMinutes) - Math.min(...endMinutes)) * 100) / 100 : null;
const inWindow = valid.map((r) => r.endMinute >= WINDOW[0] && r.endMinute <= WINDOW[1]);
const allInWindow = valid.length === runs.length && inWindow.every(Boolean);
const spreadOk = spread != null && spread <= SPREAD_MAX;

// K1: SwiftShader-Belege sind ungueltig (Dom 19:20Z).
const renderers = [...new Set(runs.map((r) => r.renderer))];
const rendererOk = renderers.length === 1 && renderers[0] != null && !/swiftshader/i.test(renderers[0]);
// K3: Boss-Dauern je Lauf; Korridor gilt fuer jeden gelieferten Boss mit messbarer Dauer.
const bossRows = runs.map((r) => ({ character: r.character, seed: r.seed, bosses: bossDurations(r) }));
const bossDurationsFlat = bossRows.flatMap((row) => row.bosses.map((b) => ({ ...b, character: row.character, seed: row.seed })));
const measured = bossDurationsFlat.filter((b) => b.durationSec != null);
const bossCorridorOk = measured.length > 0 && measured.every((b) => b.inCorridor);

const summary = {
  lane: "m10-balance-band-verify",
  phase: PHASE,
  generatedAt: new Date().toISOString(),
  parameters: { scale: SCALE, seeds: SEEDS, characters: CHARS, viewport: [VIEWPORT.width, VIEWPORT.height], dpr: DPR, autoPlay: true, god: false },
  targetMetric: { windowMinutes: WINDOW, spreadMaxMinutes: SPREAD_MAX, bossCorridorSec: BOSS_CORRIDOR },
  renderer: renderers[0] ?? null,
  rendererOk,
  runs,
  endMinutes,
  spread,
  allInWindow,
  spreadOk,
  bossRuns: bossRows,
  bossCorridorOk,
  accepted: allInWindow && spreadOk && errors.length === 0 && rendererOk,
  jsErrors: errors,
};
const out = `shots/m10-balance-band-${PHASE}.json`;
writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  phase: PHASE, renderer: renderers[0], rendererOk,
  endMinutes, spread, allInWindow, spreadOk, bossCorridorOk, accepted: summary.accepted, jsErrors: errors,
  bossDurations: bossDurationsFlat.map((b) => `${b.character}/${b.seed} ${b.name}: ${b.durationSec ?? "?"}s (defeated=${b.defeated})`),
}, null, 2));

await browser.close();
server.stop();
process.exit(errors.length > 0 ? 1 : 0);
