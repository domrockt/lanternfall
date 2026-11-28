#!/usr/bin/env node
/**
 * M10-Level-Ziel-Messung (Lane m10-level-target-balance):
 *
 *   node scripts/m10-level-target.mjs --tag before
 *   node scripts/m10-level-target.mjs --tag after
 *
 * Misst die Level/Zeit-Kurve im 30-Minuten-Run: timeScale 30, autoPlay, god
 * (god isoliert die XP-Kurve vom Todes-Rauschen des Kite-Bots; kein Eingriff
 * in XP oder Gegnerwerte). Seeds 101/202/404, je Charakter mira+kael.
 * Protokolliert pro Sim-Minute Level/XP/Kills und den Zeitpunkt, an dem
 * Level 30 erstmals erreicht wird. Ausgabe: shots/m10-level-target-<tag>.json.
 *
 * Zielband (ACCEPTANCE A5): Level bei Minute 30 in [25, 40] fuer alle Laeufe;
 * Sekundaer: Level 30 zwischen Minute 28 und 31.
 * Laufzeit ~4-6 min real. Kein flock (keine FPS-/Echtzeit-Messung, feste Substeps).
 */
import { writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const SCALE = 30;
const POLL_MS = 300;
const RUN_DEADLINE_MS = 220000;
const TARGET_SIM_SECONDS = 1800;
const BAND = [25, 40];
const LEVEL30_WINDOW_MIN = [28, 31];

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const seeds = String(argOf("seeds", "101,202,404")).split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
const chars = String(argOf("chars", "kael,mira")).split(",").map((s) => s.trim()).filter(Boolean);

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];

async function openRun(page, seed, character) {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${seed}`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.keyboard.press(character === "kael" ? "2" : "1");
  await page.keyboard.press("Enter");
  await waitForScene(page, "run");
  await page.evaluate(() => {
    window.__lf.autoPlay(true);
    window.__lf.god(true);
    window.__lf.setTimeScale(30);
  });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const game = window.__game;
    const run = game?.scene?.getScene("run");
    if (run && run.scene.isActive()) {
      const hud = run.getHudState();
      return { scene: "run", time: hud.time, level: hud.level, xp: hud.xp, xpNeed: hud.xpNeed, kills: hud.kills };
    }
    const results = game?.scene?.getScene("results");
    if (results && results.scene.isActive()) {
      const r = results.result ?? {};
      return { scene: "results", time: r.elapsed ?? 0, level: r.level ?? 0, kills: r.kills ?? 0, reason: r.reason ?? null };
    }
    return { scene: "other", time: 0, level: 0 };
  });
}

async function runOnce(seed, character) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const trace = { seed, character, samples: [], level30AtMin: null, outcome: null, final: null };
  try {
    await openRun(page, seed, character);
    const started = Date.now();
    let nextMinute = 1;
    while (Date.now() - started < RUN_DEADLINE_MS) {
      await page.waitForTimeout(POLL_MS);
      const s = await snapshot(page);
      if (s.scene === "results") { trace.outcome = s.reason ?? "results"; trace.final = s; break; }
      if (s.scene !== "run") continue;
      while (s.time >= nextMinute * 60) {
        trace.samples.push({ min: nextMinute, t: Math.round(s.time), level: s.level, xp: Math.round(s.xp), xpNeed: s.xpNeed, kills: s.kills });
        nextMinute += 1;
      }
      if (trace.level30AtMin === null && s.level >= 30) {
        trace.level30AtMin = Math.round((s.time / 60) * 10) / 10;
      }
      if (s.time >= TARGET_SIM_SECONDS) { trace.outcome = "reached30min"; trace.final = s; break; }
    }
    if (!trace.final) {
      // Deadline-Schnitt: letzten bekannten Zustand als final werten.
      const s = await snapshot(page);
      trace.outcome = trace.outcome ?? "deadline";
      trace.final = s;
    }
  } finally {
    await page.close();
  }
  trace.samples = trace.samples.slice(0, 30);
  return trace;
}

const runs = [];
for (const seed of seeds) {
  for (const character of chars) {
    const trace = await runOnce(seed, character);
    const levelAt30 = trace.samples.find((s) => s.min === 30)?.level ?? trace.final?.level ?? null;
    const inBand = levelAt30 !== null && levelAt30 >= BAND[0] && levelAt30 <= BAND[1];
    const l30ok = trace.level30AtMin !== null && trace.level30AtMin >= LEVEL30_WINDOW_MIN[0] && trace.level30AtMin <= LEVEL30_WINDOW_MIN[1];
    runs.push({ ...trace, levelAt30, inBand, level30InWindow: l30ok });
    console.log(`[m10-level-target] seed=${seed} char=${character} level@30=${levelAt30} inBand=${inBand} level30At=${trace.level30AtMin}min outcome=${trace.outcome}`);
  }
}

const measured = runs.filter((r) => r.levelAt30 !== null);
const summary = {
  milestone: "M10",
  lane: "m10-level-target-balance",
  tag: TAG,
  scale: SCALE,
  mode: "autoPlay+god+30x, Gegnerwerte unveraendert",
  band: BAND,
  level30WindowMin: LEVEL30_WINDOW_MIN,
  runs: runs.map((r) => ({
    seed: r.seed, character: r.character, levelAt30: r.levelAt30, inBand: r.inBand,
    level30AtMin: r.level30AtMin, level30InWindow: r.level30InWindow,
    outcome: r.outcome, kills: r.final?.kills ?? null,
    curve: r.samples.map((s) => [s.min, s.level]),
  })),
  inBandCount: measured.filter((r) => r.inBand).length,
  measuredCount: measured.length,
  jsErrors: errors,
  passed: measured.length >= 3 && measured.every((r) => r.inBand) && errors.length === 0,
};
writeFileSync(`shots/m10-level-target-${TAG}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ passed: summary.passed, inBandCount: summary.inBandCount, measuredCount: summary.measuredCount }, null, 2));

await browser.close();
server.stop();
process.exit(summary.passed ? 0 : 1);
