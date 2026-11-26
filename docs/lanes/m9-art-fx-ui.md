# Lane m9-art-fx-ui

Stand: Versuch 2 (Fortsetzung Versuch 1). Ziel: Art-Note FX/UI >= 4.5/5.
Bereich nur Grafik: keine Layout-, Balance- oder Hitbox-Aenderungen.
Atlas-Keys, Sprite-Rahmen und Animationsnamen bleiben gleich.

## Belege vorher (#318)
Alle Belege mit `node scripts/shot.mjs` (960x540, debug=1, 0 JS-Fehler):
- Titel: `shots/m9-art-fx-ui-title-before.png` (--scene title)
- Icons: `shots/m9-art-fx-ui-icons-before.png` (Kontaktbogen 18 Icons, 4x) plus
  Einzelausschnitte `-a/-b/-c.png`
- FX Waffen: `shots/m9-art-fx-ui-weapon-{ember,flail,frost,thorn,storm,lantern}.png` (+.gif)
- FX Evolutionen: `shots/m9-art-fx-ui-evo-{phoenix,wrath-pendulum,eternal-winter,thorn-storm,thunder-seal,soul-beacon}.png` (+.gif)
Aufnahme 1-3 s nach Ausloesen, mit lebenden Gegnern, nicht nach dem Kampf.

2x-Vergroesserungen (nearest, fuer die Abnahme):
- `shots/m9-art-fx-ui-title-before-2x.png`
- `shots/m9-art-fx-ui-icons-before-2x.png`
- `shots/m9-art-fx-ui-weapon-*-2x.png` (6 Dateien)
- `shots/m9-art-fx-ui-evo-*-2x.png` (6 Dateien)

## Maengelliste (art-director, vorher)
- P1 Titel: Mond-Halo wirkt weich/quadratisch (ADD-Glow); harte Pixelringe, Stern-Gruppen
  und eine klarere Horizontkante fehlen.
- P1 Icons: Kontur/Lichtkante der 18 Icons inkonsistent; Evolutionen nicht deutlich
  kraeftiger als Basis-Waffen/Powerups.
- P2 Font: Umlaute ok; einige Satzabstaende und fehlende Sonderzeichen pruefen.
- P2 FX: Treffer-Funken zu klein; XP-Kristall und Truhen-Oeffnung als Beleg fehlen.
- P3 9-Slice: Eckenkontrast zu gering (Rahmen wirkt oben flach).

Offene Punkte (nicht in #318 untersucht, gehen in Karten #319-#322):
- Nachher-Stand aus Versuch 1 zeigt einen dunklen Rechteck-Rand um den Mond; Urs Urs
  Ursache wird in #319 geprueft und behoben.

## Abnahme-Kriterien
- Build und alle Tests gruen, 0 JS-Fehler, art-director-Gesamturteil >= 4.5/5.
- Vorher/Nachher-Shot je Karte (2x verg), Urteil in dieser Datei.

## Karten
#318 Belege/Maengelliste, #319 Titel, #320 Icons, #321 Font/UI-Rahmen, #322 FX-Belege
und Abschluss.

## #319 Titelbild
- Vorher: `shots/m9-art-fx-ui-title-before-2x.png`
- Nachher: `shots/m9-art-fx-ui-title-after-2x.png` (frisch aus dem Build, 2x nearest).
- Korrektur: ferne Huegel als dunkle Silhouette (Palette 2) mit 1-px-Nebelkante (5)
  auf dem Nachthimmel (4); Mond-Halo bleibt als harte, unterbrochene Pixelringe.
- Kriterien: 1 harte Pixelringe PASS, 2 klare Horizontkante PASS, 3 kein dunkler
  Mond-Rand PASS.
- art-director-Urteil (#319): **4,2/5**. Alle drei Kriterien klar erfuellt; Abzug nur
  fuer den noch leicht weichen Kern-Glow und die etwas zu regelmaessige Kreisform der
  aeusseren Ringe. 0 JS-Fehler im Shot-Lauf.
- Offener Punkt: Ringform/Kern-Glow beim Gesamturteil in #322 erneut pruefen.

## #320 Icons
- Vorher: `shots/m9-art-fx-ui-icons-before-4x.png` (18 Icons, 4x nearest)
- Nachher: `shots/m9-art-fx-ui-icons-after-4x.png` (aus dem aktuellen Build, 4x nearest)
- Korrektur: alle 18 Icons laufen durch dieselbe Pipeline `outline(g, diagonal=True)`;
  die 1-px-Ink-Kontur schliesst jetzt auch Diagonalluecken (einheitliche Aussenkontur).
  Lichtkante oben-links und Schatten unten-rechts stammen aus `shade_edges` (band=1).
- Pruefung: 16x16-Raster, 18 Keys, nur Palettenindizes, kein Duplikat
  (`validateIcons` in `src/gfx/icons.ts`, laeuft in `createIconTextures`).
  Evolutionen (letzte 6) sind groesser/heller als die Basis-Waffen (erste 6).
- art-director-Urteil (#320): ausstehend (Bild liegt fuer die naechste Kontrolle bereit).
- 0 JS-Fehler im Kontaktbogen-Lauf.
