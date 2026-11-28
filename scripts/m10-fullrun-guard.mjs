#!/usr/bin/env node
// M10-Abnahme-Wächter (Lane m10-fullrun-guard): beschleunigter 30-min-Sim-Lauf
// (autoPlay + timeScale 30, Muster scripts/fullrun.mjs), der die Inhaltstore aus
// ACCEPTANCE.md prüft und ein Maschinen-JSON schreibt. Reines Mess-Skript —
// kein Balance-/Spielcode-Eingriff.
//
// Harte Tore (Exit 1 bei jeder Verletzung):
//   - 6/6 Bosse bei 300/600/900/1200/1500/1800 s (±2 s)
//   - 6 Bosse besiegt, 6 Truhen
//   - Sieg mit resultReason=dawn
//   - 0 JS-Fehler (pageerror + console.error)
//   - Heap Minute 1 -> Ende <= +15 % (JS-Heap nach erzwungenem GC)
//
// Die Tor-Definitionen sind rein und unit-getestet (tests/fullrun-guard.test.ts);
// der Browser-Lauf läuft nur, wenn das Skript direkt gestartet wird:
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-fullrun-guard.mjs \
//     --out shots/m10-fullrun-guard-baseline.json
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ---------- Tore (rein, kein Node-/Browser-I/O) ----------
export const BOSS_SECONDS = [300, 600, 900, 1200, 1500, 1800];
export const BOSS_NAMES = ["Moorkönigin", "Knochenfürst", "Der Fahle Hirte", "Glockenturm-Golem", "Hexenzirkel", "Der Hohle König"];
export const CHEST_TARGET = 6;
export const HEAP_TARGET_PCT = 15;
export const BOSS_TOLERANCE_S = 2;

/** Soll/Ist je Bosswelle: Spawn-Sekunde muss innerhalb ±2 s liegen. */
export function bossSpawnReport(bossesSpawned) {
  const list = Array.isArray(bossesSpawned) ? bossesSpawned : [];
  return BOSS_SECONDS.map((expected, i) => {
    const spawn = list.find((b) => b && b.index === i) ?? null;
    const actual = spawn && Number.isFinite(spawn.at) ? spawn.at : null;
    return {
      index: i,
      name: BOSS_NAMES[i] ?? `boss${i}`,
      expectedSecond: expected,
      actualSecond: actual,
      ok: actual !== null && Math.abs(actual - expected) <= BOSS_TOLERANCE_S,
    };
  });
}

/** Heap-Zuwachs Minute 1 -> Ende in Prozent; null, wenn nicht messbar. */
export function heapDeltaPct(minute1MB, endMB) {
  if (!(minute1MB > 0) || !(endMB > 0)) return null;
  return Math.round(((endMB - minute1MB) / minute1MB) * 1000) / 10;
}

/**
 * Prüft alle Abnahme-Tore gegen ein Maschinen-JSON (Schema wie der
 * Guard-Lauf schreibt). Liefert { passed, gates, failures } — FAILED-Gatter
 * stehen namentlich in failures.
 */
export function evaluateGuardGates(data = {}) {
  const bossReport = bossSpawnReport(data.bossesSpawned);
  const bossesSpawnedOk = bossReport.every((b) => b.ok);
  const defeated = Number(data.bossesDefeated ?? 0);
  const chests = Number(data.chestsDropped ?? 0);
  const jsErrors = Array.isArray(data.jsErrors) ? data.jsErrors : [];
  const delta = heapDeltaPct(data.heap?.minute1MB, data.heap?.endMB);
  const resultReason = data.resultReason ?? null;

  const gates = [
    { gate: "bosses-6-timing", ok: bossesSpawnedOk, actual: bossReport.map((b) => b.actualSecond), target: BOSS_SECONDS, detail: `6/6 Wellen bei ${BOSS_SECONDS.join("/")} s ±${BOSS_TOLERANCE_S} s` },
    { gate: "bosses-defeated", ok: defeated >= 6, actual: defeated, target: ">= 6" },
    { gate: "chests-6", ok: chests >= CHEST_TARGET, actual: chests, target: `>= ${CHEST_TARGET}` },
    { gate: "victory-dawn", ok: resultReason === "dawn", actual: resultReason, target: "dawn" },
    { gate: "js-errors-0", ok: jsErrors.length === 0, actual: jsErrors.length, target: 0 },
    { gate: "heap-growth", ok: delta !== null && delta <= HEAP_TARGET_PCT, actual: delta, target: `<= +${HEAP_TARGET_PCT} %` },
  ];
  return {
    passed: gates.every((g) => g.ok),
    gates,
    failures: gates.filter((g) => !g.ok).map((g) => g.gate),
    bossReport,
    heapDeltaPct: delta,
  };
}

