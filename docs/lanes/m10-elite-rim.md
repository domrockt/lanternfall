# Lane m10-elite-rim: Chaos-Rim-Light fuer Elites (ACCEPTANCE A10)

Worktree `/home/ai/games/lf-lanes/m10-elite-rim`, Branch `m10-elite-rim`.
Ziel: Elite-Gegner muessen sich bei 300–500 Gegnern sofort als Elite erkennen lassen
(ACCEPTANCE A10, art-director-Restpunkt "im Chaos verschwimmen einzelne Typen").
Kein Spawn-/Balance-Eingriff, keine Sprite-Groesse/Aenderung an Nicht-Elite-Sprites.

Bereich (Disponent): `src/gfx/enemySprites.ts`, `src/systems/EnemyPool.ts`,
`tests/elite-rim.test.ts`, `scripts/m10-elite-rim.mjs`, `docs/lanes/m10-elite-rim.md`,
`shots/m10-elite-rim-*`.

## Karten

- #5238 K1 Baseline: Schwarm-Shots + Amber-Rim-Anteil je Typ vorher.
- #5239 K2 Rim-Light im Sprite-Generator (`enemySprites.ts`).
- #5240 K3 Wirksamkeit im EnemyPool (`EnemyPool.ts`).
- #5241 K4 Nachher-Beleg + Abnahme (Contact-Sheet, art-director, FPS).

## #5238 Ist-Messung (vorher)

`node scripts/m10-elite-rim.mjs --mode baseline` (dist-Build ohne Feature).

- Schwarm: 347 Gegner, davon 20 Elites (2 Spawn-Gruppen je 10 Typen nah am Spieler),
  640x360 (dpr 1) und 780x360 (dpr 3), 0 JS-Fehler.
  `shots/m10-elite-rim-baseline-640.png`, `-780.png`; Kontaktblatt `-sheet.png` (1x/4x).
- Amber-Rim-Anteil an den Randpixeln der echten Spiel-Texturen (Randpixel = gefuellt
  mit mind. 1 transparentem 4-Nachbarn; Amber = exakt PAL 20, 0xffb84d):
  **29/30 Typen 0 %**, nur gargoyle ~0,5 (dessen Lichtkante loest via
  `lightEdgeIndex` teilweise auf PAL 20 auf). `shots/m10-elite-rim-baseline.json`.
- Lesbarkeit vorher: Elites nur ueber die dahinterliegende Aura (M9-K3, skalierte
  tintFill-Kopie) und Groesse (1,25x) erkennbar — im Schwarm-Crop kaum sofort identifizierbar.

## #5239 Rim-Light im Sprite-Generator

- `eliteRimGrid()`: alle Randpixel der geschaerften Frame-0-Maske werden auf die
  Elite-Akzentfarbe `C.amber` (PAL 20) gesetzt. **Vollumrandung** → die Kante ist
  richtungs- und frameunabhaengig: keine Laufrichtungs- oder Frame-Duplikate.
  Binaeres Alpha: nur gefuellte Pixel bekommen die Akzentfarbe, nichts expandiert,
  kein Dithering, keine neuen Farben (nur Palette).
- Genau **1 zusaetzliches Frame je Typ** (Rim-Variante der Ruhepose, Frame 0):
  Key `<spriteKey>_rim` (z. B. `enemy_bog_rat_rim`), Textur in
  `createEnemyTextures()` vorgerendert (keine Laufzeit-Erzeugung).
- Frameset-Verschluesselung: `ALL_ENEMY_FRAMES`traegt zusaetzlich die Keys
  `<id>_rim` → sie fliessen via Spread in `SPRITE_FRAMES` (textures.ts) und in die
  Atlas-`KNOWN_FRAMES` (atlas.ts) ein — beide Dateien mussten nicht angefasst werden.
- `eliteRimDef(def)`: Elite-Lauf-Def mit `id = "<id>_rim"`; `baseEnemyDef()`
  restauriert die Basis-Def. Base-Frames und deren Framezahl unveraendert
  (Test `Framezahl der Basis-Sprites bleibt unveraendert`).

## #5240 Wirksamkeit im EnemyPool

