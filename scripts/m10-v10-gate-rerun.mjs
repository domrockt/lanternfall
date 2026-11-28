#!/usr/bin/env node
// Lane m10-v10-gate-rerun (K1): duenner Wrapper um DIESELBE Gate-Suite
// scripts/m10-v10-gate.mjs — keine neue Methodik, keine eigenen Tore.
//
// Warum dieser Wrapper existiert: das verbindliche Guard-Urteil (Lauf 3,
// 15:57:11Z, gate-final-run3.json) fiel auf einen HEAD vor dem Fix-Schub
// (ground-chunk-tex-dup, gc-sawtooth-trim, blend-band-followup, renderer-guard,
// heap-gate-retry, evo-element-guard). Diese Lane faehrt die unveraenderte
// Suite 2x auf dem aktuellen main und liefert das Urteil je Tor fuer die
// v1.0-Markierung. NUR-MESS-Lane: endet mit Fix-Empfehlungen, kein Spielcode.
//
// Belege (Argus/Vera 28.11.) gehen nach ~/games/.evidence/m10-v10-gate-rerun/,
// nicht nach shots/ (shots/* ist gitignored; shots-JSONs sind keine
// Deliverables mehr). Die Suite schreibt ihre Runtime-Belege (fullrun-guard,
// verify, minute25) weiterhin ins Suite-eigene Verzeichnis
// ~/games/.evidence/m10-v10-gate-guard/ mit Zeitstempel.
//
// Aufruf (FPS/Echtzeit => Mess-Sperre, wie im Suite-Header):
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-v10-gate-rerun.mjs
// Exit-Codes: 0 = beide Laeufe PASS, 1 = mindestens ein Tor FAIL,
//             2 = Renderer ungültig (Pflichttor, Regel 6).
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const EVIDENCE = join(homedir(), "games", ".evidence", "m10-v10-gate-rerun");
mkdirSync(EVIDENCE, { recursive: true });

const runs = [join(EVIDENCE, "run1.json"), join(EVIDENCE, "run2.json")];
console.log(`[rerun] Suite: scripts/m10-v10-gate.mjs (unveraendert) | Laeufe: ${runs.length} | out: ${EVIDENCE}`);

const results = [];
for (let i = 0; i < runs.length; i++) {
  console.log(`[rerun] === Lauf ${i + 1}/${runs.length} -> ${runs[i]} ===`);
  const r = spawnSync("node", ["scripts/m10-v10-gate.mjs", "--out", runs[i]], { encoding: "utf8", timeout: 1500000 });
  let parsed = null;
  try { parsed = JSON.parse((r.stdout ?? "").split("\n").filter((l) => l.startsWith("{")).join("")); } catch { /* stdout-JSON fehlt bei Abbruch */ }
  results.push({ run: i + 1, out: runs[i], exit: r.status, verdict: parsed?.verdict ?? null, failures: parsed?.failures ?? null });
  console.log(`[rerun] Lauf ${i + 1}: exit=${r.status} verdict=${parsed?.verdict ?? "kein-JSON"} failures=${JSON.stringify(parsed?.failures ?? [])}`);
  if (r.status === 2) break; // Renderer-Pflichttor verletzt: Messung ist kein gueltiges Urteil, Lauf 2 mit gleichem Renderer waere zwecklos
}

const worst = results.some((r) => r.exit === 2) ? 2 : results.some((r) => r.exit !== 0) ? 1 : 0;
console.log(`[rerun] Ergebnis: ${JSON.stringify(results)}`);
process.exit(results.length ? worst : 1);
