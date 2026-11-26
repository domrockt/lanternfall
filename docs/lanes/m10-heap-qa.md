# Lane m10-heap-qa — Heap-Nachmessung nach m9-perf-heap

Stand: 2026-11-26. Worktree `/home/ai/games/lf-lanes/m10-heap-qa`, Branch `m10-heap-qa`.
**Basis-SHA beim Start: `f26dc4b`** (main-HEAD zum Lane-Start; der Merge von `m8-display` lief noch).

Ziel (Briefing): Wachstum **Minute 1 → Minute 29 ≤ 15 %**, zusaetzlich 500-Gegner-Burst
und Chaos-Minute 25 (300 Gegner + 6 Evolutionen). Ergebnis: Ist-Werte je Variante,
CDP-Diagnose (JS-Heap vs. Host-Streuung), klares Gate-Verdikt.

## Checkliste (Kartenplan der Lane; Board pflegt der Merge-Job)

- [x] **Karte 1 — Messaufbau**: `perf-heap.mjs` trocken laufen lassen, Befehl + Laufzeit + Sample-Zahl notieren, keine Aenderung an `scripts/`.
- [x] **Karte 2 — Drei Varianten**: Basis 1→29, Chaos-Minute 25, 500-Gegner-Burst; je Start-/End-Heap, Prozent, FPS-Minimum; Ausgaben `shots/m10-heap-*.json`.
- [x] **Karte 3 — Report**: Tabelle, Verdikt, CDP-Notiz, ggf. Top-2-Heap-Treiber mit Datei+Zeile.

## Karte 1 — Messaufbau (Beleg)

Befund vorab: `scripts/perf-heap.mjs` liegt in `f26dc4b` **nicht** auf main — das Werkzeug
stammt aus der Lane `m9-perf-heap` (Commit `c869667`) und ist noch nicht gemergt. Die Lane-Regel
„`scripts/` nur lesen, nie editieren“ bleibt gewahrt: das Skript wurde **read-only aus dem
m9-perf-heap-Worktree** aufgerufen (`node /home/ai/games/lf-lanes/m9-perf-heap/scripts/perf-heap.mjs`);
`process.cwd()` war dieser Worktree, `ensureBuild()` hat den Worktree-Build erzeugt.

Trockenlauf (Smoke, 1 Sim-Minute, 1 Lauf):

```bash
time timeout 420 node /home/ai/games/lf-lanes/m9-perf-heap/scripts/perf-heap.mjs \
  --minutes=1 --runs=1 --out=shots/m10-heap-smoke.json
```

- Laufzeit: **real 7,5 s** (inkl. `npm run build`, 857 ms).
- Sample-Zahl: `fps.samples = 2` (1 Sim-Minute bei `timeScale=30` → nur ~2 s Wanduhr).
- Baseline-Zeitpunkt: Sim-Sekunde 30 (Default `min(60, minutes*60/2)`).
- Ergebnis: Start 27,8 MB / 318 549 Knoten → Ende 29,8 MB / 333 067 Knoten, **+7,1 %** (JS-Heap +5,8 %), 0 JS-Fehler.
- Ausgabepfad des Werkzeugs ist per `--out` steuerbar; hier direkt `shots/m10-heap-smoke.json`.

Keine Aenderung an `scripts/` (`git status --short` zeigt dort nichts).

## Karte 2 — Drei Varianten (Belege)

Treiber: `~/tmp/m10-heap-qa/variants.mjs` (nicht im Repo, nutzt `scripts/harness.mjs`
read-only und das Snapshot-/GC-Muster von `perf-heap.mjs`). Jede Variante: Headless-Chromium,
`?debug=1&seed=99`, God-Mode + AutoPlay, `timeScale=30`, **Baseline-Snapshot nach erzwungenem
Voll-GC**, Ende ebenfalls nach Voll-GC. Zusaetzlich `v8.gc`-Trace-Zaehlung und roher
`usedJSHeapSize`-Peak waehrend des Laufs (CDP-Diagnose).

| Variante | Start (Sim) | Ende (Sim) | Start-Heap | Ende-Heap | Delta MB | Delta % | JS-Heap % | Peak MB | Major/Minor GC | FPS Min/Median | Gegner (nach Spawn / Ende) | <= 15 %? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Basis 1→29** | 60 s | 1740 s | 30,9 MB / 337 581 Knoten | 30,9 MB / 409 843 Knoten | −0,04 MB | **−0,2 %** | +0,7 % | 79,0 | 35 / 10 570 | 43,2 / 58,1 | 202 / 202 | **JA** |
| **Chaos-Minute 25** (300 Gegner + 6 Evolutionen bei 1500 s) | 1440 s | 1560 s | 32,2 MB / 578 977 Knoten | 29,5 MB / 413 461 Knoten | −2,7 MB | **−8,2 %** | −15,0 % | 81,6 | 9 / 147 | 30,9 / 47,4 | 306 / 162 | **JA** |
| **500-Gegner-Burst** (Spawn bei 65 s) | 60 s | 80 s | 30,6 MB / 335 265 Knoten | 31,0 MB / 370 996 Knoten | +0,4 MB | **+1,1 %** | +1,7 % | 41,0 | 2 / 367 | 53,0 / 54,2 | 500 / 334 | **JA** |

Alle drei Varianten liegen deutlich unter dem Ziel von ≤ 15 % (Snapshot-Bytes nach Voll-GC).
Keine JS-Fehler in allen Laeufen (`jsErrors: []`).

Einordnung: Der Basis-Lauf ist praktisch flach (−0,2 %), obwohl die Knotenzahl zunimmt — die
zusaetzlichen Knoten sind klein (Bytes unveraendert). Chaos-Minute und 500-Burst sinken bzw. steigen
nur um ~1 MB, nachdem die Gegner wieder abgebaut sind.

JSON-Belege: `shots/m10-heap-basis.json`, `shots/m10-heap-chaos.json`, `shots/m10-heap-burst.json`
(jeweils `heap.start/end`, `heap.deltaPct`, `heap.jsHeapPct`, `cdp.*`, `fps.*`, `sim.*`, `jsErrors`).

