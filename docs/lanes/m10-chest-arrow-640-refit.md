# Lane m10-chest-arrow-640-refit (2026-11-27)

Fix-Job zu Board-Karte **#5378** (m10-reacceptance-c-Folge: Chest-Arrow 640×360 Re-Lauf
FAIL auf PIN 43fd9eb — top/bottom/tl/br `visibleAtSpawn=false`, Winkelfehler 90–180°,
Positionsfehler 312–355 px, disappear: Pfeil bleibt sichtbar obwohl Truhe im View).

## Ergebnis

**Fall A eingetreten — Re-Lauf PASS 20/20, Karte #5378 geschlossen.**

| Lauf | Sampling | 640×360 | 780×360 | Beleg |
|---|---|---|---|---|
| Vorher (altes Harness) | rAF-Tick | 6/10 FAIL (left 29.36°, right/top/bottom 180/90/180°, tr 94.58°, disappear sichtbar) | 8/10 FAIL (zusätzlich bl 179.92°, br 96.65°) | `shots/m10-chest-arrow-refit-raf-before.json` |
| Nachher (aktueller main f4c6acf) | POST_UPDATE | 10/10 PASS | 10/10 PASS | `shots/m10-chest-arrow-refit-before.json` |

Nachher-Details: jsErrors 0, iGPU-Pflicht erfüllt — WebGL-Renderer-String im JSON:
`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`. disappear-Fall:
`visibleWhileInside=0`; insideShot: `arrow=false, inView=true`
(`shots/m10-chest-arrow-edge.png`, `shots/m10-chest-arrow-inside.png`).

## Ursache

**Messartefakt des Probe-Harness, nicht ChestSystem.** Das alte Sampling saß im
requestAnimationFrame-Kallback, der **unabhängig vom Phaser-TimeStep** läuft: bei
`fps.limit 60` skippt Phaser rAF-Ticks ohne Update/Render, das Sample zeigt dann den
letzten gerenderten (stale) Zustand — gemessen wird vor dem Step, bewertet wird aber,
als wäre es der Frame danach. Belege:

- `shots/m10-chest-arrow-refit-raf-before.json` (diese Lane): exakt die #5378-Signaturen
  (Rand/Eck-FAILs mit 96–180° Winkelfehler) **bei gleichzeitiger 0-Grad-Richtigkeit der
  POST_UPDATE-Werte** im selben Build.
- Schwester-Lane `m10-chest-arrow-fix` (`scripts/m10-chest-arrow-repro.mjs`,
  `shots/m10-chest-arrow-fix-repro.json`): rAF und POST_UPDATE parallel gesampelt —
  rAF 13/30 FAIL mit denselben Signaturen, POST_UPDATE 30/30 PASS, auch mit
  View-Width-Cap noch aktiv. ChestSystem korrekt inkl. Zoom 0.5/1.14
  (Regressionstests `tests/chest-arrow-fix.test.ts`).

Der Verdacht „View-Width-Cap“ (Karte m10-view-width-cap) ist damit **entkräftet**;
dessen Rückbau (merge m10-perf-cap-rollback, db473c7) war für diesen Befund nicht
notwendig. ChestSystem selbst wurde von dieser Lane **nicht** geändert.

## Änderungen

- `scripts/m10-chest-arrow.mjs`: alle 3 Sampler (Rand/Eck, Zoom 1.14, disappear) auf
  `POST_UPDATE` der Run-Szene umgestellt (Event `postupdate`, Abmelden nach n Samples);
  Report-Felder `sampling: "POST_UPDATE"` + `webglRenderer` je Format. Kriterien und
  Toleranzen unverändert (TOLERANCE_DEG 5, MARGIN 24, FAR 1500, je 10 Cases).
- `tests/chest-arrow.test.ts` (+2 Tests, 7/7 grün): Befund-Signaturen von #5378 als
  Invariante kodiert — top/bottom/tl/br bei 640×360/FAR 1500 sichtbar, Winkel ≤ 5°,
  Margin-Box; disappear-Verhalten an der 8-px-Einzugsgrenze.
- Board-Karte #5378 auf `done` mit Zahlen + Belegpfaden.

## Abnahme (Briefing-Kriterien)

- 10/10 Cases PASS auf 640×360 **und** 780×360 mit Renderer-String im JSON: ✅
- `npx tsc --noEmit`, `npm test`, `npm run build`: ✅ (einmal pro Karte vor Commit)
- Board-Karte #5378 done mit Beleg: ✅

## Offene Punkte

- Der Merge-Job nimmt `tests/chest-arrow-fix.test.ts` der Schwester-Lane mit; beide
  Test-Dateien ergänzen sich (Layout-Invariante vs. Viewport-Klemm-Invariante).
- Falls künftige QA-Harnesses Frame-Zustände prüfen: immer im Szenen-Event
  (`postupdate`/`render`) samplen, nie im freien rAF-Tick.
