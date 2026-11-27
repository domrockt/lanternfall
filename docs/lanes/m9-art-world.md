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
Art-Director Urteil: **FAIL, Gesamtnote 2,3/5** (Latte ≥4,5) — unabhaengige Pruefung 27.11.
- Terrain 2/5: nachgezogene Kanten nur fuer Gras belegt (after-path/ruins/water fehlen); paleMist(9)-Ufersaum
  liest als durchgehende helle "Schneekante"; Schlammkanten hart ohne Dither; Gras-Banddither als Einzelpixel.
- Props 2/5: Bodenschatten unter Props nicht sichtbar (Canvas2D-Ellipse); Laternen-Glow ohne Lichtpool;
  Baumstamm nur 2 Töne; Grasbüschel werden über Grabsteinbasis gezeichnet (Layering).
- Ambient 3/5: Glühwürmchen nutzen weiche Canvas2D-Radialgradienten statt Pixel-Sprite; Nebel nicht als
  Bänke erkennbar; Spielerlicht aus 12 anti-aliased Ringen wäscht Kontrast aus.
- Palette: nur 3,77 % exakt (überwiegend erlaubte Licht-/Vignette-Overlays, aber Licht-/Nebeltexturen selbst
  mit Anti-Alias-Gradienten).

**Muss neu:** Ufersaum (6/8 statt 9, 2-px-Bayer-Dither), Schlamm-Übergänge 2–3 px, Gras-Dither als 2×2-Zellen,
Props-Pixelsechatten (10×4, PAL[0] α0,35), Laternen-Pixelglow (Ringe 20/21/22), Ambient als Palettensprites
(Glühwurm 3×3/5×5, Nebel 2×2-Dither, Spielerlicht ≤128 px diskret), Deko vor Props.
**Nachbessern:** Baumstamm 3 Stufen + Lichtkante, after-path/ruins/water-Belege aus gleichem Seed,
Props-Shot mit Spielerin vor und hinter demselben Prop.

## Offen
#281 bleibt `blocked`: genau eine fehlende Pruefung = Grafik-Nachbesserung bis Art-Director ≥4,5/5.
Build/Tests 204/204 gruen, 0 JS-Fehler und verify:terrain PASS sind separat belegt.
