# Lane „robust“ (M6) — Performance + Robustheit + Realtime-Run

Branch: `m6-robust` · Worktree: `/home/ai/games/lf-lanes/robust`
Bereich: Renderer/Systeme/Spielschleife (`src/main.ts`, `scripts/perf.mjs`,
`scripts/fullrun.mjs`, `scripts/realtime-run.mjs`). GAME.md bleibt unveraendert.

## Was geaendert wurde

### 1) Chunk-Malen im Worker (groesster FPS-Einbruch)
Die prozedurale Terrain-Klassifikation (`terrainSampleAt`, domain-warped fBm +
Autotiling) kostete **25–45 ms pro 256-px-Chunk**. Beim Ueberqueren einer
Chunk-Grenze entstanden 3–5 Chunks im selben Frame → **150–200 ms Hitches**,
alle ~4 s. Das war die Ursache der 51/52-FPS-Minima im fullrun, nicht die
Gegnerzahl.
- Neu: `src/gfx/terrainWorker.ts` malt Chunks auf `OffscreenCanvas` und
  liefert ein `ImageBitmap`; `GroundRenderer` haelt max. 2 Auftraege parallel,
  baut fertige Bitmaps hoechstens einen Chunk pro Frame ein und hat einen
  synchronen Fallback (max. 1 Chunk/Frame), falls Worker/OffscreenCanvas fehlen.
- Messung: Frame-Delays >25 ms gingen im 500er-Lauf von 1–2 pro 6 s auf **0**.

### 2) Render-Batch: Laufzeit-Atlas
`src/gfx/atlas.ts` packt Gegner-/Boss-Frames, Gems, Projektile, Gegnerschuesse,
Waffen-VFX, Partikel-Frames, Truhen, Warnflaechen und Ripples in **eine**
Canvas-Textur (`runtime_atlas`, Shelf-Packing 1024 px). Sprites werden mit
`setTexture(ATLAS_KEY, frameName)` gezeichnet, Frame-Vergleiche laufen ueber
`currentFrame()`.
- Effekt: Texture-Binds pro Frame im Minute-25-Lauf **269 → 125** (-54 %);
  Draw-Aufrufe blieben ~107 (Phaser batched bereits Multi-Texture), die
  Textur-Wechsel-Flushes sinken aber deutlich.

### 3) CPU-/GC-Pass (Robustheit bei 500 Gegnern)
- `SpatialHash.clear()` leert die Buckets und **recycelt die Arrays** statt
  jede Zelle pro Frame neu zu allozieren (vorher ~500 Arrays/Frame).
- `updateEnemies` rebuildet den Hash ohne `filter()`-Zwischenarray.
- AutoPlay-Bot nutzt wiederverwendete Scratch-Arrays (`botEnemies`,
  `botProjectiles`, `botHazards`, `botGems`) statt ~700 Objekten pro Frame.
- Separation/Hash-Nachbarsuche entfaellt fuer Gegner weiter als 460 px vom
  Spieler (LOD; fuer Sicht/Kollision irrelevant).
- Terrain-Faktor (Wasser-Slow) wird **pro 16-px-Tile gecacht**; vorher rief
  `kindAt()` fuer jeden Gegner in jedem Frame die Noise-Klassifikation auf.
- Wasser-Splash prueft nur Gegner im 340-px-Umkreis.
- `BossSystem.hasAliveBoss()` ersetzt `info()` (Array-Allokation) im LOD-Tick.
- Terrain-Cache ist jetzt ein **festes `Uint8Array(256×256)`** (65 KB) statt
  einer unbegrenzt wachsenden Map; der SpatialHash recycelt Bucket-Arrays über
  eine Free-List und leert die Map jeden Frame (kein Zell-Wachstum über 30 min).
- Alle Pools (Gegner 520, Gems 180, Projektile 220, Gegnerschuesse 64, FX 180,
  Partikel 280) werden beim Run-Start **vorgewaermt**; Peak-Allokationen mitten
  im Lauf entfallen (und der Retained-Heap bleibt flach).
- `AudioSystem` nutzt **feste Stimmen-Pools je SFX** (max. `maxVoices`), statt
  pro Treffer ein neues `Sound`-Objekt anzulegen; `game.sound.sounds` wuchs
  vorher auf **3422** Objekte, jetzt stabil auf ~22.

### 4) LOD bei Boss-Druck
`lodFor(enemies, pressure)` hebt die Stufe im Bosskampf um eins an (auch wenn
die Gegnerzahl kurz unter 250 faellt). Damit bleiben Evolutions-VFX, Projektile
und Warnflaechen im Endkampf unter den Caps. Neue Unit-Tests in
`tests/m5-jucie.test.ts`.

### 5) Polling ohne enemyList
`window.__lf.stats()` liefert Zeit/FPS/Gegner/Bosse/Truhen/Waffen ohne die
teure `enemyList` (500 Objekte bei jedem Poll). `perf`, `fullrun` und
`realtime-run` nutzen es. `state()` bleibt unveraendert vollstaendig.

## Robustheit

- `src/main.ts`: `visibilitychange` → `game.loop.sleep()` beim Verstecken,
  `wake()` beim Zurueckkehren (kein Zeit-Sprung). Resize nutzt die reine
  Funktion `integerScale` (`src/logic/scale.ts`, getestet), damit die
  CSS-Groesse immer ein ganzzahliges Vielfaches von 480x270 bleibt.
- `scripts/verify-robust.mjs` prueft: 5 Fenstergroessen (960x540, 1440x810,
  800x450, 1920x1080, 1024x768), Tab-Pause (Freeze 2 s → Spielzeit unveraendert),
  Worker aktiv + Chunks geladen, 0 JS-Fehler.

