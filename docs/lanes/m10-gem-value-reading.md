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

### Entscheidung (datengestützt, verfolgt über 3 Iterationen)

Rampe Silber → Gold → Rubin (Edelstein-Semantik, alle Farben aus der Palette):

| Stufe | Kern | Highlight (+Sparkle) | Chaos-Kollision | Verwerfungen |
|---|---|---|---|---|
| small | bone (10) | candleWhite (12) + lanternWhite (13) | **2,24 %** | r1 mist (8): exakte Bog-Rat-Flankenfarbe (art-director FAIL, sharpenEnemyGrid hebt Rat-Midtone auf PAL 8); r2 fogBlue (6): **29,45 % Boden-Kollision** (RGB-Dist zum marsh-Boden nur 39,6) |
| medium | amber (20) | lantern (21) + 3 px lanternWhite (13) | 2,10 % | art-director r1: auf Glow-/Brand-Decals Kontrast ~0 → heller Kern |
| large | crimson (25) | hotRed (26) | 1,57 % | ok |

Zusätzlich (art-director r1): LOD-Dim der Gems 0,55 → **0,8** (`GEM_DIM_ALPHA`
in PickupSystem.ts) — 0,55 machte alle Rampenfarben zu Matsch (gemessener
Large-Kern (143,71,62) statt crimson). Nur Darstellung, keine XP-Wirtschaft.

Lektion zum Kandidaten-Sweep: die frame-weite Kollisionsmetrik mit „first
match wins" hat einen Order-Bias bei engen Farbpaaren (marsh klaut fogBlue
die Pixel: Sweep sagte 0,01 %, ehrliche Ist-Kollision 29,45 %). Verbindlich
ist die je-Stufe-Messung gegen die 3 Gem-Kernfarben.

Hinweis: Gem-Drops werden über Kills erzeugt; bei gemergtem Draw-Cap (120)
liegen nie 300 Gems gleichzeitig im Feld — gemessen werden >= 300 Drops
(305/309) plus der volle Feldstand. Das Chaos-Bild ist das echte Spielmaximum.

## Karte #10178/#10179 — Fix + Guard-Test

Umsetzung:
- `src/logic/xp.ts`: `GEMS.color` korrekt gegen die Texturen + exportierte
  `GEM_VALUE_RAMP` (core/highlight/sparkle je Stufe) + `gemStageForValue(value)`
  als EIN deterministisches Wert→Stufe-Mapping.
- `src/systems/PickupSystem.ts`: `mergeGemValues` nutzt `gemStageForValue`
  (Schwellen identisch → Merge-Semantik bitgleich); Drop-Pfad unverändert
  (`gem_${size}`-Texturen, Cap/Magnet/XP-Erhalt unberührt); LOD-Dim 0,8.
- `src/gfx/textures.ts`: gem_small/gem_medium malen die Rampe (Char-Mapping:
  a→10 bone, c→12 candleWhite, d→13 lanternWhite, k→20 amber, l→21 lantern,
  p→25 crimson, q→26 hotRed, 0→ink).
- `tests/gem-value-reading.test.ts`: 10 Tests — GEMS.color == Rampen-Kern,
  paarweise Deltas 137,4/154,1/197,7 >= 120, Fläche 31 < 57 < 81 und
  49 < 81 < 121, XP 2 < 6 < 18, Gem-Texturen malen NUR Ink+Kern+Highlight+
  Sparkle (0 Off-Palette, direkt gegen PAL geprüft), MAX_VISIBLE_GEMS == 120,
  GEM_DIM_ALPHA >= 0.8, `mergeGemValues` XP-Erhalt exakt (value + credited ==
  Summe).

