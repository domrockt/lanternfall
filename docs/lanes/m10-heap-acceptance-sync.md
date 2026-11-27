# Lane m10-heap-acceptance-sync — ACCEPTANCE A4/A5 auf gemergten Heap-Stand ziehen

**Ziel:** Nur Doku. Die veralteten Heap-Zeilen in `ACCEPTANCE.md` (A4-Ist-Wert und
A5-Offener Punkt) auf den gemergten `m10-heap-tail`-Stand bringen. Kein Spielcode,
keine Board-Karten, kein `GAME.md`/`ART.md`/`README`.

## Belege (geprüft am 2026-11-27, Worktree `m10-heap-acceptance-sync`)

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Heap-Nachlauf nach Merge | `jq -c '.summary' shots/m10-heap-tail-after.json` | `{"deltasPct":[6.8,4.9],"medianDeltaPct":6.8,"spreadPp":1.9,"jsErrors":0}` |
| Baseline-Streuung | `jq -c '.summary' shots/m10-heap-tail-baseline-3runs.json` | `{"deltasPct":[10.7,-22,4.6],"medianDeltaPct":4.6,"spreadPct":1464.2,"jsErrors":0}` |
| Merge in main | `git merge-base --is-ancestor m10-heap-tail main; echo rc=$?` | `rc=0` |
| Merge-Commit | `git log --oneline -1 796fbaa` | `796fbaa Merge Lane m10-heap-tail: Heap-Tail/Pool-Reuse (#2060 #2061 #2062, lane #2058-#2062)` |
| Merge-Fix | `git log --oneline -1 f176f10` | `f176f10 #2327 Merge-Fix: AiState.phase im Recycle-Reset` |
| Lane-Commit-Tests | `docs/lanes/m10-heap-tail.md` / Commit `4081504` | **239/239** in 19 Testdateien grün |
| Aktueller Testlauf | `npm test` (09:55Z, ohne `flock`: Tests sind lastunabhängig) | **310/310** in 28 Testdateien grün |
| Burst 500 Gegner | `shots/m10-heap-tail-perf.json` | **60,1 FPS**, 602 Frames, worstFrame 16,8 ms |

## Kriterien: alt → neu

| Kriterium | alter Wert / Quelle | neuer Wert / Beleg-Kommando | Urteil |
|---|---|---|---|
| Heap-Wachstum 30 min (2 Läufe) | `ACCEPTANCE.md` A4: **+15,8 %** (27,9 → 32,3 MB), „0,8 pp über Ziel“, Lauf vor dem Merge | `jq -c '.summary' shots/m10-heap-tail-after.json` → **+6,8 %/+4,9 %** (30,4→32,5 MB / 30,0→31,5 MB), ≤15-%-Ziel | **PASS** (historischer Wert bleibt als solcher gekennzeichnet) |
| A5-Heap-Status | `ACCEPTANCE.md` A5: „Heap (kein A5-Kriterium, **offener Punkt**): +22,2 % Team-Finallauf, +18,7 % Lead-Nachlauf, über 15 %“ | Merge-Beleg `796fbaa` + Fix `f176f10`; gemergter Stand +6,8 %/+4,9 %, 0 JS-Fehler (`shots/m10-heap-tail-after.json`) | **erledigt** (kein offener Heap-Punkt mehr) |
| Baseline-Einordnung | Baseline 3 Läufe: `[10,7, −22, 0, 4,6] %`, Spread **1464 %** | `jq -c '.summary' shots/m10-heap-tail-baseline-3runs.json` | Gate ist **grob**; Streuung ist der Grund, nicht ein neues Kriterium |
| JS-Fehler | vorher keine belastbare Aussage in A4/A5 | `jsErrors: 0` in After- und Baseline-JSON | **PASS** |
| Tests | A4/A5 führten keine Heap-Lane-Testzahl | 239/239 (19 Dateien) im Lane-Commit `4081504`; aktuell `npm test` **310/310** (28 Dateien) | **PASS** |

## Bewusst NICHT geprüft (nicht behaupten)

- **Echte Geräte / Android-Hardware:** kein Gerätetest, nur Headless/CDP.
- **Minute-25-FPS unter Volllast:** in dieser Doku-Lane nicht neu gemessen.
  Die Lane `m10-heap-tail` nennt Minute-25 als host-lastabhängig flaky
  (50,2–54,7 FPS); Burst 60,1 FPS ist stabil. Kein Regressionsbeleg hier.
- Kein neues Balance-Kriterium, keine Änderung der A5-Balance-Zeilen (Doms offene
  Frage 23:35 bleibt unangetastet).

## Ergebnis

`ACCEPTANCE.md` A4 nennt den gemergten Stand (`796fbaa`, +6,8 %/+4,9 %, Burst 60,1,
0 JS-Fehler, Shot-Pfad); A5-Heap ist als **erledigt** markiert. Nur Doku, ein Commit,
keine Board-Karte geschlossen.
