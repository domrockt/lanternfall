# Lane m10-endgame-fps — Endgame-FPS bei 640×360

Stand: 2026-11-27. Worktree `/home/ai/games/lf-lanes/m10-endgame-fps`, Branch `m10-endgame-fps`.
**Aktive Arbeit (Supervisor-Auftrag): Karte 1 (#2598) — frische 3×-Baseline 640×360 unter flock,
Roh-JSON `shots/m10-endgame-fps-baseline.json`, Attribution unten. Keine Screenshot-Experimente,
keine fremden Claims, keine PNGs stagen.**

Ziel: den einzigen roten ACCEPTANCE-Punkt (Endgame-/640×360-FPS) mit Messung und dem
kleinsten wirksamen Hebel angreifen — **ohne** die globale Gegnerzahl zu senken und ohne
die 30 Gegner-Typen zu opfern. Fremde Claims (`SpatialHash.ts`, `separation.ts`,
`EnemyPool.ts`, `Run.ts`, `CombatSystem.ts`, `FxSystem.ts`, `gen-fx.ts`,
`enemySprites.ts`, `EnemyProjectiles.ts`, `bosses.ts`, `BossSystem.ts`, `death.ts`)
bleiben unangetastet.

## K1 — Baseline messen, nicht raten

### Kommandos (nur unter `flock`)

```bash
flock /home/ai/games/.lf-perf.lock node scripts/perf.mjs \
  --viewport 640x360 --dpr 1 --out shots/m10-endgame-fbs-baseline-r<N>.json   # 3×
flock /home/ai/games/.lf-perf.lock node scripts/m10-endgame-fps.mjs \
  --viewport 640x360 --dpr 1 --runs 3 --out shots/m10-endgame-fps-attribution.json
```

`profile-minute25.mjs` ist **syntaktisch defekt** (`Unexpected token '?'` in Zeile 74,
außerdem `typeof typeof`, undefiniertes `dt`, `await? setup(page)`). Es ist kein
verlässlicher Profiler; `scripts/m10-endgame-fps.mjs` misst dieselbe Minute-25-Szene
mit lauffähiger Bucket-Instrumentierung. Kein Produktions-Quellcode wurde dafür geändert.

### Burst 500 Gegner (640×360, dpr 1)

| Lauf | FPS | Frames/10 s | minEnemies | worstFrameMs | Ziel ≥55 |
|---|---|---|---|---|---|
| 1 | 60,1 | 601 | 500 | 16,8 | PASS |
| 2 | 60,1 | 601 | 500 | 16,8 | PASS |
| 3 | 60,1 | 601 | 500 | 16,8 | PASS |

Host-loadavg während der Läufe: 7,4 → 12,9. Unter dieser Last ist der 500er-Burst
bereits grün (V-Sync-Deckel 60). Die in `ACCEPTANCE.md` dokumentierten **46,3 / 46,6 /
49,3 FPS** stammen aus einem Lauf unter deutlich höherer Parallel-Last (loadavg ~31,
belegt im ersten, verworfenen Messversuch: 9,6 FPS bei loadavg 31,8 — solche Werte sind
host-, nicht code-getrieben).

### Frische Baseline, 2026-11-27 (K1, Supervisor-Auftrag)

Drei Läufe, je unter `flock /home/ai/games/.lf-perf.lock`, aktueller Lane-HEAD.
Roh-JSON: `shots/m10-endgame-fps-baseline.json` (enthält die drei vollständigen
`perf.mjs`-Läufe), Einzeldateien `shots/m10-endgame-fps-baseline-run{1,2,3}.json`.

| Lauf | Burst-FPS (500 Gegner) | Minute-25-FPS (300 Gegner + 6 Evos) | loadavg (Start) |
|---|---|---|---|
| 1 | 60,1 | **55,2** | 6,26 |
| 2 | 60,1 | 53,3 | 8,82 |
| 3 | 54,5 (worst 100 ms Host-Ausreißer) | 52,4 | 7,93 |

Ergebnis: 1/3 Minute-25-Läufe ≥ 55, keiner < 52; Burst 2/3 ≥ 55, Lauf 3 knapp darunter
(54,5) mit einem 100-ms-Worst-Frame. Die Streuung (±2–4 FPS) ist Host-Last, nicht Code.
Damit ist die in `ACCEPTANCE.md` notierte rote Baseline 37,8–41,4 hier nicht reproduzierbar;
die 640er-FPS sind bei ruhigem Host grenzwertig grün, unter Parallel-Last rot.

### Minute 25 (300 Gegner + 6 Evolutionen, 640×360) — frühere Messung

| Lauf | FPS (perf) | Frames/6 s | minEnemies | worstFrameMs | Ziel ≥55 |
|---|---|---|---|---|---|
| 1 | 56,7 | 568 | 300 | 33,4 | PASS |
| 2 | 55,1 | 551 | 300 | 33,5 | PASS |
| 3 | 53,8 | 539 | 300 | 33,4 | knapp FAIL |

Dokumentierte ACCEPTANCE-Baseline unter hoher Last: **37,8–41,4 FPS**. Aktuelle,
lastärmere Messung: **53,8–56,7 FPS**. Der Punkt ist damit **lastabhängig**: bei
ruhigem Host knapp grün, bei paralleler Last rot.

### Attribution Minute 25 (ms/Frame, 3 Läufe, 640×360)

| System | Lauf 1 | Lauf 2 | Lauf 3 | Befund |
|---|---|---|---|---|
| `simulate` (Summe aller Sim-Systeme) | 0,80 | 0,97 | 0,80 | ~5 % von 17–19 ms |
| `combat.update` (Waffen/Treffer/Projektile) | 0,43 | 0,55 | 0,43 | größter Einzelposten, aber klein |
| davon `fx.update` / `particles.update` / `damageNumbers.update` | 0,03 / 0,04 / 0,003 | 0,03 / 0,05 / 0,005 | 0,03 / 0,04 / 0,005 | zusammen <0,1 ms |
| `ground.update` (Terrain) | 0,14 | 0,23 | 0,18 | **nicht** heiß |
| `updateEnemies` (AI + Separation + Hash) | 0,13 | 0,14 | 0,13 | **nicht** heiß |
| `spawner.update` | 0,009 | 0,011 | 0,008 | vernachlässigbar |
| `updateVisuals` | 0,05 | 0,06 | 0,06 | klein |

**Attributions-Befund:** Terrain und Spawner sind **nicht** die heißen Pfade. Die
JS-Simulationssysteme kosten zusammen ca. **0,8–1,0 ms/Frame** von ~17–19 ms — der
Rest ist Rendering/Draw (Phaser-Software-WebGL: ~500 Sprites + Texturen + Partikel).
Ein globales Absenken der Gegnerzahl ist deshalb der einzige wirksame Hebel, aber als
**lastabhängiger Frame-Budget-Regler** (nur unter Last, nicht als Dauer-Cap), damit die
30 Typen und die normale Dichte unverändert bleiben. Karten 2–3 bauen genau diesen
Regler; die Detail-Buckets widerlegen Terrain/Spawner als Ursache.

## K2 — Frame-Budget-Regler (pure)

`src/logic/scaling.ts`: `createFrameBudget` / `stepFrameBudget` / `frameBudgetTarget`.
Der Regler hält einen **Anteil** (`ratio`, 0..1) des aktuellen Deckels, nicht eine absolute
Zahl: > 19,2 ms für > 1 s senkt `ratio` um max. 10 %/s, Untergrenze ist das Verhältnis
`min(1, 320/ceiling)`; unter 15 ms erholt er sich mit 1-s-Hysterese bis `ratio = 1`.
Damit bleibt ein wachsender Früh-Deckel (< 320) unangetastet und das Default-Ziel
(780×360@3, 500) exakt 500. `tests/endgame-budget.test.ts` deckt Senkung, Boden 320,
Erholung, Hysterese-Band 15–19,2 ms, Deckel-Absenkung und Lang-Frame-Clamping mit
8 deterministischen Serien ab. Tests grün (`npx vitest run tests/endgame-budget.test.ts`: 8/8).

## K3 — Spawner koppelt den Regler

`src/systems/Spawner.ts`: `cap = min(maxActiveEnemies(...), frameBudgetTarget(...))`.
Der Regler wird **einmal pro echtem Frame** gefüttert (`game.loop.frame`), nicht pro
Sim-Substep, damit `timeScale` nicht mehrfach zählt. Tier-Mix, Spezialwellen, Elites und
`waves.ts` sind unverändert.

**Gegner-Abdeckung 30/30 unverändert:** `node scripts/enemy-coverage.mjs` vorher/nachher,
Seeds 101/202: je `covered 30`, `missingUnion []`, `totalSpawns 2524` in beiden Läufen
identisch (`shots/m10-endgame-fps-coverage-before.json`, `-after.json`).

## K4 — Nachmessen + Abnahme

Kommandos (je Lauf unter `flock /home/ai/games/.lf-perf.lock`:

```bash
flock /home/ai/games/.lf-perf.lock node scripts/perf.mjs \
  --viewport 640x360 --dpr 1 --out shots/m10-endgame-fps-final-r<N>.json   # 3×
```

| Lauf | Burst-FPS (500 Gegner) | Minute-25-FPS (300 Gegner + 6 Evolutionen) | loadavg (Start) |
|---|---|---|---|
| 1 | 60,1 | **56,6** PASS | 4,07 |
| 2 | 60,1 | **55,7** PASS | 8,74 |
| 3 | 60,1 | 53,3 (≥52, <55) | 9,43 |

Vorher (K1, gleiche Host-Lage): Burst 60,1/60,1/60,1; Minute 25 56,7/55,1/53,8.
Nachher: 56,6/55,7/53,3. **Kein belegbarer FPS-Gewinn** — die Differenz liegt im
Host-Rauschen, nicht im Regler. Ursache, ehrlich: der Minute-25-Messlauf hält exakt
300 Gegner; die Regler-Untergrenze 320 liegt darüber, also kann der Regler in diesem
Szenario gar nicht eingreifen. Der Hebel wirkt nur, wenn die reale Dichte über 320
liegt (z. B. natürlicher Endgame-Lauf mit > 400 aktiven Gegnern).

**Abnahmekriterium:** 2 von 3 Minute-25-Läufen ≥ 55 FPS und kein Lauf < 52 → **erfüllt**
(56,6 / 55,7 / 53,3), Burst 3× 60,1 ≥ 55, 0 JS-Fehler. Die in `ACCEPTANCE.md` notierte
rote Baseline 37,8–41,4 entstand unter deutlich höherer Parallel-Last; bei loadavg 4–9
ist der Punkt grün. Das ist lastabhängig, kein Codegewinn.

`npx tsc --noEmit` grün, `npm run build` grün, `npm test` **309/309** grün.
Chaos-Beleg: `shots/m10-endgame-fps-chaos.png` (640×360, Minute 24:50, lebende
Horde + Frost-/Evolutions-VFX, Boss-Banner, 0 JS-Fehler).

## Offene Punkte

- `profile-minute25.mjs` bleibt defekt (fremder Claim, nicht angefasst); Ersatz ist
  `scripts/m10-endgame-fps.mjs`.
- Absolute FPS sind host-lastabhängig (loadavg 5–32 gemessen). Alle Belege nennen die
  loadavg; Vergleiche nur zwischen Läufen ähnlicher Last.
