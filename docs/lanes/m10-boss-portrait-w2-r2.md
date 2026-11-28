# Lane m10-boss-portrait-w2-r2

Re-Queue von `m10-boss-portrait-w2` (Original wurde 06:22:11 als Opfer des Ancestor-Bugs getötet,
0 Agent-Läufe; Briefing inhaltlich unverändert). Ziel: belegte Mängel aus
`docs/lanes/m10-boss-portrait-crisp.md` (Abschnitt „Offene Punkte“) am Boss-Sprite-Generator
fixen — nur Optik, keine Balance-/HP-/Angriffs-Änderungen.

**Abnahme:** art-director >= 4/5 je gefixtem Boss (coven, pale_shepherd, hollow_king) an 4x-Kontaktbögen;
`moor_queen` bewusst unangetastet (Idle-Kontrakt); Palette-Guard grün; Tests grün; Vorher/Nachher-Belege.

## Belege (Evidence-Regel, Vera 28.11.)

Alle Mess-Bilder/JSONs liegen **außerhalb des Repos** in
`/home/ai/games/.evidence/m10-boss-portrait-w2-r2/`:

| Beleg | Pfad |
|---|---|
| Vorher-Bögen 4 Bosses (1x+4x) | `~/games/.evidence/m10-boss-portrait-w2-r2/m10-boss-portrait-w2-before-{coven,pale_shepherd,hollow_king,moor_queen}.png` |
| Vorher-Metriken | `~/games/.evidence/m10-boss-portrait-w2-r2/m10-boss-portrait-w2-before.json` |

