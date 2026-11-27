# M10-Enemy-Palette — Gegner-Farbfamilien je Biom

Ziel (Dom, 21:45Z Punkt 7): Die Gegner-Palette ist zu einfarbig (viel Grau/Weiß +
Rotbraun) — bei 300–500 Gegnern liest sich die Masse als dunkler Block. Mehr
Farbfamilien je Biom-Thema, damit Typen auch in Masse unterscheidbar bleiben.

## Mess-Methode (`scripts/m10-enemy-palette.mjs`)

Headless-Lauf des echten Spiels (Playwright, iGPU):
1. **Kontaktbogen**: alle 30 Gegner-Typen (Frame 0, 3x nearest) → `shots/m10-enemy-palette-<tag>-sheet.png`
2. **Chaos-Frame**: 500 Gegner aus 20 Typen (Stufen 0–4, mehrere Biome) gleichmäßig
   über die sichtbare Fläche verteilt (Minute 25, Boss/Banner/HUD-Banner ausgeblendet,
   Level-ups abgeräumt) → `shots/m10-enemy-palette-<tag>.png`
3. **Familien-Zählung** aus den echten Sprite-Pixeln (Texturen, nicht Screenshot):
   HSL-Cluster je Pixel → Familie (blut-rot / glut-braun / gold / gruen / blau /
   hell-mittel-dunkel-neutral / kontur). Gemeldet werden:
   - `countedFamilies`: Familien mit >= 5 % Pixelanteil
   - `strongFamilies`: **farbige** Familien (nicht Neutral/Kontur) mit >= 8 % Anteil —
     nur diese lesen sich in der Masse wirklich unterscheidbar
   Belege enthalten den iGPU-Renderer-String (`rendererName`).

## Vorher (tag=before, 27.11.)

- Chaos-Frame: 517 lebende Gegner, 0 JS-Fehler
- Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (iGPU)
- `countedFamilies`: 6, aber **`strongFamilies`: 2** (glut-braun 19,5 %, gruen 11,8 %)
- Neutralanteil (mittel+hell+dunkel-neutral): 38,4 %, Kontur: 19,9 %
- blau nur 1,5 %, gold 4,2 %, blut-rot 5,2 % → die Masse liest sich als
  Grau-/Weiß-Block mit dunklem Rotbraun
- Belege: `shots/m10-enemy-palette-before.png`, `-before-sheet.png`, `-before.json`

## Nachher (tag=after)

Karte 2–4 folgen.

## Offene Punkte

- (keine)
