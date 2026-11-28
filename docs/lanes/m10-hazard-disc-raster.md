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
`src/gfx/hazardDisc.ts` (Draw-Pfad in Hazards.ts unverändert, Warnlogik bitgleich):
- `discMask`: Füllung im Interieur (round(d) <= r-3) jetzt **flächig** — jeder Innen-Pixel ist
  DISC_FILL_I, kein 50-%-Schachbrett, kein 25-%-Raster, kein Muster auf der Fläche.
- Dither nur noch als **1-px-Übergangsband** am Rand (round(d) = r-2, 50-% auf (x+y)-Parität);
  Kontur weiter radial konstant 2 px (round(d) ∈ {r-1, r}).
- Halbtransparenz im Bake: `bakeFromMask(..., fillAlpha)` — Disc-Füllpixel mit
  `DISC_FILL_ALPHA = 0.4` (Basis) bzw. `DISC_FILL_ALPHA_STACKED = 0.28` (Stapel-Stufe 1, Key "_s1"
  ab 5 Warn-Discs, deterministische Regel unverändert). Strahl/Ring bleiben deckend (fillAlpha=1).
- Stapel-Stufe wirkt nur noch über die Alpha, nicht über die Dither-Frequenz (eine Maskenform).
- Draw-Scale bleibt 1 (eine Pixelgröße, Textur in Sprite-Pixeln) — unverändert.
- `npx tsc --noEmit` rc=0; `npx vitest run tests/hazard-disc.test.ts` 17/17 grün.

## K3 — Tests (#10070)
- Raster-Guard neu in `tests/hazard-disc.test.ts`:
  - Flächensample: für r ∈ {22, 60, 90, 160} ist **jeder** Innen-Pixel (round(d) <= r-3) Fuellung
    (`expect(...).toBe(DISC_FILL_I)`) — jede Lücke/jedes Muster in der Fläche fällt an.
  - Band-Guard: Dither ausschließlich bei round(d) = r-2, Dichte im Korridor 0.3–0.8, (x+y)-Parität;
    Fläche (<= r-3) ditherfrei.
  - Stapel-Guard: Masken stufenunabhängig; Stufe 1 nur über niedrigere Bake-Alpha.
- Volle Suite: `npm test` → **158 Dateien / 1699 Tests grün**; `npm run build` rc=0.
- Commit d8f062aa enthält die Testumstellung (K2-Karte schließt tests/hazard-disc.test.ts ein,
  K3-Karte ist der Suite-/Build-Lauf mit diesem Beleg).


## K4 — Abnahme (#10071)
t.b.d.
