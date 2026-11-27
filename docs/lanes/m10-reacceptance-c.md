# Lane m10-reacceptance-c — Nachabnahme 3 (Drain-Welle, 2026-11-27)

## PIN (gesperrter Prüfstand)

**PIN = `43fd9eb7ef8ddb8a03fa26b66c62acd31a907dea`**
(`git rev-parse main` = Branch-HEAD am 2026-11-27T20:29:24Z, main-HEAD „Board: Lane-Karten
#2679 #2678 (m10-perf-recovery) …“). Alle Prüfungen laufen auf diesem Commit (Worktree
`/home/ai/games/lf-lanes/m10-reacceptance-c`, Branch `m10-reacceptance-c`).
Diese Lane ändert **keinen Spielcode und keine Tests** — nur ACCEPTANCE.md, docs/qa,
docs/lanes (diese Datei) und shots/qa-reaccc-*. Abnahme misst, sie repariert nicht.

Der PIN deckt **19 Lane-Merges** ohne Abnahme-Beleg ab (Briefing nannte 11 + Nachtrag 20:04Z
m10-separation-budget = 12; der Merge-Drain lief nach Briefing-Erstellung weiter, daher die
ehrliche Ist-Zählung zum Startzeitpunkt). Grundlage: `git log main --first-parent --merges
49727faa..43fd9eb` (49727faa = PIN der Nachabnahme B).

## Zuordnungstabelle: Merge → Kriteriumszeile → Beleg

| # | Merge | Zeit (UTC) | Lane | Kriteriumszeile | Beleg |
|---|---|---|---|---|---|
| 1 | `9e76269` | 18:19 | m10-hazard-warn-fairness | Hazard-Warnung (Fairness) | `shots/qa-reaccc-hazard-fairness.json` + `-warnframe.png` (Neulauf auf PIN) |
| 2 | `64e7c77` | 18:24 | m10-fx-overdraw-cap | FX-Overdraw-Deckel | `shots/qa-reaccc-fx-overdraw-*.json` (Neulauf unter flock) |
| 3 | `79e1fde` | 18:28 | m10-android-perf | Android-Audit-Zahlen | `shots/qa-reaccc-android-audit.json` + Log `~/tmp/m10-reacceptance-c/android-audit.txt` (Neulauf auf PIN) |
| 4 | `6b39e10` | 18:34 | m10-results-overlap | Results-Screen (Overlap) | `shots/qa-reaccc-results-overlap-*.png` + `.json` (Neulauf auf PIN) |
| 5 | `c0a2f73` | 18:36 | m10-endgame-fps | Endgame-FPS | `shots/qa-reaccc-endgame-fps-*.json` (Neulauf unter flock) |
| 6 | `2b1394c` | 18:41 | m10-enemy-frame-cadence | Suite (Gegner-Frames) | `tests/enemy-run-frames.test.ts` grün (Ziel-Lauf 72/72, Ganzsuite 587/587) |
| 7 | `a70dcb1` | 18:46 | m10-chest-arrow-onscreen | Chest-Arrow | `shots/qa-reaccc-chest-arrow.json` + `-edge/-inside.png` (Neulauf), `tests/chest-arrow.test.ts` grün |
| 8 | `f948503` | 18:51 | m10-verify-input-fix | verify-input 28/28 | `shots/qa-reaccc-verify-input.json` (Neulauf auf PIN) |
| 9 | `49a026f` | 18:51 | m10-text-wrap | Results-Banner/Wrap | Results-Overlap-Shots mit `stress12` (alle 12 Waffennamen), Suite grün |
| 10 | `d0da358` | 19:35 | m10-evo-signature-calls | Suite (Evo-Signatur) | `tests/evo-signature-calls.test.ts` grün (Ganzsuite), Lane-Shots auf PIN |
| 11 | `290675a` | 19:40 | m10-heap-margin | Heap-Tor (A4) | `tests/heap-margin.test.ts` grün; Heap-Delta im 30-min-Echtzeitlauf |
| 12 | `b212e1c` | 19:45 | m10-death-fx-frames | Suite (Death-Frames) | `tests/death-frames.test.ts` grün (Ziel-Lauf), Lane-Shots auf PIN |
| 13 | `9055126` | 19:50 | m10-flock-sweep | Tooling (Mess-Skripte) | Die in dieser Abnahme genutzten Mess-Skripte (qa-reaccept-perf, flock -w) sind selbst der Beleg |
| 14 | `c96929d` | 19:55 | m10-separation-budget | Separation: **Blocker entkräftet** | `tests/separation-budget.test.ts` grün; Lane-Belege `shots/m10-separation-budget-*` auf PIN; 1,88-ms-Baseline war OSR-Harness-Artefakt (`docs/lanes/m10-separation-budget.md`), realer Pfad ~2 % Framebudget; Fix (Nachbar-Deckel + Paar-Budget) in main |
| 15 | `8834c19` | 20:00 | m10-view-width-cap | View-Breite | `tests/view-width.test.ts` grün; `shots/qa-reaccc-view-width-*.json` (A/B unter flock) |
| 16 | `0ef46d6` | 20:05 | m10-fx-add-cap | FX-ADD-Deckel | `tests/fx-add-cap.test.ts` (24 Tests) grün; Lane-Messbasis auf PIN |
| 17 | `90e0c4d` | 20:11 | m10-ground-props-batch | Draw-Call-Reduktion | Lane-Belege auf PIN (925→75 / 1139→85 Kandidaten); FPS-Ist über Perf-Gate |
| 18 | `d42d52f` | 20:16 | m10-passive-math | Passive-Math | `tests/passive-stack.test.ts` grün; `shots/m10-passive-math-caps.json` (22 checks, 0 violations) auf PIN |
| 19 | `552189c` | 20:21 | m10-perf-recovery | Perf-Diagnose/Regression | `docs/lanes/m10-perf-recovery.md` auf PIN (Ursache `c0f56d5`, Ambient-Batching); Ist über Perf-Gate |

## K1 — Basis auf PIN

| Zeit (UTC) | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| 20:32Z | `npx tsc --noEmit` | rc=0, keine Fehler | **PASS** |
| 20:33Z | `npm test` (vitest run) | **587/587 in 58 Dateien, 0 fail**, 1,82 s | **PASS** |
| 20:32Z | `node scripts/acceptance-count.mjs` | `ok:true`, **30/6/6/6/6/2** | **PASS** |
| 20:34Z | `npm run build` | rc=0, `✓ built in 413ms` (bekannte Chunk-Warnung >500 kB) | **PASS** |

## K2 — Renderer-Pflicht (Wunsch Dom 19:20Z)

`shots/qa-reaccc-renderer.json` (2026-11-27T20:34:59Z): Renderer
**„ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)“** = iGPU aktiv
(erwarteter String). **Kein** Abnahme-Beleg dieser Nachabnahme nutzt SwiftShader.
Belege mit SwiftShader werden nur als Vorher-Vergleich geführt.

## K3 — FPS-Gates (iGPU, unter flock)

(Siehe QA-Doku; Läufe laufen zum Zeitpunkt dieses Zwischenstands.)

## K4 — 30-min-Echtzeitlauf (A4)

Der iGPU-Beleg von m10-realtime-stability (Lauf 1: 18:20–18:50Z) ist **vor** 19:13Z
(iGPU aktiv) gefahren und trägt keinen Renderer-String → **keine Übernahme möglich**.
Neuer Lauf auf iGPU in dieser Lane gestartet; Ergebnis in der QA-Doku.

## Offene Punkte / Urteil

(folgt)
