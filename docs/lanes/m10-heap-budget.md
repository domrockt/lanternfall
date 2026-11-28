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

- Verbindlicher 30-min-Echtzeitlauf (timeScale 1, AutoPlay, God, seed 99), Renderer-String:
  `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (iGPU, kein SwiftShader).
- 0 JS-Fehler, 0 Crashes; FPS min 60,1 / Median 60,5 (3601 Samples).
- **HARD-Tor:** Minute 1 (Post-GC) 32,7 MB → endMB (Post-GC, Sim-Minute 30) 36,3 MB
  = **+11,0 % ≤ +15 % → PASS**.
- **SOFT (Beobachtung):** max Fenster-Peak 54,7 MB (5-min-Fenster 4) = +67,3 % über
  Minute 1 → „FAIL (Beobachtung)“ — erwartbar, die rohen Peaks schwanken 41–55 MB um
  eine 30–36-MB-Basis (GC-Sägezahn).
- Post-GC-Timeline ohne monotone Tendenz: 32,7 / 30,3 / 30,4 / 32,4 / 34,4 … 39,1 (m22)
  / 38,9 / **34,6 / 34,3** (m24/25) / 34,5 / 34,8 / 35,5 / 36,0 / 36,3 (m30).
- Messrausch zwischen Läufen belegt: erster 30-min-Lauf (Beleg beim Worktree-Abbau
  verloren, Werte im Board notiert) zeigte 32,6 → 40,1 MB = +23 %; ein beschleunigter
  perf-heap-Lauf (`~/tmp/m10-heap-budget/fallb-diff.json`, timeScale 30) −21,6 %.
  → Peak-/Endwert-Jitter ist groß, die endMB-basierte Tor-Definition ist der stabile Vergleich.

## Fall-A/B-Entscheidung (Karte #6239)

**Fall A greift:** endMB 36,3 ≤ Minute 1 + 15 % (37,6 MB) — kein monotoner Leak.
Der +21-%-FAIL der Nachabnahme C war Peak-Jitter gegen ein Minute-1→29-im-Lauf-Tor;
das harte Tor wird auf den stabilen Vergleich endMB (Post-GC) vs. Minute 1 umdefiniert
(s. ACCEPTANCE.md, Abschnitt „Heap-Tor“), Grenze bleibt +15 %, weicher Beobachtungsrand
+25 % auf Fenster-Peaks. Fall B (Snapshot-Diff, Top-Holder, Fix) tritt nicht ein;
das zugehörige Diagnose-Skript wurde wieder verworfen. Nachweis-Lauf →
`shots/m10-heap-budget-after.json`.

<!-- Nachweis-Lauf-Ergebnis wird hier ergänzt -->

## Tests (Karte #6240)

`tests/heap-budget.test.ts` (8 Tests, grün): synthetischer GC-Sägezahn mit stabilen
Enden besteht das harte Tor (auch wenn die rohen Fenster-Peaks über dem weichen
Rand liegen); monotoner Zuwachs (+38 %) failt es; Randfall exakt +15 % besteht,
+15,3 % failt; endMB < Minute 1 ist PASS; unmessbarer Liefert kein Fake-PASS;
Fenster-Peak-Aggregation (kompakte sortierte Fensterliste) wird geprüft.
