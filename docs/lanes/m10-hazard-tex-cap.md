# Lane m10-hazard-tex-cap — Hazard-Textur-Cap (2026-11-28)

Ziel: Belegten Heap-Wachstumshebel aus Bedarfsmeldung m10-heap-regression-fix (2026-11-28,
`~/games/.evidence/m10-heap-regression-fix/texkeys-m2-vs-m29.json`) fixen. Hazard-Telegraph-Canvases
wurden pro Radius/Laenge gebacken (`hazard_disc_r<NN>`, `hazard_ring_rNN` mit 1-px-Quantisierung,
`hazard_beam_lNNN`) und nie freigegeben — der einzige ungebundene Wachstumsmechanismus im Lauf
(~25 neue Canvases in 30 min; Nachbar-Keys wie `r22`/`r24`, `l312`/`l320`, `l832`/`l840`).

## K1 — Vorher-Beleg (#11812, Commit c5a4cf6e)

Probe `scripts/m10-hazard-tex-cap.mjs` (fullrun-Settings: AutoPlay + God + 6 Evolutionen Lv8 +
Passives Lv5 + 30x, Seed 99, 960x540, je 10 min real, `flock /home/ai/games/.lf-perf.lock`,
Poll alle 20 s, einmal gesehene `hazard_*`-Keys bleiben im Set):

- **Before: hazardKeysUnique = 21** (2 Laeufe, beide 21 — reproduziert), Zuwachs binnen ~80 s
  (30x erreicht schnelles Spielalter), danach keine neuen Keys in diesem Fenster.
- Muster belegt den Mechanismus: `hazard_disc_r22/r24`, `r70/r74`, `r92/r96`,
  `hazard_beam_l312/l320`, `l832/l840` — 1-px-Nachbarn je eigenes Canvas.
- Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`; jsErrors = 0.
- JSON: `~/games/.evidence/m10-hazard-tex-cap/m10-hazard-tex-cap-before.json` (Belege nach
  `~/games/.evidence/`, nicht in git — Dom/Vera 2026-11-28).

## K2 — Fix (#11813, Commit c2700650)

`src/gfx/hazardDisc.ts`: **Quantisierung statt LRU** (kleinerer Diff; ein `textures.remove()`
wuerde laufende Sprites anderer Hazards brechen):

- Neu: `texQuantizedRadius` / `texQuantizedBeamLength` — abrundendes **16-px-Raster**
  (`TEX_QUANT_STEP = 16`), Klemme 8..160 bzw. 8..1024; nur fuer Bake-Key + Masken-Eingang.
- Warn-Logik/Treffer bitgleich: `HazardSystem` uebergibt weiter `quantizedRadius(opts.radius)`
  bzw. `quantizedBeamLength(len)`; `hazard.radius = opts.radius` unveraendert. Gezeichnete
  Warn-Geometrie weicht max. **16 px** ab (Quantisierungstoleranz laut Briefing; abrundend,
  Textur nie groesser als die Gefahr — analog zur bestehenden Strahl-Regel).
- Kein import-Seiten-Aenderungsbedarf: `Hazards.ts` unangetastet; Tier-Regel Warn-Disc-Draw
  aus m10-hazard-quality-budget (`DISC_DRAW_CAP_LOW`, `rimPulsePhaseFractionForQuality`,
  `drawQualityTier`) unberuehrt.
- **Harte Obergrenze:** 11 Radien x 2 Fuellstufen (Disc) + 11 Radien (Ring) + 65 Laengen x 2
  (Strahl) = **163 Hazard-Canvases max**, unabhaengig von Spieldauer/Seed.

## K3 — Unit-Test (#11814, Commit fbd641c8)

`tests/hazard-tex-cap.test.ts` (8 Tests): Quantisierungstabellen, Toleranz-Guard (grobe <=
feine Quantisierung, Abweichung <= 16 px ueber 0..400/0..2000), 200 unterschiedliche Radien/
Laengen -> je <= 11 bzw. 65 Keys, Gesamt-Cap 163, Key-Stabilitaet (exists -> kein Re-Bake),
Stapel-Suffix `_s1` unveraendert.

Fremd-Datei (minimal): `tests/hazard-disc.test.ts` — 3 Key-Expectations auf die neuen reinen
Funktionen repointet (r60 -> `hazard_disc_r48`, Strahl 216 -> `l208`). Datei ist in
`claims.json` niemandem zugeordnet; Begruendung + Hinweis in `/home/ai/games/.dispatch/requests.md`
(2026-11-28T12:35Z). Masken-/Verhaltens-Assertions unveraendert.

## K4 — After-Lauf + Abnahme (#11815)

10-min-Lauf, identische Settings wie K1:

- **After: hazardKeysUnique = 15** (`r16`, `r16_s1`, `r64`, `r80`, `r96`, Ring dito,
  `l304`, `l320`, `l832` + Rims) — alle Keys auf dem 16-px-Raster, Nachbar-Keys verschmolzen
  (`r22`/`r24` -> `r16`, `r70`/`r74` -> `r64`, `l312` -> `l304`, `l840` -> `l832`).
- **Vorher 21 -> Nachher 15** im selben 10-min-Fenster; hart gebunden <= **163** — 0 ungebundenes
  Wachstum (neue Canvases ueber 10 min = 15 <= Cap-Grenze).
- Renderer: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`; jsErrors = 0.
- JSON: `~/games/.evidence/m10-hazard-tex-cap/m10-hazard-tex-cap-after.json`.
- Logs: `~/tmp/m10-hazard-tex-cap-k1.log`, `-k1b.log`, `-k4.log`.

Abnahme-Kriterien:

| Kriterium | Beleg | Status |
|---|---|---|
| tsc rc=0 | `npx tsc --noEmit` je Karte | PASS |
| npm test gruen inkl. neuer Test | 200 Dateien / 2233 Tests (12:32Z), davon hazard-tex-cap 8 | PASS |
| build rc=0 | `npm run build` vor K2-Commit | PASS |
| After-Lauf: neue Hazard-Canvases <= Cap | 15 <= 163 (`after.json`) | PASS |
| Warn-Disc-Lesbarkeit (Tier-Regel) unberuehrt | Kein Diff an `DISC_DRAW_CAP_LOW`/Rim-Puls/Draw-Pfad; Masken bitgleich, nur Key-Raster grober | PASS |

## Offene Punkte

- Strahl-Laengen-Klemme bleibt 1024 (wie zuvor); laengere Strahlen gab es nicht.
- Die 1-px-Feinquantisierung der Warn-Geometrie in `Hazards.ts` (Sprite-Skalierung) bleibt
  unveraendert — nur die Texturgroesse folgt nun dem Raster.
