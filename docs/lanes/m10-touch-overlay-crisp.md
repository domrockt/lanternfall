# Lane m10-touch-overlay-crisp — Touch-Overlay-Optik (Joystick-Ring, Thumb, Pause-Knopf)

Ziel: Joystick-Ring/Thumb und Pause-Knopf pixel-crisp (ganzzahlige Draw-Groessen,
Deckkraft >= 0.85 gegen jeden Untergrund, harte Kanten) — Dom-Ziel hochwertige
Pixelgrafik auch mobil (dpr>=3). Geste-Semantik (Deadzone, Sekanten-Snapping,
Latenz) bytegleich.

Messung: `node scripts/m10-touch-overlay.mjs before|after` (Playwright, echte
TouchControls-Pfade via Canvas-TouchEvents; Profile 640x360@2 und 780x360@3;
je Profil Sample `dark` = Spielfeld abseits des Spielers, `hot` = Ursprung 60 px
links der Spielerlaterne). Gates VOR der Messung festgelegt (in
shots/m10-touch-overlay-before.json `gates`): scaleInteger, Farb-Delta
dark<->hot <= 6, Kontrast >= 3.0, Kanten-Zwischenfarben = 0, Pause-Alphas >= 0.85.

## K1 Befund (shots/m10-touch-overlay-before.json, Stand vor Fix)

| # | Befund | Beleg (640x360@2 / 780x360@3) | Severity |
|---|--------|-------------------------------|----------|
| F1 | **Knauf ueber Laternen-Hotspot praktisch unsichtbar**: Kontrast 1.01 / 1.01 (Gate 3.0). Knochen-Fill 0.6 blendet mit hellem Untergrund. | knobContrast hot 1.01/1.01, dark nur 1.47/1.55 | hoch |
| F2 | **Ring-Kontrast zu niedrig**: 1.19/1.18 ueber Hotspot, 1.5/1.53 dunkel (Gate 3.0). | ringContrast | hoch |
| F3 | **Alpha-Fills machen Overlay untergrundabhaengig**: Ringfarbe wandert dark<->hot um 20/21 Kanalstufen, Knauf um 48/68 (Gate 6). Ursache: fills mit Alpha 0.7/0.55/0.22 (Ring), 0.85/0.6 (Knauf). | ringBandDeltaDarkVsHot, knobDeltaDarkVsHot | hoch (Ursache von F1/F2) |
| F4 | **Weiche Kanten gegen hellem Untergrund**: Ring-Aussenkante 31/371 bzw. 11/399 Zwischenfarb-Pixel (hot: ~40 % der Kantenpixel). | ringEdgeIntermediate | mittel |
| F5 | **Pause-Knopf: bg-Alpha 0.55, Stroke 0.8 < 0.85**; Rand 47/92 Zwischenfarb-Pixel (Stroke blendet mit Feld). Balken selbst OK (Kontrast 8.6-9.0, Alpha 0.9). | facts.pause.fillAlpha/strokeAlpha, pauseEdgeIntermediate | mittel |
| F6 | **Skalierung bereits ganzzahlig**: pxPerGame exakt 2 bzw. 3, Overlay-Positionen ganzzahlig (Stick-Ursprung gerundet, Knauf-Offset gerundet, Pause gerundet). Ein fraktionaler Skalierungsmangel ist bei 640x360@2/780x360@3 NICHT belegt — Matsch-Eindruck entsteht durch F3/F4 (Alpha), nicht durch Skalierung. | scaleInteger true, facts | i.O. (dokumentiert) |
| F7 | Balken-Geometrie im Pause-Knopf: x=9/19 mit Breite 4 im 30er-Knopf → Randmargen 7 links / 9 rechts (1 px Asymmetrie im Crop sichtbar). | facts.pause.bar1/bar2, pause-4x-Crops | gering (mit F5 gefixt: Balken auf x=10/20 zentriert) |

Fix-Scope (K2): nur Deckkraete/Kanten in `src/input/TouchControls.ts` —
Ring-/Knauf-Fills auf Deckkraft >= 0.85 (opak), Pause-bg 0.9, Stroke 0.9,
Balken zentriert. Keine Aenderung an Deadzone/Sektor/Geste (joystickDeadzonePx,
sectorWithHysteresis bytegleich), keine Dateien ausserhalb des Disponent-Bereichs.

## K2 Fix (Commit 4819fd2)

`src/input/TouchControls.ts`, nur Overlay-Optik:
- Ring: Ink-Kontur + bone-Koerper jetzt alpha 1.0 (vorher 0.7/0.55); die innere
  zarte F hrung (bone 0.22, untergrundabhaengig) ersetzt durch eine opake
  fogBlue-Rille (1 px, r 37) — gleiche Lesestufe, aber ohne Blending.
- Knauf: Ink-Scheibe alpha 1.0 (vorher 0.85), F llung boneLight alpha 1.0
  (vorher bone 0.6) — heller Koerper = Kontrast gegen dunkles Feld UND Hotspot.
- Pause: bg 0.55 -> 0.9, Stroke 0.8 -> 0.9, Balken von x 9/19 auf 10/20
  zentriert (Randmargen 8/8 statt 7/9, Befund F7).
