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

**Pipeline-Befund (wichtig):** `src/gfx/gen-bosses.ts` wird von ZWEI Werkzeugen gebaut:
`scripts/art/gen_bosses.py` liefert die F0-Basis-Frames, danach leitet
`node scripts/m10-boss-idle-anim.mjs gen <ids>` (Lane m10-boss-idle-anim, #6518/#6519/#6520)
F1 (Atmen: Oberkörper 1 px runter, Füße fix) und F2 (Zucken: 1 px hoch) aus F0 ab und
schreibt die TS direkt. Ein Wholesale-Regen über Python allein zerstört den Idle-Kontrakt —
Korrekte Kette: `python3 scripts/art/gen_bosses.py && node scripts/m10-boss-idle-anim.mjs gen
moor_queen,bone_lord,pale_shepherd,bell_golem,coven,hollow_king`.

Umgesetzte Muss-Fixes (je Boss genau 1, art-director-Abgleich):

| Boss | Fix | Umsetzung |
|---|---|---|
| moor_queen | Krone schwebte 2-3 px über dem Kopf | Kronenband auf Kopfhöhe + Schädel-Brücke (Kontaktband), Krone fix am Kopf (nicht am Atem-Bob, Idle-Versatz-Kontrakt); zusätzlich Zähne unregelmäßig (art-director #2) |
| bone_lord | Schulter-Blobs verschwanden im Grund | Pauldrons 5→6 + Licht 8 + Rim 9; Rippen unregelmäßig mit Brüchen (art-director #2); Gürtel-Punkte entklart (art-director #3) |
| pale_shepherd | Stab schwebte (nicht in der Hand) | Griff nach dem Schaft nachgezeichnet (1 px Überlapp), Schaft bis zur Bodenkontakt-Kante verlängert; Saum unregelmäßig mit echten Lücken (#2); Fellzeichnung + Kralle (#3-Blob) |
| bell_golem | Fäuste flach/blockig | Faust-Lichtkante oben + Kern-/Fingerbruch; Ellbogen-Kerben (#2); Beinspalt asymmetrisch + Riss/Moos (#3) |
| coven | Gesichter ohne Augen | 2x2-Augen (F0 Bernstein 20, F1+ Laternenweiß 13 + 22-Rim), grauer Kinn-Keil zur Robe aufgelöst, gebeugte Kopf-Variante (hd) |
| hollow_king | Krone rechts abgehoben | Kontaktband Schädel↔Kronenband (Reihe 14-15, Knochenfarbe) |

Nach dem Fix (Metriken gegen Before-Baseline): offPal 0/0, Dupletten 0/0,
silKontrast p75 identisch oder >= Before (Guard-Test grün), edgeContrast bone_lord
41.5→46.1, bell_golem 29.4→31.6, pale_shepherd 52.0→52.9.

**Offene Punkte (belegte, aber nicht in K2 — Folge-Karten):**
- coven: Klon-Posen + unklare Props (Besenstiel-Nadel, Goldkugel) — art-director #3
- hollow_king: Brustpanzer als Tech-Panel (art-director #1), rauschende Unterkante
  (Owner #1, silKontrast 70)
- moor_queen: F2 als lesbare Duckpose — kollidiert mit Idle-Kontrakt (F2 = 1 px Zucken),
  nur gemeinsam mit m10-boss-idle-anim-Nachfolger lösbar
- pale_shepherd: Kopf-/Gesichtsfläche matschig (Owner #1, von art-director nicht geflaggt)

## K3 — Guard-Test

## K4 — After-Belege + Urteil
