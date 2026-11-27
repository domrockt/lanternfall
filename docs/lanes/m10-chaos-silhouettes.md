# Lane m10-chaos-silhouettes: Chaos-Horde lesbar

Worktree `/home/ai/games/lanes/m10-chaos-silhouettes`, Branch `m10-chaos-silhouettes`.
Ziel: In der Chaos-Horde (500+ Gegner) bleiben die 30 Archetypen als Typen erkennbar
(ACCEPTANCE A10, art-director-Restpunkt „im Chaos verschwimmen einzelne Typen rechts“).
Kein Gameplay-/Balance-Wert und keine Sprite-Größe ändern.
Bereich: `src/gfx/enemySprites.ts`, `src/systems/EnemyPool.ts`, `tests/enemy-silhouette.test.ts`,
`docs/lanes/m10-chaos-silhouettes.md`, `shots/m10-chaos-silhouettes-*`.

## Karten

- #2518 K1 Ist-Messung: Chaos-Frame Minute 25 + Kontrast-JSON vorher.
- #2519 K2 Silhouetten schärfen: 1-px Kontur + 1-px Lichtkante oben.
- #2520 K3 Elite-Rim-Light: deterministisch, nur Elite, kein Flackern.
- #2521 K4 Test `tests/enemy-silhouette.test.ts`.
- #2522 K5 Beleg + Doku: Chaos-Frame 1920×1080 + Crop, Nachher-JSON, FPS, art-director, `.lane-done`.

## #K1 Ist-Messung (vorher)

- Chaos-Frame eingefroren: `window.__lf.god(true)`, `autoPlay(true)`, `setTimeScale(30)`,
  `skipTo(1500)`; 1920×1080-Screenshot `shots/m10-chaos-silhouettes-before.png`.
  Frame bei 25:07 mit **352 Gegnern**, davon 2 Elite (0.6 %), 0 JS-Fehler.
- Messverfahren: Rim-Band = Randpixel + 1 px innen, aus den in-game Textur-Masken
  (`GEN_ENEMIES`). Luminanz-Differenz gegen dunklen Moorboden PAL[28] (L 34.0) und
  helles Moor PAL[31] (L 140.8); Schwelle 40. Rohwerte:
  `shots/m10-chaos-silhouettes-before.json` (30 Gegner).
- Rim-Light-Breite Ist: 1 px Lichtkante nur punktuell (Mittel 42.9 % Rim-Pixel hell);
  Elite-Aura 1 px, Alpha 0.42, Scale 0.9 + radius/32.
- Lücke: Im 1920×1080-Chaos-Frame verdeckt das Boss-Intro-Banner den Kern; die
  Elite-Stichprobe ist mit 2 Elites klein. Die Per-Archetyp-Werte stammen deshalb
  aus den deterministischen Textur-Masken, nicht aus Live-Pixeln.

| Archetyp | bbox W×H | Füllgrad | Rim-Light % | Top-Light % | unter Schwelle dunkel % | unter Schwelle hell % |
|---|---|---|---|---|---|---|
| abom | 32×24 | 0.645 | 44.2 | 37.1 | 55.8 | 27.3 |
| banshee | 23×19 | 0.581 | 59.1 | 37.8 | 55.9 | 18.5 |
| bat | 20×14 | 0.611 | 28.1 | 17.5 | 71.9 | 0 |
| bog_rat | 16×13 | 0.639 | 23.3 | 25 | 76.7 | 3 |
| bogzombie | 15×16 | 0.658 | 40.5 | 33.3 | 59.5 | 23.4 |
| bomber | 17×22 | 0.612 | 57.2 | 36.4 | 42.8 | 31.4 |
| centipede | 32×15 | 0.694 | 64.6 | 46 | 35.4 | 17.4 |
| crow | 16×12 | 0.578 | 32.4 | 45.2 | 67.6 | 27.9 |
| cultist | 18×18 | 0.657 | 48.4 | 26.5 | 51.6 | 16 |
| gargoyle | 25×22 | 0.631 | 52.4 | 44 | 51 | 24.8 |
| ghoul | 16×18 | 0.635 | 39.3 | 25.8 | 60.7 | 3.8 |
| golem | 24×22 | 0.744 | 20.4 | 34 | 79.6 | 1.8 |
| harpy | 28×23 | 0.404 | 45.8 | 42.6 | 54.6 | 8.5 |
| horror | 29×22 | 0.608 | 51 | 34.5 | 49 | 23.5 |
| imp | 22×18 | 0.523 | 26.6 | 9.5 | 73.4 | 1.9 |
| knight | 28×28 | 0.648 | 51.6 | 41.1 | 53.3 | 17.3 |
| lich | 26×26 | 0.675 | 36.4 | 32.7 | 65.8 | 8.1 |
| mudling | 16×14 | 0.696 | 49.4 | 31.3 | 50.6 | 12.2 |
| reaper_bat | 30×26 | 0.431 | 30.1 | 38.3 | 75.9 | 21.7 |
| scarecrow | 20×19 | 0.658 | 34.8 | 21.1 | 65.2 | 0 |
| skeleton | 13×20 | 0.712 | 58.4 | 29.2 | 41.6 | 12.4 |
| slime | 18×13 | 0.769 | 69.4 | 31.4 | 40.6 | 38.3 |
| spider | 24×18 | 0.66 | 49.8 | 41.7 | 62.5 | 17.2 |
| toad | 15×12 | 0.761 | 38.7 | 42.9 | 61.3 | 13.9 |
| treant | 26×27 | 0.564 | 12.1 | 34.6 | 87.9 | 5.3 |
| voidcaller | 30×26 | 0.564 | 55.5 | 40 | 69.3 | 22.3 |
| wisp | 11×15 | 0.673 | 27 | 9.5 | 73 | 17.1 |
| witchling | 16×19 | 0.691 | 41.9 | 31.3 | 58.1 | 7.1 |
| wolf | 23×17 | 0.642 | 45.4 | 37 | 54.6 | 26.7 |
| wraith | 28×21 | 0.546 | 53 | 37 | 50.5 | 23.4 |

**Mittel vorher:** Rim-Light 42.9 %, Top-Light 33.1 %, unter Schwelle dunkel 59.9 %,
hell 17.4 %. Genau hier setzt K2 an: mehr helle Kante oben, damit auf dunklem Moor
die Silhouette nicht in der Fläche verschwindet.
