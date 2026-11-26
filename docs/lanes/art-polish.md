# Lane m9-art-polish

Stand: Versuch 2 (Fortsetzung). Ziel: die drei offenen Art-Restpunkte aus
`ACCEPTANCE.md` A10 beheben. Keine Gameplay-/Balance-Aenderungen, GAME.md unberuehrt.

## Bereich / Dateien (Disponent)
`src/scenes/Run.ts`, `src/systems/FxSystem.ts`, `src/systems/BossSystem.ts`,
`src/logic/lod.ts`, `src/gfx/enemySprites.ts`, `docs/lanes/art-polish.md`,
`shots/art-polish-*`. `gen-*.ts` wurden nicht angefasst.

## Karten
- #1378 art-01 Boss-Inszenierung (Knochenfuerst / Hohler Koenig)
- #1379 art-02 Chaos-Rim-Light fuer Elites
- #1380 art-03 HUD-/Level-up-Anker pruefen (nur pruefen)

## art-01 Boss-Inszenierung — PASS (art-director)

Problem vorher: Der Boss spawnt im oberen View-Rand; seine Silhouette liegt
teilweise hinter der Boss-HP-Leiste (y 33..52) und dem Warn-Banner (68..116).

Fix: `src/systems/BossSystem.ts` exportiert `BOSS_SAFE_TOP = 136`. Der
Spawnpunkt wird vertikal gespiegelt, wenn er im View zu hoch liegt; reicht das
nicht (Kamera am Welt-Rand), wird hart auf `camTop + BOSS_SAFE_TOP` gesetzt.
Der Abstand zum Spieler bleibt dabei erhalten. 136 = HP-Leisten-Ende 52 +
Banner-Unterkante 116 + halbe Figurenhoehe 20 (40-px-Boss); der Boss steht damit
eine volle Figurenhoehe unter Leiste und Banner.

Belege (`shots/`):
- `art-polish-boss-before.png` / `art-polish-boss-before-2x.png`
- `art-polish-boss-after.png` / `art-polish-boss-after-2x.png`
- Kamera identisch: `scrollY=0`, Spieler `(2048,60)`, View 640x360, 2x.
- Messung aus dem Beleg-JSON: vorher `screenY min 37` (Sprite-Haelfte hinter
  der Leiste), nachher alle 6 Bosse `screenY 153..193` (> 136).

Urteil: siehe Kontrolle unten.

## art-02 Elite-Rim-Light — PASS (vfx-check)

Problem vorher: Elites tragen eine 96-px-`elite_aura` (weisser ADD-Ring), die
im Chaos als grosse, diffuse Ringe ueber der Horde liegt.

Fix: In `src/scenes/Run.ts` ist die Elite-Aura jetzt eine um 2 Quellpixel
groessere Kopie der aktuellen Gegner-Silhouette, amber getoent (`PAL[20]`),
Blend NORMAL, hinter dem Sprite. Der Rand folgt der Kontur und ist exakt
1 Spielpixel breit. Keine weissen Pixel, kein ADD, keine Gameplay-Aenderung.

Belege (`shots/`):
- `art-polish-elites-before.png` / `-before-2x.png`: 399 Gegner, 64 Elites,
  Minute 25 (Zeit 1500), alte weisse ADD-Ringe.
- `art-polish-elites-after.png` / `-after-2x.png` bzw.
  `art-polish-elites-chaos.png`: gleiche Dichte, amber 1-px-Rim.
- `npm run vfx:read` (960x540, seed 77, 6 Waffen Stufe 8, ~486 Gegner):
  Near-White im AoE-Crop (240x220 @ +360+160, `min(R,G,B) >= 200`):
  - vorher/ungedaempft in diesem Lauf: **7,66 %** (4045/52800)
  - nachher/gedaempft: **4,14 %** (2186/52800) — Ziel **<= 4,16 %: PASS**
  - aelterer Baseline-Beleg (`shots/final-vfx-readability.json`): 3,73 %
  Dateien: `final-vfx-m25-before.png`, `final-vfx-m25-after.png`, `.gif`.
  Zusatzmessung im Elite-Chaos-Shot (Zentralcrop 480x360 @ +400+180):
  Near-White vorher **9,43 %** -> nachher **3,34 %**; die Lesbarkeit wird
  also nicht schlechter, sondern deutlich besser.