- `EnemyPool.spawn()` mit `elite: true`: setzt `enemy.def = eliteRimDef(def)` und
  applied das Rim-Frame (`ELITE_RIM_FRAMES`). Run.ts waehlt Lauf-Frames via
  `framesForDef(e.def)` → `SPRITE_FRAMES[def.id]` — mit der Rim-ID zeigt der
  zyklische Frame-Abruf fuer Elites stabil auf den einen Rim-Frame (Laenge 1,
  `runFrameIndex` immer 0): **kein Frame-Override, kein Flackern**, und Elites
  kosten sogar weniger Texture-Swaps als vorher.
- Pool-Reuse unveraendert: dieselbe Sprite-/Aura-Instanz, ai/RNG-Identitaet bleibt
  (Test). Nicht-Elite-Spawn mit geerbter Rim-Def (Splitter-Kinder erben
  `parent.def`) restauriert die Basis-Def → **kein Rim fuer Nicht-Elites**.
- Die M9-Aura (tintFill-Kopie hinter dem Sprite, Run.ts) bleibt unveraendert und
  ergibt zusammen mit der gebrannten Kante eine 2-px-Lesekante aussen + innen.
- Nebenwirkung dokumentiert: `window.__lf.state().enemyList[].id` und
  `__lfEnemyFrames` zeigen fuer Elites die Rim-ID (`<id>_rim`), z. B. `bog_rat_rim`.
  Alle gameplayrelevanten Felder (archetype/tier/color/xp/name) sind unveraendert.
  Bestehende Verify-Skripte filtern nach Nicht-Elite-IDs und sind nicht betroffen.

## #5241 Nachher-Beleg + Abnahme

- `node scripts/m10-elite-rim.mjs --mode after`:
  **30/30 Typen haben ein Rim-Frame, Rim-Anteil an den Randpixeln = 1,0** (Vollumrandung),
  0 JS-Fehler. `shots/m10-elite-rim-after.json`, Kontaktblaetter `-after-sheet.png`.
- Schwarm nachher: 20 Elites unter 347 Gegnern in beiden Ansichten sofort als
  Elites erkennbar (Amber-Umrandung), siehe `-after-640.png` / `-after-780.png`
  und Crop `/home/ai/tmp/m10-elite-rim/after-640-crop.png` vs. baseline-crop.
- FPS (flock-Sperre, `flock /home/ai/games/.lf-perf.lock npm run perf`):
  Burst 500 Gegner **60,0 FPS** (worst frame 16,8 ms), Minute-25-Fenster 60,5 FPS,
  minEnemies 500/300, 0 JS-Fehler → Ziel ≥ 55 erreicht, keine Verschlechterung
  gg. dokumentierter Baseline (docs/lanes/m10-perf-500.md: Burst-Median 59,1).
- Tests: `npx tsc --noEmit` gruen, `npm test` **598 Tests / 59 Dateien gruen**
  (davon elite-rim.test.ts 11), `npm run build` gruen.
- **art-director (Vision der Belege): PASS, Note 4/5 Lesbarkeit (Ziel >= 4 erreicht).**
  Befunde: exakt 1 Rim-Farbe (#ffb84d), Kantenbreite 1 px (Diagonalen treppenkorrekt),
  0 Luecken ueber alle 30 Typen, binaeres Alpha, Baseline-Halo (2–4 px wabblig,
  Phantom-Elites durch XP-Gems) sauber ersetzt; Schwarm-Crops: Elites < 1 s erkennbar.
  Makro-Restpunkt: Rim steckt nur in Frame 0 → Elites laufen in eingefrorener Pose
  (klassischer "cheap"-Tell), Nachbesserung siehe Backlog-Karte.
- **reviewer: PASS** (598 Tests gruen; def.id-Audit aller Consumers, Atlas-Reihenfolge
  Boot vor buildRuntimeAtlas belegt, Splitter/Boss/Reuse-Randfaelle abgedeckt).
  Debug-only-Befund: Elite-Splitter-Kinder zaehlen in `spawnCounts` nicht mehr
  (`"bog_rat_rim" in ENEMIES` false, Spawner.ts:200) — kein Gameplay-Impact,
  `Spawner.ts` ist fremd beansprucht → Backlog-Karte.

## Abgrenzung / offene Punkte

- Elites zeigen den Rim-Frame statisch (Ruhepose + Bob-Bewegung in Run.ts). Die
  Lauf-Animation der Basis-Frames bleibt Nicht-Elites vorbehalten; im Schwarm
  lies sich das nicht vom Bob unterscheiden und kostet 0 Texture-Swaps.
- Aura-Verhalten in Run.ts unveraendert (Datei nicht im Bereich).
