#!/usr/bin/env node
/**
 * M10-Persistenz-Probe (Lane m10-meta-persist-guard):
 *
 *   node --experimental-strip-types scripts/m10-meta-persist.mjs shots/m10-meta-persist-<before|after>.json
 *
 * Läuft OHNE Phaser/Browser: importiert src/logic/meta.ts und src/audio/options.ts
 * direkt (nur Typ-Imports, daher per Node-Type-Stripping ladbar) und nutzt einen
 * StorageLike-Stub (in-Memory Map) statt window.localStorage.
 *
 * Prüft:
 *  - recordRun über 5 simulierte Läufe: Monotonie der Bestwerte, Records-Flags,
 *    NaN/undefined-Freiheit (auch bei NaN/Infinity-Eingaben).
 *  - korrupte Meta-Payload (JSON-Müll) -> emptyMeta statt Wurf.
 *  - alle 7 OPTION_ROWS: saveOptions -> loadOptions über 3 Reload-Zyklen identisch.
 *  - Clamp-Grenzen inkl. SCALE_MAX (2..6, Auto=0) und NaN-Eingaben.
 *  - korrupte/teilweise Options-Payload -> DEFAULT_OPTIONS(-Felder).
 *
 * Ausgabe: JSON-Report (Vorher-/Nachher-Beleg der Lane).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { emptyMeta, emptyBest, recordRun, loadMeta, saveMeta, META_KEY } from "../src/logic/meta.ts";
import {
  DEFAULT_OPTIONS, OPTION_ROWS, OPTIONS_KEY, SCALE_MAX,
  clampVolume, clampScale, loadOptions, saveOptions, setOption, stepOption,
} from "../src/audio/options.ts";

/** In-Memory-StorageLike-Stub (gleicher Vertrag wie window.localStorage). */
function memStorage(initial) {
  const map = new Map(Object.entries(initial ?? {}));
  let failNextGet = false;
  return {
    getItem: (k) => {
      if (failNextGet) { failNextGet = false; throw new Error("boom"); }
      return map.has(k) ? map.get(k) : null;
    },
    setItem: (k, v) => { map.set(k, String(v)); },
    _dump: () => Object.fromEntries(map),
    _corrupt: () => { map.set(META_KEY, "{nicht json!!!"); map.set(OPTIONS_KEY, "{{{"); },
    _failGet: () => { failNextGet = true; },
  };
}

/** true, wenn in einem Objekt (flach) kein NaN/undefined vorkommt. */
function noNanUndefined(obj) {
  return Object.values(obj).every((v) =>
    typeof v === "number" ? Number.isFinite(v) : v !== undefined);
}

function scanMeta(meta) {
  const bad = [];
  for (const [char, best] of Object.entries(meta)) {
    for (const [k, v] of Object.entries(best)) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) bad.push(`${char}.${k}=${String(v)}`);
    }
  }
  return bad;
}

// ── 1. recordRun über 5 simulierte Läufe (inkl. Verschlechterung + NaN) ──────
const RUNS = [
  { character: "mira", time: 120.5, kills: 40, level: 6, victory: false },
  { character: "mira", time: 60, kills: 20, level: 3, victory: false },   // schlechter
  { character: "mira", time: 200, kills: 55, level: 9, victory: true },   // besser + Sieg
  { character: "mira", time: Number.NaN, kills: Number.NaN, level: undefined, victory: true }, // Müll
  { character: "kael", time: 90, kills: 30, level: 5, victory: false },
];

let meta = emptyMeta();
const runTrace = [];
const monotonicViolations = [];
const prev = { mira: { ...emptyBest() }, kael: { ...emptyBest() } };
for (let i = 0; i < RUNS.length; i++) {
  const res = recordRun(meta, RUNS[i]);
  meta = res.meta;
  const b = meta[RUNS[i].character];
  for (const k of ["time", "kills", "level"]) {
    if (b[k] < prev[RUNS[i].character][k]) monotonicViolations.push(`run${i + 1} ${k} sank ${prev[RUNS[i].character][k]}->${b[k]}`);
    prev[RUNS[i].character][k] = b[k];
  }
  runTrace.push({
    run: i + 1, input: RUNS[i], records: res.records,
    mira: { ...meta.mira }, kael: { ...meta.kael },
  });
}

