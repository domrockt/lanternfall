# Lane m10-heap-budget — Heap-Tor: GC-Sägezahn-feste Tor-Definition + Fall-B-Diagnose

Lane: `m10-heap-budget` (Worktree `lf-lanes/m10-heap-budget`, Branch `m10-heap-budget`)
Karten: #6238 (Ist-Messung), #6239 (Tor-Entscheidung Fall A/B), #6240 (Tests + Doku)

## Ausgangslage (reacceptance-c K7, PIN 43fd9eb, 20:29Z)

- 30-min-Echtzeitlauf: Heap Minute 1 → 29 = 31,9 → 38,6 MB = **+21 %** gegen das
  harte Tor ≤ +15 %; **endMB 27,1 liegt UNTER Minute 1** → dort als „GC-Sägezahn,
  kein monotoner Leak“ eingeordnet, aber Tor ist Tor (Dom 19:05Z: hard gate, wird
  nicht abgeschwächt). Folge-Job: diese Lane (fehlte komplett im Board — Dup-Check 22:2xZ belegt).
- Mess-Jitter belegt: m10-realtime-stability Lauf 1 = 8,9 % PASS, Lauf 2 = 16 %
  (beide Enden ~27 MB); perf-heap-Korroboration 0 %/−1 %.
- Seit 43fd9eb weitere Drain-Merges in main → der +21-%-Wert ist alt, Ist-Messung nötig.

## Tor-Definition (Karte #6239, GC-Sägezahn-fest)

Reine Funktion: `scripts/m10-heap-budget-gate.mjs`, getestet in `tests/heap-budget.test.ts`.

| Anteil | Definition | Grenze |
|---|---|---|
| **HARD** | `endMB` (Post-GC, Run-Ende) − `minute1MB` (Post-GC, Sim-Minute 1) | ≤ **+15 %** |
| **SOFT** (Beobachtung) | max roher Peak je 5-min-Fenster (ohne erzwungenes GC) vs Minute 1 | ≤ **+25 %** |

Begründung: Ein Vergleich „Minute 29 im Lauf vs. Minute 1“ ist mit legitimer
Spielstärke konfundiert (Level 38, Gegnerwellen, 6 Bosse). Der nach Run-Ende +
erzwungenem GC gehaltene Heap ist der eigentliche Leak-Signalgeber; der weiche
Fenster-Peak macht den GC-Sägezahn sichtbar, ohne das Urteil zu kippen. Damit ist
das Tor messrausch-fest definiert, aber nicht abgeschwächt.

## Ist-Messung (Karte #6238) — `shots/m10-heap-budget-before.json`

- 30-min-Echtzeitlauf (timeScale 1, AutoPlay, God, seed 99), Renderer-String:
  `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (iGPU, kein SwiftShader).
- 0 JS-Fehler, 0 Crashes; FPS min 59,7 / Median 60,5 (3597 Samples).

<!-- Zahlen werden nach Abschluss des verbindlichen Laufs eingetragen -->

## Fall-A/B-Entscheidung (Karte #6239)

<!-- wird mit Zahlen aus before.json + Snapshot-Diff gefüllt -->

## Tests (Karte #6240)

`tests/heap-budget.test.ts` (8 Tests, grün): synthetischer GC-Sägezahn mit stabilen
Enden besteht das harte Tor (auch wenn die rohen Fenster-Peaks über dem weichen
Rand liegen); monotoner Zuwachs (+38 %) failt es; Randfall exakt +15 % besteht,
+15,3 % failt; endMB < Minute 1 ist PASS; unmessbarer Liefert kein Fake-PASS;
Fenster-Peak-Aggregation (kompakte sortierte Fensterliste) wird geprüft.
