# Lane m10-endgame-fps — Endgame-FPS bei 640×360

Stand: 2026-11-27. Worktree `/home/ai/games/lf-lanes/m10-endgame-fps`, Branch `m10-endgame-fps`.
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

### Minute 25 (300 Gegner + 6 Evolutionen, 640×360)

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

## Offene Punkte

- `profile-minute25.mjs` bleibt defekt (fremder Claim, nicht angefasst); Ersatz ist
  `scripts/m10-endgame-fps.mjs`.
- Absolute FPS sind host-lastabhängig (loadavg 5–32 gemessen). Alle Belege nennen die
  loadavg; Vergleiche nur zwischen Läufen ähnlicher Last.
