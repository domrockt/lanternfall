#!/usr/bin/env node
/**
 * Lane m10-mira-hp-balance-check, K3 (#12907): begrenzter Suchlauf fuer den
 * Minuten-20–24-Mix (festes Iterationslimit: 2 Kandidaten, dann bindende Wahl).
 *
 *   node scripts/m10-mira-hp-search.mjs
 *
 * Kandidaten (Mix fuer Minute 20–24, Spawnrate unberuehrt):
 *   A (Ist, Commit-Stand): MID_GAME_MIX = TIER_MIXES[4] ohne abom/voidcaller.
 *   B: LATE_GAME_MIX (bewaehrte Variante der Endgame-Lane ab Minute 25).
 *
 * VORAB festgelegtes Akzeptanzkriterium je Kandidat (3 mira Seeds, volle Laeufe):
 *   - jeder Lauf dawn ODER (death mit endMinute >= 25 und Endlevel in [25,40]),
 *   - JEDE gemessene mira-Boss-Dauer in [20, 60] s,
 *   - kein JS-Fehler.
 * Gewinner = erster Kandidat, der 3/3 erfuellt; danach wird der Ist-Stand
 * wiederhergestellt, falls keiner passt (bindende Auswertung, kein Neu würfeln).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";

const WAVES = "src/data/waves.ts";
// Stand nach K3-Gewinner D: mehrzeiliges mix-Ternary mit Fensterkonstanten.
const A_OR_D_MIX = `    mix: minute >= MID_GAME_MIX_MINUTE && minute <= MID_GAME_MIX_LAST_MINUTE
      ? MID_GAME_MIX
      : late ? LATE_GAME_MIX : TIER_MIXES[tier],`;
const B_MIX = `    mix: minute >= MID_GAME_MIX_MINUTE && minute <= MID_GAME_MIX_LAST_MINUTE
      ? LATE_GAME_MIX
      : late ? LATE_GAME_MIX : TIER_MIXES[tier],`;

function setVariant(v) {
  let s = readFileSync(WAVES, "utf8");
  if (v === "D") {
    // Committeter Stand (K3-Gewinner) wiederherstellen.
    if (s.includes(B_MIX)) writeFileSync(WAVES, s.replace(B_MIX, A_OR_D_MIX));
    else if (!s.includes(A_OR_D_MIX)) throw new Error(`waves.ts enthaelt weder die D- noch die B-Variante`);
    return;
  }
  if (v !== "B") throw new Error(`unbekannte Variante ${v}`);
  if (!s.includes(A_OR_D_MIX)) throw new Error(`waves.ts enthaelt die D-Variante nicht (bereits B?)`);
  writeFileSync(WAVES, s.replace(A_OR_D_MIX, B_MIX));
}

function latestEvidence() {
  const dir = `${homedir()}/games/.evidence/m10-mira-hp-balance-check`;
  const files = readdirSync(dir).filter((f) => f.startsWith("m10-mira-hp-")).sort();
  return JSON.parse(readFileSync(`${dir}/${files[files.length - 1]}`, "utf8"));
}

function passes(ev) {
  const problems = [];
  for (const r of ev.runs) {
    if (r.character !== "mira") continue;
    if (r.outcome === "dawn") { /* ok */ }
    else if (r.outcome === "death" && (r.endMinute ?? 0) >= 25 && (r.endLevel ?? 0) >= 25 && (r.endLevel ?? 0) <= 40) { /* ok */ }
    else problems.push(`${r.seed}: ${r.outcome} @ ${r.endMinute} min L${r.endLevel}`);
  }
  for (const row of ev.bossRuns) {
    if (row.character !== "mira") continue;
    for (const b of row.bosses) {
      if (b.durationSec == null || b.durationSec < 20 || b.durationSec > 60) {
        problems.push(`${row.seed} ${b.name}: ${b.durationSec ?? "?"} s`);
      }
    }
  }
  if (ev.jsErrors.length > 0) problems.push(`${ev.jsErrors.length} JS-Fehler`);
  return problems;
}

const results = [];
for (const variant of ["B"]) { // A ist bereits gemessen (K3-Lauf 15:50Z) — Limit: 1 neuer Kandidat.
  setVariant(variant);
  console.log(`[search] Kandidat ${variant} — Messlauf (3 mira Seeds, ohne kael) ...`);
  try {
    execFileSync("node", ["scripts/m10-mira-hp-check.mjs"], {
      env: { ...process.env, MIRA_HP_KAEL: "0" },
      stdio: ["ignore", "inherit", "inherit"],
      timeout: 15 * 60_000,
    });
  } catch { /* rc != 0 ist erwartet, wenn das Kriterium (noch) nicht erfuellt ist */ }
  const ev = latestEvidence();
  const problems = passes(ev);
  results.push({ variant, problems, runs: ev.runs.map((r) => `${r.character}/${r.seed}:${r.outcome}@${r.endMinute}L${r.endLevel}`) });
  console.log(`[search] Kandidat ${variant}: ${problems.length === 0 ? "PASS" : "FAIL"} ${JSON.stringify(problems)}`);
  if (problems.length === 0) break;
}

// Bindende Wahl: Gewinner bleibt im Baum, sonst zurueck auf den committeten
// Stand (Kandidat D, Commit 43d2769f). Kandidat A (ganz ohne Vervielfacher)
// ist historisch — er waere heute ein wave-coverage-FAIL und wird nicht
// wiederhergestellt.
const winner = results.find((r) => r.problems.length === 0)?.variant ?? "D";
setVariant(winner);
console.log(JSON.stringify({ winner, results }, null, 2));
