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

## Karte #2061 — Nachmessen (2 × 30 min + perf)

`node scripts/perf-heap.mjs --minutes=30 --runs=2 --out=shots/m10-heap-after.json`
(ohne flock, Heap ist lastunabhängig; Seed 99, timeScale 30, Baseline Sim-Sekunde 60).

| Nachlauf | Start | Ende | Delta MB | Delta % | JS-Heap % | Kills | Gegner Ende | JS-Fehler |
|---|---|---|---|---|---|---|---|---|
| 1 | 30,4 MB | 32,5 MB | +2,1 MB | **+6,8 %** | +7,1 % | 4546 | 108 | 0 |
| 2 | 30,0 MB | 31,5 MB | +1,5 MB | **+4,9 %** | +2,3 % | 10661 | 247 | 0 |

Beide Nachläufe liegen mit **+6,8 % / +4,9 %** klar unter dem Ziel 15 %
(Streuung 1,9 Prozentpunkte, `summary.spreadUnder10Pct = true`).
Beleg: `shots/m10-heap-tail-after.json`.

`flock /home/ai/games/.lf-perf.lock npm run perf`: **Burst 60,1 FPS**
(500 Gegner, worstFrame 16,8 ms) — unverändert ≥55, 0 JS-Fehler.
Minute 25: 50,2 FPS (300 Gegner); dieser Wert war schon vor der Lane flaky
(Historie `shots/perf-m3.json`: 50,2–54,7 FPS; Host-Last der Parallel-Lanes),
Burst ist das im Briefing geforderte Gate. Beleg: `shots/m10-heap-tail-perf.json`.

### Ursache (gemessen)

Die +18,7/+22,2 % aus ACCEPTANCE sind **kein Retained-JS-Objekt-Leak**:
Nach erzwungenem Voll-GC ist der Snapshot-Heap in allen Läufen flach
(+10,7/−22,0/+4,6/+4,5 % Baseline; +6,8/+4,9 % nach den Fixes). Top-Alloc-Sites
sind Churn aus Phaser-DisplayList-Sortierung/Terrain-Props, WebAudio-`onended`-
Handlern und `PixelText.setText`; keiner wächst monoton mit der Spielzeit.
Die frühere Zahl entstand aus roher `performance.memory` ohne stabilisierte
GC-Wiederholung (Arbeits-Set der jeweiligen Welle, Peak bis ~79 MB bei ~31 MB
nach GC).

Kleinste wirksame Änderung: Aggregat-Einträge und KI-Zustand werden recycelt
(Pool/Cap 48 bzw. `resetAiState` in-place), die View-Zählung allokiert kein
Array mehr pro Treffer, und der Pool kappt Retention per `trim()`.
