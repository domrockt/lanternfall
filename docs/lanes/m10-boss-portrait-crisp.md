# Lane m10-boss-portrait-crisp — Zeichen-Qualitäts-Pass für die 6 Boss-Sprites

Ziel: Die 6 Bosse treten alle 5 Minuten auf; nach dem idle-anim-Pass (Lebendigkeit) fehlt der
Zeichen-Qualitäts-Pass. Konturen, Silhouetten-Lesbarkeit und Lichtkanten werden geprüft und nur
**belegte** Mängel im Generator (`scripts/art/gen_bosses.py`) neu gezeichnet.
Palette und binäres Alpha bleiben unverändert; die Verträge aus `tests/boss-idle-anim.test.ts`
bleiben grün. Keine Änderung an Spawn-/Kamera-/FX-Pfad.

Quelle der Wahrheit: `src/gfx/gen-bosses.ts` ist AUTO-GENERIERT von `scripts/art/gen_bosses.py`
(anderer Dateiname als im Briefing vermutet — ist geclaimt und wird genutzt).

## Werkzeug

`scripts/m10-boss-portrait.mjs` liest `gen-bosses.ts`, rendert je Boss die 3 Frames (F0 Ruhe,
F1 Atmen, F2 Wind-up) bei 1x und 4x nearest auf Nacht-Hintergrund PAL[2] und misst:

- `offPalette` — Pixel außerhalb der 32er-Palette (muss 0 sein)
- `silhouetteContrast` — p75 der Luminanz-Differenz gefüllter Pixel vs. PAL[2] (Nacht)
- `edgeContrast` — mittlere |dL| horizontal benachbarter gefüllter Pixel (Lichtkanten)
- `duplicates` — Frame-Dubletten je Boss (muss 0 sein)

## K1 — Before-Stand (Kontaktbögen + Mängelliste)

Belege: `shots/m10-boss-portrait-before-*.png`, Metriken `shots/m10-boss-portrait-before.json`.

| Boss | Größe | silKontrast (p75) | Kanten | Befund |
|---|---|---|---|---|
| moor_queen | 56x56 | 118.4 | 28.1 | Krone schwebt ohne Kontakt über dem Kopf |
| bone_lord | 64x64 | 170.9 | 41.5 | stärkster Sprite, siehe unten |
| pale_shepherd | 72x72 | 134.4 | 52.0 | Kopf fransig, Roben-Unterkante zerschnitten |
| bell_golem | 80x80 | 134.4 | 29.4 | Glockenform liest sich nicht |
| coven | 96x96 | 70.0 | 32.6 | Figuren verschmelzen, Gesichtsfläche leer |
| hollow_king | 96x96 | 70.0 | 34.7 | Unterkante rauscht, Krone asymmetrisch |

### Mängelliste (Owner-Sicht, max. 3 Muss-Punkte je Boss)

- **moor_queen:** (1) Krone schwebt 2 px frei über den Kopf-Hügeln — kein Kontakt, wirkt
  aufgelegt. (2) Warzen (2x2, Idx 28) auf Körper 30/31 kaum sichtbar — Rücken liest sich
  flächig. (3) Hinterbeine/Füße unten (29 auf 30) fast unlesbar, Beine gehen im Körpermass
  unter.
- **bone_lord:** keine Muss-Punkte — Kontur, Silhouette (Krone/Schädel/Rippen/Arme) und
  Lichtkanten sind sauber; rote Rippenbänder lesen sich leicht als Weste, aber eindeutig
  als Skelett erkennbar. Kein Redraw.
- **pale_shepherd:** (1) Kopf-/Gesichtsbereich matschig: Kapuzenbogen, Gesicht und
  Augen-Höhle verlaufen ineinander, Augen schweben im Grau. (2) Untere Roben-Fransen
  (vertikale Strähnen mit Lücken + ausfransende Pixel) zerschneiden die Silhouette —
  Unterkante liest sich als Rauschen. (3) Sensenblatt oben rechts als weißer Balken kaum
  als Klinge lesbar; Stab wechselt ohne Grund Weiß↔Orange.
- **bell_golem:** (1) Glocke liest sich als goldener Blob: keine Schulter/Flanken-Kurve,
  dunkles Klöppel-Feld wirkt wie Loch. (2) Kopf-Hals-Verbindung nur 1-2 px Grau — Kopf
  wirkt aufgesetzt. (3) Arme (dunkle Zylinder) haben kein Hand-/Gelenk-Signal und
  verschmelzen unten mit den Beinen.
- **coven:** (1) Mittel-Figur: Gesicht ist rote Fläche + heller Balken — keine Augen,
  kein Kopf-Interior. (2) Die drei Roben verschmelzen an Schultern/Ärmeln zu einer
  Masse — Seitfiguren silhouettieren kaum gegen die Mittel-Figur (gleiche Rottöne, keine
  dunkle Trennkontur). (3) Stab der Mittel-Figur: 1 px grauer, unterbrochener Strich —
  liest sich nicht als Stab.
- **hollow_king:** (1) Unterkante: rote Cape-"Tropfen" + isolierte graue Trümmer-Pixel
  mit Lücken — Silhouette unten rauscht (schlechtester silKontrast-Wert 70, zusammen
  mit coven). (2) Krone asymmetrisch: links dicker Klumpen, rechts dünne Zinken.
  (3) Schulter-Pauldrons und Brustplatte verlieren sich in fast gleichen Dunkelgrau-Werten
  ohne Lichtkante.

art-director-Sichtung (Kontrolleur): Ergebnis wird nach Vorliegen in K4/diesem Dokument
vermerkt; nur von beiden Seiten belegte Muss-Punkte werden in K2 gezeichnet.

## K2 — Generator-Fixes

(nach art-director-Abgleich, nur belegte Mängel)

## K3 — Guard-Test

## K4 — After-Belege + Urteil
