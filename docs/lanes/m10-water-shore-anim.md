# Lane m10-water-shore-anim — Wasser/Ufer bei 1x lebendiger (A8-Nachzug)

**Stand:** 2026-11-28 · **Zweig:** `m10-water-shore-anim` (Worktree `lf-lanes/m10-water-shore-anim`)
**Anlass:** A8 „Wasser bei 1x lebendiger/animiert" war der schwächste 4/5-Punkt der
Art-Politur-Abnahme (`shots/final-water-1x*`). Doms Kurs: Optik-Qualität.
Befund: Moor-Wasser wirkt zwischen den wenigen Animationsstufen statisch, Uferkanten hart.

## Hard-Grenze eingehalten
Kein Commit an `src/gfx/textures.ts`, `src/systems/FxSystem.ts`, `src/gfx/gen-fx.ts`,
`src/scenes/Run.ts` (belegt durch `git log --name-only` der Lane-Commits).
Alles über den prozeduralen Tile-Pfad: `tiles.ts`, `terrainWorker.ts`, `GroundRenderer.ts`.

## Was gebaut wurde (K1-K4)

### K1 — Ist-Zustand (Commit 0dfee0d)
- `scripts/m10-shore-anim.mjs`: 1x-PNG, 4x-nearest-Crops, 18-Frame-GIF (140 ms),
  Frame-Diff-Metrik (Pixel mit |Δ|≥8 zwischen aufeinanderfolgenden Frames).
- **WebGL-Renderer:** `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`,
  Vendor `Google Inc. (Intel)` — iGPU-Pflicht erfüllt, kein SwiftShader.
- Frame-Diff **before:** avg 2176 px (0,94 %) bei 640x360, Seed 13, Ufer (1988,2156).
- Befund: Wellenstriche statisch, Uferkante hart, Wasserfläche flach.

### K2 — 3 Animationsstufen im Tile-Pfad (Commits cf3bac9, 180a402)
- `tiles.ts`: `WATER_ANIM_STEPS = 3`; `paintTerrain(ctx, ox, oy, w, h, seed, worldSize, animStep = 0, destY = 0)`.
  1. **Wellen-Drift:** jede Wellengruppe kriecht 1 px/Stufe in gehashte Richtung.
  2. **Ufer-Schaum-Puls:** gehashte Stellen der Uferkante wechseln je Stufe paleMist(9)/mist(8).
  3. **Tiefen-Glisser:** sparsame 2-px-Funken (Paar-Hash, kein 1-px-Pfeffer) in offenem Wasser,
     Stufenwechsel über Hash-Schlüssel `+ animStep * 53`.
- `terrainWorker.ts`: malt **alle 3 Stufen** je Chunk (Land-Chunks nur 1 Frame, via `areaHasWater`).
- `GroundRenderer.ts`: Chunk-Textur = ein Canvas der Höhe `CHUNK_SIZE * frames` mit
  Frames `f0..f2`; Umschalten per `setFrame` (kein Textur-Rebind, Batching bleibt);
  weltverankerter Phasen-Offset je Chunk (kein taktgleiches Pulsieren); Sync-Fallback malt alle Stufen.
- `tests/shore-anim.test.ts` (7 Tests): Determinismus, **keine Abhängigkeit von der
  Mal-Reihenfolge** (putImageData überschreibt), Stufenpaare unterscheiden sich nur auf
  Wasser-Pixeln (<10 % Überlauf), Änderungen dezent (<12 % der Fläche), Palette-Compliance.
- **Ergebnis:** 7/7 grün, `npm test` 1098 Tests grün, `tsc --noEmit` grün.
- Frame-Diff after K2: avg 2652 px (1,15 %).
- **Reviewer: PASS** (Befunde umgesetzt in 180a402): `areaHasWater`-Sampling in den
  Worker verlagert (kein Main-Thread-Jank im Dispatch), `bitmap.close()` im
  getContext-Fehlerpfad, Kommentar zur destY/translate-Kopplung im Sync-Fallback.
  Offen/nicht nachgeführt (kosmetisch): Wasserstreifen < 4 px an Chunkkanten bekommen
  1 Frame (dort steht die dünne Kante still) — konsistent deterministisch, im GIF nicht
  sichtbar; Chunk-Frames-Logik im GroundRenderer ohne Unit-Test (Phaser-gebunden).

