# Lane m10-hazard-disc-raster — Gefahren-Discs: Raster raus, flächige Füllung

## Anlass
Argus-Sichtung (Claude, main 45c198d, 2026-11-28 08:15Z, Punkt 1): Die großen Gefahren-Kreise
(Boss-/Hazard-Discs) sind großflächig mit einem Schachbrett-Raster gefüllt ("Fliegengitter") und das
unruhigste Element im Endspiel. Regel (Dom/Claude): Füllung **flächig halbtransparent** ODER **nur Rand +
innerer Puls**; Dither nur am Rand (1–2 px Übergangsband), NIE als regelmäßiges Raster über Flächen;
eine Pixelgröße (Draw-Scale 1 — seit B3-Fix erfüllt).

## K1 — Vorher-Baseline (#10068)
- Standbilder late-game (skipTo 1750, ~29:10) mit je 1 Boss-Disc (stomp, r=92, color 25) und
  1 Standard-Disc (poison, r=26, color 18), gespawnt über den echten Draw-Pfad
  (`run.hazards.spawnCircle`), Warnphase per `setTimeScale(0.02)` eingefroren.
- Belege (Arbeitskopien): `~/games/.evidence/m10-hazard-disc-raster/before-{960,1280}.png` + `*-json`
  (WebGL-Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` —
  gültig, nicht SwiftShader; 0 JS-Fehler).
- Abnahme-Bilder in git: `shots/abnahme/m10-hazard-raster-before-{960,1280}.png`.
- Befund am Bild: beide Discs großflächig 50-%-Schachbrett (Boss-Disc) bzw. sichtbares Raster
  (Standard-Disc), Rand voll — das gemeldete "Fliegengitter".
- Capture-Skript: `scripts/m10-hazard-raster.mjs` (ein Skript für Vorher/Nachher, 1 Edit-Iteration).

## K2 — Fix (#10069)
t.b.d.

## K3 — Tests (#10070)
t.b.d.

## K4 — Abnahme (#10071)
t.b.d.