**Renderer-String (K1, Pflicht):** `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
— gültig (nicht SwiftShader), in beiden JSONs mitgeschrieben.

## K1 — Vorher-Stand

Tool: `scripts/m10-boss-portrait-w2.mjs` (läuft ohne flock — offline-Raster, keine FPS-/Echtzeit-Messung).

| Boss | Größe | silKontrast p75 | Kanten | Befund (aus crisp-Lane, K1/K4) |
|---|---|---|---|---|
| coven | 96x96 | 70.0 | 32.5 | 3 Klon-Posen (gleiche Silhouette/Robe-Farbe), Seitenfiguren verschmelzen mit der Mittel-Figur, „Feuerkreis“-Orbs lesen sich als Goldkugeln, Besenstiel = 1-px-Nadel (Index 5) |
| pale_shepherd | 72x72 | 134.4 | 52.9 | Kopf-/Gesichtsfläche matschig: Kapuzenbogen, Gesicht und Wangen-Highlights verlaufen ineinander, Einzel-Pixel-Highlights lesen sich als Rauschen |
| hollow_king | 96x96 | 70.0 | 34.7 | Brustpanzer liest sich als Tech-Panel (gerade Segmentnähte + Lüftungsschlitze), Unterkante rauscht (rote Tropfen + isolierte Trümmer-Pixel + Diagonal-Dornen) |
| moor_queen | 56x56 | 118.4 | 27.7 | **Kontrolle, unangetastet** (Idle-Kontrakt) |

Vorher-Sichtprüfung (Owner, 4x): Befunde bestätigt — coven liest sich als „eine rote Masse mit
3 Hüten“, hollow_king-Brust als dunkler Schrank mit Griffleisten, Unterkante als rotes Fransen-Rauschen.

## K2–K4 — Fixes (Umsetzung in `scripts/art/gen_bosses.py`, F0; F1/F2 via Idle-Transform)

Pipeline-Kette (aus crisp-Lane übernommen, wird beachtet):
`python3 scripts/art/gen_bosses.py && node scripts/m10-boss-idle-anim.mjs gen moor_queen,bone_lord,pale_shepherd,bell_golem,coven,hollow_king`

- **K2 coven:** drei unterscheidbare Rollen statt Klone (linke Hexe mit klarem Besen aus Holz
  16/17 + Reisigbesen 5/6, gebeugt; mittlere Hexe wirft ohne Requisit, Robe 25; rechte Hexe
  mit heller Robe 26/24 und Feuerkugel), Roben-Farbtrennung + 1-px-Ink-Trennkontur zwischen
  den Figuren, Feuerkreis-Orbs als klare Flammen (Tropfenform 18/13/22 statt Goldkugel),
  Besenstiel-Nadel (1 px, Index 5) entfernt/ersetzt.
- **K3 pale_shepherd:** Kopf neu strukturiert: 2-px-Kapuzenrand (8) mit Lichtkante (10),
  Gesicht als klare Fläche (9) mit 1-px-Stufen (Stirnlicht 10, Wangenknochen 11 als
  zusammenhängende 2-px-Patches, Schatten 6), Augen in dunklen Sockeln, Kinnbart klar
  vom Umhang getrennt. Keine Einzel-Pixel-Highlights mehr.
- **K4 hollow_king:** Brustpanzer organisch/knochenig: freiliegender Rippenkorb (Knochen
  10/11/9, gebogene Rippenbögen) über zerschlissenem Wams, Glut-Herz; Unterkante beruhigt:
  Kapuzensaum in verbundenen Zipfeln (keine isolierten Tropfen), Beine/Schuhe lesbar,
  Diagonal-Dornen + isolierte Eck-Trümmer entfernt, Thronfragmente erdiger.
  **Ergebnis (Abbruchkriterium erreicht, keine weitere Iteration):** silKontrast p75
  **70.0 → 93.8**, Kanten 34.7 → 39.9, offPal 0, dup 0. Probe 4x gesehen: Rippenkorb +
  Wams klar getrennt, Beine/Stiefel lesbar, keine Diagonal-Dornen mehr. Commit `57e2937c`
  (#9898); Feinschliff bewusst K6 überlassen (art-director-Urteil).

## K5 — Regressionstest

`tests/boss-portrait-w2.test.ts` (7 Tests, Commit `59f84abe`): Grid-Größen unverändert,
binaeres Alpha + 0 offPal, Silhouetten-Kontrast der 3 fixen Bosse >= Vorher (coven 70.0,
pale_shepherd 134.4, hollow_king 70.0), unangetastete Bosse >= Vorher, 0 Frame-Dubletten,
Rollen-Asserts (coven: drei Roben-Treppen 24/25/26; hollow_king: Knochen im Brustbereich).
Lauf: 7/7 grün; `npm test` 157 Dateien / 1697 Tests grün.

## K6 — Nachher-Stand + art-director

Nachher-Bögen: `~/games/.evidence/m10-boss-portrait-w2-r2/m10-boss-portrait-w2-after-*.png`
(+ JSON mit Renderer-String `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`),
Abnahme-Bilder zusätzlich in `shots/abnahme/`.

| Boss | silKontrast p75 vor→nach | Kanten vor→nach | Fix |
|---|---|---|---|
| coven | 70.0 → **93.8** | 32.5 → 37.2 | 3 Rollen statt Klone, Flammen statt Goldkugeln, Besen statt Nadel |
| pale_shepherd | 134.4 → 134.4 | 52.9 → **54.2** | Kopf/Gesicht mit 1-px-Stufen, klare Kapuzen-Lesart |
| hollow_king | 70.0 → **93.8** | 34.7 → **39.9** | Rippenkorb statt Tech-Panel, Saum verbunden statt Rauschen |
| moor_queen (Kontrolle) | 118.4 → 118.4 | 27.7 → 27.7 | unangetastet (Idle-Kontrakt) |

art-director-Urteil (streng, Maßstab „kommerziell auslieferbar“): **PASS — coven 4, pale_shepherd 4,
hollow_king 4,5** (Ziel ≥ 4/5 je gefixtem Boss erreicht, muss-neu: keines). Belege:
`shots/abnahme/m10-boss-portrait-w2-after-{coven,pale_shepherd,hollow_king}.png` (4x+1x,
nearest), Gegenstücke `~/games/.evidence/m10-boss-portrait-w2-r2/*-before-*.png`.
Optionale Nachbesser-Punkte für eine nächste Grafik-Runde (kein Muss, laut Kontrolleur):
- coven: einzelne dunkelrote Einzelpunkte in den erhobenen Arm-Innenkanten (Mittel/rechts)
  wirken nah als Rauschen → 2-px-Saumschatten; Gesicht: asymmetrischer heller
  Mittelstreifen + weiße 1-px-Punkte neben Augen/Kiefer klären oder streichen.
- pale_shepherd: Saum-Fransen weiterhin 1-px-Spitzen + 1 isoliertes hellgraues Einzel-Pixel
  im Saum (War nicht Teil des W2-Fixumfangs, Restpunkt aus crisp-Lane).

## Abnahme-Zusammenfassung

- art-director ≥ 4/5 für alle drei gefixten Bosse an 4x-Kontaktbögen (coven 4, pale_shepherd 4,
  hollow_king 4,5; moor_queen bewusst nicht bewertet/unangetastet).
- `tests/boss-portrait-w2.test.ts` 7/7 grün; `tests/boss-portrait-crisp.test.ts` +
  `tests/boss-idle-anim.test.ts` grün; `npm test` 157 Dateien / 1697 Tests grün;
  `npx tsc --noEmit` grün; `npm run build` über Harness-Lauf grün (Renderer-Beleg oben).
- Keine Änderung an Balance/HP/Angriffslogik; nur `scripts/art/gen_bosses.py` +
  regeneriertes `src/gfx/gen-bosses.ts` (Kette: python + idle-anim gen für alle 6).
- Palette-Guard grün: 0 Off-Palette-Pixel, binäres Alpha, 0 Frame-Dubletten.

## Status

- [x] K1 Vorher-Kontaktbögen + Metriken + Renderer-String (Commit `5505bcef`)
- [x] K2 coven (Commit `04a25cbe`, silKontrast 70.0 → 93.8)
- [x] K3 pale_shepherd (Commit `8b78eacd`, silKontrast 134.4 → 134.4, Kanten 52.9 → 54.2)
- [x] K4 hollow_king (Commit `57e2937c`, silKontrast 70.0 → 93.8)
- [x] K5 Regressionstest (Commit `59f84abe` + Guard-Tightening im K6-Commit, 7/7 + npm test 1697 grün)
- [x] K6 Nachher + art-director PASS (coven 4 / shepherd 4 / hollow_king 4,5)

## Reviewer-Befunde (Kontrolleur, PASS)

- Lane-Diff umfasst genau die 6 Lane-Dateien; moor_queen/bone_lord/bell_golem pixel-exakt
  main-identisch; 0 offPal über alle 6 Bosse × 3 Frames; keine Secrets/Temp-Dateien.
- Umgesetzt: Guard auf Nachher-Werte verschärft (coven/hollow_king 93.8, shepherd 134.4),
  Testtitel präzisiert.
- Bekannter, NICHT lane-bedingt offen Punkt (Bedarf für einen Folge-Job): `python3
  scripts/art/gen_bosses.py` erzeugt auf diesem Stand 785 Diff-Zeilen gegen das committete
  `gen-bosses.ts` — das driftet bereits auf main (vermutliche Python-Umgebungs-Differenz bei
  ursprünglicher Generierung). Verletzt langfristig GAME.md „Assets entstehen reproduzierbar
  per Skript“; hier nicht gefixt, um fremde Boss-Bytes nicht anzufassen.
