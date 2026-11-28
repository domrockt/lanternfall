# Lane m10-icons-consistency — Board #320 (m9-art-fx-ui-03): 12+18 Icons konsistent

**Datum:** 2026-11-28 · **Worktree:** `lf-lanes/m10-icons-consistency` · **Branch:** `m10-icons-consistency`

## Auftrag (Board #320)

Kontur/Lichtkante der 18 UI-Icons vereinfachen (nicht "vereist"), Evolution-Icons
prächtiger als Basis-Waffen-Icons, 16 px lesbar. Abnahme: Kontaktbogen Vor/Nach,
Tests grün, art-director >= 4,5/5.

Abgegrenzt (bereits erledigt durch Vor-Lanes, nicht erneut angefasst): heart/charm/boots
Redraw (#7149), Kontrast der 12 weapon/passive-Icons (m10-icon-contrast, #7145–#7148).

## K1 — Ist-Scan (Commit b781707)

`scripts/m10-icons-consistency.mjs` analysiert alle 18 GEN_ICONS-Raster offline
(Kanten-/Lichtkanten-Metrik, Pracht-Metrik, 16px-Lesbarkeit, WCAG-Kontrast) und
rendernt den 4x-Kontaktbogen. Belege:

- `shots/m10-icons-consistency-before.json` / `shots/m10-icons-consistency-before-4x.png`

Befunde (Vorher):

| Befund | Icons | Wert |
|---|---|---|
| Kontrast-Fail (<3:1) | evo_thorn_storm | 2.32:1 (Panel) — Kontrast-Lane hatte nur weapon/passive geprüft |
| "Eis"-Lichtband (rimShare 1.0) | evo_thorn_storm, passive_whetstone | jeder Lichtpixel liegt am oberen Rand |
| Fragmentierte Silhouette | passive_hourglass | 5 Komponenten, größte 39% |
| Kein Lichtton / abgerissene Kette | weapon_flail | shadowShare 1.0, größte Komponente 68% |
| Evolution ärmer als Basis | evo_thorn_storm (3), evo_eternal_winter (6), evo_wrath_pendulum (7) Töne | Basis-Waffen-Median 8 |

0 Off-Palette-Pixel, 0 weiches Alpha, 0 lose Konturpixel (bereits sauber).

art-director-Abnahme des Vorher-Stands: **FAIL** mit 6 Muss-Items (M1–M6, siehe unten).

## K2 — Zeichnen (Commit bcc81cf)

Ursache des "vereisten" Look: `normalize()`/`shade_edges` legte an JEDER
Materialregion ein uniformes 1-px-Rampen-Lichtband an. Fix: neues `FINAL_DRAWN`-Set
in `scripts/art/gen_icons.py` — die 6 Muss-Icons sind final gezeichnet (eigene,
gezielt gesetzte Licht-/Schattenkanten), normalize banded sie nicht mehr neu.

Muss-Liste → Umsetzung:

| # | Icon | Fix | Vorher → Nachher |
|---|---|---|---|
| M1 | evo_thorn_storm | Redraw: helle Marsh-Rampe 31, Gold-Beeren 20/21, Glow 13, Knochen-Splitter, unregelmäßige Arme | Kontrast 2.32 → 5.56; rimShare 1.0 → 0.47; 3 → 6 Töne; 8 Akzentpixel |
| M2 | evo_eternal_winter | Eis-Edelstein-Blüte mit Goldkern + Glow-Spitzen (Silhouette klar von weapon_frost getrennt) | 6 → 8 Töne; 12 Akzente |
| M3 | passive_hourglass | Durchgehende Silhouette (Rahmen + Sand verbunden) | 5 → 1 Komponenten |
| M4 | weapon_flail | Kettenglanz 10, Kugel-Licht 10/11, Kette 4-connected, silberne Spikes 11 | größte Komponente 68 → 76%; Lichtton vorhanden |
| M5 | passive_whetstone | Licht nur obere Schlifffläche | rimShare 1.0 → 0.28 |
| M6 | evo_wrath_pendulum | Gold-Kette 20/21, Glow 22, Licht 26/27 | 7 → 8 Töne; 0 → 9 Akzente; Kontrast 3.02 → 4.93 |

Nachher-Metrik gesamt (`shots/m10-icons-consistency-after.json`):
**0 Kontrast-Fails, 0 Eis-Kandidaten, 0 fragmentierte Icons, 0 Off-Palette,
0 weiches Alpha, 0 lose Konturpixel** über alle 18 Icons.

## K3 — Tests (Commit d3c8a31)

`tests/icons-consistency.test.ts` (81 Tests, Schwellen aus Vorher-Metrik + Muss-Liste):

- 0 Off-Palette, binäres Alpha, geschlossene 1-px-Ink-Kontur (8-Nachbarn)
- rimShare ≤ 0.9 je Icon (kein durchgehendes Lichtband)
- größte Silhouetten-Komponente ≥ 60%
- WCAG-Körperkontrast ≥ 3:1 gegen HUD `#090c10` und Panel `#101724` für **alle 18**
  (inkl. Evolutionen — Regressionsschutz über den alten 12-Icon-Scope hinaus)
- evo_*: ≥ 6 Töne, ≥ 4 Glow/Gold-Akzentpixel, Familien-Median evo ≥ weapon
- kein Vollschatten-Icon ohne Lichtton

`tsc --noEmit`, `npm test` (1534), `npm run build` grün.

## K4 — Nachher-Belege + Abnahme

- `shots/m10-icons-consistency-vor-nach-4x.png` (oben Vorher, unten Nachher)
- `shots/m10-icons-consistency-after-4x.png`, `shots/m10-icons-consistency-after.json`

**art-director-Abnahme: PASS 4,6/5** (Grenze 4,5). Alle 6 geänderten Icons je 4,5
(evo_thorn_storm, evo_eternal_winter, passive_hourglass, weapon_flail,
passive_whetstone, evo_wrath_pendulum); verifiziert an Raster + Metrik + Tests
(81/81), nicht nur an den Claims. Muss neu: nichts.

Nachbesserungspunkte aus der Abnahme (umgesetzt im K4-Commit):

1. evo_thorn_storm: Sturm-Debris von Einzelpixeln auf 2x2-Knospen (Knochen 10
   Nord-Ost, Dorn 31 Sued-Ost) — keine schwebenden Near-Black-Bögen mehr;
   größte Komponente 0.87, rimShare 0.48, Kontrast 5.56, weiterhin 6 Töne.
2. Kontaktbogen-Skript: `LABEL_H = 5·scale + 2` — Labels überlappten vorher die
   oberen ~25% der Icons.

## Offene Punkte (KANN, nicht gefixt)

- weapon_storm / weapon_thorn: Hellband läuft ohne Unterbrechung an Dorn-/Griff-Knoten (rimShare 0.81/0.88, unter Grenze)
- evo_phoenix: Silhouette liest sich eher als Flügel denn als Phönix
- weapon_ember: Panel-Kontrast 3.13:1 — bei künftigen BG-Änderungen zuerst kritisch

## Board

Lane-Karten: #8638 (K1, done), #8639 (K2), #8640 (K3, done), #8641 (K4).
Ursprungskarte: #320 (m9-art-fx-ui-03).
