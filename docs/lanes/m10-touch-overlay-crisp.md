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

## K2 Fix (nach Umsetzung)

## K3 Tests

## K4 Nachher-Befund + art-director
