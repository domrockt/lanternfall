# Lanternfall — Art-Bibel (M4)

Verbindlich für **alle** Grafiken. Ergänzt die „Grafik-Qualitätslatte“ in GAME.md.
Quelle aller Farben ist ausschließlich `src/palette.ts` (32 Indizes). Kein Asset
darf eine andere Farbe enthalten; Transparenz ist erlaubt.

## Grundregeln

1. **Kontur:** genau 1 px, immer Palettenindex **0** (`ink`, `#06070c` — kein reines
   Schwarz). Die Kontur wird *außen* um die Silhouette gelegt, nie doppelt, nie
   innen. Bei Bodenschatten/Partikeln darf sie fehlen, wenn das Asset sonst
   unlesbar klein wird.
2. **Licht:** von **oben-links**. Kanten oben/links = Lichtton, Kanten unten/rechts
   = Schattenton, Fläche = Basiston. Kein Pillow-Shading, keine Farbverläufe,
   kein Dithering über die ganze Fläche (Dither nur als 2–3-Pixel-Akzent).
3. **Schattierungsstufen:** mindestens 3 (Schatten / Basis / Licht), optional
   1 Highlight-Ton nur an der obersten Kante. Pro Material genau eine Rampe.
4. **Rauschen:** keine Einzelpixel. Jede Form ist mindestens 2×2 px breit, außer
   Augen, Glanzpunkten und Konturspitzen. Details werden gruppiert (2er/3er-Blöcke).
5. **Silhouette:** auf dunklem Moorboden lesbar; jede Gegnerart hat eine eindeutige
   Form (Körperbau + ein Markenzeichen: Hörner, Flügel, Kapuze, Sense, Kelle …).
6. **Pixelraster:** ganzzahlige Positionen und Skalierung. Interne Auflösung
   480×270. Nichts wird verzerrt (nur 2×/3×/4× nearest).
7. **Animation:** Frames verschieben nur Gliedmaßen/Rumpf um 1–2 px und tauschen
   keine Details, die die Silhouette brechen. Idle atmet, Lauf alterniert Beine,
   Hit ist eine kurze Rückstoß-Pose. **Vier Lauf-Frames sind vier echte Posen**
   (Frame 1 linkes Bein vorn, Frame 3 rechtes Bein vorn; nie Frame 1 ≡ Frame 3).
8. **Flächen-S shading:** Schattiert wird pro *Materialfläche*, nicht nur an der
   Silhouette. Ein andersfarbiger Nachbar (Kapuze neben Gesicht, Rumpf neben Arm)
   beendet die Fläche; dadurch bekommen auch Gesichter und Bäuche echte 1–2-px-
   Licht-/Schattenbänder. Basis bleibt in der Flächenmitte erhalten.
9. **Laternenweiß (13) ist reine Glow-Farbe:** nur Glaskern, Glanzpunkt in Augen,
   Lichtkern. Nie als Haut-, Stoff- oder Rüstungsgrundton.
10. **Tier-Akzent:** bei Gegnern mindestens **2×1 px** pro Auge (besser 2×2), auf
    dunkler Augenhöhle (Index 2, nicht 0). Innen-Tinte (0) ist verboten; 0 nur
    außen als Kontur.
11. **Haut/Stoff:** Haut-Rampe 9 · 11 · 12 (12 nur 1-px-Glanzkante). Hände und
    Handschuhe 8 · 10 · 11. Kerzenweiß (12) ist kein Grundton für Stoff.

## Rampen (Palettenindizes)

Jede Rampe ist `(Schatten, Basis, Licht[, Highlight])`.

| Material | Rampe | Verwendung |
|---|---|---|
| Moorboden Gras | 28 · 29 · 30 · 31 | Tiles, Grasbüschel |
| Moorwasser | 2 · 3 · 4 · 6 | Wasser, Wellen, Ufer |
| Weg/Schlamm | 14 · 15 · 16 · 17 | Wege, Schlamm, Wurzelholz |
| Stein | 4 · 5 · 6 · 8 | Steine, Ruinen, Grabstein |
| Knochen | 5 · 8 · 10 · 11 | Skelette, Knochenwaffen |
| Eisen | 2 · 4 · 5 · 7 | Rüstung, Kessel, Ketten |
| Nacht-Tuch | 2 · 3 · 4 · 5 | Kael-Robe, Schattenstoffe |
| Rot-Tuch | 23 · 24 · 25 · 27 | Mira-Tuch, Hexen, Blut |
| Fleisch | 23 · 24 · 25 · 27 | Ghul, Koloss, Horror |
| Haut (blass) | 9 · 11 · 12 | Gesichter, Hände |
| Geist | 6 · 8 · 9 · 13 | Irrlicht, Banshee, Wraith (13 nur Glow) |
| Feuer | 15 · 17 · 18 · 20 | Glut, Flammen, Imp |
| Gold/Messing | 16 · 17 · 20 · 22 | Laternen, Truhe, Münzen |
| Kerzenlicht | 20 · 21 · 22 · 13 | Glow-Kerne, Licht (13 nie als Fläche) |
| Moos/Gift | 28 · 29 · 30 · 31 | Kröte, Schlammling, Golem |
| Violett/Nachtmagie | 3 · 4 · 23 · 25 | Leerenrufer, Hexenzirkel |

