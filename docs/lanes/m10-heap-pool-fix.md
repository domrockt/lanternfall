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

Befund vor dem Fix (Diagnose, `shots/m10-heap-pool-fix-pools.json`, volle Abnahme-Last):
Die Pools selbst sind **bereits stabil** — EnemyPool `created` 520 konstant über 25 Sim-Minuten
(Free-Liste 520 → 491, kein Wachstum), ProjectilePool `created` 0 (alles Recycling), fx 129–172,
Particles 32–188 (fluktuierend, nicht monoton). Der Snapshot-Diff (Minute 2 vs. 28,
`shots/m10-heap-pool-fix-snapdiff.json` + Roh-Snapshots) zeigt **kein messbares JS-Retention-Wachstum**
(Top-Delta: Closure `s` +1325 Stück/+37 kB, Strings fx_orb_3/fx_thorn_2; Summe < 60 kB).
Das Gate (performance.memory nach GC) wächst trotzdem 42,2 → 49,2 MB — die Wachstumsquelle ist
**GC-/Heap-Slack durch Allokationsdruck**, nicht Retention. Hebel bleibt: Allokationsrate im Hot Path.

Fix in `src/systems/EnemyPool.ts`:
- `spawn(..., options = {})` allozierte pro Spawn ein leeres Options-Objekt (Default-Parameter
  `= {}` wird pro Aufruf neu alloziert). Jetzt: ein geteiltes eingefrorenes
  `EMPTY_SPAWN_OPTIONS` (nur-Lesen, Spawn schreibt nie in `options`).
- Diagnose-Zähler ergänzt: `createdTotal`, `freeCount` (öffentlich, für das Messskript).

Tests (`tests/enemy-pool-reuse.test.ts` erweitert, deterministische Wiederverwendungs-Zählung):
- 200 Spawn/Compact-Zyklen: `createdTotal` konstant, der freigegebene Runtime-Slot wird sofort
  wiederverwendet (Identitäts-Assertion), Free-Liste leer am Ende.
- Spawn ohne Options wendet Def-Defaults an (radius/speed aus Def, hpScale 1).
- Bestand: KI-State/RNG-Identität über Recycling bleibt (unverändert grün).

**Nächster, belegter Hebel außerhalb meines Claims** (K4-Empfehlung): Die Allokations-Churn-Spitzen
liegen an den Aufrufstellen — `CombatSystem.fireEmber/firePhoenix` baut pro Schuss
`enemies.map((e) => ({ e, d }))`-Wrapper-Arrays (~100 k Projektil-Spawns/Lauf), `Run.ts:973` und
`Spawner.spawnAt` bauen Options-/Spawn-Literale pro Spawn. Diese Dateien sind nicht in meinem
Disponent-Bereich; ein Churn-Fix dort braucht eine Folgelane (siehe K4).

## K3 — ProjectilePool

Fix in `src/systems/ProjectilePool.ts`:
- `view()` (Cull-/Hide-Margin-Berechnung, 1× pro Frame) allozierte pro Frame ein neues
  Cache-Objekt. Jetzt: in-place-Update des wiederverwendeten `viewScratch`-Objekts —
  semantisch identisch (Werte pro Frame frisch, null ohne Kamera).
- Der Spawn-Pfad selbst war bereits allokationsfrei (`hit`-Set wird wiederverwendet und
  geleert, `trailFrames` in-place befüllt, Runtime-Objekte per Free-Stack) — jetzt durch
  Tests fixiert.

Tests (`tests/heap-pool-fix.test.ts` neu, deterministische Wiederverwendungs-/Lese-Zählung):
- 500 Spawn/Compact-Zyklen: `stats.created` konstant, freigegebene Runtime-Instanz wird
  sofort wiederverwendet, `stats.reused` = 500.
- `hit`-Set-Identität bleibt über Recycling erhalten, Inhalt wird geleert (keine alten UIDs).
- `view()`-Cache: genau **ein** `worldView`-Lesezugriff pro Frame (zwei compact()-Läufe im
  selben Frame = 1 Read, Frame-Wechsel = 1 weiterer Read), in-place-Update verfälscht die
  Cull-/Hide-Entscheidungen nicht (Cull/Hide-Verhalten verifiziert).

## K4 — Nachher-Messung + Befund

Gleiche Werkzeuge/Parameter wie Vorher (K1): `npm run fullrun` (Gate) und
`node scripts/perf-heap.mjs --minutes=30 --runs=2` (Snapshot), Seed 99, timeScale 30,
AutoPlay, God, volle Evolutions-/Passiv-Last.

