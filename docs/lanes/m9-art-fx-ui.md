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

## Maengelliste (art-director, vorher)
- P1 Titel: Mond-Halo wirkt weich/quadratisch (ADD-Glow); harte Pixelringe, Stern-Gruppen
  und eine klarere Horizontkante fehlen.
- P1 Icons: Kontur/Lichtkante der 18 Icons inkonsistent; Evolutionen nicht deutlich
  kraeftiger als Basis-Waffen/Powerups.
- P2 Font: Umlaute ok; einige Satzabstaende und fehlende Sonderzeichen pruefen.
- P2 FX: Treffer-Funken zu klein; XP-Kristall und Truhen-Oeffnung als Beleg fehlen.
- P3 9-Slice: Eckenkontrast zu gering (Rahmen wirkt oben flach).

## Abnahme-Kriterien
- Build und alle Tests gruen, 0 JS-Fehler, art-director-Gesamturteil >= 4.5/5.
- Vorher/Nachher-Shot je Karte (2x verg), Urteil in dieser Datei.

## Karten
#318 Belege/Maengelliste, #319 Titel, #320 Icons, #321 Font/UI-Rahmen, #322 FX-Belege
und Abschluss.
