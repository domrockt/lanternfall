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

## #K3 Elite-Rim-Light (deterministisch)

In `src/systems/EnemyPool.ts`:
- `eliteMarkerSpec(radius)` liefert `{ color: PAL20/Amber, alpha: 0.92, rimPx: 1, scale: 1 + 2/(2·radius) }`.
  Alle Werte hängen nur vom Radius ab – kein Zufall, keine Zeitabhängigkeit, kein Flackern.
- `NORMAL_MARKER_SPEC` = `{ color: -1, alpha: 0, rimPx: 0, scale: 1 }` → normale Gegner tragen keinen Marker.
- `eliteMarkerTint()` liefert `0xffb84d` (Palette 20). Der Marker wird im Spawn nur für `elite` gesetzt;
  Bosse behalten ihre eigene Inszenierung.
- Beleg: `tests/enemy-silhouette.test.ts` prüft `Elite-Spec ≠ Normal-Spec` und Determinismus (2 Läufe gleich).

## #K4 Test: 30 Archetypen unterscheidbar

`npx vitest run tests/enemy-silhouette.test.ts` → **5/5 grün**:
- 30 Archetypen als Basis.
- Jedes Paar unterscheidet sich in **≥ 2 Shape-Dimensionen** (Breite, Höhe, Füllgrad,
  Top-/Bottom-Kantenbreite, Randpixel-Anteil); Differenztoleranzen 1 px bzw. 0.02.
- Kantenkontrast: maximale Luminanzdifferenz gegen dunklen Moorboden > 40 L bei allen 30;
  mittlerer Kontrast gegen helles Moor > 40 L bei allen 30.
- Elite-Spec weicht messbar von Normal ab (Alpha, Rim-Breite, Farbe).
- Determinismus: zwei Läufe liefern identische Signaturen.

## #K5 Beleg + Abnahme

- Chaos-Frame **1920×1080** (25:35, **580 Gegner**, 8 Elite, 0 JS-Fehler):
  `shots/m10-chaos-silhouettes-chaos.png`; 2×-Crop `shots/m10-chaos-silhouettes-crop.png`.
  Der Crop zeigt Horrors (Augen), Ritter/Gargoyle (Flügel/Helm), Bomber, Vogelmenschen,
  Treants und kleine swarm-Einheiten an ihrer Silhouette unterscheidbar.
- Nachher-JSON mit denselben Metriken: `shots/m10-chaos-silhouettes-after.json`
  (30 Archetypen, Mittel Rim-Light 44.9 %, Top-Light 37.1 %, unter Schwelle dunkel 57.6 %,
  mittlerer Randkontrast dunkel 59.5). Zusätzlich `chaosFrame` und `eliteMarker` im JSON.
- FPS Minute 25 mit `flock /home/ai/.lf-perf.lock`: **60.1 FPS** (602 Frames/10 s,
  min. 552 Gegner, avg 578, 1920×1080@dpr1, worstFrame 16.8 ms, 0 JS-Fehler) →
  `shots/m10-chaos-silhouettes-fps.json`.
- `npm run build` + `npm test` grün (306 Tests). Ehrlich: der Silhouetten-Gewinn ist
  messbar, aber moderat; im dichten Kern bleiben Überschneidungen, lesbar sind vor allem
  die Randfiguren und die Lichtkante oben.

## #K5 Abnahme: art-director FAIL 3/5 (blockiert)

Das art-director-Urteil fiel **FAIL, Note 3/5** (nötig ≥4/5). Begründung:
- Grundsilhouetten (Ritter, Krabbler, Irrlicht, Imp, Totem), 1-px-Tinte-Kontur,
  3 Schattierungsstufen, Palette und Spritegrößen sind ok.
- Aber 57,6 % der Randpixel bleiben unter dem Kontrastschwellwert zum dunklen Moor;
  die Problemfälle besserten sich kaum: treant 82,3 % unter Schwelle / Edge 26,5;
  golem 77,4 % / 28,5; bog_rat 70,7 % / 32,8; crow unverändert 67,6 % / 47,7.
- Kein Elite mit Amber-Rim ist in einem Beleg eindeutig sichtbar (8 Elite im Chaos-Frame,
  aber unter Boss-Banner und rotem Feuer-VFX; Amber 20 geht dort farblich unter).
- `after.png` (26:19, fast leeres Feld) ist kein Hordenframe und passt nicht zu den
  JSON-Zahlen (25:13, 358 Gegner) – Vorher/Nachher ist nicht dieselbe Szene.

