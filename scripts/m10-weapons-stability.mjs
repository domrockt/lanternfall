#!/usr/bin/env node
// M10-weapons-stable Lane: reproduziert den timing-flaky Check `chest-roll-names`
// aus scripts/verify-weapons.mjs. Serialisiert N Läufe unter optionaler CPU-Last
// und schreibt PASS/FAIL + Messzeiten nach shots/m10-weapons-stability.json.
//
// Start (ohne flock, kein FPS-Messlauf):
//   node scripts/m10-weapons-stability.mjs --runs 12 --load 16
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? Number(process.argv[idx + 1]) : fallback;
}

const RUNS = arg("runs", 12);
const LOAD = arg("load", 16);
const RUN_TIMEOUT_MS = arg("timeout", 240_000);
const OUT = "shots/m10-weapons-stability.json";

mkdirSync("shots", { recursive: true });

/** Startet CPU-Spinner, damit der Check unter derselben Last wie ACCEPTANCE flakt. */
function startLoad(n) {
  const kids = [];
  for (let i = 0; i < n; i++) {
    kids.push(
      spawn(process.execPath, ["-e", "for(;;){}"], {
        stdio: "ignore",
        detached: false,
      }),
    );
  }
  return kids;
}

function stopLoad(kids) {
  for (const kid of kids) {
    try { kid.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
}

/** Führt einen verify-weapons-Lauf aus und liefert stdout/stderr. */
function runVerify() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/verify-weapons.mjs"], {
      env: { ...process.env, M10_CHEST_ONLY: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* egal */ }
    }, RUN_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

/** Schneidet das letzte JSON-Summary aus dem Log (verify-weapons druckt es am Ende). */
function parseSummary(out) {
  const marker = '{\n  "weapons"';
  const at = out.lastIndexOf(marker);
  if (at < 0) return null;
  try {
    return JSON.parse(out.slice(at));
  } catch {
    return null;
  }
}

const kids = LOAD > 0 ? startLoad(LOAD) : [];
const runs = [];
try {
  for (let i = 1; i <= RUNS; i++) {
    const startedAt = Date.now();
    const { code, out, err } = await runVerify();
    const finishedAt = Date.now();
    const summary = parseSummary(out);
    const failed = summary?.failed ?? ["<kein Summary>"];
    const rollNames = Boolean(summary?.rollNames);
    const passed = Boolean(summary?.passed) && code === 0;
    const timing = summary?.chestTiming ?? null;
    runs.push({
      run: i,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      passed,
      rollNames,
      failed,
      exitCode: code,
      panelVisibleMs: timing?.panelVisibleMs ?? null,
      rollNamesReadyMs: timing?.rollNamesReadyMs ?? null,
      checkReadMs: timing?.checkReadMs ?? null,
      stderrTail: err.trim().split("\n").slice(-3).join("\n"),
    });
    const verdict = passed ? "PASS" : "FAIL";
    console.log(`Lauf ${i}/${RUNS}: ${verdict} rollNames=${rollNames} failed=${failed.join(",") || "-"} dauer=${finishedAt - startedAt} ms`);
  }
} finally {
  stopLoad(kids);
}

const fails = runs.filter((r) => !r.passed).length;
const report = {
  lane: "m10-weapons-stable",
  generatedAt: new Date().toISOString(),
  config: { runs: RUNS, cpuLoadProcs: LOAD, runTimeoutMs: RUN_TIMEOUT_MS, chestOnly: true },
  summary: {
    runs: runs.length,
    fails,
    passes: runs.length - fails,
    flakeRate: runs.length ? fails / runs.length : 0,
  },
  runs,
};
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n${JSON.stringify(report.summary, null, 2)}`);
console.log(`JSON: ${OUT}`);
process.exit(fails === 0 ? 0 : 1);
