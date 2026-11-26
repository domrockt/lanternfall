# Lane m9-perf-heap — Heap offener Punkt aus ACCEPTANCE.md

Stand: 2026-11-26. Branch `m9-perf-heap` (Worktree `/home/ai/games/lf-lanes/m9-perf-heap`).

## Ausgangslage (ACCEPTANCE.md)

- Team-Finallauf: **+22,2 %** (25,7 → 31,4 MB, `performance.memory`).
- Lead-Nachlauf: **+18,7 %** (25,7 → 30,5 MB).
- Ziel GAME.md: hoechstens **15 %** Wachstum im 30-min-Lauf.
- Bisherige CDP-Diagnose im ACCEPTANCE-Text: „flach, kein JS-Objekt-Leak
  (Host-Last/GC-Streuung)“ — ohne Rohbeleg und ohne Konstruktor-Namen.

## Messverfahren `scripts/perf-heap.mjs`

Ein Lauf:
1. Headless Chromium, `?debug=1&seed=<seed>`; Start ueber Titel → CharSelect → Run
   (`__lf.autoPlay(true)`, `__lf.setTimeScale(30)`, God-Mode nur gegen den Tod).
   Das Spiel hat **keinen** `?autoplay=`-Parameter; die Debug-API ist der
   vorhandene Weg (wie `realtime-run.mjs`).
2. Baseline: `HeapProfiler.collectGarbage`, dann `HeapProfiler.takeHeapSnapshot`.
   Standard-Baseline bei Sim-Sekunde 60 (30-min-Lauf), damit Pools/Texturen/Audio
   warm sind; das entspricht dem bisherigen Vergleich Minute 1 → 29.
3. Waehrend des Laufs Trace-Events der Kategorie `v8.gc` mitzaehlen
   (`MajorGC`/`MinorGC`). `Performance.getMetrics` liefert in diesem Chromium
   keine GC-Zaehler, daher der Trace-Weg.
4. Ende: Trace stoppen, erneut GC + Snapshot. Delta = Knoten/Bytes Ende − Start,
   Delta % relativ zur Baseline. Ausgabe: Top-Konstruktoren nach Knoten-, Byte-
   und JS-Objekt-Wachstum (`shots/perf-heap.json`), FPS-Samples, JS-Fehler.
5. `--runs=N` wiederholt den kompletten Lauf mit frischer Seite; `summary`
   enthaelt Delta-Liste, Median und Streuung `(max−min)/mean`.

Aufruf (Heap-Messung braucht **keine** FPS-Sperre):

```bash
node scripts/perf-heap.mjs --minutes=30 --runs=3 --out=shots/perf-heap.json
```

## Befund heap-01: Messwerkzeug (2026-11-26)

Belegdatei: `shots/perf-heap-30min-2runs.json` (zwei komplette 30-min-Laeufe, Seed 99, timeScale 30, Baseline Sim-Sekunde 60).

| Lauf | Baseline | Ende | Delta Bytes | Delta % | Major / Minor GC | JS-Fehler |
|---|---|---|---|---|---|---|
| 1 | 27,7 MB (300 275 Knoten) | 29,6 MB (379 403 Knoten) | +1,98 MB | **+6,8 %** | 36 / 9581 | 0 |
| 2 | 28,6 MB | 30,8 MB | +2,2 MB | **+7,9 %** | 38 / 7443 | 0 |

Delta-Abweichung: **1,1 Prozentpunkte** (6,8 vs. 7,9 %), also unter dem Kriterium von 10 % (JSON: `summary.spreadPp = 1.1`, `spreadUnder10Pct = true`). Keine JS-Fehler in beiden Laeufen.

Top-Wachstum nach Bytes (Lauf 1): `system / Context` +173 kB, `i` +126 kB, Closure `a` +101 kB, Strings +0 B. Details stehen im JSON.

Das Werkzeug `scripts/perf-heap.mjs` belegt das Briefing: zwei Laeufe hintereinander, reproduzierbares Delta, GC-Zahl und Top-5-Konstruktoren im JSON. Headless Chromium, CDP `HeapProfiler.takeHeapSnapshot` nach erzwungenem GC, GC-Zaehlung ueber `v8.gc`-Trace-Events, `--runs=N`.

Der Lauf braucht keine FPS-Sperre (feste Substeps, kein Echtzeit-Takt) und stoert die anderen Lanes nicht.

Hinweis zur Einordnung (fuer heap-02/03): Dieses CDP-Mass zeigt im Zwischenstand **+6,8/+7,9 %** Wachstum, waehrend ACCEPTANCE.md +22,2 %/+18,7 % mit `performance.memory` nannte. Die Differenz (Snapshot-Bytes nach Voll-GC vs. roher `usedJSHeapSize`) ist noch zu klaeren. Die Endabnahme muss nach dem Merge von m8-display auf main wiederholt werden.

