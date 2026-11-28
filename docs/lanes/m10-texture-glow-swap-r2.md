# Lane m10-texture-glow-swap-r2

Ziel laut Briefing: dreifacher belegter Rest aus m10-boot-glow-local — (1)
`createLightTexture`/`createVignetteTexture` in textures.ts exportieren und die
Boot.ts-Local-Kopie durch Import ersetzen, (2) destination-in-Masken-Bug in
createLightTexture fixen (gestapelte destination-in-Fills schneiden ihre
Masken; Fix = Stufen-Alpha pro Pixel, Referenz: Boot.ts rev.2), (3) B2-Ring-
Farb-Abgleich (Kern Amber/Lantern 20/21) in die textures.ts-Version.

Belege (JSON/PNG) liegen NACH `~/games/.evidence/m10-texture-glow-swap-r2/`
(Dom-Regel 27.11.: Belege sind keine Deliverables). Nur Abnahme-Bilder nach
`shots/abnahme/`.

## K1 (#11058) — Ist-Probe / Baseline

Probe `scripts/m10-boot-glow.mjs` um die Ist-Version von textures.ts (main)
als dritte Referenz erweitert (`RINGS_TEXTURES_MAIN`: Kern 22/13, weiche
destination-in-Kante — exakt der Quelltext in src/gfx/textures.ts). Lauf
(Playwright/Chromium, seed=1, Warmup abgewartet):

| Vergleich (light_radius 192x192) | maxDiff | meanDiff |
|---|---|---|
| Runtime (Boot-Local rev.2) vs Stufen-Referenz | **0** | 0 |
| Runtime (Boot-Local rev.2) vs textures.ts-Ist (weich, Kern 22/13) | **255** | 11.835 |
| Runtime vs weiche Kante mit B2-Ringen (vsSoft) | 255 | 10.555 |

vignette 640x360: vsStufen maxDiff 1/255 (Rundung), vsSoft maxDiff 255.
`centerAlpha` light 143 / vignette 99 (nicht-vakuose Texturen),
`steppedWins=true`. A7-Near-White-Baseline dieses Laufs: 0,47 % (640x360) /
0,20 % (780x360@3) — Gate 4,16 %.

JSON/PNG: `~/games/.evidence/m10-texture-glow-swap-r2/m10-texture-glow-swap-before.json`
(+ 2 Profile-Shots je + 4x-nearest-Crop).

Befund: Die beiden Implementierungen sind UNVEREINBAR (maxDiff 255 = weiche
Gradient-Kante + lanternWhite/candle-Kern vs. harte Stufen + B2-Kern). Der
Swap ersetzt also nicht nur Code-Zeilen, sondern muss (a) den Stufen-Fix und
(b) die B2-Farben in textures.ts tragen, sonst waere das ein doppelter
Rueckschritt (A7-Near-White + „Luftbrause"-Kante zurueck).

## K2 (#11059) — destination-in-Masken-Bug gefixt

createLightTexture in textures.ts: die weiche destination-in-Radialgradient-
Kante (und damit der eaf2ab6-Bug: gestapelte destination-in-Fills schneiden
ihre Masken, Band 2 loescht den Kern von Band 1 -> vollstaendig transparente
Textur) ersetzt durch den rev.2-Fix aus Boot.ts: Stufen-Alpha wird PRO PIXEL
auf den gestapelten Ring-Aufbau multipliziert (getImageData/putImageData,
192x192). LIGHT_EDGE_STEPS exakt wie eaf2ab6 ([0,70,1],[70,76,0.66],
[76,82,0.38],[82,88,0.18],[88,96,0.08]). createVignetteTexture: Radialgradient
ersetzt durch vignetteSteps (11 Baender a 20 px ueber r=70..290 + Ecken-Klemme
0.72), identisch zur rev.2-Referenz in Boot.ts.

Probe nach K2 (vor dem Boot-Swap, textures.ts noch geschaetzt durch den
exists-Guard): siehe K4-After-Lauf — massgeblich ist der Runtime-Beleg nach
K3, dort greift die textures.ts-Version wirklich.

## K3 (#11060) — Export + Boot-Swap + B2-Farb-Kern

- textures.ts: `export function createLightTexture/createVignetteTexture`,
  Ring-Tabelle auf B2-Kern umgestellt (r<=40: 21/21/21/20/20/20 statt
  22/22/13/13/13) — A7-Near-White-Schutz bleibt.
- Boot.ts: createLightTextureLocal/createVignetteTextureLocal und die
  Tabellen LIGHT_EDGE_STEPS/vignetteSteps entfernt, Import der
  textures.ts-Versionen; Aufrufe in createTitleTextures jetzt direkt die
  exportierten Creator. exists-Guard macht die Reihenfolge harmlos (Boot
  registriert, Warmup/ createAllTextures ueberspringt).

## K4 (#11061) — Test, Suite, Belege, Abschluss

- tests/boot-light-textures-w2.test.ts: Export-Kontrakt, kein
  createRadialGradient/destination-in im aktiven textures.ts-Code,
  LIGHT_EDGE_STEPS/vignetteSteps-Tabellen exakt, B2-Kern-Farben, Boot.ts
  importiert die Creator (kein Local-Duplikat mehr).
- After-Probe: `~/games/.evidence/m10-texture-glow-swap-r2/m10-texture-glow-swap-after.json`
- Suite: siehe Commit-Message.

## Hinweise

- Gen-Fx-Override (Argus 08:52Z): die 4 Shot-Keys (projectile_ember/ice,
  flail_ball, orb_lantern) stehen unter Runtime-Override aus gen-fx.ts — im
  textures.ts-Diff unangetastet gelassen, nicht zurueckgesynct.
- eaf2ab6 (m10-chaos-fix-raster-glow) ist in diesem Base NICHT in main — der
  Bugfix hier ist der Port des rev.2-Stands; sobald eaf2ab6 doch noch ankommt,
  ist der Fix in textures.ts bereits drin (Boot konsumiert textures.ts).