Commits: 7937d48b (#10178), 17b52c0a (#10179), 27a1837e (#10180-Fix r2),
r3 siehe Karte #10180.

## Karte #10180 — Nachher-Messung + Abnahme (r3)

Belege:
- `/home/ai/games/.evidence/m10-gem-value-reading/gem-reading-after.json`
- `/home/ai/games/.evidence/m10-gem-value-reading/chaos-after-960.png` / `-640.png`
- 3x-nearest-Zoom: `~/tmp/m10-gem-value-reading/zoom3-after-960.png` (Vergleich: zoom3-before)
- Abnahme-Bilder (git): `shots/abnahme/m10-gem-value-reading-960.png`, `-640.png`

### Nachher-Zahlen r3 (960x540, Gem-Drops >= 300, 0 JS-Fehler)

Kontrolleure (28.11.):
- art-director Runde 2: **PASS 4,5/5** (Bone-Rampe) — 3 Stufen sofort
  unterscheidbar (Farbe + Groesse), bone-Gems vor Moor-Boden und neben der
  Knochen-Familie sauber getrennt, Sparkles wirken, 0 off-palette, LOD-Dim 0.8
  ok. Nicht blockierende Empfehlungen (backlog-wuerdig): large-Gem dunklere
  Schattenstufe unten-rechts, small-Konturton vereinheitlichen. Beleg: echtes
  3x-nearest-Zoom `~/tmp/m10-gem-value-reading/zoom3-after-960.png` (2880x1620;
  das erste zoom3-File war fälschlich 1x — vom Kontrolleur ersetzt).
- reviewer: **PASS** — Cap/Merge-Semantik bitgleich (mergeGemValues über
  gemStageForValue mit identischen Schwellen, Drop-Pfad/Magnet/XP-Erhalt
  unberührt), Test-Assertions mit nachgerechneten Deltas, 18/18 grün.
  Bereinigt: Code-Kommentare auf die verbindliche je-Stufe-Kollision 2,24 %
  (statt Sweep-Zahl 2,03 %) angeglichen.


| Stufe | Kernfarbe | px-Fläche | Δ zur nächsten Stufe | Chaos-Kollision |
|---|---|---|---|---|
| small | 0xb8c4c2 bone | 31 | 137,4 (zu amber) | **2,24 %** (vorher grün 7,43 %) |
| medium | 0xffb84d amber | 57 | 154,1 (zu crimson) | 2,10 % (vorher 1,94 %) |
| large | 0xb8303f crimson | 81 | 197,7 (small↔large) | 1,57 % (vorher 1,37 %) |

Verlauf der small-Kollision über die Iterationen: marshLight 7,43 % →
mist 2,59 % (aber exakte Rat-Flankenfarbe, art-director FAIL) → fogBlue
29,45 % (Boden, verworfen) → **bone 2,24 %** ohne exakten Gegner-Farbtreffer.

- Paarweise Deltas 137,4 / 154,1 / 197,7 — alle >= 120 ✔
- Größenordnung monoton: 31 < 57 < 81 (opake px) ✔
- Off-Palette-Pixel in den Gem-Texturen: **0** ✔
- gem-draw-cap + pickup-gems Tests unverändert grün; Guard-Test 10/10 ✔
- `npm run build` rc=0; 0 pageerror/console.error (960 + 640) ✔
- 640x360-Lauf: ebenfalls 300+ Drops, 0 JS-Fehler (siehe after-JSON).

Restkollision 2,24 % bei small stammt aus der Knochen-Familie im Frame
(Steine/Ripple, 2,05 % im Kandidaten-Sweep); die 1-px-Ink-Kontur, die
candleWhite-/lanternWhite-Glanzpixel und die Luminanz (bone ~193 vs Boden
~31–81) tragen die Ablesbarkeit. art-director r2 (Bone-Rampe): PASS 4,5/5.

## Abnahme-Kriterien (Ergebnis)

| Kriterium | Ergebnis |
|---|---|
| 3 Wertstufen paarweise farb-distant (Delta >= 120, Zahl im JSON) | ✔ 137,4 / 154,1 / 197,7 |
| Größenordnung monoton | ✔ 31 < 57 < 81 |
| XP-Erhalt + Cap/Merge bitgleich, npm test grün | ✔ Guard 10/10, gem-draw-cap unverändert |
| 0 Off-Palette-Pixel (Gem-Texturen) | ✔ 0 |
| art-director >= 4/5 auf dem Chaos-Frame | ✔ r2: **4,5/5 PASS** (r1 3/5 FAIL → Bone-Rampe-Fix) |
| npm run build rc=0, 0 JS-Fehler im Probe-Lauf | ✔ rc=0 (28.11. erneut), 0 pageerror/console.error (960+640), Suite 1773/1773 |

## Commit-Status (28.11. 09:15Z, Versuch 3)

Die Lane ist inhaltlich abnahme-reif, aber der #10180-Endcommit blockiert am pre-commit-Claimcheck:
`src/gfx/textures.ts` ist aktuell von der Lane `m10-fx-bakes-evo-r2` geclaimed (aktiv seit 08:59, legitim).
Drei Commit-Versuche (08:57, 09:08, 09:15) scheiterten an derselben Stelle → Retry-Loop gestoppt.

- Bereit im Worktree (staged, verzahnt — ein Split wurde geprüft und verworfen: Guard-Test prüft
  Sprite-Rows aus textures.ts gegen die Rampen-Konstanten in xp.ts, ein Commit ohne textures.ts
  wäre rot): `src/gfx/textures.ts` (nur gem_small/gem_medium-Rows + Kommentare), `src/logic/xp.ts`,
  `tests/gem-value-reading.test.ts`.
- Exakter Patch: `git diff HEAD -- src/gfx/textures.ts` (gem-Rows r3 Silber/Gold/Rubin, Konflikt-frei
  zu den fx-Blöcken). Antrag in `/home/ai/games/.dispatch/requests.md` (09:05Z): Freigabe nach dem
  fx-bakes-evo-r2-Merge oder disjunkter Mini-Job (Präzedenz m10-powerup-sfx-wire).
- Nächster Versuch: nur die drei gestagten Code-Dateien committen (`#10180`), dann .lane-done.

