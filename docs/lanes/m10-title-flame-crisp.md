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

## Karte 2 — Generator (Commit 8eb5d63)

`scripts/art/gen_title.py` erzeugt jetzt zusätzlich:
- `title_flame_f0/f1/f2` — Sparse-Overlay **8x11 Texel**, binäres Alpha (`.` = transparent):
  Reihen 0–4 nur Glutfunken (0–2 px je Frame), Reihen 5–10 Glasfläche voll opak.
- `TITLE_FLAME_SPOTS` — 4 Patch-Anker (Texel im 480x270-Kernbild): (19,194), (211,198),
  (297,194), (389,197).
- Farben: **nur** Palette-Indices 13 (Glow-Kern), 20 (amber), 21 (Laterne), 22 (Glühen);
  der Gehäuserand (Index 4) bleibt in der Basis. Keine neuen Palette-Einträge.
- `title_background` ist **unverändert** (Diff gegen HEAD: nur die Notizzeile + neue Keys;
  ein Generator-Guard bricht laut, falls sich das Laternen-Glas zwischen den Spots
  unterscheiden würde — das hat eine echte Glühwürmchen-Kollision an der Gehäusekante
  verhindert, deshalb übermalt das Overlay bewusst NUR das Glas, nicht das Gehäuse).
- Frame-Belege: `shots/m10-title-flame-frames-f0/f1/f2.png` (8x nearest).
- Begründeter Minimaleingriff in fremde Datei: `tests/menu-art-crisp.test.ts` erwartete
  `GEN_TITLE == {title_background}`; Keyliste um die 3 Flammen-Frames erweitert (sonst
  keine Änderung an fremden Dateien).

## Karte 3 — Runtime (Commit 90e0a12)

`src/scenes/Title.ts` — enger Diff, nur Anzeige-Zeilen nach dem Mond-Glow:
- 4 Overlay-Images (eins je Spot), Position `bgL.x/y + Spot`, **Scale = bgL.scale**
  (ganzzahlig, identisch zum Kernbild → keine Mixel), Origin 0/0, **Depth 2**
  (unter dem Dim-Overlay Depth 3, über dem Mond-Glow Depth 1 → Flammen werden
  genauso gedimmt wie die Basis, kein Naht-Sprung).
- Texturwechsel alle 500 ms im Zyklus **f0 → f1 → f0 → f2** (≈ 2 fps, ruhig).
- Layout, Text-Positionen, Buttons: unberührt (AE = Glasfläche + Funken).

Befund (ehrlich): Laternen 2–4 liegen — wie schon im Vorher-Stand — hinter den
Menü-Knöpfen START/OPTIONEN/CREDITS; bei ihnen sind nur die Funken über den Deckeln
sichtbar. Volle Flamme sichtbar an Lanterne 1 (links unten, Texel 22/214). Optionale
Folgekarte (backlog): Flammen sichtbarer machen (z. B. Mond-Glut-Flicken oder
Laternen oberhalb der Knopfleiste) — bewusst nicht umgesetzt, weil das Layout
unangetastet bleiben muss.

verify:menus: **14/15** — der eine FAIL („Skalierung 2X gestellt, Fit-View zentriert“)
ist **Vorher-Befund** (reproduziert auf stash-edlem Basis-Commit, ohne Lane-Änderungen);
kein Layout-Umbau durch diese Lane.

## Karte 4 — Abnahme

- Guard-Test `tests/title-flame.test.ts`: **14/14 grün** (Frames vorhanden, 8x11,
  Palettentreue exakt {13,20,21,22}, binäres Alpha, F0 = Zellkopie der Basis an allen
  opaken Zellen + Glas voll opak + Funkenbereich transparent, F1/F2 sparsam (≤ 12
  Zelldiffs), titleBgLayout für 640x360/780x360/1920x1080 unverschoben, ganzzahliger
  Scale/Positionen).
- `npm test`: **1375 Tests / 128 Files grün**. `npx tsc --noEmit` grün, `npm run build` grün.
- After-Belege: `shots/m10-title-flame-after-640x360.png`, `-780x360.png`,
  `-1920x1080.png`, Animations-GIF `shots/m10-title-flame-after-640x360.gif`
  (10 Frames @ 2 fps, Frame-Diffs via signalstats YDIF 0,05–0,07),
  `shots/m10-title-flame-after-anim-strip.png` (4 Frames Lanterne 1, 6x nearest),
  Zooms `shots/m10-title-flame-after-zoom-640-lantern1.png` / `-zoom-1920-lantern1.png`.
- Burst/FPS unberührt: Titelszene ohne Spiel-Draw-Pfad; pro Frame kein zusätzlicher
  Draw außer 4 statischen Images (Texturenwechsel nur 2x/s).
- art-director-Urteil: siehe unten.

### art-director-Urteil (2026-11-28, **PASS**, alle Noten ≥ 4)

| # | Punkt | Note |
|---|---|---|
| 1 | Belebung/Eindruck | 4 |
| 2 | Palette/Stil (0 off-palette, 0 nicht-binäres Alpha, deckungsgleich mit Glasform) | 5 |
| 3 | Dezenz/Tempo (500 ms/Step, f0→f1→f0→f2, Funken 0/1/2 px, Depth 2 verifiziert) | 4 |
| 4 | Lesbarkeit/Skalierung (640/780/1920, ganzzahlig, 4 unterscheidbare gedimmte Stufen) | 5 |
| 5 | Gesamt „schön & jetzt belebt" | 4 |

muss neu: — / nachbessern: — / ok: Frames, Spots-Anbindung, Belegkette.
Umgesetzte optionale Anmerkung 1: **Phasenversatz je Laterne** (`flameStep + i`
je Spot) — Laternen schalten nicht mehr synchron, gleiches Tempo (Karte-4-Commit).
Anmerkung 2 (Doku-Fix): K2-Commit-Text nannte fälschlich „Palette 4/13/20/21/22" —
das Overlay nutzt ausschließlich 13/20/21/22 (Index 4 ist der Gehäuserand in der Basis).
Hinweis des Art-Directors: statisches Vorher/Nachher-Diff an den Laternen ist 0 px
(korrekt — Glas ist in der Basis gebacken, f0 = Zellkopie; Beweis über GIF + Rohdaten).

## Ergebnis / Messwerte

- 0 Off-Palette-Pixel, 0 neue fraktionale Skalierungen (Scale = bgL.scale ganzzahlig),
  AE = 4 × (Glas 8x6 + ≤ 2 Funkenpx) — Basisbild byte-identisch.
- Burst/FPS unberührt: Titelszene, 4 statische Images, Texturenwechsel 2x/s, kein
  Spiel-Draw-Pfad, kein flock-Bedarf.
- Offener Punkt (backlog-Kandidat): Laternen 2–4 hinter Menü-Knöpfen (Vorher-Zustand,
  Layout-Constraint) — nur Funken sichtbar; Flammen sichtbarer machen wäre ein
  Layout-Eingriff und war nicht Teil des Briefings.

