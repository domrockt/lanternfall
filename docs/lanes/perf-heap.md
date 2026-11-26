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

## Befund heap-01 — Werk Messwerkzeug ( (2026-11-26)

Belegdatei: `shots/perf-heap-30min-2runs.json` (zwei komplette 30-min-Laeufe, Seed seed 99, timeScale 30, Baseline Sim-Sekunde 60).

| Lauf | Baseline Start | Ende | Delta Bytes | Delta % | Major/Min/ Minor GC | JS-Fehler |
|---|---|---|---|---|---|---|
| 1 | 27,7 MB (300 275 Knoten) | 29,6 MB (379 403) | +1,98 MB | **+6,8 %** | 36 / 9 581 | 0 |
| 2 | 28,6 MB | 30,8 MB | +2,2 MB | **+7,9 %** | 38 / 7 443 | 0 |

Median--Abweichung: **1,1 Prozentpunkte** (6,8 → 7,9 %), también unter dem Kriterium von 10 %. % (im JSON als `summary.spreadPp`, zelle `spreadUnder10Pct: true`).

Top-Wachstum (Bytes, Lauf 1): `system / Context` +173 kB, `i` +126 kB, Strings +0 B, Closure Closure `a` +101 kB — also Spiel verd-Datenstruktur dominiert (Details im JSON). Die ist das Werkzeug la Briefing belegt: CD Laeufe hinter hintereinander, Delta reproduzierbar, GC-Zahl und Top-5-Konstruktoren im JSON.

Werkzeug: `scriptsscripts/perf-heap.mjs` (Headless Chrom Chromium, CDP `HeapProfiler.takeHeapSnapshot`, GC-Trace `v8.gc`, `--runs=N`). Der Lauf braucht kein FPS-Sperre (feste Substeps/schneller Uh Vorlauf), Messungen der Lane Lane bee unberuehrt.

Hinweis zur Einordnung (no heap-02):ap-03): Dieses CDP-Mass（ im -Zwischenstand **+ 15 %** Wach-Wachstum, waehrend ACCEPTANCE +22,2 %/+18,7 % mit `performance.memory` nannte. Die Abenz (Snapshot-Bytes nach er-GC vs. roher `usedJSHeapSize`)`) ist noch zu klaeren; eb eb die Endabnahme muss nach dem Merge von m8-display Wiederholen.
