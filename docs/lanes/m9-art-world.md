# Lane m9-art-world — M9 Art (Draufsicht)

Stand: Thu 26 Nov 2026 — Versuch 3.

## Bereich
Boden-Tiles, Uebergaenge (Moor/Weg/Wasser/Ruinen), Props-Tiefe/Schatten, Ambient.
Terrain nur optisch: Kollision/Begehbarkeit unveraendert.

## Karten

### #278 Terrain-Tiles (Commit b59f9f3)
Gras-Bandkanten per Pixel gedithert, Bueschel/Moos in 2x2-Clustern.
Weg: 2-px-Saum, Innenkante hell oben-links / Schatten unten-rechts.
Wasserbank: Torf/Moos-Saum, drei Tiefenstufen gedithert.
Belege: shots/m9-art-world-01-before-grass.png, ...-after-grass.png. tests gruen.

### #279 Props-Tiefe/Schatten (Commit da3ef77)
footY je Prop; Depth je Frame: Fusspunkt unter Spieler -> 12.4 vor,
darueber -> 11.6 dahinter; Schatten 11.15. Laternen-Glow folgt.
Beleg: shots/m9-art-world-02-props-depth.png.

### #280 Ambient (Commit c0f56d5)
24 Gluehwürmchen (ADD, amber, pulsierend) und 3 weiche Nebelbaenke
(bildschirmverankert, niedriges Alpha). Belege: shots/m9-art-world-03-ambient.png/.gif, 0 JS-Fehler.

### #281 Abnahme
Build und alle Tests gruen (175/175), 0 JS-Fehler in den Shots.
Perf mit flock: Burst 59.8 FPS bestanden; Minute25 53.1 FPS (unter 55, als Hinweis offen).
Art-Director Urteil: folgt unten.

## Offen
art-director-Nachpruefung und perf-Messung folgen in #281.
