# Lane m10-frame-tail-batching — Frame-Zeit-Schwanz (Hebel B): Spawn-Batching + Chunk-Upload-Glättung

Datum: 2026-11-28. Auftrag: K3-FAIL der Lane m10-v10-device-acceptance (janky 13,44 %/13,90 %,
p99 31 ms, worstFrame 33–34 ms) — Befundliste Hebel B abarbeiten. Belege (außerhalb des Repos,
Merge-sicher): `~/games/.evidence/m10-frame-tail-batching/`. Board: #11989 (K1), #11990 (K2), #11991 (K3).

## Datei-Mapping (Disponent-Claim)

Der Disponent-Claim nennt `src/systems/EnemySystem.ts` — diese Datei existiert nicht; das
Spawn-System heißt real **`src/systems/Spawner.ts`** (Worden-Director, `spawnEnemy`, Budget-Regler).
Alle Spawn-Änderungen dieser Lane sind in Spawner.ts. Zusätzlich minimal angefasst (begründet):
`src/scenes/Run.ts` — nur `debugSpawnEnemy()` (3 Zeilen): der Debug-API-Pfad muss auf die neue
Batch-Methode zeigen, das ist der dokumentierte Fix-Gegenstand (Harness-Top-up). Spielereignisse
(Dawn-Effekt, Elite-Aufnahmen) nutzen weiterhin `spawner.spawnEnemy()` sofort — unverändert.

## K1 — Vorher-Messung (Baseline, vor jeder Änderung) — abgeschlossen

Alle Messungen 2026-11-28, Minute-25-Worst-Case (6 Evos Lv8, 6 Passives Lv5, `skipTo(1490)`,
Top-up auf 300 Gegner im 50-ms-Takt, god, suppressLevelUps, autoPlay).

### Gerät (Redmi Pad Pro, Adreno 710, Thermal 0, device-bridge/CDP)

| Beleg | Methode | FPS | janky | p50/p90/p95/p99 (ms) | worst rAF (ms) |
|---|---|---|---|---|---|
| `before-device.json` | gfxinfo-Fenster 10 s (`scripts/m10-v10-device-gfxinfo.mjs`) | 115,1 | **9,09 %** (100/1100) | 8/18/22/**36** | 91,6 |
| `before-device-frames.json` | je-Frame 24 s (`scripts/m10-frame-tail-batching.mjs --mode device`) | ~112 | 1,33 % (rAF-dt > 16,9) | 8,3/8,4/8,5/**25** | 58,4 |

- GPU-Renderer: **`Adreno (TM) 710`** (aus dem Spiel-Page-Context, kein SwiftShader). 0 JS-Fehler.
- Die eigene Baseline (9,09 %) liegt unter den 13,4/13,9 % der Akzeptanz-Lane — Gerätezustand
  schwankt zwischen Läufen; verbindlich ist die Vorher/Nachher-Differenz MITTels gleicher Methode
  und gleicher Session.

### Befund-Korrelation (je-Frame, 24 s Gerät) — `before-device-frames.json`

- **Spawn-Top-up ist der belegte Tail-Treiber:** rAF-dt nach Top-up-Gruppen (bis 281 Gegner in
  einem 50-ms-Tick): 41,6 / 33,4 / 25,0 ms. Große Spikes (f1177 41,7 ms, f1182 58,4 ms, f692/f777
  33,4 ms) folgen direkt auf Top-up-Gruppen; alle Spikes sind VSync-Vielfache (25/33/41/58 ≈ n·8,3).
- **Chunk-Main-Thread-Kosten NICHT bestätigt:** 6 Chunk-Installs im Fenster, alle auf Frames mit
  dt 8,3–8,4 ms — der Worker-Pfad hält den Main-Thread sauber.
- **Aber:** gfxinfo-janky (9 %) ≫ rAF-dt-Tail (1,33 %) → der größte Teil des Janky entsteht
  COMPOSITOR-/Render-Thread-seitig. Hauptverdächtiger neben dem Spawn-Burst: der GPU-Upload je
  Chunk-Install (`texture.refresh()`, 512 px, Wasser 3 Stufen) — ein Render-Thread-Stall, der im
  rAF-dt unsichtbar bleibt (p95 rAF 8,5 ms vs. gfxinfo p95 22 ms).

### Lokal iGPU (Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`)

- `before-local.json` (10 s): p50 16,7 / p99 16,8 / worst 16,8 ms, 0 Frames > 16,9 — der lokale
  Lauf ist 60-Hz-VSync-gebunden und quantisiert den Tail weg; das Tail-Signal ist nur am Gerät
  auflösbar. Lokal dienen die Läufe dem A/B-Vergleich derselben Methode, nicht als Tail-Beleg.

## K2 — Fix (Spawn-Batching + Chunk-Upload-Glättung)

1. **Spawn-Batching (`src/systems/Spawner.ts` + `src/scenes/Run.ts` debugSpawnEnemy):**
   Neue Debug-Pfad-Methode `queueEnemyWave(id, n, x, y, elite)`: berechnet ALLE Positionen sofort
   (exakt gleiche RNG-Reihenfolge wie `spawnEnemy`: Winkel, Radius, Clamp), legt sie in eine Queue;
   `update()` materialisiert höchstens `SPAWN_DEBUG_BATCH_PER_FRAME = 30` Runtime-Spawns je Frame
   (reine Helfer-Funktion `drainSpawnQueue`, getestet). Der natürliche Director-Pfad (`update`-
   Budget/Allowance) ist UNVERÄNDERT; kleine Spiel-Spawns (Dawn-Ereignis `spawnEnemy("bog_rat",8)`,
   Elite-Aufnahmen) bleiben über `spawnEnemy()` sofort — Semantik dort bitgleich.
2. **Chunk-Upload-Glättung (`src/gfx/GroundRenderer.ts`):** `finalizeReady` hatte bereits die
   harte Obergrenze 1 Install/Frame; neu zusätzlich `chunkInstallDue()` (rein, getestet): bei
   Rückstau (> 1 fertiger Chunk) mindestens `CHUNK_INSTALL_MIN_INTERVAL_MS = 12` ms zwischen zwei
   Installs → die Upload-Kette nach einer Chunk-Grenzüberfahrt wird über Frames verteilt, der
   Steady-State (1 fertiger Chunk) bleibt sofort. Keine Änderung an Worker/Sync-Fallback/Margin
   (K1: kein belegter Main-Thread-Tail dort; ein größeres Prefetch-Margin wäre +50 MB GPU auf
   Android — verworfen, siehe Android-Praxis-Notiz).
3. **Nicht angefasst** (fremde Claims): `src/gfx/textures.ts`, `src/systems/FxSystem.ts`.

Tests: `tests/frame-tail-batching.test.ts` (11 Tests: Reihenfolge/Cap/Summe des Spawn-Drains,
Steady-State/Intervall/Überschreibung des Install-Gates). tsc rc=0.

## K3 — Nachher-Messung (gleiche Methode wie K1)

Siehe Abschnitt unten (wird nach den Läufen ergänzt).
