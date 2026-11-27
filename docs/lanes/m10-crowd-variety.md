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

Skript: `scripts/m10-crowd-variety.mjs` (500 Gegner, Minute-30-Mix, gleiche
Seed 20261127 für Vorher/Nachher → gleiche Anordnung). Zählt pro Typ die
Distinct-Sprite-Texture-Keys im Frame (Atlas-Frame-Name), Renderer-String im
JSON, Burst-FPS über 240 rAF-Ticks (Vergleichswert, beide Läufe unter
`flock /home/ai/games/.lf-perf.lock`).

### Vorher (#6398, Commit 2b9e118)

- Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
- 500/500 Gegner, 32 Distinct-Keys gesamt, **je Typ 4 Keys**
- Befund: die 4 Keys verteilen sich über 4 *nahezu identische Posen
  desselben Tons* — Doms „gleiche Sprites" ist damit pro Typ bestätigt
  (Klon-Wirkung kommt vom Ton/Detail, nicht von der Key-Anzahl)
- Burst-FPS: median 60 / mean 60
- Belege: `shots/m10-crowd-variety-before.json`, `.png`

### Nachher (#6402)

- Renderer: dito (Mesa Intel RPL-S)
- 500/500 Gegner, 32 Distinct-Keys gesamt, **je Typ 4 Keys** — Key-Anzahl
  bleibt 4 (fremder Vertrag tests/enemy-run-frames.test.ts), aber die Slots
  2/3 tragen jetzt den Varianten-Ton: im Frame sind pro Typ **2
  unterscheidbare Ton-Varianten** sichtbar (Abnahme „>= 2 je Typ" über
  Frames-Inhalt erfüllt; Unit-Test: Instanz-Streuung in
  tests/crowd-variety.test.ts)
- Burst-FPS: median 60 / mean 60 (identisch zum Vorher-Lauf — kein
  Performance-Rückgang, gleiche Texture-Anzahl, gleiche Atlas-Größe)
- Belege: `shots/m10-crowd-variety-after.json`, `.png`,
  `shots/m10-crowd-variety-before-after.png` (Side-by-side)

### Kontrolleur-Urteile

- **Reviewer: PASS** (826/826 Tests, tsc sauber). Silhouetten nur umgefärbt,
  kein Off-Palette-Pfad, Elite-Rim-Pfad unverändert, Tabu-Dateien unberührt.
  Anmerkungen umgesetzt: Guard in `enemyFrameGrids` (`frames.length < 4`
  fällt auf Basis zurück) + Determinismus-Test über alle 30 Typen
  (Commit 3c63b0e). Offen und ehrlich: jeder Gegner wechselt durch den
  4-Frame-Zyklus alle ~333 ms zwischen Basis- und Variantenton — in der
  Masse gemischt korrekt, Einzelgegner lesen das als Ton-Wechsel.
- **Art-director: PASS — 4,4/5** (Abnahmeziel >= 4/5). 26/30 Typen klar
  unterscheidbar, 0 Silhouetten-/Paletten-/Kant-Verstöße (120 Frame-Paare,
  9 950 Randspalten programmatisch geprüft), Elite-Rim intakt, Masse liest
  sich lebendig statt geklont. Nachbesserung (nicht blockierend, Folgekarte):
  Variantenton von `skeleton`, `centipede`, `harpy` kräftiger trennen
  (Lum-Distanz 26–30 vs. 40–90 bei den guten Typen).

### Offene Punkte

- Positionsstreuung (bis 2 px) und Instanz-Spiegelung wären nur mit Änderungen
  an Run.ts/EnemyPool.ts (tabu, fremd geclaimed) möglich — nicht umgesetzt.
  Die Ton-Variante deckt die Abnahme (>= 2 unterscheidbare Varianten je Typ)
  ohne diese Mechaniken ab.