const metaNan = scanMeta(meta);
const runsCounterOk = meta.mira.runs === 4 && meta.kael.runs === 1;
const victoryOk = meta.mira.victories === 2; // Sieg in Lauf 3 + 4 (Lauf 4 ist Müll, victory=true)

// Verschlechterung (Lauf 2) darf Records NICHT setzen:
const worsenedOk = runTrace[1].records.time === false
  && runTrace[1].records.kills === false && runTrace[1].records.level === false;
// NaN-Lauf (Lauf 4) darf Bestwerte nicht auf 0 senken und keine NaN eintragen:
const nanRunOk = meta.mira.time === 200 && meta.mira.kills === 55 && meta.mira.level === 9;

// ── 2. korrupte Meta-Payload -> emptyMeta statt Wurf ─────────────────────────
const badStore = memStorage();
badStore._corrupt();
let metaCorruptOk = false, metaCorruptValue = null, metaCorruptThrew = false;
try {
  metaCorruptValue = loadMeta(badStore);
  metaCorruptOk = JSON.stringify(metaCorruptValue) === JSON.stringify(emptyMeta());
} catch { metaCorruptThrew = true; }
// Teilweise korrupt (ein Charakter Müll, der andere ok):
const partialStore = memStorage();
partialStore.setItem(META_KEY, JSON.stringify({ mira: { time: 33, kills: 7, level: 2, victories: 1, runs: 3 }, kael: "kaputt" }));
const metaPartial = loadMeta(partialStore);
const metaPartialOk = metaPartial.mira.kills === 7 && metaPartial.kael.kills === 0
  && metaPartial.kael.runs === 0 && noNanUndefined(metaPartial);
// Storage wirft beim getItem -> kein Wurf:
const throwStore = memStorage(); throwStore._failGet();
const metaThrow = (() => { try { return loadMeta(throwStore); } catch { return "THREW"; } })();
const metaThrowOk = metaThrow !== "THREW" && metaThrow.mira.runs === 0;
// saveMeta->loadMeta Roundtrip:
const rtStore = memStorage();
saveMeta(rtStore, meta);
const metaRtOk = JSON.stringify(loadMeta(rtStore)) === JSON.stringify(meta);
// null-Storage:
const metaNullOk = JSON.stringify(loadMeta(null)) === JSON.stringify(emptyMeta())
  && (() => { try { saveMeta(null, meta); return true; } catch { return false; } })();

// ── 3. Options: 7 Zeilen, 3 Reload-Zyklen, Clamp, korrupte Payload ───────────
const optStart = { ...DEFAULT_OPTIONS, music: 0.3, sfx: 0.45, shake: false, damageNumbers: false, muted: true, scale: 4 };
const cycStore = memStorage();
let options = { ...optStart };
const cycleTrace = [];
let cyclesOk = true;
for (let c = 0; c < 3; c++) {
  saveOptions(cycStore, options);
  const loaded = loadOptions(cycStore);
  const equal = JSON.stringify(loaded) === JSON.stringify(options);
  if (!equal) cyclesOk = false;
  cycleTrace.push({ cycle: c + 1, saved: { ...options }, loaded, equal });
  options = loaded;
}

// Clamp-Grenzen:
const clampTrace = {
  clampVolume_neg: clampVolume(-0.5),
  clampVolume_over: clampVolume(1.7),
  clampVolume_nan: clampVolume(Number.NaN),
  clampScale_neg: clampScale(-3),
  clampScale_over: clampScale(SCALE_MAX + 2),
  clampScale_frac: clampScale(3.7),
  clampScale_nan: clampScale(Number.NaN),
};
const clampOk = clampTrace.clampVolume_neg === 0 && clampTrace.clampVolume_over === 1
  && clampTrace.clampVolume_nan === 0 && clampTrace.clampScale_neg === 0
  && clampTrace.clampScale_over === SCALE_MAX && clampTrace.clampScale_frac === 4
  && clampTrace.clampScale_nan === 0;
