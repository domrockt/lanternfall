# Lane m10-boss-onscreen — Boss-Spawn-Komposition (ACCEPTANCE A10)

Ziel: Kein Boss spawnt hinter HP-Leiste/Banner; das Intro-Banner liegt nie ueber
dem Boss-Sprite. Nur Komposition/Zeichnung, keine HP-, Tempo- oder Angriffswerte.

Messaufbau: headless Playwright, `scripts/harness.mjs`; Messskript
`~/tmp/m10-boss-onscreen/measure-boss.mjs` (ein Lauf, festes Timeout, Log
`~/tmp/m10-boss-onscreen/k5.log`, `errors=0`); pro Boss 72 deterministische
Ring-Winkel (5°-Schritte) je View, direkt nach `spawnBoss` gemessen (Run pausiert,
Kamera-Zoom auf 1). Logische View 640x360 (Viewport 1920x1080, Skalierung 3) und
480x360 (Viewport 640x360, Fit-Skalierung 1). Sprite-Rect ist das volle Frame-Rechteck
inkl. transparentem Rand (konservativ). Banner-Rect auf Endposition y=68..116.

## #K1 Ist-Geometrie (vorher)

Quelle: `shots/m10-boss-onscreen-before.json` (Worst Case je Boss/View).

| View | Boss | Sprite-Rect (x,y,w,h) | HP-Leiste (x,y,w,h) | Banner (x,y,w,h) | Boss.top - hpBar.bottom | Banner-Overlap px (% Sprite) |
|---|---|---|---|---|---|---|
| 1920x1080 | #0 moor_queen | 153,115,56,56 | 202,40,236,12 | 170,68,300,48 | +63.0 px | 39 px (1.24%) |
| 1920x1080 | #1 bone_lord | 149,111,64,64 | 202,40,236,12 | 170,68,300,48 | +59.0 px | 215 px (5.25%) |
| 1920x1080 | #2 pale_shepherd | 145,107,72,72 | 202,40,236,12 | 170,68,300,48 | +55.0 px | 423 px (8.16%) |
| 1920x1080 | #3 bell_golem | 141,103,80,80 | 202,40,236,12 | 170,68,300,48 | +51.0 px | 663 px (10.36%) |
| 1920x1080 | #4 coven | 133,95,96,96 | 202,40,236,12 | 170,68,300,48 | +43.0 px | 1239 px (13.44%) |
| 1920x1080 | #5 hollow_king | 133,95,96,96 | 202,40,236,12 | 170,68,300,48 | +43.0 px | 1239 px (13.44%) |
| 640x360 | #0 moor_queen | 73,115,56,56 | 122,40,236,12 | 90,68,300,48 | +63.0 px | 39 px (1.24%) |
| 640x360 | #1 bone_lord | 69,111,64,64 | 122,40,236,12 | 90,68,300,48 | +59.0 px | 215 px (5.25%) |
| 640x360 | #2 pale_shepherd | 65,107,72,72 | 122,40,236,12 | 90,68,300,48 | +55.0 px | 423 px (8.16%) |
| 640x360 | #3 bell_golem | 61,103,80,80 | 122,40,236,12 | 90,68,300,48 | +51.0 px | 663 px (10.36%) |
| 640x360 | #4 coven | 53,95,96,96 | 122,40,236,12 | 90,68,300,48 | +43.0 px | 1239 px (13.44%) |
| 640x360 | #5 hollow_king | 53,95,96,96 | 122,40,236,12 | 90,68,300,48 | +43.0 px | 1239 px (13.44%) |

Befund vorher: Boss-Sprite-Rects liegen zwar unter der HP-Leiste (top >= 52 px),
aber die grossen Bosse (Fahler Hirte, Glockenturm-Golem, Hexenzirkel, Hohler Koenig)
ragen in den Banner-Bereich y=68..116 hinein (bis 13,44 % der Sprite-Flaeche).
Die Banner-Ueberlappung ist viewport-unabhaengig (gleiche logische Geometrie).

## #K2 Spawn-Komposition (nachher)

`src/systems/BossSystem.ts`: Die Komposition richtet sich jetzt nach der echten
Sprite-Frame-Hoehe (`BOSS_SPRITE_SIZE` 56/64/72/80/96/96), nicht nach einem
pauschalen Mittelpunkt. `composedBossCenterY` spiegelt den nach oben zeigenden
Ring-Winkel nach unten und schiebt die Vertikale nur so weit wie noetig auf
`max(hpBar.bottom, banner.bottom) + 6 px`. X bleibt erhalten; HP, Tempo und
Angriffswerte sind unveraendert.

