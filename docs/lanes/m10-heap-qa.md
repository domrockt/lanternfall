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