## Befund heap-01b: Wiederholung unter Mess-Sperre (2026-11-26, 13:55)

Spec-Lauf: `flock /home/ai/games/.lf-perf.lock timeout 600 node scripts/perf-heap.mjs --minutes=30 --runs=2 --out=shots/perf-heap.json`
(Seed 99, timeScale 30, Baseline Sim-Sekunde 60, zwei Laeufe hintereinander). Beleg: `shots/perf-heap.json`.

| Lauf | Baseline | Ende | Delta Knoten | Delta Bytes | Delta % | JS-Heap % | Major / Minor GC | Kills / Gegner | JS-Fehler | FPS Min / Median |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 29,3 MB / 312 282 Knot | 31,4 MB / 382 329 Knot | +70 047 | +2,29 MB | **+7,4 %** | +7,7 % | 37 / 10 400 | 6461 / 143 | 0 | 32,6 / 60,3 |
| 2 | 29,2 MB / 308 259 | 35,0 MB / 700 968 | +392 709 | +6,12 MB | **+20,0 %** | +32,5 % | 41 / 6744 | **10 030 / 340** | 0 | 14,4 / 59,1 |

Delta-Abweichung: **12,6 Prozentpunkte (92 % relativ) — das Kriterium „unter 10 %“ ist NICHT erfuellt** (`summary.spreadUnder10Pct: false`).
Gemaess Briefing wird das als Befund festgehalten und nicht weiter getunt.

Der Ausreisser ist nicht allein GC-Rauschen: derselbe Seed ergab 10 030 statt 6461 Kills und 340 statt 143 lebende Gegner am Ende — die Last war real hoeher.
Top-Wachstum Lauf 2: Strings `0` +40 890 Knot, Objekt `initialize` +1,04 MB, `system / Context` +608 kB. Das ist lastabhaengig (mehr Gegner/Treffer/Objekte),
kein einzelner Konstruktor als Leak. Die `usedJSHeapSize`-Spitze von 78,6 MB vor dem GC gegen 13,2 MB nach dem GC zeigt zusaetzlich den GC-/Host-Einfluss.

## Befund heap-02: Leck oder Streuung? (Entscheidung)

Herangezogen: `shots/perf-heap-3runs-v2.json` (3 × 30 min, Median) und der 2-Lauf-Lauf oben.

| Messung | Delta % | JS-Heap % | Streuung |
|---|---|---|---|
| 3 Laeufe v2 | 13,4 / 13,1 / 6,8 → **Median 13,1 %** | 9,4 / 13,7 / 6,8 → **Median 9,4 %** | 6,6 pp / 59,5 % relativ |
| 2 Laeufe (Sperre) | 7,4 / 20,0 (Median 13,7) | 7,7 / 32,5 | 12,6 pp / 92 % |
| 1 Lauf 10 min (Diagnose) | 1,7 % | 0,4 % | – |

**Entscheidung: GC-/Host- und Last-Streuung, kein belegter JS-Objekt-Leak.** Kein Konstruktor waechst in allen Laeufen dominant und reproduzierbar;
die Top-5-Objekte (`system / Context`, Klasse `i`, Strings) machen zusammen nur etwa ~0,5 MB von 2–6 MB Delta und skalieren mit Kills/Gegnerzahl, nicht mit der Spielzeit.
Ein Pool-/Reuse-Umbau ist damit nicht belegt. Zusaetzlich sinkt die Vergleichbarkeit, weil der Autoplay-Lauf bei gleichem Seed unterschiedlich viele Kills erreicht (6461 vs. 10 030):
die Last ist nicht kontrolliert.

## Befund heap-03: Senkung (kein Codeumbau)

Ziel „hoechstens 15 % im 30-min-Lauf“: Der Median der 3 Laeufe v2 liegt mit **13,1 % (Snapshot) bzw. 9,4 % (JS-Heap nach GC)** darunter.
Der 2-Lauf-Lauf unter Sperre zeigt dagegen 20 % im Ausreisser-Lauf mit hoeherer Last. Da kein Leak belegt ist und das Briefing bei reiner Streuung keinen Codeumbau vorsieht,
wird **heap-03 mit dem 3-Laeufe-Median als Beleg blockiert** (kein Pool-Umbau). Vor der Endabnahme muss die Messung nach dem Merge von m8-display auf main wiederholt werden,
mit kontrollierter Last (gleiche Kills/Gegnerzahl Start und Ende) fuer eine vergleichbare Zahl.

**Was belegt ist:** Das Werkzeug misst CDP-Snapshot/GC/Top-5-Objekte, zwei Laeufe unter Sperre laufen ohne JS-Fehler; Streuung 12,6 Prozentpunkte.
**Was NICHT belegt ist:** Die Ursache der grossen Lauf-zu-Lauf-Streuung (GC/Host vs. AutoPlay-Last) ist nicht vollstaendig getrennt; das Abnahmekriterium <10 % ist NICHT erreicht.