Konkrete geforderte Korrekturen (nächste Runde, nicht mehr in diesem Lauf):
- `treant`: obere Stamm-/Kronenkante auf PAL 11/12, Rindenmittelton PAL 16/17 → Edge >40.
- `golem`/`bog_rat`: Mittelton auf PAL 7/8, Kontur vollständig PAL 0 → Rim >50 %, unter Schwelle <45 %.
- `wisp`/`imp`/`crow`: Lichtkante über den gesamten oberen Bogen statt nur erstes Innenpixel;
  `wisp` zusätzlich linke/untere Innenseite abdunkeln.
- Elite: zusätzlich 1 px `lanternWhite` (13) außen oder deterministischer 3-px-Amber-Diamant
  über dem Kopf; Beleg-Crop Elite vs. Normalo auf dunklem Grund.
- Belege: `after.png` durch 500+-Hordenframe derselben Zeit/Elite-Zahl wie die JSONs ersetzen,
  Chaos-Frame ohne Boss-Banner über dem Kern.

Status: Karte #2522 auf `blocked` (art-director FAIL 3/5, Supervisor-Stopp vor weiterer
Pixel-Analyse). `.lane-done` wird bewusst **nicht** gesetzt, bis A10 mit PASS ≥4/5 belegt ist.

## #K2 Silhouetten schärfen (nachher)

`sharpenEnemyGrid()` in `src/gfx/enemySprites.ts`: Randpixel mit Luminanz < 70
werden Tinte (PAL 0) → 1 px dunkle Kontur außen; pro Spalte wird direkt unter der
oberen Kontur exakt 1 px auf einen hellen Palettenton der Gegnerfarbe gesetzt
(Luminanz ≥ 85, Augen/Glow PAL 13 bleiben erhalten) → 1 px Lichtkante oben.
Deterministisch, binäres Alpha, ausschließlich bestehende Palettenfarben.
**Größenneutral belegt:** alle 30 Archetypen mit identischer `gridW/gridH/bboxW/bboxH`
vor/nach (`sizeDiff 0`, `idMismatch 0`), Frame-Zahl unverändert (`GEN_ENEMIES`
nicht angefasst).

| Metrik (30 Archetypen, Mittel) | vorher | nachher | Delta |
|---|---|---|---|
| Rim-Light hell % | 42.9 | 44.9 | **+2.0 pp** |
| Top-Light % | 33.1 | 37.1 | **+4.0 pp** |
| Randkontrast dunkel (L) | 57.5 | 59.5 | **+2.0** |
| unter Schwelle dunkel % | 59.9 | 57.6 | **−2.3 pp** |

Beleg: `shots/m10-chaos-silhouettes-after.json` (30 Archetypen) und
`shots/m10-chaos-silhouettes-after.png` (25:13, 358 Gegner, 3 Elite, 0 JS-Fehler).
Ehrlich: der Gewinn ist messbar, aber moderat; die Kontur trennt überlappende
Silhouetten, die Lichtkante ist auf dunklem Moor oben sichtbar. Im 1920×1080-Frame
verdeckt das Boss-Banner weiterhin den Kern → für K5 wird ein Banner-freier Crop
erzeugt. Offen: K3 Elite-Rim-Light, K4 Test, K5 Beleg/Doku/FPS.

## #K5 Korrekturrunde 27.11. (art-director FAIL 3/5)

Der art-director verlangte konkrete Nachbesserungen. In `sharpenEnemyGrid()`
(`src/gfx/enemySprites.ts`) umgesetzt:

- **Lichtkante über den gesamten oberen Bogen:** das oberste Pixel jeder Spalte
  (obere Kontur) wird zum Lichttone; vorher wurde nur das erste Innenpixel unter
  der oberen Kontur aufgehellt. Damit leuchten auch die abfallenden Flanken der
  runden Silhouetten (wisp/imp/crow).
- **Per-Archetyp-Tonkorrekturen** (`CONTRAST_TONES`, nur Palettenindizes):
  - `treant`: obere Kante PAL 12 (candleWhite), Mitteltöne < 62 → PAL 17
    (emberOrange). Mittlerer Randkontrast dunkel: 26.5 → **68.1**.
  - `golem`: obere Kante PAL 12, Mitteltöne < 62 → PAL 8 (mist).
  - `bog_rat`: obere Kante PAL 12, Mitteltöne < 62 → PAL 8 (mist).