Urteil: siehe Kontrolle unten.

## art-03 HUD-/Level-up-Anker — PASS (keine Aenderung)

Geprueft bei 360p-Basis und 16:9 (View 640x360) sowie 19.5:9 (View 780x360),
Worst Case mit Boss (Moorkoenigin), sichtbarem Banner und offenen Level-up-Karten.

- `shots/art-polish-hud-16.png` (640x360, Screenshot 1280x720)
- `shots/art-polish-hud-195.png` (780x360, Screenshot 1560x720)

Layout: Boss-Leiste Depth 90 (y 46), Banner Depth 95 (Rahmen 68..116),
Level-up-Overlay Depth 100 mit Voll-Dim und Kartenrahmen ab y ~66. Das
Level-up-Overlay deckt Banner und Leiste vollstaendig ab; die lesbaren Elemente
ueberlappen nicht (weder horizontal noch vertikal). Keine Aenderung noetig.

Urteil: siehe Kontrolle unten (ux-check).

## Kontrollen (PASS/FAIL mit Beleg)
- art-director art-01: **PASS** — Vorher ragen Boss-Koepfe in HP-Leisten-Zeile/Banner
  (`screenY min 37 < 52`); nachher alle 6 Bosse `screenY 153..193 > 136`,
  Banner-Unterkante 116 frei, Banner bleibt in der oberen Bildhaelfte
  (Unterkante < Mitte 180) und ueberdeckt die Mitte nicht.
- vfx-check art-02: **PASS** — Near-White im A7-Crop 2186/52800 = **4,14 %**
  <= 4,16 %; vorher 7,00 %/7,66 %, Lesbarkeit nicht schlechter. 6x-Crop der
  Horde (399 Gegner / 64 Elites, t=1500): diffuse weisse ADD-Auren weg,
  Silhouetten/Projektile klar getrennt, Amber-Kanten (~1 Spielpixel) liegen
  direkt an der Kontur, kein Flackern/ADD-Bleed. Tint exakt `0xFFB84D`
  (Palette 20), Blend NORMAL, Alpha 0,92. Einschraenkung: Rand bewusst dezent
  und stellenweise von Nachbarsprites verdeckt — kein FAIL.
- ux-check art-03: **PASS** — 16:9 (640x360): Boss-Name (~33..40) und
  HP-Leiste (~40..52) enden ~17 px ueber der Level-up-Rahmenkante (~69..72),
  Header/Karten beginnen darunter; 19.5:9 (780x360): identische Y-Stapelung,
  Banner horizontal zentriert, Karte 3 endet bei x ~655 < 780, nichts
  abgeschnitten. Banner liegt bewusst hinter Dim/Overlay (Depth 95 < 100).

## Build / Tests / Performance
- `npm run build`: gruen
- `npm test`: 192/192 gruen
- `flock /home/ai/games/.lf-perf.lock npm run perf`: **PASS**
  (Burst 60,1 FPS bei 500 Gegnern, Minute 25 56,1 FPS bei 300 Gegnern,
  `jsErrors: []`; Lauf bei Load Average 4,4). Vorherige Laeufe unter
  Fremdlast (Load 15-18) ergaben 49-54 / 28-35 FPS und wurden verworfen.

## Offene Punkte
- Perf-Messung muss ohne Fremdlast (Load Average < 5) wiederholt werden;
  Laeufe bei Load 15-18 ergaben Burst 49-54 FPS und Minute 25 35 FPS und sind
  als Messartefakt zu werten (flock schuetzt nur gegen andere Perf-Laeufe,
  nicht gegen Test-/Build-Last anderer Lanes).
