# Lane m10-chest-closed-crisp — chest_closed auf Textur-Ebene abschließen (menu-art-crisp F2)

**Ziel:** Belegte Befundklasse menu-art-crisp F2 (`chest_closed`, Mixel/fraktionale
Skalierung im Truhen-Panel) auf der **Textur-Ebene** abschließen. Die UI-Anzeige-Seite
(`src/scenes/UI.ts`) ist bewusst ausgespart (belegt bei m10-gamepad-nav-scenes-r2);
die Anzeige bleibt, wie sie ist (Draw-Stufe 3 aus m10-chest-icon-crisp).

## Supervisor-Steuerung (28.11.)

Der Supervisor hat die Lane nach der Skript-/Belegphase gestoppt: **keine weitere
Codebase-Suche, kein Eingriff in Draw-Pfade**. K4 wurde als Abschlusskarte gezogen:
Screenshot-/Verify-Skript ausführen, Doku schreiben, alles als K4 committen, `.lane-done`.
K2/K3 (eigener Grid-/Test-Eingriff in `src/gfx/textures.ts`) wurden damit **nicht** als
Code-Änderung ausgeführt — der Textur-Scan belegt stattdessen, dass die Textur-Ebene
die Abnahme-Kriterien bereits erfüllt (0 Off-Palette, 0 nicht-binäres Alpha,
0 fraktionale Skalierungsschritte, s. u.). Das Ratchet
(`tests/palette-compliance.test.ts`, chest_*-Grids) bleibt unverändert grün.

Hinweis Board: Der Supervisor nannte für K4 die Karten-ID **#9196** — auf dem Board
gehört #9196 aber zur Lane m10-props-wiring (fremd). Die K4-Karte dieser Lane ist
**#9624** (doing → review/done); der Commit nennt #9624.

## Messung (scripts/m10-chest-closed.mjs, TAG=after)

Methode: Playwright-Harness, Truhen-Panel via `debugTriggerEvent("chest")` geöffnet;
Live-Textur `chest_closed` per Canvas-Erfassung 1:1 gescannt (Palette-Membership +
Alpha-Binarität); Draw-Metriken des Panel-Icons; 4x-nearest-Crop des Icons mit
Run-Length-Analyse (jede Run-Länge identischer Farben muss Vielfaches der
Texeleinheit sein — sonst fraktionale Skalierungsschritte/Mixel).

Belege: `shots/m10-chest-closed-after.json` + `shots/m10-chest-closed-after-*-panel.png`
+ `shots/m10-chest-closed-after-*-icon4x.png` (Kopien: `~/games/.evidence/m10-chest-closed-crisp/`).

| Format | Renderer | Draw-Scale | GerätPixel/Texel | Off-Palette | Nicht-binäres Alpha | Frakt. Skalierungsschritte |
|---|---|---|---|---|---|---|
| 640x360@2 | ANGLE Mesa Intel(R) Graphics (RPL-S), iGPU | 3 | 6 | **0** | **0** | **0** |
| 780x360@3 | ANGLE Mesa Intel(R) Graphics (RPL-S), iGPU | 3 | 9 | **0** | **0** | **0** |

Renderer-String-Pflicht erfüllt (iGPU, kein SwiftShader). 0 JS-Fehler. Verdict
`passed: true` in allen 7 Kategorien (JSON `verdict`).

Einordnung: Der historische Befund F2 (UI-Draw mit Scale 2.4 → 38.4 px Displaybreite,
Mixelzeilen) wurde von m10-chest-icon-crisp auf dem UI-Pfad behoben (ganzzahlige
Stufe 3). Diese Lane belegt die Textur-Ebene: das 16x16-Grid in `src/gfx/textures.ts`
ist palette-clean (9 Farben, binäres Alpha), wird nur auf ganzzahligen Stufen
gezeichnet und erzeugt in beiden Abnahme-Formaten uniforme Texel ohne Mixel.

## art-director-Urteil

**PASS — Note 4/5 (beide Formate, 640x360@2 und 780x360@3).** Belege:

- Uniforme Texelgröße: `cropNonMultipleRuns: 0` in beiden Formaten (2544 bzw. 3816
  Run-Längen geprüft); harte Kanten, keine Zwischenstufen im 4x-nearest-Crop.
- Nur Palettenfarben: `offPalette: 0`, binäres Alpha; beide Formate identische
  7 Farben (#06070c, #2a3547, #7a331a, #a84a21, #ffb84d, #ffd77a, #ffeeb0).
- Silhouette lesbar: Deckel mit Zierstreifen, Metallbänder, Schloss klar; 5 warme
  Tonstufen = >= 3 Schattierungsstufen; 1-Texel-Kontur, kein Einzelpixel-Rauschen.
- Konsistenz: beide Formate strukturell pixelidentisch (nur Texeldichte 6 vs. 9).
- Optionale Anmerkung (kein Abzug): 1 Texel hellere Deckel-Oberkante für eine
  deutlichere Top-Licht-Lesart.

## Abnahme-Status

| Kriterium (Briefing) | Status |
|---|---|
| 0 fraktionale Skalierungsschritte chest_closed in beiden Formaten | OK (Run-Length: 0 Nicht-Vielfache, beide Formate) |
| 0 Off-Palette-Pixel | OK (Textur-Scan je Format 0) |
| 0 nicht-binaeres Alpha | OK (AlphaViolations je Format 0) |
| `npm test` grün inkl. palette-compliance-Ratchet | OK (1655/1655, 153 Dateien; `npm run build` grün) |
| art-director-Urteil >= 4/5 | OK (PASS, 4/5 je Format, Urteil oben) |
| UI.ts nicht anfassen | OK (git diff leer) |

## Offene Punkte

- Keine. Falls künftig ein Rest-Mixel im Zoom auftaucht, wäre ein Grid-Defekt in
  `src/gfx/textures.ts` der Hebel (eigenes Job, wie in m10-chest-icon-crisp notiert).
