#!/usr/bin/env node
// Flake-Sweep (Karte #13870): fuehrt die volle Test-Suite (`npm test`) 3x aus,
// je Lauf unter flock (Muster perf.mjs, Wartezeit begrenzt -w 900), und schreibt
// je Lauf ein Summary-JSON nach shots/m10-v10-flake-sweep-run{1,2,3}.json:
// Pass/Fail-Zahl, Dauer, Liste FAILender Tests (Testname + Fehlerklasse).
// Kein sleep-Warten: jeder Lauf laeuft synchron mit hartem Timeout (900 s).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const RUNS = 3;
const LOCK = "/home/ai/games/.lf-perf.lock";
// common.md (2026-11-28): Tests laufen OHNE flock (nur FPS/Echtzeit unter der
// Sperre) — sonst blockiert eine Lane die andere. Erster Versuch mit flock -w 900
// verbrannte 3x900s auf fremdbelegter Sperre ohne einen einzigen Test (18:11Z).
// Opt-in fuer Kontrollzwecke: FLAKE_SWEEP_FLOCK=1.
const USE_FLOCK = process.env.FLAKE_SWEEP_FLOCK === "1";
const LOCK_WAIT_S = 900; // flock -w 900 (nur bei USE_FLOCK)
const RUN_TIMEOUT_S = 900; // harter Timeout je Suite-Lauf
const OUT_DIR = resolve(ROOT, "shots");
const RAW_DIR = resolve(tmpdir(), "m10-v10-flake-sweep");
const LOG_DIR = resolve(process.env.HOME ?? tmpdir(), "tmp");

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });

const classify = (msg) => {
  const m = String(msg ?? "");
  if (/timed out|timeout exceeded|Test timed out/i.test(m)) return "Timeout";
  if (/Cannot find module|is not a function|is not defined|Cannot read propert/i.test(m))
    return "Error";
  if (/seq|order|beforeEach|afterEach|repeat|duplicate/i.test(m)) return "Reihenfolge";
  return "Assertion";
};

const short = (s, n = 400) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};

// Pfad zur Testdatei aus vitest-JSON: absolut -> repo-relativ
const relFile = (abs) => {
  const rel = relative(ROOT, String(abs ?? ""));
  return rel.startsWith("..") ? String(abs ?? "") : rel;
};

const runOnce = (i) => {
  const raw = resolve(RAW_DIR, `run${i}.json`);
  const log = resolve(LOG_DIR, `m10-v10-flake-sweep-run${i}.log`);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const testCmd = `npm test -- --reporter=default --reporter=json --outputFile=${raw}`;
  const cmd = USE_FLOCK ? `flock -w ${LOCK_WAIT_S} ${LOCK} ${testCmd}` : testCmd;
  const res = spawnSync("bash", ["-lc", cmd], {
    cwd: ROOT,
    timeout: (USE_FLOCK ? RUN_TIMEOUT_S + LOCK_WAIT_S : RUN_TIMEOUT_S) * 1000,
    encoding: "utf8",
  });
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - t0;
  writeFileSync(log, res.stdout + "\n=== STDERR ===\n" + res.stderr + "\n");

  const summary = {
    run: i,
    cmd,
    startedAt,
    finishedAt,
    durationMs,
    exitCode: res.status,
    killed: res.error?.code === "ETIMEDOUT" || res.signal != null,
    log,
    numTotalTests: null,
    numPassedTests: null,
    numFailedTests: null,
    suiteError: null,
    failures: [],
  };

  let rawJson = null;
  try {
    rawJson = JSON.parse(readFileSync(raw, "utf8"));
  } catch {
    // kein/ungueltiges vitest-JSON (z. B. Crash vor Reporter-Ausgabe)
  }

  if (rawJson) {
    summary.numTotalTests = rawJson.numTotalTests ?? null;
    summary.numPassedTests = rawJson.numPassedTests ?? null;
    summary.numFailedTests = rawJson.numFailedTests ?? null;
    for (const tr of rawJson.testResults ?? []) {
      if (tr.status === "failed" && !(tr.assertionResults ?? []).some((a) => a.status === "failed")) {
        // Suite-/Datei-Fehler ohne einzelnen failed Test (z. B. Import-Fehler)
        summary.failures.push({
          file: relFile(tr.name),
          test: "(ganze Datei)",
          errorClass: "Error",
          message: short(tr.message ?? tr.failureMessages?.[0]),
        });
      }
      for (const a of tr.assertionResults ?? []) {
        if (a.status === "failed") {
          const msg = (a.failureMessages ?? []).find((m) => String(m).trim()) ?? "";
          summary.failures.push({
            file: relFile(tr.name),
            test: (a.ancestorTitles ?? []).concat(a.title ?? []).join(" > "),
            errorClass: classify(msg),
            message: short(msg),
          });
        }
      }
    }
  } else {
    summary.suiteError = short(res.stderr || res.stdout || "(keine Ausgabe)", 600);
  }

  const out = resolve(OUT_DIR, `m10-v10-flake-sweep-run${i}.json`);
  writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
  console.log(
    `[flake-sweep] Lauf ${i}/${RUNS}: exit=${res.status} total=${summary.numTotalTests} ` +
      `pass=${summary.numPassedTests} fail=${summary.numFailedTests} ` +
      `failures=${summary.failures.length} -> ${basename(out)}`
  );
  return summary;
};

const all = [];
for (let i = 1; i <= RUNS; i++) all.push(runOnce(i));

const total = all.reduce((s, r) => s + (r.numTotalTests ?? 0), 0);
const fails = all.reduce((s, r) => s + (r.numFailedTests ?? 0), 0);
const flakyFiles = new Set(all.flatMap((r) => r.failures.map((f) => f.file)));
console.log(`[flake-sweep] Gesamtergebnis: ${RUNS} Laeufe, ${total} Testausfuehrungen, ${fails} FAILs, ${flakyFiles.size} betroffene Dateien`);
process.exit(0); // Befund-Sammlung: FAILs sind Ergebnis, kein Skript-Fehler
