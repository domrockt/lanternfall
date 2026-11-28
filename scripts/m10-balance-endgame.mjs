#!/usr/bin/env node
/**
 * Lane m10-balance-endgame: Endzeit-Messung (Vorher/Nachher, gleiche Parameter).
 *
 *   node scripts/m10-balance-endgame.mjs before   # -> shots/m10-balance-endgame-before.json
 *   node scripts/m10-balance-endgame.mjs after    # -> shots/m10-balance-endgame-after.json
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
    await page.keyboard.press("Enter");
    await waitForScene(page, "charselect");
    await page.keyboard.press(character === "kael" ? "2" : "1");
    await page.keyboard.press("Enter");
    await waitForScene(page, "run");
    await page.evaluate((scale) => {
      window.__lf.autoPlay(true);
      window.__lf.god(false);
      window.__lf.setTimeScale(scale);
    }, SCALE);

    let last = null;
    while (Date.now() - started < WALL_LIMIT_MS) {
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => {
        const game = window.__game;
        const run = game?.scene?.getScene("run");
        if (run && run.scene.isActive()) {
          const hud = run.getHudState();
          return { scene: "run", time: hud.time, level: hud.level, kills: hud.kills, enemies: hud.enemies, dawn: hud.dawn };
        }
        const results = game?.scene?.getScene("results");
        if (results && results.scene.isActive()) {
          const r = results.result ?? {};
          return { scene: "results", reason: r.reason ?? null, time: r.elapsed ?? 0, level: r.level ?? 0, kills: r.kills ?? 0, character: r.character ?? null, god: r.god ?? null };
        }
        return { scene: "other", time: 0 };
      });
      last = s;
      if (s.scene === "results") {
        trace.outcome = s.reason === "dawn" ? "dawn" : "death";
        trace.endSecond = Math.round(s.time * 10) / 10;
        trace.result = { reason: s.reason, level: s.level, kills: s.kills, god: s.god, character: s.character };
        break;
      }
      if (s.scene !== "run") break;
    }
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

const summary = {
  lane: "m10-balance-endgame",
  phase: PHASE,
  generatedAt: new Date().toISOString(),
  parameters: { scale: SCALE, seeds: SEEDS, characters: CHARS, viewport: [VIEWPORT.width, VIEWPORT.height], dpr: DPR, autoPlay: true, god: false },
  targetMetric: { windowMinutes: WINDOW, spreadMaxMinutes: SPREAD_MAX },
  runs,
  endMinutes,
  spread,
  allInWindow,
  spreadOk,
  accepted: allInWindow && spreadOk && errors.length === 0,
  jsErrors: errors,
};
const out = `shots/m10-balance-endgame-${PHASE}.json`;
writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ phase: PHASE, endMinutes, spread, allInWindow, spreadOk, accepted: summary.accepted, jsErrors: errors }, null, 2));

await browser.close();
server.stop();
process.exit(errors.length > 0 ? 1 : 0);
