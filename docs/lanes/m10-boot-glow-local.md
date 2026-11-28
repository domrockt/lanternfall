# Lane m10-boot-glow-local

Ziel laut Briefing: Boot.ts registriert lokale Kopien `light_radius`/`vignette`
(createLightTextureLocal/createVignetteTextureLocal, Boot.ts ~21-93) VOR textures.ts und
verdraengt damit zur Laufzeit die harten Alpha-Stufen (LIGHT_EDGE_STEPS/vignetteSteps,
Commit eaf2ab6). Fix: Boot-Local-Block durch Import der textures.ts-Versionen ersetzen.

## K1 Befund/Repro (#8618) — Shadowing bestaetigt

Runtime-Probe (`scripts/m10-boot-glow.mjs`, Output `shots/m10-boot-glow-before.json`,
Playwright/Chromium, Run gestartet, Warmup abgewartet, Quell-Canvas beider Texturen
Pixel-fuer-Pixel gegen zwei Referenz-Renderings verglichen):

| Textur | vs Boot-Local-Rendering | vs textures.ts-Rendering (main) | Gewinner |
|---|---|---|---|
| light_radius 192x192 | maxDiff 1/255, mean 0.017 | maxDiff 78, mean 1.378 | **Boot-Local** |
| vignette 640x360 | maxDiff 1/255 | maxDiff 1/255 (Varianten identisch) | Boot-Local |

maxDiff 1/255 = Rundungsrauschen. Der Warmup ersetzt die Texturen NICHT
(exists-Guard in textures.ts) — d. h. solange Boot registriert, ist die
textures.ts-Version tot Code im Laufzeit-Pfad. Vorher-Shots (Minute-25-Chaos,
seed=1, god/autoPlay, Waffen Lv8 + Evos + Passives, skipTo 1490):
`shots/m10-boot-glow-before-640-360-1-m25-1.png` + `shots/m10-boot-glow-before-780-360-3-m25-1.png`
(je + 4x-nearest-Crop). Near-White-A7-Baseline: 0,4 % (640) / 0,27 % (780) — Gate 4,16 %.

## Blocker fuer K2-K4 (Befund, nicht Ausrede)

Der Briefing-Fix „Boot-Local-Block durch Import der textures.ts-Versionen ersetzen"
ist im aktuellen Base NICHT umsetzbar — drei harte Fakten:

1. **textures.ts exportiert die Creator nicht.** `createLightTexture`/
   `createVignetteTexture` sind module-privat (Zeilen 647/690), weder in main
   noch in eaf2ab6 (`git show eaf2ab6:src/gfx/textures.ts` — exportiert sind nur
   LIGHT_EDGE_STEPS, lightEdgeAlphaFor, vignetteSteps). Ein Import ohne
   Export-Zeile ist unmoeglich; textures.ts ist fremd geclaimed
   (m10-evo-fx-form-polish, claims.json) — der pre-commit-Hook (claimcheck.py)
   blockt jede Aenderung, das Umgehen ist verboten.
2. **eaf2ab6 ist nicht in main.** Nur auf Branch `m10-chaos-fix-raster-glow`
   (nicht gemerged, `git merge-base --is-ancestor eaf2ab6 main` = rc 1, auch
   nach `git fetch origin`). In diesem Base haben Boot-Kopie UND textures.ts
   noch die weiche destination-in-Kante — es gibt hier nichts hartes, das
   verdraengt werden koennte; die Acceptance „0 weiche Radialgradient-Reste im
   4x-Vergleich" ist in diesem Base fuer JEDE Implementierung unerreichbar.
3. **Die Boot-Kopie ist nicht 1:1 (trotz Kommentar).** Boot.ts traegt das
   B2-Tuning aus dem Chaos-Audit (m10-chaos-legibility): Rampen-Kern Richtung
   Amber/Lantern (Farben 20/21 ab r<=40), textures.ts main (UND auch eaf2ab6!)
   haben lanternWhite/glow im Kern (Farben 22/13 ab r<=40). Probe belegt die
   Differenz (maxDiff 78). Ein blinder Austausch wuerde das B2-Tuning
   zurueckdrehen und genau den Near-White-Fall (A7: r>=235) wieder erzeugen,
   gegen den das Chaos-Audit getuned hat — eaf2ab6 hat die B2-Ring-Farben
   NICHT uebernommen.

Fazit: Die Lane braucht ZUSAMMEN: (a) Merge von m10-chaos-fix-raster-glow in
main, (b) `export` fuer die beiden Creator in textures.ts (Claim-Inhaber oder
Merge-Owner), (c) Abgleich der Ring-Farben (B2-Kern Amber/Lantern muss in
textures.ts landen, sonst A7-Rueckschritt). Erst dann kann K2 die zwei Zeilen
really sein, die das Briefing meint.

## Status

- K1 (#8618): erledigt (Probe + Vorher-Shots + dieser Befund).
- K2 (#8619), K3 (#8620), K4 (#8621): blocked auf (a)-(c) oben;
  Bedarfsmeldung in ~/games/.dispatch/requests.md gestellt (2026-11-28).
- Kein `.lane-done` (Lane unvollendet, wartet auf Disponent/Merge-Owner).