Quelle: `shots/m10-boss-onscreen-after.json` — gemessen im realen Intro-Zustand (Kamera-Zoom 1,13–1,14, nicht auf 1 zurueckgesetzt).

| View | Boss | Sprite-Rect (x,y,w,h) | HP-Leiste (x,y,w,h) | Banner (x,y,w,h) | Boss.top - hpBar.bottom | HP-Overlap px (%) | Banner-Overlap px (%) |
|---|---|---|---|---|---|---|---|
| 1920x1080 | #0 moor_queen | 435,125,62,62 | 202,40,236,12 | 170,68,300,48 | +73.4 px | 0 px (0.00%) | 0 px (0.00%) |
| 1920x1080 | #1 bone_lord | 141,126,70,70 | 202,40,236,12 | 170,68,300,48 | +73.8 px | 0 px (0.00%) | 0 px (0.00%) |
| 1920x1080 | #2 pale_shepherd | 134,128,79,79 | 202,40,236,12 | 170,68,300,48 | +75.7 px | 0 px (0.00%) | 0 px (0.00%) |
| 1920x1080 | #3 bell_golem | 427,123,90,90 | 202,40,236,12 | 170,68,300,48 | +71.3 px | 0 px (0.00%) | 0 px (0.00%) |
| 1920x1080 | #4 coven | 418,125,109,109 | 202,40,236,12 | 170,68,300,48 | +73.3 px | 0 px (0.00%) | 0 px (0.00%) |
| 1920x1080 | #5 hollow_king | 420,125,109,109 | 202,40,236,12 | 170,68,300,48 | +73.3 px | 0 px (0.00%) | 0 px (0.00%) |
| 640x360 | #0 moor_queen | 357,124,63,63 | 122,40,236,12 | 90,68,300,48 | +72.3 px | 0 px (0.00%) | 0 px (0.00%) |
| 640x360 | #1 bone_lord | 54,124,72,72 | 122,40,236,12 | 90,68,300,48 | +72.0 px | 0 px (0.00%) | 0 px (0.00%) |
| 640x360 | #2 pale_shepherd | 49,126,81,81 | 122,40,236,12 | 90,68,300,48 | +74.1 px | 0 px (0.00%) | 0 px (0.00%) |
| 640x360 | #3 bell_golem | 43,123,90,90 | 122,40,236,12 | 90,68,300,48 | +71.3 px | 0 px (0.00%) | 0 px (0.00%) |
| 640x360 | #4 coven | 338,125,109,109 | 122,40,236,12 | 90,68,300,48 | +73.3 px | 0 px (0.00%) | 0 px (0.00%) |
| 640x360 | #5 hollow_king | 339,125,109,109 | 122,40,236,12 | 90,68,300,48 | +73.3 px | 0 px (0.00%) | 0 px (0.00%) |

Nachher: 0 px HP-Ueberlappung und 0 px Banner-Ueberlappung bei 6/6 Bossen und
beiden Views; kleinster Abstand Boss.top zu hpBar.bottom = 71,3 px und kleinster
Abstand zur Banner-Unterkante = 7.3 px (>= 6 px Luft).

## #K3 Banner/Intro

`src/scenes/Run.ts`: `showBossBannerWhenVisible` emittiert `bossSpawn` erst,
wenn das Boss-Frame nach Kamera-Zoom/Shake vollstaendig unter HP-Leiste und
Banner steht (`rect.y >= hpBar.bottom + 6 && !rectsOverlap(rect, banner)`).
Nach 12 Retries (Zoom-Puls ~700 ms) wird das Banner hart emittiert statt still
auszufallen; die Komposition haelt den Boss dann bereits sicher unter dem
Banner. Die Banner-Dauer in der UI-Szene (2400 ms) ist unveraendert, ebenso
AutoPlay- und God-Pfad.

## #K4 Test

`tests/boss-spawn-composition.test.ts` (25 Tests): fuer alle 6 Bosse bei
640x360 und 480x360 gilt ueber 72 deterministische Ring-Winkel
`boss.top >= banner.bottom + 6` und `banner ∩ boss = ∅`; zusaetzlich mit
realem Intro-Zoom 1,14 und Weltkanten (camTop 0/2000/3736, Spieler-Screen-Y
30/180/300). `npx vitest run tests/boss-spawn-composition.test.ts` = 25/25 PASS.

## #K5 Belege