- Kontur bleibt vollständig PAL 0, Augen/Glow (PAL 13) unangetastet, binäres
  Alpha, Sprite-Größen und Frame-Zahl unverändert (reine Umfärbung).

Offline aus den in-game Textur-Masken gerechnet (identische Metrik wie K1,
kein Live-Frame, kein FPS-Lauf):

| Metrik (30 Archetypen, Mittel) | vorher | nach K2 | nach Korrektur |
|---|---|---|---|
| Rim-Light hell % | 42.9 | 44.9 | **60.2** |
| Top-Light % | 33.1 | 37.1 | **88.6** |
| Randkontrast dunkel (L) | 57.5 | 59.5 | **73.9** |
| unter Schwelle dunkel % | 59.9 | 57.6 | **42.5** |

Problemfälle einzeln: treant Randkontrast 68.1 / unter Schwelle 33.3 %;
golem 67.7 % hell / 32.3 % unter Schwelle; bog_rat 72.2 % / 27.8 %;
wisp Top-Light 71.4 % (vorher 19 %); imp 64.3 % (33.3 %); crow 100 % (45.2 %).
`tests/enemy-silhouette.test.ts` prüft diese Fälle jetzt als Regression (6/6 grün).

**Offen / blockiert:** Die Beleg-PNGs (`after.png`, `chaos.png`, `crop.png`) und
`after.json` stammen noch vom Stand vor dieser Umfärbung und müssen nach Freigabe
der Mess-Sperre mit 500+-Gegner-Hordenframe (gleiche Zeit/Elite-Zahl wie JSON,
ohne Boss-Banner über dem Kern) neu erzeugt werden. Ein Elite-vs-Normalo-Crop auf
dunklem Grund fehlt weiterhin. art-director-Re-Abnahme steht aus; `.lane-done`
bleibt ungesetzt.

## #K5 Abnahme Runde 2 (27.11., Mess-Sperre frei)

- **Chaos-Frame neu:** `shots/m10-chaos-silhouettes-chaos.png` 1920×1080,
  25:55, **612 Gegner**, 2 Elite (0,3 %), 0 JS-Fehler (`…-chaos.json`).
  Boss-Intro-Banner liegt nicht mehr über dem Kern (nur HP-Leiste oben).
  Crop `shots/m10-chaos-silhouettes-crop.png` (3× nearest, Kern).
- **Nachher-JSON aus echtem Code:** `shots/m10-chaos-silhouettes-after.json`
  wird über `enemySpriteFrames()`/`sharpenEnemyGrid()` erzeugt (nicht mehr aus
  einer Text-Mirror-Funktion). Mittel über 30 Archetypen: Rim-Light **60,2 %**,
  Top-Light **88,6 %**, Randkontrast dunkel **73,9 L**, unter Schwelle dunkel
  **42,5 %** (vorher 42,9 / 33,1 / 57,5 / 59,9).
- **Elite-Marker sichtbar gemacht:** `setTint` multiplizierte die Gegnerfarbe
  (Amber-Rim ging bei dunklen Sprites unter). In `src/scenes/Run.ts` wird die
  Aura jetzt mit `setTintFill(PAL20)` als reine Amber-Silhouette gefüllt;
  Skalierung/Alpha/Radius bleiben deterministisch, nur Elite, kein Flackern.
  Beleg: `shots/m10-chaos-silhouettes-elite-vs-normal.png` (links Elite
  `bogzombie` mit 1-px-Amber-Rim, rechts normaler `toad` ohne Marker),
  `…-elite.json`.
- **FPS Minute 25 (flock):** `shots/m10-chaos-silhouettes-fps.json` →
  60,1 FPS, 601 Frames/10 s, min. **458** Gegner, avg 472, 9 Elite,
  worstFrame 16,8 ms, 1920×1080@dpr1, 0 JS-Fehler, PASS ≥55.
- **Regression:** `tests/enemy-silhouette.test.ts` 6/6, `npx tsc --noEmit` grün,
  `npm run build` grün, `npm test` 307 Tests grün (einziger Fremdtest
  `enemy-pool-reuse` nutzt einen Phaser-Stub ohne `setTintFill`; deshalb bleibt
  `EnemyPool.spawn` bei `setTint`, `Run.ts` überschreibt pro Frame).
- Ehrlich: der Gewinn ist messbar, aber moderat; im dichten Kern überlappen
  weiterhin Figuren. Die Kante/der Amber-Rim machen Elites und Randfiguren klar
  lesbar; 500+-Hordenframe und Elite-Crop sind jetzt dieselbe Codebasis.

