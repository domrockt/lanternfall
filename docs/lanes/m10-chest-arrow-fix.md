# Lane m10-chest-arrow-fix — Chest-Arrow Re-Abnahme-Befund (5/10 FAIL bei 640×360)

Stand: 2026-11-27, Lane-Branch `m10-chest-arrow-fix` (Worktree `lf-lanes/m10-chest-arrow-fix`)

## Ausgangslage

Nachabnahme C befundete (`shots/qa-reaccc-chest-arrow.json`): Re-Lauf von
`scripts/m10-chest-arrow.mjs` failt 5/10 Cases bei 640×360 (top/bottom/tl/br +
disappear: `visibleAtSpawn=false`, Winkelfehler 90–180°, Positionsfehler
312–355 px), 780×360 PASS. Der frühere Lane-PASS (17:52Z) stammte aus der
SwiftShader-Ära; Verdacht war eine echte Regression durch einen der
Drain-Merges (m10-view-width-cap, m10-ground-props-batch).

## Karte K1: Repro (Commit 73b52d5)

`scripts/m10-chest-arrow-repro.mjs` = Case-Identischer Re-Lauf (10 Cases je
Format) mit erweiterter Diagnostik: Kamera-Rohdaten pro Sample
(scrollX/Y, worldView, width/height, zoom, `__rbDbg.scale`, Canvas-Buffer),
Live-Gegenrechnung `run.chests.computeArrowLayout(cam, chest)` im selben
Frame, und **zwei** Sampling-Wege:

- **raf** — wie das alte Baseline-Skript: `requestAnimationFrame`-Kette.
- **post** — `POST_UPDATE`-Event der Run-Szene: Zustand direkt nach
  `ChestSystem.update()`, also genau das, was der folgende Render zeigt.

Ergebnis (`shots/m10-chest-arrow-fix-repro.json`, Vorher-Lauf):

| Format | post (massgebend) | raf (Alt-Methode, ohne `disappear` = 9 Cases) |
|---|---|---|
| 640×360@2 | **10/10 PASS**, max. 0,08° | 3/9 FAIL (left 29,36°, bottom 180°, tr 94,58°) |
| 640×360@3 | **10/10 PASS** | 5/9 FAIL (90°/132,71°/180°) |
| 780×360@3 | **10/10 PASS** | 6/9 FAIL (24,78°/90°/96,65°/180°) |

Summe 14/27 FAIL-Signaturen des Alt-Samplings (Korrektur gegenüber der
Kartennorm in Commit 73b52d5, dort „13/30" — disappear hat keinen rAF-Pfad,
Zählung war aus dem ersten Diagnose-Lauf übernommen).

Zusatzlauf mit gepinntem Render-Budget-Teiler 2
(`shots/m10-chest-arrow-fix-repro-rbscale2.json`, Kamera dann 320×180 mit
Zoom 0,5 statt 640×360/1): **ebenfalls 30/30 PASS** auf post.

## Karte K2: Ursache — Messartefakt im Probe-Harness, NICHT ChestSystem

**Befund:** Die FAILs des Re-Abnahme-Laufs sind ein Sampling-Artefakt des
Messskripts. Das Spielverhalten ist in allen 3 Formaten und beiden
Render-Budget-Stufen korrekt.

**Mechanismus (belegt aus den diag-Rohdaten, alle FAIL-Samples sind `i=0`):**

1. `scripts/m10-chest-arrow.mjs` sampelt per `requestAnimationFrame`-Kette
   (dort: `const samples = await page.evaluate(...)` mit `step()`/rAF,
   Zeilen 79–94 im Skript-Stand von PIN 43fd9eb). Das Playwright-`evaluate`
   für Spawn/Teleport landet irgendwo im Frame — empirisch **nach** dem
   Phaser-Step, **vor** dem Sampling-rAF desselben Ticks.
2. Der erste Sample zeigt damit den Zustand **vor** dem nächsten
   `ChestSystem.update()`:
   - Nie-aktualisierte Spawn-Defaults (`visible:false, x:0, y:0, rot:0`;
     Fall `left`, 640×360@2) oder
   - die Richtung des **Vorgänger-Falls** (Fall `bottom`, 780: Arrow auf
     (390, 24) rot −90° = `top`-Richtung → Winkelfehler exakt 180°; Fall
     `tl`, 640×360@3: 132,71° = exakt der Winkel zwischen `bottom`-Richtung
     90° und erwarteten −137,3°).
3. Ab Sample 2 läuft alles korrekt: in ALLEN FAIL-Fällen war `i=0` das
   einzige verletzte Sample (`diag` der Runs enthält nur `i=0`-Einträge),
   und die Live-Gegenrechnung `computeArrowLayout` im selben Sample liefert
   bereits die erwartete Position (`liveX:24, liveAngleDeg:180` bei Fall
   `left`). Der vermessene "falsche" Zustand war nie auf dem Bildschirm —
   er wurde vor dem Sample gerendert-ersetzt bzw. stammt aus dem
   Spawn-Tick, in dem Phaser noch nicht erneut gerendert hat.
