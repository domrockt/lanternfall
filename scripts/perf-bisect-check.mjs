#!/usr/bin/env node
// Bisect-Predikat fuer scripts/perf-bisect.sh:
// Laeuft `npm run perf` im aktuellen (Bisect-)Worktree mit gepinnter Harness-Datei
// aus der Lane und entscheidet anhand des gewaehlten Kriteriums.
//
// Env:
//   LANE_PERF           absoluter Pfad zu scripts/perf.mjs der Lane
//   BISECT_CRITERION    "minute25" (Default, >=55 FPS) oder "burst" (>=55 FPS)
//   BISECT_MIN_ENEMIES  Mindest-Gegner (Default: minute25 300, burst 500)
//
// Exit: 0 = gut, 1 = schlecht, 125 = unbrauchbar (Build/Fehler -> skip).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const perf = process.env.LANE_PERF;
const criterion = process.env.BISECT_CRITERION || "minute25";
if (!perf) {
  console.error("LANE_PERF fehlt");
  process.exit(125);
}
const out = join(tmpdir(), `lf-bisect-${process.pid}.json`);
let buildOrPerfFailed = false;
try {
  execFileSync("flock", [
    "/home/ai/games/.lf-perf.lock",
    "node", perf, "--viewport", "640x360", "--dpr", "1", "--out", out,
  ], {
    stdio: "inherit",
    timeout: 240000,
  });
} catch {
  buildOrPerfFailed = true;
}

let result;
try {
  result = JSON.parse(readFileSync(out, "utf8"));
} catch {
  console.error("perf-Ergebnis fehlt/unlesbar -> skip");
  process.exit(125);
} finally {
  // perf.mjs schreibt shots/perf-*.png in den Worktree; das blockiert den
  // naechsten `git bisect`-Checkout. Nach jeder Messung aufraeumen.
  try {
    execFileSync("git", ["checkout", "--", "shots"], { stdio: "ignore" });
    execFileSync("git", ["clean", "-fdq", "shots"], { stdio: "ignore" });
  } catch { /* nichts zu tun */ }
}

const phase = criterion === "burst" ? result.burst : result.minute25;
const minEnemies = Number(
  process.env.BISECT_MIN_ENEMIES || (criterion === "burst" ? 500 : 300),
);
if (!phase || typeof phase.fps !== "number") {
  console.error("Phase fehlt -> skip");
  process.exit(125);
}
const good = phase.fps >= 55 && phase.minEnemies >= minEnemies;
console.log(`BISECT ${criterion}: fps=${phase.fps} minEnemies=${phase.minEnemies} gut=${good}`);
// Ein Build-Fehler ohne Messwert ist unbrauchbar, nicht "schlecht".
if (buildOrPerfFailed && !phase) process.exit(125);
writeFileSync(out, JSON.stringify(result, null, 2));
process.exit(good ? 0 : 1);