| Messung | Vorher (K1) | Nachher (K4) | Ziel |
|---|---|---|---|
| **Gate `heapDeltaPct` (fullrun, JS-Heap nach GC, Minute 1 vs. 29)** | **+32,7 %** (37,9 → 50,3 MB) | **+19,6 %** (44,5 → 53,2 MB) | ≤ 15 % → **nicht erreicht, Rest-Lücke +4,6 pp** |
| CDP usedSize (fullrun) | 14,6 → 16,1 MB | 13,0 → 16,9 MB | – |
| Snapshot-Delta (perf-heap, 2 Läufe, Median) | +2,5 % (−23,9/+2,5) | **−18,8 %** (−19,0/−18,8, Streuung 0,2 pp) | – |
| Sieg/Dawn, JS-Fehler, fpsMin | ja / 0 / 60,4 | ja / 0 / 60,3 | – |

Belege: `shots/m10-heap-pool-fix-before-fullrun.json`, `shots/m10-heap-pool-fix-after-fullrun.json`,
`shots/m10-heap-pool-fix-before.json`, `shots/m10-heap-pool-fix-after.json`.

### Interpretation (ehrlich)

- Die Verbesserung am Gate (32,7 → 19,6 pp) ist **innerhalb der Lauf-zu-Lauf-Streuung**:
  die Minute-1-Referenz schwankte bei identischem Seed/Parameter-Set zwischen 37,9 und 44,5 MB
  (±9 pp Wirkung auf das Delta). Beide Fixes (K2/K3) sind Wiederverwendungs-Fixes mit kleinem
  Volumen (~13 k Spawn-Options-Objekte/Lauf; 1 Cache-Objekt/Frame) — sie allein können einen
  4,6-pp-Gate-Abstand nicht belastbar schließen.
- Der Snapshot-Diff (Minute 2 vs. 28) belegt: **keine JS-Retention-Wachstum** (<60 kB über 28
  Sim-Minuten), die Pools sind retention-stabil (Enemy created konstant 520, Projektile created 0).
  Das Gate (performance.memory nach GC) misst daher überwiegend **V8-Heap-Slack/Allokationsdruck**,
  nicht geleakte Objekte.

### Belegte Rest-Lücke + konkrete Hebel (Empfehlung Folgelane)

Der Allokationsdruck sitzt an den **Aufrufstellen der Pools** — Dateien außerhalb meines
Disponent-Bereichs (CombatSystem.ts/Run.ts/Spawner.ts sind nicht geclaimed bzw. von
m10-run-determinism bzw. m10-pause-freeze belegt):

1. **`CombatSystem.fireEmber`/`firePhoenix` (größter Einzelposten):** pro Schuss
   `enemies.map((e) => ({ e, d: … }))` — bei ~103 k Projektil-Spawns pro 30-min-Lauf entstehen
   ~100 k Wrapper-Arrays + Wrapper-Objekte. Hebel: Scratch-Array auf dem System (wie
   `CombatSystem.scratch`), in-place Befüllen + Top-K-Auswahl statt `.map`+`sort`.
2. **Pro-Spawn-Options-Literale:** `Spawner.spawnAt` baut `{ speed: …, ...options }` pro Gegner
   (~13 k/Lauf), `Run.ts:973` baut das `enemyShots.spawn({...})`-Literal pro Gegnerprojektil.
   Hebel: wiederverwendete Options-Slots (Muster `EMPTY_SPAWN_OPTIONS` aus K2) bzw. parameterlose
   Spawn-Argumente.
3. **Pro-Frame-Filter:** `CombatSystem` Zeile 219 `ctx.enemies.filter((e) => e.alive && e.hp > 0)`
   pro Frame → in-place Compact (Muster `EnemyPool.compact`).
4. **Mess-Metrik (Abnahme-Entscheid):** Das Gate `performance.memory.usedJSHeapSize` nach GC ist
   Slack-/Allocator-dominiert (Lauf-Streuung ±9 pp, Snapshot-Retention gleichzeitig flach).
   Empfehlung: das 15-%-Kriterium zusätzlich/mit auf die **CDP-Snapshot-Retention** stützen
   (deterministischer, Last-unabhängiger) — sonst misst das Gate hauptsächlich GC-Timing.

Kein weiteres Tuning in dieser Lane: die Hebel 1–3 brauchen fremde Dateien (Claims), Hebel 4 ist
ein Abnahme-Werkzeug-Entscheid.

### Review-Nachzug (Reviewer-PASS, 2 Anmerkungen umgesetzt)

- `view()`: Frame-Cache-Check **vor** jeder Allokation verschoben — jetzt wird pro Aufruf auch
  keine `compute`-Closure mehr erzeugt (Anmerkung 1, „sollte“).
- Alias-Hinweis am `viewScratch` ergänzt: das Ergebnis von `view()` darf nicht über den Frame
  hinaus gehalten werden (Anmerkung 2).
- Danach: tsc grün, 1238 Tests grün.
