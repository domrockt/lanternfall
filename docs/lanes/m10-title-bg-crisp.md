# M10-title-bg-crisp — Titel-Hintergrund pixelgenau statt fraktional skaliert

Datum: 2026-11-28. Lane: `m10-title-bg-crisp` (Worktree `/home/ai/games/lf-lanes/m10-title-bg-crisp`,
Branch `m10-title-bg-crisp`). Bedarfsmeldung: m10-menu-art-crisp (Mixel-Befund F1) — `title_background`
(480x270) wurde in `src/scenes/Title.ts` per `setDisplaySize(W, H)` fraktional hochskaliert.

## Vorher-Messung (Karte #6738, Commit 85a8d7d)

`scripts/m10-title-bg.mjs before` (Playwright, Title-Szene, dpr 1 bzw. 3, 0 JS-Fehler):

| Viewport | texelScaleX | texelScaleY | Befund |
|---|---|---|---|
| 640x360 | 1.3333 | 1.3333 | fraktional — Texel ungleich breit/hoch, weiche Kanten |
| 780x360 | 1.6250 | 1.3333 | fraktional, zusaetzlich verzerrtes Aspect-Ratio |

Belege: `shots/m10-title-bg-before.json`, `-before-640.png`, `-before-780.png` (+ 4x-nearest-Zooms).

## Fix (Karte #6739, Commit bd67d00)

Nur `src/scenes/Title.ts` (Anzeige; keine Text-/Layout-/Eingabe-Aenderungen):

- **`titleBgLayout(gameW, gameH)`** (rein, exportiert): ganzzahliger Scale `max(1, floor(min(W/480, H/270)))`,
  Panel zentriert, Rest-Rand links/rechts/oben/unten. Invariante: `left + 480*scale + right = W`,
  `top + 270*scale + bottom = H` (alle Werte ganzzahlig).
- **Kanten-Fuellung**: Die Restflaeche wird von gestreckten Rand-Texeln geschlossen —
  echte 1px-Reihen/Spalten des Quellbilds als einmalige Canvas-Texturen
  (`title_bg_row_t/b`, `title_bg_col_l/r`, 4 Eck-Texel `title_bg_px_*`), skaliert mit
  ganzzahligen Faktoren. Kachelung ist C0-stetig (Fuellung = exakt die Rand-Texel), dadurch
  0 sichtbarer Rand. Texel-Skalierung aller Teile ganzzahlig → keine Sub-Pixel-Kanten.
- **Falle dokumentiert**: `Image.setCrop` auf der Canvas-Textur samplet hier das falsche Texel
  (Band zeigte nur Texel (x,0) einfarbig statt der Spalte) — deshalb drawImage-Kanten-Texturen.
- **Mond-Glow gekoppelt** (art-director-Nachbesserung 1): der additive Glow folgt jetzt der
  On-Screen-Mondposition (`bgL.x + 404, bgL.y + 56`; Mond-Zentrum im Quellbild (404, 56), via
  Luminanz-Centroid bestimmt) statt fix `(W - 76, 56)`.
- Resize: `onScaleResize` startet die Szene neu → `create()` berechnet das Layout neu (existierender Pfad).
- Vertikale Zentrierung == bisheriger `oy`-Anker (bei Scale 1) → Logo/Text/Buttons unversetzt.

## Nachher-Messung (Karte #6741)

`scripts/m10-title-bg.mjs after` (`shots/m10-title-bg-after.json`):

| Viewport | texelScale | seamVertikal AE | seamHorizontal AE | JS-Fehler | Urteil |
|---|---|---|---|---|---|
| 640x360 | 1 / 1 | 0 | 0 | 0 | PASS: ganzzahlig + nahtlos |
| 780x360 | 1 / 1 | 0 | 0 | 0 | PASS: ganzzahlig + nahtlos |

seam AE = `compare -metric AE -fuzz 3%` zwischen Spalte/Zeile direkt innerhalb/ausserhalb der
Panel-Kante (oben gemessen; unten endet zufaellig die Text-Lasur → Messartefakt, kein Bg-Naht).
Belege: `shots/m10-title-bg-after-640.png`, `-after-780.png` (+ 4x-nearest-Zooms).

## Tests (Karte #6740, Commit 5ecfae0)

`tests/title-bg-crisp.test.ts` (21 Tests, gruen): Scale ganzzahlig ≥ 1 fuer 8 Viewports
(480x270 … 1920x1080, Width-Cap 860; MIN_WIDTH=480 → Bleed-Fall unerreichbar), Kachelung
lueckenlos (Rand + Kern + Rand = View in beiden Achsen), Exaktwerte 640/780, Reinheit,
`oy`-Anker unveraendert. `npx tsc --noEmit` rc=0, Suite 884/884, `npm run build` rc=0.

## Grafik-Abnahme (art-director)

**PASS — Note 4/5**, nach Glow-Kopplung **PASS — Note 4,5/5** („auslieferungsreif für diese Karte“):

- Eigene Naht-Messung an den echten Panel-Grenzen (640: x=79|80, 559|560, y=44|45; 780 dpr3:
  x=449|450, 1889|1890, y=134|135): max AE 1–3 → farbkontinuierlich, keine sichtbare Naht.
- Pixel-Kanten crisp (4x-nearest-Zoom), Komposition voll erhalten (Mond jetzt vollstaendig sichtbar),
  nur Palettenfarben.
- Nachbesserung 1 (umgesetzt + nachgeprueft): Mond-Glow an On-Screen-Mondposition gekoppelt,
  Halo zentriert auf dem Mond, kreuzt die Panel-Naht nicht, kein neues Artefakt.
- Nachbesserung 2 (bewusst nicht geaendert, Vorher-Verhalten identisch): die Text-Bodenlasur
  (Alpha-Overlay y 177..314) endet hart auf der Panel-Unterkante — Bestandteil des bisherigen
  Layouts, kein Bg-Naht-Artefakt; falls gewuenscht, eigene Karte.
