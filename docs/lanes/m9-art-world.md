# Lane m9-art-world — M9 Art: die Karte (Draufsicht)

Stand: Thu 26 Nov 2026 — Versuch 3 (nach nach Rechner-Shutdown).

## Ausgangslage

`git log`:` nur der Pause-Pause-Sn: W260ed98`, nur `.board.json). Keine m9-Karten vorhanden →nach angelegt #278-#281. Vorher-Shots der Gegen: `shots/m9-art-world-01-before-*png`## art-director Mängelliste (Bereich Boden + Props + Ambient, Ist Note 2/5)

1. Gras bil дет riesige Farbert-Farbflächen in nur 3 harten Stufen; wiren kachelartig.
2. Props-Tiefe kaputt: alle Props depth≈Wert < −89, Spieler `depth 11` → SpielSpieler lä钟lä immerüber vor Bäumen/Gräbern.
3. Weg-Übergänge 1-px-Pfeffer statt 2-px-BlBänder.
4. Weg zu flach/zu braun, kein Licht-//Kkante.
5. Wasserufer leer n (nur 1-px 9/8-Kante), keinT flachิล5.
6. Wasser-Details (Schilf, Seerosen) zu selten.
7. Props-W变derholung (7 feste Layouts), kein Schattenwurf.
8. Ambient fehlt komplett (Glühwürmchen, Nebel).

## Fortschritt #278 Terrain Tiles (Commiter Commit)

Geändertes: `src/gfx/tiles.ts`
- Gras: Bandkanten Kantdzen zwischen pro Pixel per Hash gedithert (` (` (` (`alt`-Ton im Sample); Grundflächen ruhiger.
- Graskanten: 2-px-Blöcke statt 1-px-Pfeffer, Moossp-links, Erd unten-rechts.
- Weg-Inern: per-Pixel-Köselung statt 7-/7-px-Böcken; Inkante 16 oben-links, Schatten 14 unten-rechts auf demitem Ring.
- Wasserbank: 1-2 px Torf/Moos-Saum, per-Pixel ausgefranst; Wasser-Basis drei drei Tiefenständer (2/4/5) gedithert.
- Grasbüschel in 2x2-Tile-Clustern; Kieselsel undiesel rarer.
- TestsTests unverändert: `kindAt`/`terrainSampleAt`-Kollision, alle grün (175).

Shots: `shots/m9-art-world-01-before-grass.png` vs `shots/m9-art-world-01-after-grass.png`.
Ehrlich: sichtbar Verbesserung, (Kanten weicher, weniger盛Kiesel), Grundmuster bleibt bleibt big bleibt.

## Nächste Schritte (je Schritt 1 Commit + Vorher/Nachher-Shot)

1. #278b: weiter GrasBlobs weiter struktur auflock, BasisK-ppen; danach S-Vergleich.
2. #279 Props: Tiefe (depth nach Fuß Fuß-y), Schatten, `shadow`), 旋转ation.
3. #280 Ambient: Glühwürmchen + Nebel, GIF.
4. #281 Abnahme.