// ---------- Messlauf (nur bei direktem Start) ----------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { ensureBuild, startServer, loadPlaywright, startRun } = await import("./harness.mjs");
  ensureBuild();

  const argv = process.argv.slice(2);
  const argOf = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const OUT = argOf("out", "shots/m10-fullrun-guard-baseline.json");
  const SEED = Number(argOf("seed", "99"));
  const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
  const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
  const POLL_MS = 500;
  const TIME_SCALE = 30;

  mkdirSync("shots", { recursive: true });
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  let summary = null;
  let exitCode = 1;
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
    await startRun(page);
    await page.evaluate(({ evolutions, passives, timeScale }) => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
      for (const id of evolutions) window.__lf.addWeapon(id, 8);
      for (const id of passives) window.__lf.addPassive(id, 5);
      window.__lf.setTimeScale(timeScale);
    }, { evolutions: EVOLUTIONS, passives: PASSIVES, timeScale: TIME_SCALE });

    // Heap nach erzwungenem GC, dreifach gemessen (kleinster Wert = gehaltener Heap).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("HeapProfiler.enable");
    const heapOnce = async () => {
      await cdp.send("HeapProfiler.collectGarbage");
      const jsUsed = await page.evaluate(() => {
        if (typeof globalThis.gc === "function") globalThis.gc();
        return Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10;
      });
      const usage = await cdp.send("Runtime.getHeapUsage");
      return { jsMB: jsUsed, cdpMB: Math.round((usage.usedSize / 1048576) * 10) / 10 };
    };
    const heapAt = async () => {
      let best = await heapOnce();
      for (let i = 0; i < 2; i++) {
        const s = await heapOnce();
        if (s.jsMB < best.jsMB) best = s;
      }
      return best;
    };
    const heapStart = await heapAt();
    let heapMinute1 = null;
    let heapMinute29 = null;

    const started = Date.now();
    let lastTime = 0;
    let lastRunState = null;
    let result = null;
    let fatal = null;
    try {
      while (Date.now() - started < 240000) {
        await page.waitForTimeout(POLL_MS);
        const s = await page.evaluate(() => window.__lf.stats());
        if (!s) continue;
        lastTime = s.time;
        if (s.scene === "run") {
          lastRunState = s;
          if (s.time >= 60 && heapMinute1 === null) heapMinute1 = await heapAt();
          if (s.time >= 29 * 60 && heapMinute29 === null) heapMinute29 = await heapAt();
        } else if (s.scene === "results") {
          result = await page.evaluate(() => {
            const scene = window.__game.scene.getScene("results");
            return { ...scene.result, dawn: Boolean(scene.result?.reason === "dawn") };
          });
          await page.screenshot({ path: OUT.replace(/\.json$/, "-results.png") });
          break;
        }
      }
    } catch (e) {
      fatal = String(e);
    }

    // Endzustand des Runs: bei hoher Zeitskalierung liegt der letzte Poll oft
    // vor Boss 6 – deshalb den beim Run-Ende konservierten State nutzen.
    const finalRun = (await page.evaluate(() => window.__lf.finalState())) ?? lastRunState;
    const heapEnd = await heapAt();

    const spawned = (finalRun?.bossesSpawned ?? []).map((b) => ({
      name: BOSS_NAMES[b.index] ?? `boss${b.index}`,
      index: b.index,
      expectedSecond: BOSS_SECONDS[b.index] ?? null,
      actualSecond: b.at,
    }));

    summary = {
      lane: "m10-fullrun-guard",
      kind: "guard-run",
      seed: SEED,
      timeScale: TIME_SCALE,
      viewport: { width: 960, height: 540, dpr: 1 },
      simMinutes: Math.round(((finalRun?.time ?? lastTime) / 60) * 10) / 10,
      elapsedRealSeconds: Math.round((Date.now() - started) / 1000),
      completed: result !== null,
      fatal,
      bossesSpawned: (finalRun?.bossesSpawned ?? []).map((b) => ({ index: b.index, at: b.at })),
      bossesDefeated: finalRun?.bossesDefeated ?? 0,
      bossFlags: finalRun?.bossFlags ?? [],
      chestsDropped: finalRun?.chestsDropped ?? 0,
      elitesSpawned: finalRun?.elitesSpawned ?? 0,
      kills: finalRun?.kills ?? result?.kills ?? 0,
      level: finalRun?.level ?? result?.level ?? 0,
      resultReason: result?.reason ?? null,
      heap: {
        startMB: heapStart.jsMB,
        minute1MB: heapMinute1?.jsMB ?? null,
        minute29MB: heapMinute29?.jsMB ?? null,
        endMB: heapEnd.jsMB,
        cdpUsedMB: { start: heapStart.cdpMB, minute1: heapMinute1?.cdpMB ?? null, minute29: heapMinute29?.cdpMB ?? null, end: heapEnd.cdpMB },
      },
      jsErrors: errors,
    };
    summary.gates = evaluateGuardGates(summary);
    summary.passed = summary.gates.passed;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    server.stop();
  }

  writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ out: OUT, passed: summary.passed, failures: summary.gates.failures, simMinutes: summary.simMinutes, bossesSpawned: summary.bossesSpawned, bossesDefeated: summary.bossesDefeated, chestsDropped: summary.chestsDropped, resultReason: summary.resultReason, heap: summary.heap.minute1MB, heapEnd: summary.heap.endMB, heapDeltaPct: summary.gates.heapDeltaPct, jsErrors: summary.jsErrors.length }, null, 2));
  exitCode = summary.passed ? 0 : 1;
  process.exit(exitCode);
}
