# Lane m10-chaos-fix-raster-glow — Merge-Befund (2026-11-28)

## MERGE ZURÜCKGENOMMEN

- Merge `f2844a4` (ohne .lane-done) wurde nach dem Kontroll-Screenshot **revertiert**
  → Revert-Commit `34e97d3`. Branch `m10-chaos-fix-raster-glow` (5 Karten #8218–#8222,
  Lane-Doku mit Original-Befund liegt im Branch) bleibt erhalten, Worktree bleibt stehen.

## Abbruchkriterium: reines Schwarz im Spielfeld-Canvas

- Nach dem Merge (`f2844a4`), Viewport 960x540 (2x, ganzzahlig):
  hartkantiges schwarzes Rechteck **x=0–95, y≈230–540** im Spielfeld (RGB 8,9,15),
  symptomgleich zum Dornensturm-Vorfall (schwarze Terrain-Löcher).
- Belege:
  - `shots/merge-m10-chaos-fix-raster-glow-check-960.png` (Schaden, Merge-Stand f2844a4)
  - `shots/zz-chaos-check-960-crop-bl.png` (4x nearest Crop, harte Kante)
  - `shots/merge-m10-burst-cloud-calm-check-960.png` (unmittelbar vorher, main@80ae44: keine
    Schwarz-Fläche ≥30 px — Pixelmessung: 0 kontinuierliche Runs)
  - `shots/merge-m10-chaos-fix-raster-glow-after-revert-960.png` (nach Revert 34e97d3: sauber,
    Pixelmessung: 0 Runs ≥30 px, Bild visuell identisch zur Baseline)
- 1280x720 zeigte den Block nicht (nicht-ganzzahliges Skalierung, anderer Pfad) — 960er ist der
  verbindliche Default-Viewport.

## Verdacht / nächste Hebel (für die Lane)

- K3 (textures.ts: `LIGHT_EDGE_STEPS`, `vignetteSteps`, „Ecken-Klemme") ist der Prime-Verdacht:
  Blockbreite ≈ 96 px ≈ 5 Vignette-Bänder à 20 px; nur linke untere Kante betroffen (asymmetrisch).
  Reihenfolge: Vignette-Ecken-Klemme isoliert testen (Guard-Shot 960x540), dann light_radius-Bänder.
- K2/K4 (Mixel-Bake-Basen, ADD_ALPHA_CAP) wirken auf Sprites/Partikel, nicht auf Terrain-Füllung —
  unwahrscheinlich, aber beim Re-Merge mit testen.
- Die Lane-Messung (K5) lief auf 640x360@1/780x360@3 und sah das Problem nicht — künftig
  Merge-Kontroll-Shot auch bei 960x540 Pflicht (siehe Merge-Brief 04:00Z).
