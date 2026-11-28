# Lane m10-heap-pool-fix — Heap-Wachstum 30-min-Lauf senken (Ziel ≤ 15 %)

Stand: 2026-11-28. Branch `m10-heap-pool-fix` (Worktree `/home/ai/games/lf-lanes/m10-heap-pool-fix`).
Offene Lücke aus der Nachabnahme: vorher +18,7–22,2 % (Gate `heapDeltaPct < 15`, gemessen von
`scripts/fullrun.mjs`: JS-Heap nach erzwungenem GC, Minute 1 vs. Minute 29).
Verdacht: Pool-Pfad alloziert im Hot Path neu statt Runtime-Objekte wiederverwendet.

## K1 — Ist-Messung (Vorher), Akzeptanzgrenze vor dem Fix

Akzeptanzgrenze (vor der Nachher-Messung festgelegt): **heapDeltaPct (Nachher) ≤ 15 %**, gemessen
mit dem Abnahme-Werkzeug `scripts/fullrun.mjs` (gleiche Parameter wie Nachabnahme: Seed 99,
timeScale 30, AutoPlay, God, alle Evolutions Stufe 8, Passives Stufe 5).

Drei Belege (alle committed):

| Beleg | Werkzeug | Ergebnis |
|---|---|---|
| `shots/m10-heap-pool-fix-before-fullrun.json` | `npm run fullrun` (Abnahme-Gate) | **heapDeltaPct = +32,7 %** (Minute 1: 37,9 MB → Minute 29: 50,3 MB; Ende nach GC 34,7 MB) → FAIL, Ziel 15 %. 5119 Kills, Sieg/Dawn regulär, 0 JS-Fehler, fpsMin 60,4. |
| `shots/m10-heap-pool-fix-before.json` | `node scripts/perf-heap.mjs --minutes=30 --runs=2` (CDP-Snapshot, Baseline Sim-Sek. 60) | Delta %: −23,9 / +2,5 (Median +2,5 %), jsHeap +2,3 %. Hohe Streuung (26,4 pp) — Snapshot-Metrik am Sekunde-60-Baselinepunkt ist GC-abhängig, deshalb ist das Fullrun-Gate die verbindliche Metrik. 0 JS-Fehler. |
| `shots/m10-heap-pool-fix-before-alloc.json` | `node scripts/heap-alloc-profile.mjs --minutes=30` (Sampling-Heap-Profil, 32 kB-Intervall) | 30 Sim-Minuten, 12 886 Kills, 0 JS-Fehler. Größte Allokationsquellen (gesampelt, ~4 MB gesamt): minifizierte Sites in `update`/`updateEnemies`/`spawn` (Bundledatei, line 812), `Set.add`/`Map.set`/`addHandler`/`setAlpha`/`setTexture` — kein einzelner dominanter Leak-Konstruktor; das Muster passt zu Churn im Gegner-/Projektil-Hot-Path, nicht zu einem persistenten Sammel-Leak. |

Wichtig: Der Vorher-Fullrun liegt mit +32,7 % **über** den in der Nachabnahme genannten
+18,7–22,2 % — die Streuung zwischen Läufen ist real (auch m9-perf-heap dokumentierte
6,8–20 % Spannweite). Deshalb: Vorher/Nachher werden mit **demselben Werkzeug, demselben Seed,
dasselbe Parameter-Set** verglichen, und die Nachher-Messung wird erst nach K2+K3 gefahren
(kein wiederholtes Würfeln; die Akzeptanzgrenze 15 % steht oben und wird nicht verschoben).

## K2 — Pool/EnemyPool Hot-Path

(folgt)

## K3 — ProjectilePool

(folgt)

## K4 — Nachher-Messung + Befund

(folgt)