// setOption/stepOption clampen ebenfalls (7 Zeilen):
const optClampStore = memStorage();
saveOptions(optClampStore, { ...DEFAULT_OPTIONS, music: 0.5, sfx: 0.5 });
let o = loadOptions(optClampStore);
o = stepOption(o, 0, +1); o = stepOption(o, 0, +1); o = stepOption(o, 0, +1); o = stepOption(o, 0, +1); o = stepOption(o, 0, +1); // 1.0 Cap
const rowsOk = o.music === 1 && o.sfx >= 0 && o.sfx <= 1;
const stepDown = stepOption(stepOption({ ...o }, 1, -1), 5, -1); // SFX runter, Skalierung zurück
const stepCycleOk = stepDown.sfx === 0.4 && stepDown.scale === 6; // Rückwärts von AUTO (0) wrappt auf 6X
// OPTIONS_KEY vorhanden:
const keyOk = OPTIONS_KEY === "lanternfall-options-v1";

// korrupte/teilweise Options-Payload:
const corruptOptStore = memStorage(); corruptOptStore.setItem(OPTIONS_KEY, "{kaputt");
const corruptOpt = loadOptions(corruptOptStore);
const corruptOptOk = JSON.stringify(corruptOpt) === JSON.stringify(DEFAULT_OPTIONS);
// teilweise (music Müll, rest fehlt): Zahl-Felder auf Default, nicht 0:
const partialOptStore = memStorage();
partialOptStore.setItem(OPTIONS_KEY, JSON.stringify({ music: "x", scale: 99, shake: "ja" }));
const partialOpt = loadOptions(partialOptStore);
const partialOptOk = partialOpt.music === DEFAULT_OPTIONS.music
  && partialOpt.sfx === DEFAULT_OPTIONS.sfx
  && partialOpt.scale === SCALE_MAX // 99 wird geclampt, nicht verworfen
  && partialOpt.shake === DEFAULT_OPTIONS.shake;
// null-Storage + wirfender Storage:
const optNullOk = JSON.stringify(loadOptions(null)) === JSON.stringify(DEFAULT_OPTIONS)
  && (() => { try { saveOptions(null, DEFAULT_OPTIONS); return true; } catch { return false; } })();

// ── Report ───────────────────────────────────────────────────────────────────
const checks = {
  meta_monotonic_over_5_runs: monotonicViolations.length === 0,
  meta_no_nan_or_undefined: metaNan.length === 0 && noNanUndefined(meta.mira) && noNanUndefined(meta.kael),
  meta_worse_run_sets_no_record: worsenedOk,
  meta_nan_run_keeps_best: nanRunOk,
  meta_run_counters: runsCounterOk,
  meta_victory_count: victoryOk,
  meta_corrupt_payload_falls_back: metaCorruptOk && !metaCorruptThrew,
  meta_partial_corrupt_falls_back_per_char: metaPartialOk,
  meta_throwing_storage_survives: metaThrowOk,
  meta_save_load_roundtrip: metaRtOk,
  meta_null_storage_safe: metaNullOk,
  options_roundtrip_7_rows_3_cycles: cyclesOk && OPTION_ROWS.length === 7,
  options_clamp_bounds_and_scalemax: clampOk,
  options_step_and_set_clamp: rowsOk && stepCycleOk,
  options_key: keyOk,
  options_corrupt_payload_defaults: corruptOptOk,
  options_partial_payload_defaults_per_field: partialOptOk,
  options_null_storage_safe: optNullOk,
};

const report = {
  lane: "m10-meta-persist-guard",
  date: new Date().toISOString(),
  node: process.version,
  mode: process.argv[2] === undefined ? "(stdout)" : process.argv[2],
  runs: runTrace,
  monotonicViolations,
  optionCycles: cycleTrace,
  clampTrace,
  partialMeta: metaPartial,
  partialOptions: partialOpt,
  corruptOptions: corruptOpt,
  checks,
  summary: {
    total: Object.keys(checks).length,
    passed: Object.values(checks).filter(Boolean).length,
    nanFields: metaNan,
  },
};

const outPath = process.argv[2];
const text = JSON.stringify(report, null, 2);
if (outPath) {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, text);
  console.log(`geschrieben: ${outPath}`);
} else {
  console.log(text);
}
if (report.summary.passed !== report.summary.total) process.exitCode = 1;
console.log(`Checks: ${report.summary.passed}/${report.summary.total} passed`);
