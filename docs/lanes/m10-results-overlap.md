# M10-Lane m10-results-overlap — Ergebnis-Screen ohne Überlappungen

Blocker aus der Nachabnahme (Versuch 3, `docs/qa/reacceptance-2026-11-27.md`):
art-director FAIL 3,25/5 mit Restpunkt **Results-Screen-Overlap**. Ziel dieser Lane:
0 Überlappungen bei 640×360 UND 780×360@3, art-director ≥ 4/5, Inhalt unverändert.

## K1 — Repro + Messung (#4118, Commit 9ce6fd7)

`scripts/m10-results-overlap.mjs` rendert den Ergebnis-Screen im Stressmodus
(`?debug=1&stress12`, alle 12 Waffennamen) bei 640×360 (dpr 1) und 780×360 (dpr 3),
Victory (`dawn`) und Defeat (`death`), und misst die **echt gerenderten
Bounding-Boxen** aller sichtbaren Elemente (PixelText, Icons, Balken, Rahmen,
Portrait, Knöpfe). Klassennamen sind im Bundle minified → strukturelle Erkennung
(`valueText`, `geom`/`fillColor`, `texture.key`); unsichtbare Touch-Zonen (44×44
Hit-Flächen aus m10-menu-touch-targets) zählen nicht als Optik. Container-Skalierung
(Titel ×2) wird manuell über die Transformationskette aufgelöst.

Belege: `shots/m10-results-overlap-before.json` + 4 Before-Shots.

**Befund vor dem Fix:**
- 0 echte Rechteck-Überlappungen — das reine Layout (`layoutResultRows`) war bereits
  kollisionsfrei; der art-director-Eindruck „überlagert sich" kommt von **1 px
  Abständen** (Untertitel→Header→Total→Zeilen) und der zentrierten vs. linksbündigen
  Grundlinie („gebrochene Grundlinie").
- **Portrait ragte 14 px aus dem Panel-Rahmen** (CLIPPED @panel in 4/4 Fällen):
  Center `cx-186`, 96 px breit → linke Kante `cx-234` vs. Panel-Rahmen bei `cx-220`.
- **Banner-Text mid-word abgeschnitten**: `slice(0, 26)` aus „NEUER BESTWERT:
  ZEIT, LEVEL" machte „… ZEIT, LEVE".
- Hinweis-Text „ENTER/PFEILE ODER MAUS" liegt teilweise in der unsichtbaren 44 px
  Touch-Zone der Knöpfe (nicht visuell, Input-Thema aus m10-menu-touch-targets —
  hier nur dokumentiert, nicht geändert).

Wichtig: 640×360@1 ist ein **Fit-Rückfall** — logische View 480×360 (`computeView`),
Canvas zentriert im Fenster. Die Layout-Mathematik muss also für logische Breiten
480…860 funktionieren.

## K2 — Logik-Fix (#4119, Commit fdd3f58)

`src/logic/results.ts`: `totalLabel.y` aus `rowsTop` abgeleitet (`rowsTop-9+oy`;
Szene übergibt 68 → 59..66+oy). Header bleibt 50+oy. Ergebnis: gleichmäßige
≥2 px Abstände im Kopfblock bei beiden Abnahme-Views. Keine Änderung an Daten,
Sortierung oder Rundung (`damageTable` unverändert).

## K3 — Rendering-Fix (#4120, Commit c60a249)

`src/scenes/Results.ts`:
- Portrait `cx-186` → `cx-169` (linke Kante `cx-217`, 2 px Luft zum Rahmen),
  Charakter-Labels `cx-136` → `cx-114` (Namensende ≤ `cx-45`, 8 px zur Trennlinie).
- Untertitel `42+oy` → `40+oy` (Abstand 2 px zum Titel, 3 px zum Header).
- `rowsTop` 66 → 68: 12 Zeilen enden mit Icon bei ≤ 304 (Panel-Inneres bis 306).
- Banner-Text ganz oder Fallback „NEUER BESTWERT" statt Wort-Schnitt.

Nachher-Messung (`shots/m10-results-overlap-after.json` + 4 After-Shots):
**4/4 Fälle (640×360 + 780×360@3 × Victory + Defeat): 0 Überlappungen, 0 Clipping,
0 JS-Fehler.**

## K4 — Tests + Abnahme (#4121)

`tests/results-overlap.test.ts` (9 Assertions): spiegelt die Szenen-Positionen als
Box-Modell und prüft für die 5 bekannten M8-Geräte (`computeView`: 640×360@1 → 480,
780×360@3 → 780, iphone14 → 844, pixel7 → 860, laptop → 683) Victory+Defeat auf
0 Überlappungen/0 Clipping, dazu GOTT-MODUS-Zeile vs. Trennlinie, Kopfblock-Abstände
≥2 px, 12 Namen vollständig (2-zeilig, kein Zeichenverlust), Icon-Unterkante über
dem Panel-Rand. Mutation-Check: alte Koordinaten (rowsTop 66, Portrait cx-186,
Untertitel 42) → 6/9 rot; neuer Stand 9/9 grün.

Gesamtsuite: **407 Tests in 37 Dateien, 0 fail**; `npm run build` rc=0.

## Bekannte Restpunkte (nicht Teil dieser Lane)

- Wortumbruch ohne Trennstrich („SEELENLEU/CHTFEUER"): `slotNameLines` in
  `src/logic/text.ts` — fremde Datei (Disponent), Folgekarte nötig.
- Fuß-Hinweistext in der 44 px Touch-Zone der Knöpfe (nur Input, nicht Optik).

## art-director-Urteil (Vision, After-Shots)

**PASS — Note 4,4/5** (Schwelle ≥ 4/5 erfüllt), 2026-11-27, geprüft auf allen 4
After-Shots inkl. Pixel-Zooms (Kopfblock, Portrait, Tabellenende):

- Alle vier Blocker des FAILs 3,25/5 behoben: Portrait komplett im Panel,
  Kopfblock ohne Überlappung, 12 Zeilen ohne Clipping („CHTFEUER" endet in 4/4
  Shots über der Panel-Unterkante), Banner ganz. Liste „muss neu": leer.
- Pixel-Grid/Palette sauber (ganzzahlige Kanten, 32er-Nachtpalette), Umlaute
  korrekt, Victory/Defeat konsistent (nur Titelfarbe wechselt).
- Nicht-blockierende Hinweise: knappe Bodenluft (~2 px) an der letzten Zeile und
  knapper Titel→Untertitel-Abstand im Defeat-Shot → Folge-Karte im Backlog
  (+2–3 px Puffer beim nächsten UI-Pass); Wortumbruch ohne Trennstrich wie oben
  ausdrücklich als außerhalb der Karte bewertet.
