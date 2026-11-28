# Lane m10-spawn-burst-alloc (M10, 2026-11-28)

Bedarf aus `docs/lanes/m10-run-cpu-budget.md` ("Offene Bedarfe"): die
**Spawn-Burst-Kosten des Nachschub-Ticks** dominieren die JS-Frame-Zeit-Spitzen
(p95) — Ziel dieser Lane ist die Senkung der **Allokationen je Tick** im
Spawn-Pfad. Die Burst-**Verteilung** ist bereits durch m10-spawn-burst-budget +
m10-spawn-budget-dt abgedeckt und wurde NICHT angefasst.

## K1 — Vorher-Messung (Karte #12089, Commit 735a4061)

Methode: `scripts/m10-spawn-burst-alloc.mjs` — der **echte `Spawner`** wird mit
rolldown nach Node gebundelt (Phaser gemockt wie in
`tests/spawn-budget-dt.test.ts` — der Spawner nutzt Phaser nur für
`Math.Clamp`; der EnemyPool ist ein Stub wie dort). Burst-Szenario: Minute 25,
960x540 (Cap 300, dort lief der Chaos-Lauf der Bedarfs-Lane), Pool am Cap minus
Burst-Raum, Budget-Rückstau 32, volle Allowance
(`SPAWN_ALLOWANCE_MAX = 16`) → genau **16 Spawns je Tick**, danach Kill-Churn.
Kein FPS/Echtzeit-Lauf → ohne flock.

Metrik: **Minor-GC-Häufigkeit** (`--trace-gc`) bei fix kleinem Young-Gen
(`--max-semi-space-size=1` MiB) — die Scavenge-Zahl ist proportional zum
Young-Gen-Churn, d. h. den Allokationen je Tick; Heap-Konfiguration in Vorher-
und Nachher-Lauf identisch. Dazu `mixPickCalls` (deterministischer Zähler für
`Object.entries`/`values` im Szenario) und eine **Spawn-Sequenz-Checksum**
(FNV-1a über `id|x|y|elite` je Spawn, Seeds 1/2/3) als Bitgleichheits-Basis.

Kalibrierung (im Skriptkopf dokumentiert): der Node-Sampling-Heap-Profiler
(Inspector) misst Short-Lived-Allokationen **nicht** (64 MB Churn → 0 gemeldete
Bytes) und der GC-PerformanceObserver liefert in diesem Node-Build keine
gc-Entries — deshalb `--trace-gc` + fixer Semi-Space.

Beleg (außerhalb des Repos):
`~/games/.evidence/m10-spawn-burst-alloc/m10-spawn-burst-alloc-before.json`

| Metrik | Vorher |
|---|---|
| scavengesPer1000Ticks | **30.09** (Streuung 29–38 über 4 Läufe) |
| gcMsPer1000Ticks | 1.04 |
| tickMsPer1000Ticks | 13.5–15.3 |
| mixPickCallsPerTick | 16 (= 1 `Object.entries` je Spawn) |
| Checksum Seed 1/2/3 | 1048818830 / 4047071672 / 1745884332 |
| Szenario | Minute 25, 960x540, Cap 300, 16 Spawns/Tick, 90000 Ticks |

Hinweis: der Stub-Pool alloziert (wie beschrieben dokumentiert) je Spawn ein
Runtime-Objekt — der echte Pool reutzt es (Free-List). Das verwässert das
Vorher/Nachher-Verhältnis leicht **konservativ** (gemessene Senkung ist die
Unterprozess der wahren Senkung).

## K2 — Fix (Karte #12090, Commit a8b94a69)

Einzige geänderte Datei: `src/systems/Spawner.ts` (Logik `logic/waves.ts` und
Verteilung unangetastet):

