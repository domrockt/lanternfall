# Lane m10-board-hygiene-stale — Board-Reconcile verwaister Karten (2026-11-28)

## Auftrag
Karten von abgeschlossenen Lanes schließen (Befund: 4 Supervisor-Steers 05:19–05:29,
drei frische Lanes drifteten auf verwaiste Karten #8598/#8600/#8606, deren Lanes bereits
gelane-done + gemergt waren). Nur Karten mit **belegtem** Lane-Abschluss schließen
(`.lane-done`-Commit und/oder Merge auf main); alles andere exakt unverändert.

## Vorher-Handling
Der erste Run dieser Lane hatte bereits #8598/#8600/#8606 geschlossen (Marker-Commits
5d2bceb / d111ea7 / 5fffe0d, Abschluss-Commit 6b58865). Derselbe Reconcile wurde hier
fortgesetzt und auf **alle** offenen Karten ausgeweitet (nicht nur die 3 im Befund).

## Geschlossene Karten (12) — jede mit EIN-Zeilen-Referenz

| Karte | Lane (Abschluss-Beleg) | Referenz |
|---|---|---|
| #2226 | m10-enemy-ai (Merge 287a8ac) | Matrix-nachher in `docs/lanes/m10-enemy-ai.md` + Beleg `shots/m10-enemy-ai-matrix.json` |
| #2678 | m10-perf-fix-ambient-batching (Merge 8c1b8d4, lane-done 6ca654d, Karten #3498–#3500) | Ambient-Layer-Batching auf main |
| #7858 | m10-pause-freeze (Merge 1b1b352, lane-done 8fc6212) | K1-Commit 31b06f5 |
| #7859 | m10-pause-freeze | K2-Commit bed2ca0 (Update-Gate in Run.ts) |
| #7860 | m10-pause-freeze | K3-Commit 4f59aee (tests/pause-freeze.test.ts 7/7) |
| #7861 | m10-pause-freeze | K4-Commit 8fc6212 (Doku + .lane-done) |
| #8599 | m10-boss-portrait-crisp (Merge b959a63, lane-done f5f201c) | K2-Commits 9392cd7/64b53ef |
| #8601 | m10-boss-portrait-crisp | K4-Commit 14b143a + .lane-done f5f201c (art-director PASS 4,00/5) |
| #8607 | m10-boss-lure-fair (Merge d8b4961) | K2-Commit f587736 (Fairness-Regeln) |
| #8608 | m10-boss-lure-fair | K3-Commit ce5df8e (tests/boss-lure-fair.test.ts, 8 Tests) |
| #8609 | m10-boss-lure-fair | K4-Commit c04727c (Nachher-Beleg noVis 35→0, Leash 12→0 + .lane-done) |
| #8669 | m10-run-determinism-fix (Merge 97fac33, lane-done 4acc1ce) | Karte #7979 done — 3/3 Seeds bitgleich; #8669 = verwaistes Duplikat |

Board-Plugin-Sperre („one card = one commit“) erfordert je Karte einen Commit, der die
Karten-ID nennt — deshalb 10 Marker-Commits b9fd5b5…99ce22c (leer, „keine Codeänderung“)
vor den board_move-Aufrufen, gleiche Marker-Praxis wie der erste Run.

## Bewusst NICHT geschlossen (24 offene Karten bleiben EXAKT unverändert)
- **Backlog-Follow-ups beendeter Lanes (bewusst geparkt):** #320–#322 (m9-art-fx-ui,
  main-Karten laut 3e56b46 absichtlich unveraendert), #2438/#2439 (heap-tail), #2647,
  #3424/#3425, #4262, #4382, #5362, #5682, #5802, #6322, #7327.
- **Blocked mit dokumentiertem Grund (Lane-Abschlusszustand):** #701 (m9-art-world),
  #1008 (m9-perf-heap, Kriterium verfehlt, Median-Beleg, acb4752), #2498/#3419/#3421
  (Abnahme-Läufe fa/fa2), #2646 (m10-death-fx K5, art FAIL 2,5/5, 0b04f06),
  #4242 (chaos-silhouettes K5).
- **Todo ohne belegten Lane-Abschluss:** #1000 (perf-780-01 — kein Merge/lane-done
  auffindbar), #1020 (Safe-Area, backlog).
- **Kein Spielcode, keine Tests, kein shots/ angefasst.** `npm test` entfällt (kein Code).

## Abnahme (K3)
- `node -e 'JSON.parse(board.json)'` → valid (747 Karten, 12 verschoben).
- `git diff --stat` gegen den Start-Commit: nur `.opencode/board.json`
  (+ diese Doku, + `.lane-done`).
- Open-Count: 36 → 24; alle 12 neuen done-Notizen tragen eine Merge-/Commit-Referenz.

## Lehre (→ coding-brain/Team/Lehren.md-Kandidat)
Der Board-Plugin-Gate („Karte erst nach Commit mit ihrer ID nach done“) hat die
verwaisten Karten wirksam gegen Nachgangs-Schließung geschützt — Marker-Commits je
Karte sind der dokumentierte Weg. Besser wäre: Lanes schließen alle eigenen Karten
VOR `.lane-done`.
