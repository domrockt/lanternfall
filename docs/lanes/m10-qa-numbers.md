# M10 QA-Numbers — konsolidierte Zahlenliste (Lane m10-qa-numbers)

**Basis-SHA:** `257416c` (Worktree-Abbau am 2026-11-26 20:09 UTC). Der Merge der Lane
`m8-display` lief zum Start noch; alle Ist-Zahlen hier gelten für den Worktree-Stand
`257416c`, nicht für einen späteren main-Merge. Wo eine Belegzahl aus einem älteren
Commit stammt, ist der Commit ausdrücklich genannt.

**Ziel:** die in `ACCEPTANCE.md` und `docs/qa/2026-11-26.md` genannten Zahlen gegen die
vorhandenen JSON-Belege prüfen; jede Abweichung ≥ 5 % mit Quelle belegen. Ergebnis ist die
Basis für die finale Abnahme (`m9-final-acceptance`).

**Geprüfte Behauptungen (Briefing):** Tests 175, FPS Minute 25 59,3, Heap +18,7 / +15,8,
Inhaltszählung 30/6/6/6/6/2.

## Checkliste (Kartenplan, Board-Pflege macht der Merge-Job)

- [x] **Karte 1 — Quellen inventarisieren:** alle `shots/*.json` und `docs/qa/*.md` mit Zahl + Datum.
- [ ] **Karte 2 — Abgleich:** ACCEPTANCE-Zahl vs. Belegzahl, Abweichung in Prozent, Status;
      `node scripts/acceptance-count.mjs` und `npx vitest run` je einmal gelaufen, Ist-Zahlen notiert.
- [ ] **Karte 3 — Report:** konsolidierte Tabelle + offene Widersprüche für `m9-final-acceptance`.

## Karte 1 — Quellen-Inventar

Grundlage: `ls shots/*.json` = **71 Dateien**; dazu das einzige QA-Dokument
`docs/qa/2026-11-26.md`. Datum ist `generatedAt` aus der JSON, sonst das Git-Commit-Datum
der Datei. Reine Screenshot-Metadaten ohne Messzahl sind als solche markiert.
Die maschinenlesbare Fassung liegt in `shots/m10-qa-numbers-inventory.json`.

