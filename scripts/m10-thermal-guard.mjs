/**
 * M10-quality-thermal-guard (K4): Beleg mit simulierten FPS-Serien.
 *
 * Deterministisch, kein Geraet/Browser noetig — treibt DIE ECHTE
 * Implementierung (src/logic/quality.ts, importfrei) ueber
 *   node --experimental-strip-types scripts/m10-thermal-guard.mjs
 * und schreibt einen JSON-Beleg nach ~/games/.evidence/m10-quality-thermal-guard/.
 * Kein Browser-Lauf => keine Renderer-String-Pflicht (die gilt nur fuer
 * FPS-/Echtzeit-Messungen am Geraet, siehe AGENTS.md Mess-Sperre).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  THERMAL_FPS,
  THERMAL_HOLD_MS,
  THERMAL_RECOVERY_FPS,
  THERMAL_RECOVERY_MS,
  THERMAL_WINDOW_MS,
  evaluateThermalStep,
  initialThermalState,
} from "../src/logic/quality.ts";

const DT = 1000;               // 1-Hz-Samples
const WINDOW = THERMAL_WINDOW_MS / DT; // 8 Samples = 8 s Median-Fenster
const DUR = 120000;            // 120 s Simulation je Szenario

const serieOf = (fps) => Array.from({ length: WINDOW }, () => fps);

/** Fuehrt ein Szenario aus: fpsAt(t) liefert den FPS-Wert zum Zeitpunkt t. */
function run(name, fpsAt) {
  let s = { ...initialThermalState(), tier: "low" };
  const events = [];
  let engagedAt = null;
  let recoveredAt = null;
  for (let t = DT; t <= DUR; t += DT) {
    const before = s.tier;
    s = evaluateThermalStep(serieOf(fpsAt(t)), s, DT);
    if (s.tier !== before) {
      if (s.tier === "thermal") engagedAt = t;
      if (before === "thermal") recoveredAt = t;
      events.push({ tMs: t, from: before, to: s.tier });
    }
  }
  return { name, finalTier: s.tier, engagedAt, recoveredAt, events };
}

const scenarios = [
  // 1. Stabile FPS trotz low: nie ein Eingriff (Bitgleichheit, kein Flapping).
  run("stabil-55fps", () => 55),
  // 2. Thermischer Absturz: dauerhaft 26 FPS < THERMAL_FPS -> engage bei THERMAL_HOLD_MS.
  run("thermisch-26fps", () => THERMAL_FPS - 4),
  // 3. Kurze Einbrueche (7 s < Haltefenster): engage nie.
  run("kurze-einbrueche-7s", (t) => (t % 10000 < 7000 ? THERMAL_FPS - 5 : 55)),
  // 4. Flapping-Schutz: engage, dann wechselnd 5 s erholt / 5 s Absturz —
  //    Erholungsfolge (20 s am Stueck) bricht immer ab -> bleibt thermal.
  { ...run("flapping-schutz", (t) => (t < THERMAL_HOLD_MS + DT ? THERMAL_FPS - 5 : t % 10000 < 5000 ? 55 : THERMAL_FPS - 5)), },
  // 5. Erholung: engage, dann dauerhaft 55 FPS -> Rueckkehr nach THERMAL_RECOVERY_MS.
  run("erholung-nach-abstieg", (t) => (t < THERMAL_HOLD_MS + DT ? THERMAL_FPS - 5 : 55)),
  // 6. Totzone 30..45 FPS waehrend aktiv: thermal bleibt, Rueckweg startet nicht.
  run("totzone-37fps", (t) => (t < THERMAL_HOLD_MS + DT ? THERMAL_FPS - 5 : (THERMAL_FPS + THERMAL_RECOVERY_FPS) / 2)),
];

const expectations = {
  "stabil-55fps": { tier: "low", engagedAt: null },
  "thermisch-26fps": { tier: "thermal", engagedAt: THERMAL_HOLD_MS },
  "kurze-einbrueche-7s": { tier: "low", engagedAt: null },
  "flapping-schutz": { tier: "thermal", engagedAt: THERMAL_HOLD_MS },
  "erholung-nach-abstieg": { tier: "low", engagedAt: THERMAL_HOLD_MS, recoveredAt: THERMAL_HOLD_MS + THERMAL_RECOVERY_MS },
  "totzone-37fps": { tier: "thermal", engagedAt: THERMAL_HOLD_MS },
};

let failures = 0;
const results = scenarios.map((r) => {
  const exp = expectations[r.name];
  const ok =
    r.finalTier === exp.tier &&
    (exp.engagedAt ?? null) === (r.engagedAt ?? null) &&
    (exp.recoveredAt ?? null) === (r.recoveredAt ?? null);
  if (!ok) failures++;
  return { ...r, ok };
});

const report = {
  lane: "m10-quality-thermal-guard",
  date: new Date().toISOString(),
  runtime: "node --experimental-strip-types (deterministisch, kein Geraet)",
  rendererString: null,
  rendererNote: "kein Browser-Lauf — Renderer-String-Pflicht nur bei Geraet-Messung (m10-v10-device-acceptance)",
  constants: { THERMAL_FPS, THERMAL_WINDOW_MS, THERMAL_HOLD_MS, THERMAL_RECOVERY_FPS, THERMAL_RECOVERY_MS },
  scenarios: results,
  summary: `${results.length - failures}/${results.length} Szenarien PASS`,
  failures,
};

const outDir = join(homedir(), "games", ".evidence", "m10-quality-thermal-guard");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "thermal-guard.json");
writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}: final=${r.finalTier} engage@${r.engagedAt ?? "-"} recover@${r.recoveredAt ?? "-"}`);
}
console.log(report.summary);
console.log(`Beleg: ${out}`);
process.exit(failures === 0 ? 0 : 1);