- Nachher-JSON: `shots/m10-boss-onscreen-after.json` (12 Messzeilen)
- Vorher-JSON: `shots/m10-boss-onscreen-before.json` (12 Messzeilen)
- 12 Spawn-Screenshots: `shots/m10-boss-onscreen-shots/1920x1080-<boss>.png` und
  `shots/m10-boss-onscreen-shots/640x360-<boss>.png` (Moorkoenigin, Knochenfuerst,
  Fahler Hirte, Glockenturm-Golem, Hexenzirkel, Hohler Koenig)
- `npm run build` gruen, `npm test` 314/314 gruen (27 Dateien)
- art-director-Urteil: **PASS** (ACCEPTANCE A10), Boss-Inszenierung **4/5**.
  Alle 12 Faelle: `boss.top - hpBar.bottom` min. 71 px, Banner-Overlap 0 px².
  Gegenprobe vorher: 39–1239 px² Banner-Overlap, bannerGap -1 bis -21.
  Nicht AC-blockierende Nachbesserungen (offen, eigene Karte in spaeterer Lane):
  `pale_shepherd` Baum-Prop vor dem Boss, `bell_golem` grau-auf-grau,
  `moor_queen` Gruen-auf-Gruen (Silhouette/Kontur).

## #K6 Intro-Zoom-Banner-Sichtbarkeit

Nachbesserung aus der Abnahme: Der Boss-Intro-Puls zoomt die Kamera fuer ca. 700 ms
auf 1,14 um die Viewport-Mitte. Dadurch wandert die Sprite-Oberkante im Screen-Raum
nach oben, und der alte Banner-Guard (`rect.y >= hpBar.bottom + 6`) fiel nach dem
Retry-Fenster still aus – der Boss-Auftritt blieb ohne Banner.

Fix:
- `composedBossCenterY(..., camTop, zoom)` projiziert die Oberkante in den
  gezoomten Screen-Raum und komponiert den Boss gleich so, dass er auch bei
  Zoom 1,14 unter `max(hpBar.bottom, banner.bottom) + 6 px` liegt. Kein unteres
  Screen-Clamp mehr; der Ring-Abstand zum Spieler bleibt erhalten.
- `bossSpriteScreenRect(..., viewWidth, viewHeight)` rechnet den Zoom um die
  Viewport-Mitte (`midPoint`) statt um `scrollX/Y` – so wie Phaser es rendert.
- `Run.ts`-Guard prueft gegen `banner.bottom + 6` (Banner liegt unter der HP-Leiste)
  und emittiert nach 12 Retries (Zoom-Puls vorbei) das Banner trotzdem, da die
  Komposition die Ueberlappung bereits ausschliesst. Banner-Dauer 2400 ms,
  AutoPlay/God unveraendert.

Neue Belege (`shots/m10-boss-onscreen-after.json`, 12 Messzeilen, je Boss 72
Winkel bei realem Intro-Zoom 1,07–1,14): **0 px HP-/Banner-Overlap**, kleinster
`bannerGap` 7,3 px, `bannerVisible` 72/72 je Boss/View. Neu aufgenommene
12 Spawn-Screenshots in `shots/m10-boss-onscreen-shots/` zeigen HP-Leiste, Banner
und Boss gleichzeitig ohne Ueberdeckung. `tests/boss-spawn-composition.test.ts`
prueft zusaetzlich Zoom 1,14 ueber 3 Kamerahoehen (0/2000/3736) und 3
Spielerpositionen: 25/25 Tests gruen.

## Messungen Performance/Balance (unveraendert, kein Render-/Wertepfad angefasst)

- `git diff` dieser Lane enthaelt **keine** Datei aus `src/data/`, `src/logic/`,
  `src/gfx/` oder `src/systems/FxSystem.ts`; nur Komposition in
  `BossSystem.ts`/`Run.ts` + Test/Doku/Belege.
- `flock /home/ai/games/.lf-perf.lock npm run perf`: Burst 500 Gegner
  **59,0 FPS** PASS, 0 JS-Fehler. Minute 25 = **50,8 FPS** (< 55) – bekannter
  offener Punkt #1000 („perf-780-01 Minute 25 FPS“), nicht durch diese Lane
  verursacht.
- `npm run balance`: Survival 30,7 min, 4 Evolutionen, Boss-Dauern im Korridor;
  `levelInCorridor` false (bekannte Balance-Baustelle, von Tariq zu bewerten).
  Keine Balance-Datei in dieser Lane geaendert.

