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
