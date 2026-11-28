#!/usr/bin/env node
/**
 * Lane m10-balance-spawn-damp K1: Suche nach SPAWN_DAMP_18_24 mit FESTEM
 * Iterationslimit (max. 3 Suchläufe, siehe Briefing + Tempo-Regeln: Tuning nie
 * per Hand im Loop).
 *
 *   node scripts/m10-balance-search-1824.mjs
 *
 * Kandidatenleiter (fest verdrahtet, Reihenfolge = Suchreihenfolge):
 *   0.60, 0.45, 0.30 — Anteil des Zuwachses seit Minute 18, der im Fenster
 *   Minute 18–24 entfernt wird (siehe src/data/waves.ts). Monotonie-Grenze der
 *   Datentabellen-Tests liegt bei ~0,62.
 *
 * Je Kandidat: waves.ts patchen -> `node scripts/m10-balance-endgame.mjs after
 * search` (baut selbst neu, 6 Läufe wie die Abnahme) -> Score aus dem JSON.
 * Frühabbruch, sobald ein Kandidat das K2-Band vollständig erfüllt
 * (6/6 in [25,40] min, Streuung ≤ 4 min, 0 JS-Fehler, Renderer ok, Endlevel
 * je Lauf in [25,40]). Nach dem Limit: bester Kandidat wird committet und die
 * K2-Messung fährt — kein weiteres Tuning (Abbruchkriterium Briefing).
 *
 * Ausgabe: shots/m10-balance-search-1824.json (Suchergebnis, wird committet).
 * Läuft OHNE flock (Balance mit festen Substeps, siehe lanes/common.md).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const WAVES_FILE = "src/data/waves.ts";
const MAX_SEARCH_RUNS = 3;
const CANDIDATES = [0.6, 0.45, 0.3];
const WINDOW = [25, 40];
const SPREAD_MAX = 4;

/** SPAWN_DAMP_18_24 in waves.ts auf Kandidatenwert setzen. */
function patchWaves(value) {
  const src = readFileSync(WAVES_FILE, "utf8");
  const patched = src.replace(
    /export const SPAWN_DAMP_18_24 = [0-9.]+;/,
    `export const SPAWN_DAMP_18_24 = ${value};`,
  );
  if (!patched.includes(`SPAWN_DAMP_18_24 = ${value};`)) {
    throw new Error(`waves.ts patch fehlgeschlagen (Wert ${value})`);
  }
  writeFileSync(WAVES_FILE, patched);
}

/** Score eines Kandidaten aus dem Endgame-JSON; hoeher = besser. */
function score(json) {
  const valid = (json.runs ?? []).filter((r) => r.outcome === "dawn" || r.outcome === "death");
  const mins = valid.map((r) => r.endMinute);
  const inWindow = mins.filter((m) => m >= WINDOW[0] && m <= WINDOW[1]).length;
  const spread = mins.length ? Math.max(...mins) - Math.min(...mins) : 99;
  const levels = valid.map((r) => r.result?.level ?? 0);
  const levelsOk = levels.length > 0 && levels.every((l) => l >= WINDOW[0] && l <= WINDOW[1]);
  const measured = (json.bossRuns ?? []).flatMap((row) => row.bosses ?? []).filter((b) => b.durationSec != null);
  const bossOk = measured.filter((b) => b.inCorridor).length;
  const deaths = valid.filter((r) => r.outcome === "death").length;
  return {
    inWindow, spread: Math.round(spread * 100) / 100, levels, levelsOk,
    bossOk, bossMeasured: measured.length, deaths, jsErrors: (json.jsErrors ?? []).length,
    rendererOk: Boolean(json.rendererOk),
    // Ordnung: (a) alle im Fenster, (b) wenige Tode, (c) wenig Streuung,
    // (d) Level-Korridor, (e) Boss-Korridor.
    rank: inWindow * 1e6 + (valid.length - deaths) * 1e4 - spread * 100 + (levelsOk ? 50 : 0) + bossOk,
    pass: json.allInWindow === true && json.spreadOk === true && levelsOk
      && (json.jsErrors ?? []).length === 0 && json.rendererOk === true,
  };
}

const results = [];
let chosen = null;

for (const candidate of CANDIDATES) {
  if (results.length >= MAX_SEARCH_RUNS) break;
  console.log(`[search-1824] Suchlauf ${results.length + 1}/${MAX_SEARCH_RUNS}: SPAWN_DAMP_18_24 = ${candidate}`);
  patchWaves(candidate);
  const run = spawnSync("node", ["scripts/m10-balance-endgame.mjs", "after", "search"], {
    stdio: "inherit",
  });
  if (run.status !== 0 && run.status !== 1) {
    // Modellausfall/Harness-Killer: ehrlich abbrechen, nicht als Ergebnis verkaufen.
    console.error(`[search-1824] Endgame-Lauf rc=${run.status} — Suche abgebrochen.`);
    results.push({ candidate, error: `rc=${run.status}` });
    break;
  }
  const json = JSON.parse(readFileSync("shots/m10-balance-band-search-after.json", "utf8"));
  const s = score(json);
  results.push({ candidate, ...s, endMinutes: json.endMinutes });
  console.log(`[search-1824]   -> im Fenster ${s.inWindow}/6, Streuung ${s.spread} min, Tode ${s.deaths}, Level ${s.levels}, Boss ${s.bossOk}/${s.bossMeasured}, pass=${s.pass}`);
  if (s.pass) { chosen = candidate; break; }
}

if (chosen == null) {
  const ranked = results.filter((r) => !r.error).sort((a, b) => b.rank - a.rank);
  chosen = ranked[0]?.candidate ?? CANDIDATES[0];
  console.log(`[search-1824] Limit erreicht — bester Kandidat: ${chosen} (kein weiteres Tuning, K2-Messung fährt).`);
}
patchWaves(chosen);

const summary = {
  lane: "m10-balance-spawn-damp",
  generatedAt: new Date().toISOString(),
  parameter: "SPAWN_DAMP_18_24 (Anteil des Zuwachses seit Minute 18, Rampenform siehe waves.ts)",
  maxSearchRuns: MAX_SEARCH_RUNS,
  candidates: CANDIDATES,
  runs: results,
  chosen,
  note: "Festes Iterationslimit (max. 3 Suchläufe, Frühabbruch bei PASS). Nach dem Limit bester Kandidat, kein weiteres Tuning.",
};
writeFileSync("shots/m10-balance-search-1824.json", JSON.stringify(summary, null, 2));
console.log(`[search-1824] waves.ts gesetzt: SPAWN_DAMP_18_24 = ${chosen}; Ergebnis -> shots/m10-balance-search-1824.json`);