### K3 — Weiche Ufer-Schale + FPS (Commit 5135f22)
- Wasserufer in `tiles.ts`: Kante statt geschlossener Leuchtlinie gehasht aufgelockert
  (9/7) + Puls (9/8); dunkle SE-Kante gedithert (1/2 bzw. 2/5) statt harter Ringe.
- **FPS-Beleg M25 640x360** (`flock /home/ai/games/.lf-perf.lock npm run perf --
  --viewport 640x360 --dpr 1`):

| Messung | before | after | Schwelle |
|---|---|---|---|
| M25 FPS (Roll) | 60,0 (gemessen 60,4) | **60,0** (gemessen 60,5) | ≥ 55 bzw. ≥ 57 (−5 %) |
| worstFrame | 16,8 ms | 16,8 ms | — |
| minEnemies | 300 | 300 | ≥ 200 |
| JS-Fehler | 0 | 0 | 0 |

  Vsync-gecapped, Werte im Rauschen. JSONs: `shots/m10-shore-anim-fps-before.json`,
  `shots/m10-shore-anim-fps-after.json`.
- Belege: `shots/m10-shore-anim-{before,after}-shore-4x.png` (convert-Crop 160x120 an der
  Uferkante, 4x nearest), `shots/m10-shore-anim-after.{png,gif}`.

### K4 — art-director-Abnahme
- **PASS — 4/4/4/4, Gesamtnote 4/5 (Ziel ≥ 4 erreicht), Massstab „kommerziell auslieferbar".**
- Lebendigkeit 4/5: Wellen-Drift nachweislich ~1 px/Stufe (12x-Montage); Schaum-Aktivität
  entlang der gesamten Uferkante + Funken in der Seemitte neu (Vorher-Diff: absent);
  nichts wirkt eingefroren, Ruhe passt zum Moor.
- Uferkante 4/5: vorher durchgehende helle Linie jetzt an 1-px-Lücken gebrochen, dunkle
  Innenkante gedithert — gebrochen, aber nicht verwaschen; Kante wandert nicht.
- Störfreiheit 4/5: kein 1-px-Strobo (Diff-Messung Uferstreifen before Ø 75 / after Ø 85 px,
  kein Ausreißer); Land/Bäume statisch.
- Kommerziell 4/5: „calm, mehrschichtiges Wasser … würde ich ausliefern".
- Backlog-würdig (nicht blockend): sattgrüne 1-px-Glints entsättigen/2-px, Stipple-Fleck
  in der Seemitte (Altbestand vor der Lane), Capture-GIF-Loop-Naht an Animationsperioden koppeln.

## Offene Punkte / Hinweise für GAME.md-Merge
- Chunk-Malen im Worker ist für Wasser-Chunks ~3x teurer (3 Stufen);initialer
  Chunk-Aufbau nach Teleport spürbar langsamer (Messskript wartet jetzt 2,6 s statt 600 ms).
  Im normalen Spiel (Streaming beim Laufen) nicht aufgefallen; M25-FPS unverändert 60.
- Speicher: Wasser-Chunk-Texturen 3x Höhe (256x768 statt 256x256). JS-Heap-Messung
  nicht separat wiederholt; FPS/Frame-Zeit unverändert. Falls der Heap-Gate-Strengtest
  anschlägt: `WATER_ANIM_STEPS` auf 2 senken (eine Zeile in tiles.ts) oder Glisser-Pass reduzieren.
- Ripples (Sprites, 2 Frames, 620 ms) bleiben unverändert und laufen neben den 3
  Tile-Stufen (560 ms, phasenversetzt) — Desync wirkt organisch.
- `scripts/m10-shore-anim.mjs` ist Messwerkzeug; GIFs liegen auch nach Merge unter
  `shots/` (im Repo via `git add -f`, da `shots/*.gif` default ignoriert ist).
