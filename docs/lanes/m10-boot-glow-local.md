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

## K2 rev. / K3 / K4 (Versuch 2, 2026-11-28) — Stufen in die Boot-Local-Kopien portiert

Versuch 2 startete mit unveränderten Blockern (eaf2ab6 weiterhin nicht in
origin/main, textures.ts weiterhin fremd geclaimed und ohne Exports — geprüft
per `git fetch origin` + claims.json). Statt erneut zu blockieren, wurde der
Scope innerhalb der Lane-Claims revidiert:

**K2 rev. (#8619, Commit 8e8dff4):** Die harte Quantisierung aus eaf2ab6 wurde
in die Boot-Local-Kopien PORTIERT (Boot.ts ist Lane-Claim, textures.ts wurde
nicht geändert und nur importiert/gelesen):
- `light_radius`: LIGHT_EDGE_STEPS-Band-Loop (5 Bänder ≥ 6 px, Alpha
  1/0.66/0.38/0.18/0.08, harte Kanten) statt destination-in-Radialgradient.
- `vignette`: vignetteSteps (11 Bänder à 20 px über r=70..290 + Ecken-Klemme
  0.72, Alpha-Treppe 0.02..0.72) statt Radialgradient.
- B2-Ring-Tuning bewusst erhalten (Kern Farbe 20/21 statt 22/13) — kein
  Near-White-A7-Rückschritt; Guard tests/chaos-glow-runpath.test.ts bleibt grün.

**K3 (#8620, Commit nach 8e8dff4):** tests/boot-light-textures.test.ts
(Quelltext-Checks nach Repo-Muster, Boot.ts ist nicht headless importierbar):
0 createRadialGradient/addColorStop, Tabellen exakt wie eaf2ab6, arc-Band-
Zeichnpfad, B2-Farben, exists-Guards. Suite 1447/1447 grün, tsc grün,
`npm run build` grün.

**K4 (#8621):** After-Lauf (`node scripts/m10-boot-glow.mjs --tag after`,
Playwright/Chromium, Minute-25-Chaos seed=1, god/autoPlay, Waffen Lv8 + Evos +
Passives, skipTo 1490):
- Runtime-Probe: light_radius maxDiff **0** (mean 0) gegen die gestufte
  Referenz; vignette maxDiff **1/255** (Rundung). Gegen die weiche Referenz
  maxDiff 255 bzw. mean 3.6 — d. h. **0 weiche Gradient-Reste zur Laufzeit**,
  `steppedWins=true` (shots/m10-boot-glow-after.json).
- Near-White-A7: 0,38 % (640x360) / 0,19 % (780x360@3) — Gate 4,16 % klar
  eingehalten (Vorher-Baseline 0,4 %/0,27 %).
- Shots: shots/m10-boot-glow-after-640-360-1-m25-1.png(+ -4x) und
  shots/m10-boot-glow-after-780-360-3-m25-1.png(+ -4x), lebende Gegner sichtbar.
- art-director: 1. Runde FAIL (Belege untauglich: Bänder im Chaos-Frame nicht
  ablesbar, Telegraphen-Overlay, keine eindeutig lebenden Gegner) → Belege
  neu erzeugt (siehe unten), Code dabei als korrekt befunden.
- HINWEIS rev.2: Der Probe-Vergleich dieses Laufs war für light_radius VAKUUM
  (leere Runtime-Textur matched jede leere Referenz mit maxDiff 0) — erst der
  rev.2-Lauf (unten) erbringt den echten Beleg. Near-White-Zahlen bleiben als
  Messwerte gültig; die Runde-1-Shots zeigen das Spielerlicht nicht (Textur
  leer) und sind durch die Runde-2-Belege ersetzt.

## K2 rev.2 — KRITISCHER BUGFIX (2026-11-28, Commit nach 00d658f)

Die Beleg-Arbeit deckte einen echten Bug auf, den sowohl der erste Port ALS
AUCH **eaf2ab6 selbst** enthält:

- `destination-in`-Fills SCHNEIDEN ihre Masken: Band 2 (Ring 70–76, Alpha
  0.66) löscht per Loch (src alpha 0) den Kern, den Band 1 erhalten hat.
  Nach allen 5 Bändern bleibt eine **vollständig transparente Textur**.
- A/B-Beweis im Browser (Probe-Diagnostik): destination-in + Einzeldisc
  erhält Inhalt (discKeep ok), gestapelte Band-Ringe ergeben überall 0.
- Folge: light_radius war seit K2 rev.1 (8e8dff4) zur Laufzeit UNSICHTBAR —
  und derselbe Code liegt in eaf2ab6: `createLightTexture` in
  m10-chaos-fix-raster-glow erzeugt eine leere Textur. Das ist dort nie
  aufgefallen, weil zur Laufzeit die Boot-Local-Kopie schattet und die
  lane-eigenen Tests nur Quelltext-Guards sind (`lightEdgeAlphaFor` ist rein
  und korrekt — nur der Canvas-Pfad ist falsch).
- **Warnung an die Merge-Owner** (requests.md): eaf2ab6 NICHT ungéprüft in
  main mergen — light_radius würde (sobald Boot konsumiert) unsichtbar.

Fix (rev.2): Stufen-Alpha wird PRO PIXEL auf den Ring-Stack multipliziert
(`getImageData`/`putImageData`, 192×192, semantisch = Band-Tabelle × Stack).
Tabelle unverändert; Vignette war korrekt (source-over-Bänder ohne
Composite-Trick). Guards: `destination-in` im aktiven Code verboten
(tests/boot-light-textures.test.ts). Suite 1447/1447, tsc/Build grün.

## K4-Belege, Runde 2 (art-director-Nachbesserung)

`node scripts/m10-boot-glow.mjs --mode evidence --tag after-evidence`:
Minute-3-Frame (vor MOORKÖNIGIN, kein Burst, kein LOD-Dimming), 8 gezielt
gespawnte bog_rat, DPR3:
- `shots/m10-boot-glow-after-evidence-evidence-780-360-3-m8.png` (+ center/
  corner-4x): Lichtpool mit Stufen um den Spieler, 14 lebende Gegner im/nahe
  dem Licht, Vignette über ruhigem Terrain.
- `shots/m10-boot-glow-after-evidence-evidence-light-radius-4x.png`:
  Kontaktbogen — Runtime-Textur (probe-validiert, maxDiff 0) direkt als
  4x-nearest Render über Mooston; die 5 Stufenbänder an r=70/76/82/88/96
  ablesbar.
- Nicht-vakuose Probe: `steppedWins` verlangt jetzt `centerAlpha > 0` UND
  maxDiff <= 2 (nach dem rev.2-Fix: light centerA 143, vignette 99);
  `shots/m10-boot-glow-after-evidence.json`.
- art-director-Urteil Runde 2: siehe Karten-Notiz #8621.

## Offener Punkt (Folgekarte, nicht lane-fähig)

Der ursprüngliche Briefing-Swap („Boot-Local-Block durch Import ersetzen")
bleibt richtig, sobald ZUSAMMEN: (a) m10-chaos-fix-raster-glow (eaf2ab6) in
main gemerged ist, (b) textures.ts die beiden Creator exportiert (Claim-
Inhaber m10-evo-fx-form-polish), (c) der Ring-Farb-Abgleich geklärt ist
(Boot-Kern 20/21 vs. textures.ts 22/13 — B2-Entscheid beim Merge-Owner).
Bis dahin läuft die Runtime mit der portierten Stufen-Version; der exists-
Guard macht einen Uebergangszustand (Export kommt, Import fehlt noch) harmlos.
Bedarfsmeldung in ~/games/.dispatch/requests.md bleibt bestehen.
