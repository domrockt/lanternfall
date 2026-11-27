# Lane m10-boss-onscreen — Boss-Spawn-Komposition (ACCEPTANCE A10)

Ziel: Kein Boss spawnt hinter HP-Leiste/Banner; das Intro-Banner liegt nie ueber
dem Boss-Sprite. Nur Komposition/Zeichnung, keine HP-, Tempo- oder Angriffswerte.

Messaufbau: headless Playwright, `scripts/harness.mjs`; pro Boss 72 deterministische
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

_folgt mit K2/K5_

## #K3 Banner/Intro

_folgt mit K3_

## #K4 Test

`tests/boss-spawn-composition.test.ts`: fuer alle 6 Bosse bei 640x360 und 480x360
gilt `boss.top >= hpBar.bottom + 6` und `banner ∩ boss = ∅` (deterministisch).

## #K5 Belege

_folgt mit K5: Nachher-JSON, 12 Spawn-Screenshots, art-director-Urteil._
