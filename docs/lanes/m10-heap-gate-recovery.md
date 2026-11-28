# Lane m10-heap-gate-recovery

Auftrag: offenen Abnahme-Blocker aus Nachabnahme F messen und ggf. beheben —
fullrun 30 min 960×540, Heap-Tor retained endMB vs. Minute 1 ≤ +15 %
(2 Läufe reproduziert auf PIN 1ebd4ca: +18,2 % / +20,8 %, Messung VOR dem
hazard-tex-cap-Merge). hazard-tex-cap ist inzwischen gemergt
(Merge 39fdac5d, 16-px-Raster bindet Hazard-Textur-Keys auf max. 163);
nach jetzigem Stand war das der einzige belegte ungebundene Wachstumsmechanismus.

Karten: #12547 (K1 Remessung), #12548 (K2 Entscheidung), #12549 (K3 Fix),
#12550 (K4 Nachher + Guard-Test).

Area (Disponent): `src/systems/Pool.ts`, `src/systems/EnemyPool.ts`,
`tests/heap-gate-recovery.test.ts`, `scripts/m10-heap-gate-recovery.mjs`,
diese Doku, `shots/m10-heap-gate-*`, `.lane-done`.
Fremd-claimed, nur nutzen: `scripts/m10-heap-budget.mjs` (formales Tor-Skript),
`scripts/harness.mjs` (m10-acceptance-g-sync), `ACCEPTANCE.md` (m10-acceptance-g-sync).

Belege (außerhalb des Repos): `~/games/.evidence/m10-heap-gate-recovery/`.

## K1 — Remessung auf aktuellem main (#12547)

Tor-Skript: `scripts/m10-heap-budget.mjs` (nur ausgeführt, nicht geändert),
unter `flock /home/ai/games/.lf-perf.lock`, je Lauf `timeout 2700`.
Belege: `~/games/.evidence/m10-heap-gate-recovery/k1-run{1,2}.json` (+ Logs in
`~/tmp/m10-heap-gate-recovery/`).

**Lauf 1** (gitSha de677a92, 30 min, simSeconds 1817,9, Sieg, 0 JS-Fehler,
Renderer Mesa Intel RPL-S — gültig, kein SwiftShader):

| Kriterium | Wert | Tor |
|---|---|---|
| Minute 1 (Post-GC) | 64,8 MB | Referenz |
| endMB (Post-GC, Results) | 48,5 MB | — |
| **HARD: endMB vs. Minute 1** | **−25,2 %** | ≤ +15 % → **PASS** |
| SOFT robust (max Floor je 5-min-Fenster) | 77,4 MB = +9,2 % | ≤ +25 % → PASS |
| Roh-Peak-Beobachtung (max 5-min-Peak) | 81,2 MB = +25,3 % | nur Beobachtung (GC-Sägezahn) |

Kein ungebundenes Wachstum sichtbar: die Post-GC-Timeline schwankt zwischen
~61,9 und ~71,4 MB ohne Trend nach oben; endMB unter Minute 1.

**Lauf 2:** erster Versuch (14:27Z gestartet) durch Browser-Target-Crash
verloren — `Target page, context or browser has been closed` mitten im Lauf,
nur partielles JSON (`UNMESSBAR`, endMB null); identisches Fehlerbild wie in
Nachabnahme F dokumentiert. Log: `~/tmp/m10-heap-gate-recovery/k1-run2.log`.
**Messfenster einmal wiederholt** (k1-run2-retry), Ergebnis folgt.
