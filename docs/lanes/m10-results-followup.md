# M10-Lane m10-results-followup — Ergebnis-Screen nach view-fill-refit + menubg-crisp

Folgekarte **#4382** (`m10-results-overlap-followup`, Restpunkte aus Lane m10-results-overlap:
Bodenluft letzte Zeile +2–3 px, Titel→Untertitel im Defeat ~2 px). Die alte Lane war gemergt;
seit ihrem Check sind `view-fill-refit` und `menubg-crisp` in main gelandet, ohne dass der
Ergebnis-Screen neu gegen die Abnahme-Formate geprüft wurde. Diese Lane prüft nach, fixt die
belegten Mängel und härtet sie in Tests.

## K1 — Before-Messung (#7478, Commit 332daea)

`scripts/m10-results-followup.mjs` rendert den Ergebnis-Screen im Stressmodus
(`?debug=1&stress12`, alle 12 Waffennamen) in **3 Formaten** — 640x360 (dpr 1, Fill-View),
780x360@3 und 1920x1080 (dpr 1 → logisch 640x360@3) — Victory und Defeat, und misst die echt
gerenderten Bounding-Boxen aller Text-/Balken-/Icon-Elemente. **Renderer-String-Pflicht** erfüllt:
alle 6 Fälle melden `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — iGPU,
kein swiftShader.

Belege: `shots/m10-results-followup-before.json` + 6 Before-Shots.

**Befund vor dem Fix (identisch in allen 3 Formaten, das Layout ist view-unabhängig):**
- **0 Rechteck-Überlappungen, 0 Clipping, 0 JS-Fehler** in 6/6 Fällen — `view-fill-refit`
  (640x360 ist jetzt logisch **640** breit statt 480) und `menubg-crisp` (Vignette) haben am
  Ergebnis-Screen keine Überlappungen eingeführt.
- Die beiden Restpunkte aus #4382 sind real messbar: **Bodenluft letzte Zeile → Panel-Rand 2 px**
  (Ziel +2–3) und **Titel→Untertitel 2 px**.
- Bestwert-Banner: Text ganz, an Wortgrenzen mit `..`-Ellipsis (`fitBanner`), keine Kollision.
- Hinweis: der bekannte Mid-word-Break „SEELENLEU/CHTFEUER" (`slotNameLines` in
  `src/logic/text.ts`, fremde Datei/Disponent) bleibt außerhalb dieser Lane — Folgekarte nötig.

## K2 — Fixes + Tests (#7479, Commit fcca742)

`src/scenes/Results.ts` (einzige Code-Datei der Lane; `src/logic/results.ts` nur gelesen):
- Panel 250 → **254** px hoch (Mitte bleibt 136+oy): Bodenluft letzte Zeile **2 → 4 px**.
- Titel 24+oy → **22+oy**: Titel→Untertitel **2 → 4 px** (Untertitel- und Header-Abstand
  unverändert 3 px).

`tests/results-followup.test.ts` (neu, harte Assertions):
- **0 Überlappungen** im stress12-Layout in **allen 3 Formaten** (logische Views via
  `computeView`: 640x360 Fill → 640 breit, 780x360@3, 1920x1080 → 640x360@3).
- 640x360 ist logisch 640 breit (Regressionssicherung gegen Rückfall auf 480), 1920x1080
  ganzzahlig 3x.
- Waffennamen vollständig, max. 2 Zeilen, **kein Zeichenverlust**; Mehrwort-Namen brechen an
  der Wortgrenze (`EWIGER WINTERSUPPE` → `EWIGER`/`WINTERSUPPE`), Compound-Wörter balanciert.
- #4382-Szene-Mirror: Bodenluft ≥ 4 px, Titel→Untertitel ≥ 4 px, Untertitel→Header ≥ 3 px.
- Banner-Wortumbruch: ganze Wörter + `..`-Ellipsis (`ELLIPSIS`-Konstante), kurzer Text unverändert.

Mutationssicherung: die alten Koordinaten (Titel 24+oy, Panel 250) verletzen die ≥4-px-Assertions.

`npx tsc --noEmit` grün; Suite **1103/1103 Tests in 102 Dateien** grün; `npm run build` rc=0.

## K3 — After-Belege + art-director (#7480)

Nachher-Messung (`shots/m10-results-followup-after.json` + 6 After-Shots):
**6/6 Fälle (3 Formate × Victory/Defeat): 0 Überlappungen, 0 Clipping, 0 JS-Fehler**, iGPU
(Mesa Intel RPL-S). Real gemessen in allen 3 Formaten: Titel→Untertitel **4 px** (vorher 2),
Untertitel→Header 3 px, **Bodenluft 4 px** (vorher 2), Titel→Panel-Oberkante 13 px.

Sichtprüfung (Lead, 4x/3x nearest Zooms in ~/tmp/m10-results-followup/): Umlaute korrekt
(MORGEND**Ä**MMERUNG, **Ü**BERLEBT — kein AE-Mojibake) auch außerhalb der Fixes; Pixel-Grid
im 3x-Shot ganzzahlig; letzte Zeile endet mit sichtbarer Luft vor dem Panel-Rahmen;
Victory/Defeat konsistent (nur Titel/Farbe wechselt).

## art-director-Urteil

**PASS — Note 4,5/5** (Schwelle ≥ 4/5 erfüllt), Subagent `art-director`, 2026-11-28; alle 6
After-Shots mit 2–8x nearest Zooms + numerischen Belegen geprüft:

- K1 Keine Überlappungen: **5** — maschinell `totalOverlaps: 0`, `totalClipped: 0`, `errors: []`;
  4x-Crops Titelblock/Kopfblock/Zeilen/Banner kollisionsfrei.
- K2 Waffennamen: **4** — 12 Namen vollständig, „SEELENLEU/CHTFEUER" wickelt sauber, ~4 px
  Bodenluft über der Panel-Unterkante. Minor (nicht blockierend): mid-word ohne Trennstrich.
- K3 Bestwert-Banner: **5** — Text ganz im Rahmen, `..`-Ellipsis korrekt, keine Kollision.
- K4 Pixel-Grid/Umlaute: **5** — Run-Length-Analyse im 3x-Shot: ausschließlich Vielfache von 3
  (3515 Runs) → ganzzahlige Skalierung; „MORGEN**DÄ**MMERUNG" mit zwei getrennten Umlaut-Punkten
  (8x/16x-Crops), „PH**Ö**NIXSCHWARM" ebenfalls — **kein AE-Mojibake, auch außerhalb der Fixes**.
  Minor (fontseitig): Ö des Listenfonts x-hoch statt Kapshöhe — Font-Änderung, eigene Karte.
- K5 Konsistenz/Palette: **5** — pixelgleiches Layout Victory/Defeat (nur Titel/Farbe/Untertitel
  unterscheidet sich), alle 85 Farben pro Shot innerhalb der 32er-Palette (0 Ausreißer),
  Bodenluft in allen 6 Fällen vorhanden.

**muss neu: —**; optional, nicht blockierend: weicher Trennstrich bei „SEELENLEU/CHTFEUER",
Ö-Glyph des Listenfonts auf Kapshöhe (beide Folgekarten, fremde Dateien).

## Abnahme-Kriterien (Lane-Briefing)

| Kriterium | Beleg | Status |
|---|---|---|
| 0 Text-Überlappungen in 3 Formaten (JSON-belegt) | `shots/m10-results-followup-after.json` (6/6: overlaps 0, clipped 0) | erfüllt |
| Waffennamen vollständig 2-zeilig | before/after-JSON `textItems` + Stresslayout-Test | erfüllt |
| Bestwert-Banner ohne Kollision | before/after 0 Overlaps; Test `fitBanner`-Wortumbruch | erfüllt |
| Balken-/Summenlayout stabil | Test: Summe Zeilen == Gesamt, Icons über Total-Label | erfüllt |
| Tests grün | 1103/1103 (102 Dateien), `tsc --noEmit` grün, build rc=0 | erfüllt |
| art-director ≥ 4/5 (streng) | siehe Urteil oben | siehe oben |
| Optisch AE/Ä außerhalb der Fixes korrekt | Victory/Defeat-Shots: Ä/Ü korrekt | erfüllt |

## Bekannte Restpunkte (nicht Teil dieser Lane)

- Wortumbruch ohne Trennstrich („SEELENLEU/CHTFEUER"): `slotNameLines` in `src/logic/text.ts`
  — fremde Datei (Disponent), Folgekarte nötig (besteht seit Lane m10-results-overlap).
- Kopfblock-Abstände bleiben knapp (3 px Untertitel→Header, 2 px Header→Total): bewusst so
  aus der alten Lane übernommen, ≥2 px und messbar kollisionsfrei.
