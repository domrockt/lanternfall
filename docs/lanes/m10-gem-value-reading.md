# Lane m10-gem-value-reading — XP-Gems im Chaos lesbar (3 Wertstufen)

Ziel: XP-Gems im 300–500er-Chaos in 3 Wertstufen (klein/mittel/groß) ohne Hover
lesbar machen — Farb-Rampe + Größenstufe aus der Nacht-/Gold-Palette.
gem-magnet / gem-drawcap sind gemergt: Cap (MAX_VISIBLE_GEMS = 120),
Merge-Überschuss, Tween je Gem und XP-Erhalt (<= 1 %) bleiben **bitgleich**;
diese Lane ändert nur Darstellung/Stufe-Zuordnung, nicht die XP-Wirtschaft.

Karten: #10177 Ist-Messung · #10178 Farbrampe · #10179 Guard-Test · #10180 Nachher + Abnahme.

## Karte #10177 — Ist-Messung (BEVOR der Fix)

Skript: `scripts/m10-gem-reading.mjs` (Chaos via Spawn-Automat: 500 Gegner
 aufgefüllt, autoPlay, god, Seed 1; Gem-Drops laufen über den echten
 Kill→drop()-Pfad; Zeit eingefroren; Klassifikation aus den Gem-Texturen +
 Screenshot-Pixeln).

Belege (nicht in git, Dom-Regel 27.11.):
- `/home/ai/games/.evidence/m10-gem-value-reading/gem-reading-before.json`
- `/home/ai/games/.evidence/m10-gem-value-reading/chaos-before-960.png` / `-640.png`

### Vorher-Zahlen (960x540, 305 Gem-Drops, 108 Gems im Feld bei Cap 120)

| Stufe | Kernfarbe (Dominanz ohne Ink) | px-Fläche (opak) |
|---|---|---|
| small | 0x6f9b58 marshLight | 31 |
| medium | 0xffb84d amber | 57 |
| large | 0xb8303f crimson | 81 |

- Paarweise RGB-Delta: small–medium 147,3 · medium–large 154,1 · small–large 131,9
- Größenordnung monoton: 31 < 57 < 81 ✔
- Off-Palette-Pixel in den Gem-Texturen: **0** ✔
- Chaos-Kollision (Anteil Frame-Pixel <= 60 RGB-Distanz zur Kernfarbe):
  **small 7,43 %** · medium 1,94 % · large 1,37 %

### Befund

Die kleinen Gems sind **marshLight-Grün** — genau die Farbe der Bog-Horde
(7,43 % des Chaos-Frames liegen nahe dieser Farbe; Kandidaten-Sweep, ein Lauf:
marsh 42,5 %, marshLight 7,43 %, fogBlue 0,01 %, mist 0,21 %, paleMist 0,13 %,
glow 0,2 %). Grün ist im Moor-Chaos verbrannt; Blau/Grau-Blau und die warmen
Akzente sind praktisch frei. medium/large (amber/crimson) sind bereits sauber.

### Entscheidung (datengestützt, ein Suchlauf, festgehalten)

Neue Rampe — Edelstein-Semantik kalt → warm (Saphir → Gold → Rubin), alle
Kernfarben aus der Palette, gemessen minimale Kollision je Stufe:

| Stufe | Kern | Highlight | Chaos-Kollision | Begründung |
|---|---|---|---|---|
| small | mist (8) | paleMist (9) | 0,21 % (vorher 7,43 %) | kalt = häufig, nachts lesbar (Luminanz ~121 vs Boden ~31) |
| medium | amber (20) | lantern (21) | 1,94 % (unverändert) | warm = mittel |
| large | crimson (25) | hotRed (26) | 1,37 % (unverändert) | heiß = selten, Rubin = hochwertig |

Erwartete Deltas (neu): mist–amber 163 · amber–crimson 154 · mist–crimson 130
— Schwelle für den Guard-Test: >= 120.

Hinweis: Gem-Drops werden über Kills erzeugt; bei gemergtem Draw-Cap (120)
liegen nie 300 Gems gleichzeitig im Feld — gemessen werden >= 300 Drops
(305/309) plus der volle Feldstand. Das Chaos-Bild ist das echte Spielmaximum.