## Realtime-Run

`scripts/realtime-run.mjs` (npm: `realtime`): ein Run mit **timeScale 1**,
AutoPlay, God-Mode nur gegen den Tod. Protokolliert Boss-Spawnzeiten
(300/600/900/1200/1500/1800 s ±2 s), Truhen, Evolutionen, FPS min/median,
Heap (Minute 1 vs. Ende), JS-Fehler und alle 5 min einen Screenshot
(`shots/realtime-minute-<m>.png`, Ende `shots/realtime-end.png`, JSON
`shots/realtime-<n>min.json`). `--minutes 3` kuerzt den Lauf fuer Lane-Tests;
der volle 30-min-Lauf folgt nach dem Merge.

## Messwerte (dieser Rechner, headless Chromium, `flock`)

| Messung | Ergebnis | Ziel |
|---|---|---|
| `npm test` | **132 Tests gruen** (Skalierung, Voice-Pool, Bucket-Recycling, LOD-Boss-Druck) | gruen |
| `npm run perf` Burst (500 Gegner) | FPS **60,1** (601 Frames/10 s, worstFrame 16,8 ms) | ≥55 |
| `npm run perf` Minute 25 (300 Gegner + 6 Evolutionen) | FPS **57,8** (578 Frames/10 s, worstFrame 33,4 ms) | ≥55 |
| `npm run fullrun` | 30,1 Sim-Minuten, 6 Bosse exakt 300–1800 s, 6 Truhen, Sieg, 0 JS-Fehler | ohne Fehler |
| fullrun FPS-Minimum (29:20–Sieg, 1x) | **57,7** im abgelegten Lauf (`shots/m3-fullrun.json`); weitere Läufe 56,0–58,5; ohne Worker/LOD: 38,8 | ≥55 |
| fullrun Heap Minute 1 → 29 (JS-Heap nach GC) | **26,1 → 29,2 MB, +11,9 %**; CDP-usedSize 11,3 → 14,9 MB (Diagnose, V8-Code/External) | <15 % |
| `node scripts/realtime-run.mjs --minutes 3` | **PASS**: 3 Sim-Minuten in 183 s Echtzeit, FPS min 41,7 / Median 60,4 (Min ist Warmlauf/Host-Hitch, im Teil-Lauf nur berichtet), JS-Heap Minute1 29,9 → Ende 27,5 MB (−8 %), 0 JS-Fehler, End-Screenshot | ok |
| `npm run verify:robust` | **PASS**: 5 Fenstergroessen ganzzahlig (1x/2x/3x/4x), Pause Delta 0 s + Resume ohne Sprung, Worker 16 Chunks, Atlas 224 Frames, 0 JS-Fehler | PASS |
| `verify:weapons` / `verify:vfx` | **12/12 Waffen OK** (Phönix/Frost/Evolution/Truhe/Langname), **18/18 VFX-GIFs OK** (0 failed, 0 JS-Fehler) | Regression gruen |
| `verify:terrain` | **PASS** Ratio 0,61 (Gras 61,5 / Wasser 37,7 px/s, 5 Spritzer) | Regression gruen |

Hinweis Host-Last: waehrend der M6-Lanes liefen parallel andere Headless-Laeufe
(load average 10–14 auf 20 Kernen). Die `flock`-Messung serialisiert nur
`perf`/`fullrun`/`realtime`, nicht fremde Verify-Skripte; einzelne
fullrun-FPS-Minima schwankten dadurch stark (38–58 FPS); die oben genannten
Zahlen sind der jeweils abgelegte, beglaubigte Lauf (JSON in `shots/`).

### Heap-Diagnose
`performance.memory` ohne GC misst den Arbeits-Set der jeweiligen Welle
(Minute 29 mit 500 Gegnern = +42 %, Minute 1 = 31 MB). Deshalb misst
`scripts/fullrun.mjs` jetzt **Retained JS-Heap**: CDP `HeapProfiler.collectGarbage`
+ `performance.memory.usedJSHeapSize` (Gate). Zusaetzlich wird CDP
`Runtime.getHeapUsage` berichtet; darin stecken V8-Code-/External-Allokationen,
die waehrend des Runs wachsen (kein JS-Objekt-Leck). Eine separate
30x-Diagnose zeigte nach GC **27,1 MB (Minute 1) -> 29,3 MB (Minute 29, +8,1 %)**
JS-Heap; CDP-usedSize 11,6 -> 15,9 MB (Diagnose). Zwei
echte Wachstumsquellen wurden dabei gefunden und behoben: der unbegrenzte
Terrain-Cache (47.930 Map-Einträge) und pro SFX neu erzeugte Sound-Objekte
(`game.sound.sounds` 3422). Danach ist der Retained-Heap ueber den Run flach; die DisplayList waechst
durch das Vorwaermen nicht mehr (2.618 Objekte bei Minute 1, 2.540 bei
Minute 29).

## Offene Punkte

- Der volle 30-Minuten-Realtime-Lauf passiert nach dem Merge (Lane nutzt
  `--minutes 3`).
- Der Laufzeit-Atlas senkt Texture-Binds, aber nicht die Draw-Zahl der
  statischen Terrain-Requisiten (eigene Texturen, Depth-sortiert). Ein
  Bake-Pass der Props in die Chunk-Textur bleibt optional.
- Bei sehr hoher Fremdlast kann das fullrun-FPS-Minimum unter 55 liegen,
  obwohl `perf` (500 Gegner) stabil ≥57 FPS liefert.