| Datei | Datum | Typ | Kernzahlen |
|---|---|---|---|
| `shots/balance-all.json` | 2026-11-26T05:09:10.106Z | Balance | 6 Läufe; allRunsPass false; seeds 101,101,202,202,404,404; chars mira,kael |
| `shots/balance-death-mira-202.json` | 2026-11-26 | Balance-Rohdaten (Array) | 2 Läufe/Keys |
| `shots/balance-death-runs.json` | 2026-11-26 | Balance-Rohdaten (Array) | 1 Läufe/Keys |
| `shots/balance-death.json` | 2026-11-26T05:58:05.011Z | Balance | 0 Läufe; allRunsPass true; seeds ; chars  |
| `shots/balance-main-m8-640.json` | 2026-11-26T10:41:49.127Z | Balance | 6 Läufe; allRunsPass true; seeds 101,101,202,202,404,404; chars mira,kael |
| `shots/balance-main-m8-780-clean.json` | 2026-11-26T12:20:37.880Z | Balance | 4 Läufe; allRunsPass true; seeds 101,101,404,404; chars mira,kael |
| `shots/balance-main-m8-780-final.json` | 2026-11-26T11:23:27.374Z | Balance | 6 Läufe; allRunsPass false; seeds 101,101,202,202,404,404; chars mira,kael |
| `shots/balance-main-m8-780-tune07.json` | 2026-11-26T11:07:40.115Z | Balance | 4 Läufe; allRunsPass false; seeds 101,101,404,404; chars mira,kael |
| `shots/balance-main-m8-780.json` | 2026-11-26T10:51:13.706Z | Balance | 6 Läufe; allRunsPass false; seeds 101,101,202,202,404,404; chars mira,kael |
| `shots/balance-main-m8-780b.json` | 2026-11-26T10:59:32.942Z | Balance | 6 Läufe; allRunsPass false; seeds 101,101,202,202,404,404; chars mira,kael |
| `shots/balance-main-runs.json` | 2026-11-26 | Balance-Rohdaten (Array) | 4 Läufe/Keys |
| `shots/balance-main.json` | 2026-11-26T12:14:10.184Z | Balance | 1 Läufe; allRunsPass true; seeds 101; chars kael |
| `shots/balance-mainm8-780-final.json` | 2026-11-26T11:54:58.729Z | Balance | 4 Läufe; allRunsPass false; seeds 101,101,404,404; chars mira,kael |
| `shots/balance-maintune070.json` | 2026-11-26T12:08:49.232Z | Balance | 1 Läufe; allRunsPass true; seeds 101; chars kael |
| `shots/balance-maintune085.json` | 2026-11-26T12:07:11.688Z | Balance | 1 Läufe; allRunsPass false; seeds 101; chars kael |
| `shots/balance-weapons-runs.json` | 2026-11-26 | Balance-Rohdaten (Array) | 12 Läufe/Keys |
| `shots/balance-weapons.json` | 2026-11-26T05:47:59.153Z | Balance | 0 Läufe; allRunsPass true; seeds ; chars  |
| `shots/final-art-shots.json` | 2026-11-26 | Art-Shot-Metadaten | spiders –; errors 0 |
| `shots/final-trailer.json` | 2026-11-26 | Trailer | 8 Segmente, 36 s, 8 fps, 480x270, overview 6 |
| `shots/final-verify.json` | 2026-11-26 | Verify | 7/7 Checks PASS; jsErrors/errors 0;  |
| `shots/final-vfx-readability.json` | 2026-11-26 | VFX-Readability | paused time 1405.4 s, kills 2919, 468 Gegner, fx 60, Partikel 158; sameDensity true; errors 0 |
| `shots/latest.json` | 2026-11-25 | Shot-Metadaten | jsErrors 0 |
| `shots/lead-accept.json` | 2026-11-25 | Lead-Accept | sheet 33 Sprite-Paare (identisch 0); victory true; jsErrors 0; passed true |
| `shots/m10-heap-basis.json` | 2026-11-26T19:13:14.592Z | Heap-Serie (ein Lauf) | variant basis; heap 30.9→30.9 MB, Δ -0.2 %; JS-Heap 30.5→30.7 MB (0.7 %); neurons 72262; jsErrors 0; criterion15 true |
| `shots/m10-heap-burst.json` | 2026-11-26T19:13:05.478Z | Heap-Serie (ein Lauf) | variant burst; heap 30.6→31 MB, Δ 1.1 %; JS-Heap 29.8→30.3 MB (1.7 %); neurons 35731; jsErrors 0; criterion15 true |
| `shots/m10-heap-chaos.json` | 2026-11-26T19:14:48.496Z | Heap-Serie (ein Lauf) | variant chaos; heap 32.2→29.5 MB, Δ -8.2 %; JS-Heap 34.1→29 MB (-15 %); neurons -165516; jsErrors 0; criterion15 true |
| `shots/m10-heap-smoke.json` | 2026-11-26T18:39:53.310Z | Heap-Serie | Δ 7.1 %; median 7.1 %; spread – pp; jsErrors 0 |
| `shots/m10-vfx-evo-readability.json` | 2026-11-26 | VFX-Readability | baseSha 1238df1; 12 Effekte; Ziel <= 4.16 %; jsErrors 0 |
| `shots/m3-bosses.json` | 2026-11-25 | Boss-/Verify-Rohdaten | 6 Ergebnisse; jsErrors 0 |
| `shots/m3-fullrun-m8-780.json` | 2026-11-26 | fullrun (30 min) | sim 30.2 min; fpsMin 29.5; heap 30→35 MB (16.7 %); Boss 6/6; Truhen 6; Kills 4141; Level 38; victory true; jsErrors 0; passed false |
| `shots/m3-fullrun.json` | 2026-11-26 | fullrun (30 min) | sim 30.2 min; fpsMin 55.8; heap 25.7→30.5 MB (18.7 %); Boss 6/6; Truhen 6; Kills 4222; Level 38; victory true; jsErrors 0; passed false |
| `shots/m3-fullrunm8-780.json` | 2026-11-26 | fullrun (30 min) | sim 30.2 min; fpsMin 38.9; heap 29.7→31.8 MB (7.1 %); Boss 6/6; Truhen 6; Kills 4115; Level 38; victory true; jsErrors 0; passed false |
| `shots/m3-terrain.json` | 2026-11-26 | Shot-Metadaten | jsErrors 0 |
| `shots/m5-vfx.json` | 2026-11-26 | VFX-Serie | 12 Waffen, 6 Events, 18 GIFs, failed 0, jsErrors 0, passed true |
| `shots/m6-menus.json` | 2026-11-26 | Verify | 15/15 Checks PASS; jsErrors/errors 0; M6-menus |
| `shots/m7-shot.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m7-shot.png |
| `shots/m8-display.json` | 2026-11-26 | Verify | 38/38 Checks PASS; jsErrors/errors 0; M8-display |
| `shots/m8-input.json` | 2026-11-26 | Verify | 28/28 Checks PASS; jsErrors/errors 0; M8-input |
| `shots/m8-view-hd.png.json` | 2026-11-26 | Shot-Metadaten | scene title; jsErrors 0; out shots/m8-view-hd.png |
| `shots/m9-art-fx-ui-title-after.png.json` | 2026-11-26 | Shot-Metadaten | scene title; jsErrors 0; out shots/m9-art-fx-ui-title-after.png |
| `shots/m9-art-fx-ui-title-before.png.json` | 2026-11-26 | Shot-Metadaten | scene title; jsErrors 0; out shots/m9-art-fx-ui-title-before.png |
| `shots/m9-art-fx-ui-title-step-after.png.json` | 2026-11-26 | Shot-Metadaten | scene title; jsErrors 0; out shots/m9-art-fx-ui-title-step-after.png |
| `shots/m9-art-fx-ui-title-step-before.png.json` | 2026-11-26 | Shot-Metadaten | scene title; jsErrors 0; out shots/m9-art-fx-ui-title-step-before.png |
| `shots/m9-art-heroes-bosses-01-crowd.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-heroes-bosses-01-crowd.png |
| `shots/m9-art-heroes-bosses-02-boss5.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-heroes-bosses-02-boss5.png |
| `shots/m9-art-heroes-bosses-02-boss5b.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-heroes-bosses-02-boss5b.png |
| `shots/m9-art-heroes-bosses-03-death.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-heroes-bosses-03-death.png |
| `shots/m9-art-heroes-bosses-before-boss0.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-heroes-bosses-before-boss0.png |
| `shots/m9-art-heroes-bosses-before-boss5.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-heroes-bosses-before-boss5.png |
| `shots/m9-art-heroes-bosses-before-crowd.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-heroes-bosses-before-crowd.png |
| `shots/m9-art-world-01-after-grass.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-world-01-after-grass.png |
| `shots/m9-art-world-01-before-grass.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-world-01-before-grass.png |
| `shots/m9-art-world-01-before-path.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-world-01-before-path.png |
| `shots/m9-art-world-01-before-ruins.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-world-01-before-ruins.png |
| `shots/m9-art-world-02-props-depth.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-world-02-props-depth.png |
| `shots/m9-art-world-03-ambient.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-world-03-ambient.png |
| `shots/m9-art-world-before-run.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-world-before-run.png |
| `shots/m9-art-world-before-start.png.json` | 2026-11-26 | Shot-Metadaten | scene run; jsErrors 0; out shots/m9-art-world-before-start.png |
| `shots/perf-heap-30min-2runs.json` | 2026-11-26T12:15:21.995Z | Heap-Serie | Δ 6.8 / 7.9 %; median 7.9 %; spread 1.1 pp; jsErrors 0 |
| `shots/perf-heap-3runs-v2.json` | 2026-11-26T12:52:41.391Z | Heap-Serie | Δ 13.4 / 13.1 / 6.8 %; median 13.1 %; spread 6.6 pp; jsErrors 0 |
| `shots/perf-heap-3runs.json` | 2026-11-26T12:39:49.937Z | Heap-Serie | Δ 20.7 / 8.6 / 1 %; median 8.6 %; spread 19.7 pp; jsErrors 0 |
| `shots/perf-heap-diag10.json` | 2026-11-26T13:41:51.146Z | Heap-Serie | Δ 1.7 %; median 1.7 %; spread – pp; jsErrors 0 |
| `shots/perf-heap-smoke.json` | 2026-11-26T12:47:34.578Z | Heap-Serie | Δ 5 %; median 5 %; spread – pp; jsErrors 0 |
| `shots/perf-heap.json` | 2026-11-26T13:55:30.388Z | Heap-Serie | Δ 7.4 / 20 %; median 20 %; spread 12.6 pp; jsErrors 0 |
| `shots/perf-m3-baseline.json` | 2026-11-26 | perf (Burst + Minute 25) | Burst fps 40 / measured 39.4; Minute25 fps 28.8 / measured 27.9, frames 289; jsErrors 0; passed false |
| `shots/perf-m3-m8-780.json` | 2026-11-26 | perf (Burst + Minute 25) | Burst fps 47.9 / measured 45.4; Minute25 fps 37.9 / measured 36.9, frames 380; jsErrors 0; passed false |
| `shots/perf-m3.json` | 2026-11-26 | perf (Burst + Minute 25) | Burst fps 60.1 / measured 59.8; Minute25 fps 54.7 / measured 53.1, frames 549; jsErrors 0; passed false |
| `shots/perf-m3m8-640.json` | 2026-11-26 | perf (Burst + Minute 25) | Burst fps 60 / measured 59.7; Minute25 fps 50.5 / measured 51.6, frames 507; jsErrors 0; passed false |
| `shots/perf-m3m8-780.json` | 2026-11-26 | perf (Burst + Minute 25) | Burst fps 59.1 / measured 57.3; Minute25 fps 40.2 / measured 40.9, frames 403; jsErrors 0; passed false |
| `shots/realtime-30min.json` | 2026-11-26 | realtime 30 min | sim 30.4 min in 1869 s; fps min 57.2 / median 60.3 (7181 Samples); heap 27.9→32.3 MB (15.8 %), CDP 11.3→16.2; Boss 6; Truhen 6; Kills 9938; Level 49; Evos 4; victory true (dawn); jsErrors 0; passed false |
| `shots/realtime-3min.json` | 2026-11-26 | realtime 30 min | sim 3 min in 183 s; fps min 42.3 / median 51.3 (660 Samples); heap 29.9→– MB (-7.7 %), CDP 11.7→–; Boss 0; Truhen 0; Kills 151; Level 7; Evos 0; victory false (null); jsErrors 0; passed true |

## QA-Dokumente

| Dokument | Datum / Basis | Enthaltene prüfbare Zahlen |
|---|---|---|
| `docs/qa/2026-11-26.md` | 2026-11-26, Basis `main` @ `7a522a4`, Läufe in Commit `0b42ffe` | Tests **175** (10 Dateien), perf Burst **59,3 FPS** (roh 59,9), Minute 25 **59,3 FPS** (roh 58,9), `verify:final` **7/7**, `acceptance-count` **30/6/6/6/6/2**, 0 JS-Fehler, Build grün, APK-Basis `53a9261` |
| `ACCEPTANCE.md` | 2026-11-26, M6-Stand + Nachtrag QA | Tests **147** (A2/A5/A12) bzw. **175** (Nachtrag), perf Burst **60,7** (Team) / **59,3** (Lead), Minute 25 **57,9** (Team) / **56,4** (Lead) bzw. **59,3** (Nachtrag), fullrun fpsMin **55,8**, realtime fps min **57,2** / median **60,3** / 7181 Samples, Heap realtime **+15,8 %** (27,9→32,3 MB), Heap fullrun **+18,7 %** (25,7→30,5 MB), Inhaltszählung **30/6/6/6/6/2**, Trailer **35,6 s / 285 Frames / 480×270 / 8 fps** |

## Karte 2 — Abgleich ACCEPTANCE vs. Beleg (Basis `257416c`)

Eigene Ist-Läufe am 2026-11-26 (Logs in `~/tmp/m10-qa-numbers/`):

- `node scripts/acceptance-count.mjs` → **EXIT 0**, `ok:true`, **30/6/6/6/6/2**.
- `npx vitest run` → **EXIT 0**, **12 Testdateien, 192 Tests grün**.
- `npx vitest run tests/view.test.ts tests/spawn-view.test.ts` → **17 Tests** (genau die Differenz 175 → 192).

Abweichung = (Ist − Soll) / Soll. Status: **gleich** (≤ 5 %), **erklärt** (Abweichung
mit Commit/Ursache belegt), **offen** (Widerspruch, den `m9-final-acceptance` klären muss).
Maschinenlesbar: `shots/m10-qa-numbers-comparison.json`.

| Kennzahl | Soll (ACCEPTANCE/QA) | Ist (Beleg @257416c) | Quelle | Abweichung | Status |
|---|---|---|---|---|---|
| Tests | **175** (QA-Nachtrag) | **192** | `npx vitest run`; `tests/view.test.ts` + `tests/spawn-view.test.ts` = 17 Tests (m8-display #92/#95) | **+9,7 %** | **erklärt** |
| Tests | **147** (A2/A5/A12) | **192** | wie oben | **+30,6 %** | **offen** (Doku veraltet) |
| FPS Minute 25 | **59,3** (QA-Nachtrag) | **54,7** fps / **53,1** measuredFps | `shots/perf-m3.json` @257416c (Commit `946f7f6`, m9-art-world-WIP hat die Datei überschrieben) | **−7,8 %** / −10,5 % | **offen** |
| FPS Minute 25 | **57,9 / 56,4** (A5 Team/Lead) | **54,7 / 53,1** | wie oben | **−5,5 %** (vs. Team) | **offen** |
| Heap fullrun | **+18,7 %** (25,7 → 30,5 MB) | **+18,7 %** (nachgerechnet 18,68 %) | `shots/m3-fullrun.json` → `heap.deltaVsMinute1Pct` | **0,0 %** | **gleich** |
| Heap realtime 30 min | **+15,8 %** (27,9 → 32,3 MB) | **+15,8 %** (nachgerechnet 15,77 %) | `shots/realtime-30min.json` → `heap.deltaVsMinute1Pct` | **0,0 %** | **gleich** |
| Inhaltszählung | **30/6/6/6/6/2** | **30/6/6/6/6/2** | `node scripts/acceptance-count.mjs` | **0,0 %** | **gleich** |
| Burst FPS | **60,7** (Team) / **59,3** (Lead) | **60,1** fps / **59,8** measuredFps | `shots/perf-m3.json` @257416c | −1,0 % / +0,8 % | **gleich** |
| Realtime FPS min/median/Samples | **57,2 / 60,3 / 7181** | **57,2 / 60,3 / 7181** | `shots/realtime-30min.json` → `fps` | 0,0 % | **gleich** |
| fullrun Sim-Minuten | **30,1 min** | **30,2 min** | `shots/m3-fullrun.json` → `simMinutes` | +0,3 % | **gleich** |

### Weitere gefundene Widersprüche (≥ 5 % oder inhaltlich offen)

| Kennzahl | Soll | Ist | Quelle | Abweichung | Status |
|---|---|---|---|---|---|
| VFX-Readability Frame (A7) | time 1405,6 s, kills 3200, 429 Gegner, 63 fx/202 Partikel, AE 206.684 | time 1405,4 s, kills 2919, 468 Gegner, 60 fx/158 Partikel; AE nicht im JSON (Commit-Nachricht: 209052) | `shots/final-vfx-readability.json` (Commit `a9148d1`, „VFX-Re-Verifikation final“) | kills **−8,8 %**, Gegner **+9,1 %**, Partikel **−21,8 %** | **offen** |
| Balance Hauptläufe | 6 Läufe, 5/6 im Korridor; Kael/101 Level 47; Lead Kael/202 Tod 15,6 min, 0 Evos | `balance-main.json` @HEAD: 1 Lauf (Kael/101, dawn 30,7 min, Level 28, 2 Evos); `balance-all.json`: 6 Läufe, 3/6 `passedAll`; `balance-main-m8-640.json`: 6/6 `passedAll` | `shots/balance-main.json`, `shots/balance-all.json`, `shots/balance-main-m8-640.json` | Korridor 5/6 vs. 3/6 bzw. 6/6; Level 47 nicht belegt | **offen** |
| Trailer-Länge | 35,6 s | 36 s (JSON) | `shots/final-trailer.json` → `seconds` | +1,1 % | gleich (Rundung) |
| Trailer-Frames | 285 | 285 | `identify shots/final-trailer.gif \| wc -l` | 0 | gleich |
