# Lane m10-crowd-variety — Gegnermasse: Abwechslung statt Klonen

Briefing (Dom 21:45Z, Punkt 4c): „Gegnermasse Minute 30 = einfarbiger dunkler
Block gleicher Sprites — Lesbarkeit/Abwechslung." Ziel: pro Gegnertyp
mindestens 2 unterscheidbare Sprite-Varianten, ohne Silhouetten, Elite-Rim
oder Palette zu verletzen.

## Mechanik

### Variante je Typ (#6399, Commit 10ab95b)

- `enemyVariantColor(index)`: Variantenton = Stufe der Familien-Rampe
  (`GEN_ENEMY_FAMILIES[def.spriteKey].ramp`) mit dem größten Luminanz-Abstand
  zur Basisfarbe. Nur Palettenindizes, Familie bleibt erhalten.
- `enemyVariantFrames(index)`: die 4 generierten Posen, nach dem Schärfen
  deterministisch umgefärbt — jeder Körperpixel wird mit 55 % Variantenfarbe
  gemischt und auf den nächsten Palette-Index gerundet. Unangetastet: Kontur
  (0), Augen/Glow (13), 1-px-Lichtkante (`tones.top`). Silhouette identisch,
  binäres Alpha bleibt.
  - Warum nicht `sharpenEnemyGrid(rows, variantColor)`: der Farb-Parameter
    wirkt nur bei Typen ohne `CONTRAST_TONES`-Eintrag — 10 Typen (u. a.
    voidcaller, bog_rat, bat) hätten identische Varianten bekommen.

### Instanz-Auswahl (#6400)

Kein Eingriff in `src/systems/EnemyPool.ts` / `src/scenes/Run.ts` nötig —
keine Meldung in `/home/ai/games/.dispatch/requests.md` erforderlich.

Die Auswahl läuft vollständig über bestehende, von `enemySprites.ts`
gelieferte Keys:

- `framesForDef(e.def)` → `SPRITE_FRAMES[def.id]` → 4 Frame-Keys
  (`enemy_<typ>`, `_2`, `_3`, `_4`); Frames 0/1 tragen den Basis-Ton, Frames
  2/3 den Varianten-Ton (`enemyFrameGrids`, registriert in
  `createEnemyTextures`).
- `runFrameIndex(frames.length, t, e.phase)` mit zufälliger Spawn-Phase
  (`Spawner.spawnAt`: `rng.next() * 2π`) streut die Instanzen eines Typs
  zu jedem Zeitpunkt über die 4 Frames — in der Masse sind damit Basis- und
  Varianten-Ton gleichzeitig sichtbar.
- Elite-Rim unberührt: `eliteRimFrame(index)` bleibt die Umrandung der
  Basis-Ruhepose; der Rim-Frameset (`<id>_rim`) ist weiterhin ein eigener
  Eintrag in `SPRITE_FRAMES`.

### Tabus respektiert

`src/systems/Pool.ts`, `src/systems/EnemyPool.ts`, `src/scenes/Run.ts`,
`src/gfx/gen-enemies.ts`: nicht angefasst. Fremde Tests
(`tests/enemy-run-frames.test.ts` pinnt Frameset-Länge 4 und `frames[0] ===
spriteKey`) bleiben grün, weil der Key-Satz unverändert 4 Slots hat und nur
der *Inhalt* der Slots 2/3 zur Variante wird.

## Messungen

(Vorher/Nachher-Messung folgt in #6398/#6402 — 500-Gegner-Frame Minute 30,
Distinct-Sprite-Texture-Keys je Typ, Renderer-String, Burst-FPS unter flock.)
