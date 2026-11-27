# Lane m10-heap-tail — Heap-Wachstum 30-min-Lauf ≤ 15 %

Stand: 2026-11-27. Worktree `/home/ai/lf-lanes/m10-heap-tail`, Branch `m10-heap-tail`.
Ziel (offener ACCEPTANCE-Punkt): Heap-Wachstum im 30-min-Lauf **≤ 15 %**
(belegt 25,7 → 30,5 MB = +18,7 %, Team-Finallauf 25,7 → 31,4 MB = +22,2 %).
Kein Fullrun/Flock für die Heap-Baseline (Heap ist lastunabhängig).

## Karte #2058 — Baseline (COMMIT 43d9ce1, 37193d0)

Messung mit `scripts/perf-heap.mjs`: Headless Chromium, `?debug=1&seed=99`,
AutoPlay + God, `timeScale=30`, Baseline-Snapshot bei Sim-Sekunde 60 nach
erzwungenem Voll-GC, Ende bei Sim-Sekunde 1800 nach Voll-GC.
Rohdaten: `shots/m10-heap-tail-baseline-3runs.json`, Einzellauf:
`shots/m10-heap-tail-baseline.json`, Alloc-Profile:
`shots/m10-heap-tail-alloc.json`.

| Lauf | Start | Ende | Delta MB | Delta % | JS-Heap % | FPS Min / Median | JS-Fehler |
|---|---|---|---|---|---|---|---|
| 1 | 30,4 MB | 33,6 MB | +3,2 MB | **+10,7 %** | +11,1 % | 24,0 / 60,1 | 0 |
| 2 | 30,7 MB | 23,9 MB | −6,8 MB | **−22,0 %** | −25,4 % | 27,1 / 60,2 | 0 |
| 3 | 30,4 MB | 31,8 MB | +1,4 MB | **+4,6 %** | +4,7 % | 27,3 / 60,2 | 0 |
| Einzellauf | 29,8 MB | 31,1 MB | +1,3 MB | **+4,5 %** | +4,5 % | – | 0 |

Einordnung: Nach erzwungenem Voll-GC ist der Retained-Heap nahezu flach; die
früheren +18,7/+22,2 % stammen aus der rohen `performance.memory`-Messung ohne
stabilisierte GC-Wiederholung (Arbeits-Set der jeweiligen Welle). Die Streuung
zwischen den Läufen (30,7→23,9 MB) ist GC-/Host-Streuung, kein Retained-Leak.

Alloc-Sampling (HeapProfiler, 259 Samples, 30,2 Sim-Minuten): Top-Sites sind
Churn, nicht Retention — `sortByDepth`/`addProp` (Phaser-DisplayList/Terrain),
`t.onended` (WebAudio-Clip-Handler), `initialize`/`set` (Phaser-Helfer),
`setText` (Damage-Numbers). Keine dieser Sites wächst monoton mit der Spielzeit.

## Karte #2060 — DamageNumbers/EnemyPool Reuse (COMMIT folgt)

- `DamageNumberSystem` hält Aggregat-Einträge jetzt in einem `Pool<AggregateEntry>`
  (`MAX_ENTRIES = 48`, Kap beim Einfügen: ältester per Swap-Remove verdrängt und
  zurückgegeben). Kein `Array.filter` mehr pro Treffer für die View-Zählung;
  `activeViews` wird inkrementell geführt (`report`/`update`/`clear`).
- `src/logic/damage-numbers.ts`: `addDamage(..., sink?)` und
  `expireDamage(..., sink?)` recyceln Einträge; `MAX_ENTRIES` hart gekappt.
- `EnemyPool.spawn`: KI-Zustand wird per `resetAiState` in-place zurückgesetzt
  statt `newAiState` (kein Objekt pro Spawn); ein `DEFAULT_AI_RNG` ersetzt die
  RNG-Closure pro Spawn.
- Tests `tests/pool-reuse.test.ts`: 8/8 (Pool-Identität, Steady-State ohne
  Neuanlage, trim, Release-Fremdobjekt, Damage-Reuse, Cap, KI-Reset in-place).