- **`mixCache`**: die Wellen-Mischung wird je Wellen-Objekt einmal kompiliert
  (`{ ids, weights, total }`, max. 30 statische Wellen) — der Burst-Pfad baut
  kein `Object.entries` + `filter` + Tupel-Array + Closure mehr **je Spawn**
  (Vorher: 16 `Object.entries`-Aufrufe je Burst-Tick, Nachher: 0).
  `pickEnemyCached` ist bitgleich zu `pickEnemy`: gleiche Kompilier-Reihenfolge
  (= `Object.entries`-Insertion-Order), gleiche Summe, ein `rng.next()`,
  gleiche `roll <= 0`-Abbrüche.
- **`spawnOpts`/`eliteOpts` Scratch-Felder** statt Options-Literal + Spread je
  Spawn in `spawnAt`/`spawnOne` (`pool.spawn` liest synchron, behält die
  Options nie — Werte bitgleich zum alten Literal).
- **`EMPTY_SPAWN_OPTIONS`** (geteilt, frozen) statt `{}`-Default je Aufruf und
  **`ALL_ENEMY_DEFS`** statt `Object.values(ENEMIES)` je Fallback-Spawn.

Bitgleichkeit: Seed-Checksums identisch zur Vorher-Messung (Seed 1/2/3 =
1048818830 / 4047071672 / 1745884332) — Spawn-Phasen und Tier-Verteilung
unverändert. `npx tsc --noEmit`, `npm run build` und **2279 Tests** grün.

## K3 — Nachher-Messung + Grenze (Karte #12091)

Beleg: `~/games/.evidence/m10-spawn-burst-alloc/m10-spawn-burst-alloc-after.json`
(gleiche Methode/Szenario wie K1, zwei Nachher-Läufe: 10.81 und 10.91).

**Grenze vor der Messung festgelegt:** Ziel ≤ 50 % der Vorher-Allokationen im
Tick — erreicht.

| Metrik | Vorher (#12089) | Nachher (#12091) | Verhältnis |
|---|---|---|---|
| scavengesPer1000Ticks | 30.09 | **10.81 / 10.91** | **0.36 (−64 %)** |
| gcMsPer1000Ticks | 1.04 | 0.40 | 0.38 |
| tickMsPer1000Ticks | 13.49 | 6.96–7.5 | ~0.5 |
| mixPickCallsPerTick | 16 | **0** | 0 |
| Checksums (Seed 1/2/3) | s. o. | **identisch** | bitgleich |
| Szenario | dito | dito | — |

Die p95-Wirkung im Browser (JS-Frame-CPU p95) war in der Bedarfs-Lane
m10-run-cpu-budget (K4) auf diesem Desktop-Host bereits als nicht belastbar
trennbar begründet worden (±3 % Host-Rauschen); die hier entfernten
~16 Objekt-Gruppen je Spawn senken die Minor-GC-Frequenz um ~64 % genau in
diesem Tick — der Hebel wirkt dort, wo CPU-ms knapp sind (Android, GC-Kosten
skalieren mit der CPU-Drosselung).

Offene Reste (außerhalb dieses Claims): `advanceSpawnBudget`/
`splitSpawnBurst` bauen je Tick 2 kleine Ergebnis-Objekte (reine Funktionen in
`logic/waves.ts`, Datei-Claim fremd); Options-Literale in `Run.ts`-Aufrufen von
`spawnAt` (Splitter-Kinder/Summoner-Minions, nicht-Burst-Pfad).

## Lane-Abschluss

- Commits: 735a4061 (#12089 K1), a8b94a69 (#12090 K2), K3-Commit (#12091),
  K4-Commit (#12092).
- Belege ausschließlich `~/games/.evidence/m10-spawn-burst-alloc/` (before/after
  JSONs); nichts Abnahme-Bildpflichtiges.
- Hinweis: die fremden Dirty-Dateien `shots/m10-passive-math-*.json` in diesem
  Worktree stammen von einem externen Verify-Lauf (bekanntes Muster, siehe
  Ende von `docs/lanes/m10-run-cpu-budget.md`) und wurden nicht angefasst.
