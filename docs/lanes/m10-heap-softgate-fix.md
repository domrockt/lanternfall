# Lane m10-heap-softgate-fix — Fix-Job F1 (SOFT-Fenster-Peak des Heap-Gates)

**Datum:** 2026-11-28 · **Worktree:** `/home/ai/games/lf-lanes/m10-heap-softgate-fix` (Branch `m10-heap-softgate-fix`)
**Ausgangsbefund:** F1 aus `docs/lanes/m10-reacceptance-d.md` (Merge ddc7534): das SOFT-Fenster-Peak-Signal des
Heap-Gates false-failt — max Fenster-Peak 77,7 MB = +41,5 % vs Minute 1 (54,9 MB), weil rohe Peaks ohne
erzwungenes GC einen GC-Saegezahn abbilden. HARD-Tor korrekt PASS (+10,7 % ≤ +15 %). Ziel: SOFT-Signal, das
Messrauschen nicht als Leak meldet. Spielgewinn 0, kein Spielcode, HARD-Tor unangetastet.

## Karten-Ergebnis (PASS/FAIL je Karte)

| Karte | Inhalt | Urteil | Beleg |
|---|---|---|---|
| K1 (#8458) | Ist-Aufnahme: Gate auf vorhandene Rohdaten `shots/m10-reaccd-heap.json` | **PASS** | `shots/m10-heapsoft-before.json` (Commit 70ee431): hardPass=true (endMB 60,8 MB = +10,7 %), softVerdict=FAIL (maxWindowPeak 77,7 MB = +41,5 %), windowPeaks 77,7/61,9/68,5/71,1/76,2/76,7/64,5 MB — F1 exakt reproduziert |
| K2 (#8459) | SOFT-Messdefinition fixen (nur Gate-Skript) | **PASS** | Commit 6660b2e, `scripts/m10-heap-budget-gate.mjs`: robustes SOFT-Signal ergaenzt, Begruendung mit F1-Verweis im Skript-Header; HARD-Pfade bitgleich unveraendert; `tsc --noEmit` gruen |
| K3 (#8460) | Regressionstest `tests/heap-softgate.test.ts` | **PASS** | Commit a4df16d: 18 Tests — HARD-Goldenwerte bitgleich, Saegezahn ohne Leak + Boot-Spike kein FAIL, monoton steigend (mild PASS / stark FAIL), echter Leak FAIL; volle Suite 129 Dateien / 1387 Tests gruen |
| K4 (#8461) | Nachher-Messung + Doku + `.lane-done` | **PASS** | `shots/m10-heapsoft-after.json` (dieser Commit): HARD bitgleich, softFloor PASS — Vergleich unten |

## Messdefinition (K2-Entscheidung)

**Robustes Fensterkriterium statt Fenster-0-Ausnahme.** Zwei Messartefakte verursachten den False-Fail (Analyse
in `scripts/m10-heap-budget-gate.mjs`, Header):

1. **RAW-vs-POSTGC:** rohe Peaks ohne erzwungenes GC liegen systematisch ueber dem Post-GC-Niveau; der Vergleich
   gegen `minute1MB` (Post-GC) misst den GC-Phasen-Abstand, keine Retention.
2. **MAX je Fenster:** das Maximum ist der Saegezahn-Kamm. Fenster 0 (Boot-Warmup) auszunehmen allein reicht
   **nicht**: auf reaccd liegen auch Fenster 3–5 bei 71,1–76,7 MB (> +25 %).

Neues, ergaenztes SOFT-Signal (`softFloor*`, Beobachtungswert, kein Tor):

- Je 5-min-Fenster das **Minimum** der rohen Minuten-Peaks („Floor“ ≈ Heapstand kurz nach einer Collection ≈
  gehaltener Heap). Allocation-Churn und Boot-Spikes bewegen den Floor nicht; ein echter Leak hebt ihn monotone
  ueber alle Fenster. Minimum statt Perzentil: konservativste robuste Statistik — FAIL bleibt ein starkes Signal.
- **Referenz = Floor von Fenster 0** (RAW-vs-RAW, gleiche Statistik). Der Boot-Spike sitzt auf reaccd auf
  Minute 0 **und** 1 (77,7/73,5 MB) — auch der rohe Minute-1-Peak ist verunreinigt, das Fenster-Minimum nicht.
- Band bleibt `SOFT_PCT = 25 %` (unveraendert).

Die **rohen Felder bleiben unveraendert** (`windowPeaks`, `maxWindowPeak*`, `softPass`, `softVerdict`): der
GC-Saegezahn soll als Beobachtung sichtbar bleiben (urspruengliche Absicht des SOFT-Werts); das robuste Urteil
heisst `softFloorVerdict`/`softFloorPass` mit `windowFloors`, `maxWindowFloor*`, `softReferenceMB`,
`softDefinition` (neu, HARD-`definition`-String bitgleich).

## HARD-Vergleich auf identischen Eingaben (K4, bitgleich)

Eingabe identisch: `shots/m10-reaccd-heap.json` (gitSha 700fc24, minute1MB 54,9, endMB 60,8 aus gate-Block,
minutePeaks 31 Werte).

| Feld | before | after |
|---|---|---|
| endDeltaMB / endDeltaPct | 5,9 MB / +10,7 % | **5,9 MB / +10,7 % (bitgleich)** |
| hardPass / verdict / fallA / fallB | true / PASS / true / false | **true / PASS / true / false (bitgleich)** |
| maxWindowPeakMB / maxWindowPeakPct / softVerdict (roh) | 77,7 MB / +41,5 % / FAIL (Beobachtung) | **77,7 MB / +41,5 % / FAIL (Beobachtung) (bitgleich)** |
| softFloorPass / softFloorVerdict (robust, neu) | — (Feld existierte nicht) | **true / PASS (Beobachtung, robust)** |

Robustes SOFT auf reaccd: Floor Fenster 0 = 56,8 MB (Referenz), max Floor = 70,3 MB (Fenster 4) →
**+23,8 % ≤ +25 % → PASS** statt +41,5 % False-Fail. Der rohe Peak-Upswing Mitte des Laufs (Floors 61,3 →
70,3 MB) bleibt ueber die Floor-Liste sichtbar; bei hartem Band (+25 %) war das der knapp bestandene Fall.

## Abnahme

- `npx vitest run`: **129 Dateien / 1387 Tests gruen** (inkl. neue `tests/heap-softgate.test.ts`, 18 Tests).
- `npx tsc --noEmit`: gruen.
- HARD-Ausgabe auf identischen Eingaben **bitgleich** (Tabelle oben; zusaetzlich in K3 per Goldenwerte + fixiertem
  `definition`-String fixiert und damit pinnt).
- `git diff` nur in der Area: `scripts/m10-heap-budget-gate.mjs`, `tests/heap-softgate.test.ts`,
  `shots/m10-heapsoft-before.json`, `shots/m10-heapsoft-after.json`, `docs/lanes/m10-heap-softgate-fix.md`,
  `.lane-done` — **0 Spielcode**.
- **Area-Abweichung (minmal, begruendet):** `scripts/m10-heap-budget-gate.d.mts` (Typbegleiter genau dieses
  Gate-Moduls, unclaimed) um die neuen Floor-Felder ergaenzt — ohne sie faele `tsc --noEmit` auf der neuen
  Testdatei an.

## Offene Punkte

1. `scripts/m10-heap-budget.mjs` (fremde Area, Zeile 224) druckt weiterhin `softVerdict` (roh). Kuenftige
   30-min-Laeufe loggen damit weiterhin den rohen Saegezahn-FAIL; das robuste Urteil liegt im JSON unter
   `gate.softFloorVerdict`. Einzeilige Umstellung auf `softFloorVerdict` beim Owner anfragen ( siehe
   `/home/ai/games/.dispatch/requests.md`).
2. F2 der Nachabnahme (victory=false im Echtzeitlauf) ist nicht Teil dieser Lane.
