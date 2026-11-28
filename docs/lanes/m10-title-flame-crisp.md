# Lane m10-title-flame-crisp — Belebung des Titel-Screens (Laternen-Flammen)

Ziel (Dom-Briefing): Erster Eindruck "schöne Pixelgrafik" — der Titel wirkt statisch.
Sparsame, palettentreue Laternen-Flammen-Animation (2–3 Frames, ganzzahliger Texel-Scale,
Muster titleBgLayout/crisp) über den Source-Generator, Layout/Text unangetastet
(AE=0 außer der Animationsfläche).

## Karte 1 — Before-Belege + Befund

Skript: `scripts/m10-title-flame.mjs` (vor/after, 3 Formate, 0 JS-Fehler erzwungen).

Belege (Vorher):
- `shots/m10-title-flame-before-640x360.png`
- `shots/m10-title-flame-before-780x360.png`
- `shots/m10-title-flame-before-1920x1080.png`
- `shots/m10-title-flame-before.json` (Rohdaten, jsErrors leer)
- Zoom (nur Prüf-Artefakt, ~/tmp): Laternenpfahl bei Texel (22, 214) — Glas ist ein
  statischer Amber-Block.

Befund (was wirkt statisch/tot):
1. **Laternen-Glas der 4 Moorpfähle** (Texel x = 22/214/300/392, Glas y ≈ base_y−15..−10)
   ist ein eingefrorener Farbblock (Palette 20/21/22/13). Kein Flackern, keine Glut-Funken —
   die auffälligste "Lichtquelle" der unteren Bildhälfte ist tot.
2. Bewegung gibt es nur am **Mond-Glow** (additiver Puls-Tween) — der ist bereits da und
   bleibt unangetastet. Glühwürmchen im Grundbild sind Einzel-Pixel ohne Animation.
3. Folgerung: 2–3 Flammen-Frames + je 1–2 Glut-Funken über dem Glas, ruhiges Tempo (~2 fps),
   Overlay nur über der Glasfläche (binäres Alpha), darunter liegende Basis-Pixel byte-identisch.

## Karte 2 — Generator (geplant / umgesetzt)
## Karte 3 — Runtime
## Karte 4 — Abnahme
