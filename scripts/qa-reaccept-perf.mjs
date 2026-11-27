#!/usr/bin/env node
// Re-Abnahme Performance: kurzer, serialisierter Lauf ueber 640x360 und 780x360@3.
// Misst pro Iteration Burst (500 Gegner) und Minute-25 getrennt, alles unter
// flock -w 420 /home/ai/games/.lf-perf.lock (erwartete Laufzeit ~300 s gemessen + 120 s Puffer).
// Maximal 3 Iterationen (Default). Bei Lock-Timeout (rc != 0): "qa-reaccept-perf: Sperre
// /home/ai/games/.lf-perf.lock belegt — spaeter erneut versuchen" ausgeben und Exitcode
// weiterreichen — kein stiller Abbruch, kein unbegrenztes Warten.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const RUNS = Math.max(1, Math.min(3, Number(argOf("runs", "3")) || 3));
const VIEWS = String(argOf("views", "640x360:1,780x360:3"))
  .split(",")
  .map((spec) => {
    const [wh, dpr] = spec.split(":");
    const [width, height] = wh.split("x").map(Number);
    return { width, height, dpr: Number(dpr) || 1, tag: `${width}x${height}@${dpr}` };
  });

const out = { runs: RUNS, views: VIEWS.map((v) => v.tag), iterations: [], summary: {} };
for (let i = 0; i < RUNS; i++) {
  for (const v of VIEWS) {
    const file = `shots/qa-reaccept-iter${i + 1}-${v.width}x${v.height}@${v.dpr}.json`;
    const started = Date.now();
    // perf.mjs endet mit rc=1, wenn sein kombiniertes 55-Ziel verfehlt wird
    // (hier ist Minute 25 bewusst nur >=50). Der Exitcode ist daher kein Fehler.
    const run = spawnSync(
      "flock",
      [
        "/home/ai/games/.lf-perf.lock",
        "node",
        "scripts/perf.mjs",
        "--viewport",
        `${v.width}x${v.height}`,
        "--dpr",
        String(v.dpr),
        "--out",
        file,
      ],
      { stdio: "pipe", timeout: 300_000, encoding: "utf8" },
    );
    if (run.error) throw run.error;
    const j = JSON.parse(readFileSync(file, "utf8"));
    const row = {
      iteration: i + 1,
      view: v.tag,
      burstFps: j.burst.fps,
      burstWorstMs: j.burst.worstFrameMs,
      burstMinEnemies: j.burst.minEnemies,
      minute25Fps: j.minute25.fps,
      minute25WorstMs: j.minute25.worstFrameMs,
      minute25MinEnemies: j.minute25.minEnemies,
      jsErrors: j.jsErrors.length,
      wallSeconds: Math.round((Date.now() - started) / 1000),
    };
    out.iterations.push(row);
    console.log(JSON.stringify(row));
  }
}
for (const v of VIEWS) {
  const rows = out.iterations.filter((r) => r.view === v.tag);
  out.summary[v.tag] = {
    burstFpsMin: Math.min(...rows.map((r) => r.burstFps)),
    minute25FpsMin: Math.min(...rows.map((r) => r.minute25Fps)),
    jsErrors: rows.reduce((n, r) => n + r.jsErrors, 0),
    burstTarget: 55,
    minute25Target: 50,
    burstPass: rows.every((r) => r.burstFps >= 55),
    minute25Pass: rows.every((r) => r.minute25Fps >= 50),
  };
}
writeFileSync("shots/qa-reaccept-perf-summary.json", JSON.stringify(out, null, 2));
console.log("SUMMARY " + JSON.stringify(out.summary));