4. Der Rückrechnungs-Modell im Analyse-Teil (scrollFactor-0 wird um die
   Kameramitte mit zoom skaliert) stimmt mit dem Verhalten überein —
   nachgewiesen auch für Zoom 0,5 (RENDER_SCALE 2, `enforceCameraProjection`
   in `src/config.ts:106-131`) und Zoom 1,14 (Boss-Intro-Puls, 12/12
   Samples sichtbar, 0° Fehler).

**ChestSystem-Verifikation (K3-Scope-Anpassung):**
`computeChestArrow` (`src/systems/ChestSystem.ts:62-88`) leitet
Pfeilposition/-winkel bereits vollständig aus der **echten Kamera-Transform**
ab: `camera.width/height` (Viewport), `camera.worldView.*` (sichtbarer
Weltbereich), `camera.zoom`; die Renderposition kompensiert die
Zoom-Skalierung der scrollFactor-0-Objekte (`ChestSystem.ts:82-87`).
Verifiziert für: Zoom 1, Zoom 0,5 (Buffer-Teiler 2), Zoom 1,14 (Boss-Puls),
640×360@2/@3 und 780×360@3 — max. Winkelfehler 0,1°, max. Positionsfehler
0,4 px (post-Sampling). **Kein fixer View-Annahme-Befund im Spielcode.**

**Konsequenz:** Der Fix liegt im Messpfad (`scripts/m10-chest-arrow.mjs`,
Sampling auf `POST_UPDATE` umstellen — nach Disponent-Freigabe, Request in
`/home/ai/games/.dispatch/requests.md`). `src/systems/ChestSystem.ts` wird
absichtlich NICHT geändert: Truhen-Inszenierung (m10-chest-reveal) und
Pfeilpfad bleiben unangetastet.

## Karte K4: Regressionsschutz

`tests/chest-arrow-fix.test.ts`: Viewport-Klemm-Invariante gegen die reine
Funktion `computeChestArrow` — Pfeil-Layoutpunkt liegt in beiden Formaten
(640×360, 780×360) und Kamera-Varianten (Zoom 1/0,5/1,14, Extrem-Kamerapositionen
an allen 4 Welträndern + 4 Ecken) vollständig im Viewport (≥ `CHEST_ARROW_MARGIN`
Einzug, 0 px ausserhalb) und zeigt zur Truhe. 4 Tests, gesamt 818/818 grün
(vorher 814), `npm run build` rc=0.

## Nachher-Beleg (Re-Lauf, Commit 79b0163)

`shots/m10-chest-arrow-fix-after.json` — massgebendes POST_UPDATE-Sampling:

| Format | Ergebnis | max. Winkelfehler |
|---|---|---|
| 640×360@2 (QA-Bedingung) | **10/10 PASS** | 0,08° |
| 640×360@3 | **10/10 PASS** | 0,08° |
| 780×360@3 (Abnahme-Stand) | **10/10 PASS** | 0,08° |

`disappear`: Pfeil verschwindet bei View-Eintritt (7 Inside-Samples,
0 sichtbar); `zoom1.14`: 12/12 Samples sichtbar am Rand. Screenshots:
`shots/m10-chest-arrow-fix-edge-640x360.png` (Pfeil am rechten Rand während
der Wirkung, Truhe off-screen) und `shots/m10-chest-arrow-fix-inside-640x360.png`
(Truhe im View, Pfeil aus; `insideShot.arrowVisible=false, inView=true`).
Kein SwiftShader-Vergleich — nur iGPU-Stand (Playwright/chromium, gleiche
Bedingungen wie der Befund-Lauf).

## Offene Punkte

1. `scripts/m10-chest-arrow.mjs` (QA-Skript, NICHT im Disponent-Bereich der
   Lane): rAF-Sampling weiterhin artefaktanfällig — ein Re-Lauf dieses
   Skripts kann pseudo-FAILs produzieren (Vorher-Lauf dieser Lane: 14/27
   FAIL-Signaturen des Alt-Samplings über alle Formate). Fix = Sampling auf POST_UPDATE der
   Run-Szene umstellen (Muster: `scripts/m10-chest-arrow-repro.mjs`,
   `SAMPLER`). Request liegt in `/home/ai/games/.dispatch/requests.md`
   (2026-11-27T23:10Z); bis zur Freigabe gilt der Re-Lauf über das
   Repro-Skript als massgebender Nachweis (identische 10 Cases/Kriterien).
2. Fremde Schreibvorgänge im Worktree beobachtet: `shots/m10-passive-math-*.json`
   nur mit neuem `generatedAt` (23:13:59Z) — parallel laufender Job, von der
   Lane nicht committet.

