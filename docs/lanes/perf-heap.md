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

## Befunde

(folgt je Karte)