**Tier-Farbcodes der Gegner** (Akzent an Augen/Runen/Glow):
Tier 0 = `marshLight` 31 · Tier 1 = `boneLight` 11 · Tier 2 = `amber` 20 ·
Tier 3 = `hotRed` 26 · Tier 4 = `lanternWhite` 13.
Elite-Gegner: additiver Leuchtrand (`elite_aura`) + 1,25× Skalierung.

## Proportionen

| Asset | Raster | sichtbare Höhe |
|---|---|---|
| Spielfigur | 32×32 | 32 px (Kopf ~9 px, Rumpf ~12 px, Beine ~8 px) |
| Portraits | 48×48 | Büste, Kopf ~22 px |
| Gegner Tier 0 | 16×16 | 12–16 px |
| Gegner Tier 1 | 20×20 | 14–18 px |
| Gegner Tier 2 | 24×24 | 18–22 px |
| Gegner Tier 3 | 28×28 | 22–26 px |
| Gegner Tier 4 | 32×32 | 26–30 px |
| Bosse | 48–96 px | 48 / 56 / 64 / 72 / 80 / 96 (Boss 0–5) |
| Tiles | 16×16 | randlos, kachelbar |
| Icons | 16×16 | 12–14 px Motiv, 1 px Rand |
| Projektile | 5–13 px | Kern + 1 px Kontur |
| UI-Rahmen | 9-Slice 24×24 (Border 8) | 2 px Kontur, Goldnieten in den Ecken |

## Animationslängen

- Spieler: Lauf **4 Frames** je Richtung (unten/oben/seitlich; seitlich gespiegelt),
  Idle **2**, Treffer **1**.
- Gegner: **2–4** Lauf-/Flatter-Frames; Tod = 1 Puff-Sprite + Partikel.
- Bosse: Idle **2**, Wind-up **1**, Angriff **1** (pro Boss eigene Pose passend zur
  Mechanik: Sprung, Bogenwurf, Sichelschwung, Stampfen, Feuerstrahl, Dornenring).
- Truhe: geschlossen → offen (Deckel), Öffnungssequenz zusätzlich mit Licht/Coins.

## Tileset & Karte

- Moorgras **ruhig**: pro Pixel aus weichem Noise (29/30/28) → große organische
  Flecken ohne Kachelnähte; Grasbüschel nur als 2-px-Stängel mit 2×2-Spitze in
  Clustern, keine Einzelpixel-Rauschflecken. Kachelgrenzen dürfen nicht sichtbar
  sein (keine ganzen Kacheln in einer anderen Grünton-Fläche).
- Wasser: Grund 3/4, Wellenlinien 5/6, Uferkante als per Pixel ausgefranstes
  1–3-px-Band 28/29/31 zur Landseite. Autotiling über Nachbar-Maske (N/O/S/W).
- Wege: 15/16 mit Kies 14, Rand unregelmäßig aber blockweise, keine Einzelpixel.
- Dekor nur in Gruppen (2×2-Blöcke): toter Baum, Grab, Stein, Ruine, Laternenpfahl.
- Laternenpfahl = kleine warme Lichtquelle (eigener ADD-Glow im Bodenrenderer).

## FX

- Spieler-Magie additiv (Glow), Gegner-Projektile **normal** (dunkle Kontur) — so
  bleiben sie unterscheidbar.
- Treffer: 3–6 Funken in Waffenfarbe; Tod: 6–10 Puff-Pixel + XP-Kristall.
- Kein Screen-Flash über 0,15 s; Shake max. 0,006.

## Pipeline

- `scripts/art/lib.py` — Palette, Grid-Zeichnen, Rampen-Shading, Kontur, PNG.
- `scripts/art/gen_*.py` — prozedurale Assets, schreiben `src/gfx/gen-*.ts`
  (Grid-Daten) und/oder `public/art/*.png` (große Bilder).
- `scripts/art/gen.py` — Asset-Server-Client (nur Rohmaterial, wird nachbearbeitet).
- `scripts/art/contact.py` — Kontaktbögen `shots/m4-sheet-*.png` (4×, beschriftet).
- Texturen werden beim Boot einmalig aus den Grids gebaut (Canvas), nie pro Frame.
