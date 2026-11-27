# Lane m10-menu-touch-targets — Touch-Trefferflächen für alle Menüs (M10)

Ziel: Alle Menüs auf Handy-Formaten (640x360@3, 780x360@3) zuverlässig per Touch
bedienbar machen. Bekannt aus der QA: kleine Rahmen-Buttons (22/18/20 px hoch)
und Optionszeilen waren bei 640x360 leicht zu verfehlen; Touch-Trefferflächen
waren nie belegt worden.

## Dateien / Hebel

| Datei | Änderung |
|---|---|
| `src/ui/touch-targets.ts` (neu, K2) | Reine Geometrie `fitTouchRect(cx,cy,w,h,viewW,viewH,min=44)`: Trefferfläche mind. 44x44 logische Pixel, ganzzahlig, mittig zum Sichtbaren, an Rändern in die View geclampt. |
| `src/ui/menu.ts` (K2) | `createMenuButton`: unsichtbare Hit-Zone >=44x44 im Container (Optik unverändert, `setEnabled` schaltet nur die Zone). `createHitZone`: läuft ebenfalls über `fitTouchRect`. |
| `src/ui/options-menu.ts` (K3) | 7 Optionszeilen haben je EINE zusammenhängende Trefferfläche über die volle Zeilenbreite (520 px) und die ganze 20-px-Zeilenhöhe; Zeilen berühren sich, überlappen nicht (kein Durchtippen auf die Nachbarzeile). Tap auf Zeilenanfang erhöht, Tap nahe dem `<`-Glyph senkt; Tap setzt `selected` + sichtbaren Fokus-Rahmen. |
| `scripts/verify-menu-touch.mjs` (K1/K5) | Synthetische Tap-Probe (Playwright, `hasTouch`/`isMobile`) durch Titel → Options → CharSelect → Run/Pause → Options → Results → Titel auf beiden Profilen; loggt Treffer/Misserfolg je Ziel und alle interaktiven `getBounds` als JSON. Robust gegen Scene-Fades (180–200 ms) via Polling statt Fix-Wait. |
| `tests/menu-touch-targets.test.ts` (K4) | 21 Assertions: `fitTouchRect` >=44x44 + View-Clamp, Probe-Tap-Punkte treffen die richtigen Zonen (alle Profile), 7 Zeilen lückenlos/überlappungsfrei, Pfeil-Randtreffer = -1 / Label-Tap = +1, Quelltext-Verankerung. |

## Messung (Vorher/Nachher, `shots/m10-menu-touch-*.json`)

| Kennzahl | Vorher (K1, 3dafe2b) | Nachher (K5) |
|---|---|---|
| Tap-Probe 640x360@3 + 780x360@3 | **12/34 Checks (35,3 %)** | **36/36 (100 %)**; identischer Kern der 34 Vorher-Checks: **34/34** |
| Kleinstes interaktives Rechteck | 24x18 (Pfeil-Zonen), Menübuttons 22 px hoch | 92x44; **alle** Zonen >= 44 px hoch, 0 Zonen außerhalb der View |
| Optionszeilen | ohne Tap-Handler auf der Zeile (nur 24x18-Pfeilzonen) | 7/7 Zeilen treffen den richtigen Wert (Erhöhen/Toggle/Senken am `<`), volle Zeilenbreite |
| JS-Fehler in der Probe | 0 | 0 |

Neu in der Nachher-Messung: 2 Robustheits-Checks („Options nach Skalenwechsel
offen“ je Profil) — deshalb 36 statt 34 Checks; der Kern-Vergleich nutzt die 34
Vorher-Check-Namen.

## Sichtbare Optik unverändert (Pixel-Diff)

Vorher/Nachher-Screenshot des Optionsmenüs je Profil
(`shots/m10-menu-touch-options-640/780.png`, vor dem Fix committet in 3dafe2b):

- AE (exakt unterschiedliche Pixel, `compare -metric AE`): **3141** (640) bzw.
  **3501** (780) von 2,07 Mio. bzw. 2,53 Mio. Device-Pixeln (0,15 %).
- Referenz-Rauschen: zwei Shots im selben Lauf 700 ms auseinander → AE **15876**
  (animierter Mond-Glow/Glühwürmchen blutet durch das 92-%-Overlay des Menüs).
- Die Vorher/Nachher-Differenz liegt damit deutlich **unter dem Same-Run-
  Animationsrauschen** → die statische Menügrafik ist unverändert.
- Zusätzlich getBounds-Äquivalenz (einzeilig prüfbar): Menüknopf-Zentren
  vor/nachher identisch je Profil und Szene —
  640: `96@216@259, 108@320@259, 92@426@259` (Breite@x@y, Next-Purpose-Zentren),
  780: `96@286@259, 108@390@259, 92@496@259`; Results-Zentren identisch
  (`JSON.stringify`-Vergleich der Zentren vor/nachher = true).

## Abnahme

- `npx tsc --noEmit` grün; `npm run build` grün (Vite 385 ms);
  `npm test` **376/376 in 34 Dateien** grün.
- Vorher/Nachher-JSON mit Trefferquoten: siehe Tabelle oben.
- Spiel-/Run-Dateien (`src/scenes/Run.ts`, `src/scenes/UI.ts`,
  `src/gfx/font.ts`, `src/gfx/textures.ts`, `src/systems/CombatSystem.ts`)
  wurden nicht angefasst; der K4-Test importiert nur `src/ui/touch-targets.ts`.

## Offene Punkte

- Optionszeilen sind 20 px hoch (Zeilen-Pitch); sie sind lückenlos
  zusammenhängend, so dass ein Tap nie ins Leere geht. Eine 44-px-Zone je Zeile
  ist bei 7 Zeilen x 20 px Pitch (140 px Panel) geometrisch nicht möglich ohne
  Überlappung — der Kompromiss (volle Breite, keine Lücken) ist im K4-Test
  festgehalten.