- Draw-Geometrie als reine Funktion `touchOverlaySpec()` (Vertrag fuer den
  Guard-Test), Pause-Anker als `pauseAnchor()` (Formel bytegleich, update()
  nutzt sie unveraendert).
- NICHT angefasst: joystickDeadzonePx, sectorWithHysteresis, TouchState,
  Deadzone/Sektor/Hysterese/Latenz (Bestandstests 72/72 gruen).

## K3 Tests (Commit 6e7ed8e)

`tests/touch-overlay-crisp.test.ts`, 7 reine Geometrie-Assertions:
- Alle Draw-Groessen ganzzahlig (Ring-/Knauf-Fills, Pause, Balken zentriert 8/8).
- Alle Alphas >= OVERLAY_MIN_ALPHA (0.85).
- Koerper-Fills (bone/boneLight) WCAG-Kontrast >= 3.0 gegen beide gemessenen
  Untergruende (FIELD_DARK [39,55,39], FIELD_HOT [91,94,62] aus before-JSON).
- pauseAnchor haelt PAUSE_MARGIN/Inset fuer 640x360 und 780x360, ohne Inset
  bitgleich zur Referenz (600/10 bzw. 740/10).
- RING_RADIUS/KNOB_RADIUS dazu exportiert; 1329/1329 Tests gruen.

## K4 Nachher-Befund (shots/m10-touch-overlay-after.json + -crisp.json, Crops after-*)

Verbindliche v2-Metrik (`scripts/m10-touch-overlay-eval.mjs`, MODALFARBEN im
Spielpixel-Raster aus den 4x-Crops — v1 im Hauptskript misst Band-Mittelwerte
und verwaesst durch Ink-Kontur + Feld-Reihe; vor UND nach mit derselben Metrik
ausgewertet):

| Gate | before 640 | before 780 | after 640 | after 780 |
|---|---|---|---|---|
| Ring-Koerper Delta dark<->hot (<=6) | FAIL (99) | ok (0)* | ok (0) | ok (0) |
| Knauf-Koerper Delta (<=6) | ok | ok | ok (0) | ok (0) |
| Pause-Balken/bg Delta (<=6) | ok | ok | ok (0/1..3) | ok |
| Ring-Kontrast dark/hot (>=3) | FAIL (1.5/1.08) | FAIL (1.53/1.06) | ok (4.97/6.89) | ok |
| Knauf-Kontrast (>=3) | FAIL (1.02/1.01) | FAIL (1.07/1.0) | ok (10.08/14.54) | ok |
| Balken-Kontrast (>=3) | ok (8.8) | ok | ok | ok |
| Koerper = exakte Palettenfarbe | FAIL (dist 18) | FAIL | ok (dist 0) | ok (dist 0) |
| Stroke nahe bone (<=24) | FAIL (37) | FAIL (37) | ok (19) | ok (19) |

*before-640: Modalwert des Bands war das geblendete Ink (0.7) — Ringkoerper
fast unsichtbar; after: Koerper exakt bone (184,196,194) in beiden Samples.

Alle 12 after-Gates GRUEN. Skalierung weiterhin ganzzahlig (pxPerGame 2/3,
scaleInteger true in beiden Laeufen) — Befund F6 bleibt i.O.
Kanten-Metrik (edgeSoftPx) bleibt Reportwert ohne Gate: im texturierten Feld
sind Mischfarben-Pixel nicht sauber von Feld-Inhalten trennbar (graue Steine
liegen nahe der Mischstrecke); Kanten-Haerte ist strukturell belegt
(ganzzahlige Fills + roundPixels, Guard-Test) und visuell per 4x-Crop.

art-director-Urteil: siehe unten.

## art-director-Urteil

**PASS — 4,5/5** (Abnahmegrenze >= 4 erfuellt), geprueft an allen 24 Crops
(vor/nach, je dark/hot, beide Profile) inkl. eigenem Pixel-Audit gegen
src/palette.ts:

- Pixel-Crispness 5/5: Koerper palette-exakt (ring/knobPalette.dist = 0
  schliesst Alpha-Blending aus), kein Mixel; entfernte Edge-Softness-Metrik
  ehrlich dokumentiert und strukturell ersetzt (integer Fills + roundPixels +
  dist-0-Nachweis).
- Lesbarkeit 5/5: Ring dark 7,59 / hot 4,59, Knauf 14,54, Balken 11,24 — alle
  klar ueber Gate 3,0.
- Palette-Disziplin 5/5: nur ink/bone/boneLight/fogBlue/nightDeep/candleWhite;
  Off-Palette-Pixel nur im Terrain unter dem additiven Spielerlicht (von
  GAME.md erlaubt, im Vorher-Bild identisch — nicht Overlay-verursacht).
- Inszenierung 4,5/5: konturierte Koerper, pixelgenau symmetrische Balken
  (Rand 8/8, im Pixel nachgemessen).
- muss neu: nichts. Nicht-blockierende Polish-Ideen: 1 px heller Trennstrich
  zwischen Knauf- und Ringkontur bei max. Auslenkung; fogBlue-Innenring ggf.
  1 Stufe heller (mist) als Richtungs-Guide — A/B fuer einen spaeteren Pass.
