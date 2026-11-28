# Lane m10-evo-element-guard — Evo-Element-Regression-Guard

Ziel: Doms Evo-Regel (02:00Z, Optik-Abnahme 10:00Z) als automatischen Guard sichern:
**"Element muss auf einem Standbild ohne Beschriftung erkennbar sein."**
Der Guard verhindert, dass künftige FX-/Depth-Änderungen (blend-band-followup,
warmup-Chunks, …) die Element-Identität stumm verschlechtern. Kein FPS-Tor (Standbilder).

## Karten

| Karte | Inhalt | Commit |
|---|---|---|
| K1 (#13384) | Probe `scripts/m10-evo-element-guard.mjs`: je Evo ein eingefrorener Standbild-Frame (640x360 + 960x540), 12 PNGs + `shots/m10-evo-element-guard.json` | 5b870f96 |
| K2 (#13385) | Farb-Signaturen + kalibrierte Schwellen, 6/6 GREEN im Verifikationslauf | 63b89dee |
| K3 (#13386) | `tests/evo-element-guard.test.ts` (6 Tests), Suite 233 Dateien / 2521 Tests grün, tsc rc=0, Build ok | 73887835 |
| K4 (#13387) | Diese Doku + `.lane-done` | — |

## Messaufbau

- `scripts/m10-evo-element-guard.mjs` (Muster: m10-boss-fx-contrast.mjs / m10-evo-fx-*.mjs):
  Seed 7, `?debug=1`, god mode, autoPlay aus, Level-Ups suppressed, Teleport 2048/2048,
  `addWeapon(<evo>, 8)`, 20 lebende Gegner (12 mudling + 8 bog_rat).
- Warten bis die Evo-Signatur live sichtbar ist (FX-Keys **und** Live-Sprites gelesen —
  kein Blind-Shot; `orb_soul`/Projektile sind keine FX-Keys, daher Doppel-Prüfung).
- **Standbild:** `window.__game.scene.pause("run")` → Screenshot → resume. FX-Update und
  Kamera stehen, Rendering bleibt — stabiler Frame.
- Signatur: nearest-Palette-Histogramm (32 Farben aus `src/palette.ts`) im Spieler-Crop
  (±42 % Breite / ±38 % Höhe um die Canvas-Mitte), je Evo 2 Aufloesungen → 12 Belege:
  `shots/m10-evo-element-<evo>-{640,960}.png`.
- **iGPU-Pflicht:** Renderer-String via `window.__lf.rendererInfo()` (eigene Erfassung;
  `scripts/lf-renderer.mjs` war bei Lane-Start nicht gemergt). Gemessen:
  `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — gültig, kein SwiftShader.
  0 JS-Fehler in allen Läufen. Belege zusätzlich in `~/games/.evidence/m10-evo-element-guard/`.

## Signaturen und Schwellen (Element-Zuordnung Dom 02:00Z)

Signatur = **absoluter** Ziel-Farbband-Anteil im Spieler-Crop. Ort und Seed sind
deterministisch → Terrain-Anteil ist laufstabil; eine Verschiebung zeigt FX-/Licht-Regression.
Schwellen: **min = schlechtester Ist-Anteil über 2 Ist-Läufe × 0,4** (4 Dezimalstellen) —
absorbiert das beobachtete Freeze-Phasen-Rauschen (phoenix.fire schwankte ~2× durch
Sprite-Phase im Freeze-Moment) und fällt, wenn die Identität grob halbiert wird.

| Evo | Waffe | Ziel-Band (PAL-Indizes) | Ist-Anteile (640/960) | Schwelle | Urteil |
|---|---|---|---|---|---|
| Phönix (Feuer) | `phoenix` | fire 14–22, Kern 17–21 | fire 2,19–4,66 %, Kern 0,35–0,60 % | fire ≥ 0,0086, Kern ≥ 0,0014 | GREEN |
| Ewiger Winter (Frost) | `eternal_winter` | cold 5–10, hell 8–10 | cold 11,1 %, hell 4,15–4,19 % | cold ≥ 0,0444, hell ≥ 0,0165 | GREEN |
| Soulpyre (kalt-türkis) | `soul_beacon` | cold 5–10, hell 8–10+12–13 | cold 7,43 %, hell 1,52–1,56 % | cold ≥ 0,0297, hell ≥ 0,006 | GREEN |
| Gewittersiegel (Blitz) | `thunder_seal` | weiß 12–13 | 0,094–0,096 % | ≥ 0,0003 | GREEN |
| Zornpendel (Glut/Rot) | `wrath_pendulum` | Glut/Rot 14–17+23–26 | 5,16–5,19 % | ≥ 0,0206 | GREEN |
| Dornensturm (grüne Dornen) | `thorn_storm` | Grün 28–31 | 29,6–44,7 % | ≥ 0,1183 | GREEN |

Sonderregeln:
- **Soulpyre.noFire (max 0,06):** Umgebungsglut (Lantern/Terrain-Licht) liegt konstant bei
  ~4,5 % Feuer-Band (Referenz Gewittersiegel-Frame: 4,52 %) — Soulpyre-FX trägt sichtbar
  **kein** Feuer. max=0,06 fällt, wenn künftig Flammen-Farben in die Soulpyre-Signatur mischen.
- **Dornensturm-Raster:** Grid-CV (Variationskoeffizient der Grün-Pixel je Bildreihe) ≥ 0,1 —
  echte Dornen variieren (Ist 0,22–0,54), ein flächiges Raster-Overlay hätte ~0.
- Dornensturm.green ist Terrain-dominiert (Moor-Boden am fixen Ort) und sitzt deshalb bei
  40 % des schlechtesten Ist; trotzdem sensitiv, weil der Ort deterministisch ist.

## Befunde (Dora-Rohstoff — NICHT im Spielcode gefixt, FX-Dateien fremd)

1. **FX-Budget dimmt das Lantern-Licht, sobald eine Waffe feuert.** Ein waffenloser
   Referenz-Frame (gleiches Setup, gleicher Teleport, Freeze @1500 ms) ist systematisch
   **heller** als jeder Evo-Frame (Beleg: `~/games/.evidence/m10-evo-element-guard/crop-baseline.png`
   vs. `crop-phoenix.png`): die rechte Bildhälfte ist ohne Waffe hell ausgeleuchtet, mit
   Waffe dunkel. Ein Baseline-Differenz-Guard ist deshalb **nicht** ohne Weiteres brauchbar —
   die Differenz misst das Waffen-Licht-Budget, nicht die Element-Farbe. Hebel: im
   FX-/Quality-Regler (Frame-Budget) das additive Lantern-Licht vom Waffen-FX-Budget entkoppeln;
   danach könnte der Guard auf Differenz-Signaturen umgestellt werden (schärfer gegen
   Licht-Regressionen).
2. **Soulpyre-Identität trägt nur die Kalte-Halos** (`fx_halo_cold`, Pale-Mist/Bone-Band);
   der `orb_soul` war im Freeze-Moment nicht im Crop. Cold-Bright 1,5 % ist die kleinste
   Signatur der sechs Evo-Elemente — bei FX-Änderungen an soulpyre zuerst hier messen.
3. **Gewittersiegel-Weiß ist dünn** (0,094 %): die Zickzack-Blitze sind 1–2 px Linien.
   Schwelle 0,0003 ist bewusst knapp über dem Rauschen; wer das Blitz-Gewicht ändert,
   fällt hier zuerst durch.

## Reproduktion

```
node scripts/m10-evo-element-guard.mjs        # Standbilder + Signaturen + JSON (kein flock)
npx vitest run tests/evo-element-guard.test.ts # Guard-Suite
```

Kalibrierung neu: `CALIB=1 node scripts/m10-evo-element-guard.mjs` gibt Ist-Anteile +
Schwellenvorschläge aus (einmal laufen lassen, Werte übernehmen, Verifikationslauf).

## Offene Punkte

- Merge-Abnahme: 6/6 Signaturen GREEN auf main (in dieser Lane belegt; main-Check nach Merge).
- Befund 1 (Licht-Budget) als Fix-Job an Dora melden.
