# Lane m10-gamepad-charselect-start (2026-11-28)

## Auftrag
Befund B1 (Major) aus `docs/lanes/m10-sightprep-smoke.md`: Gamepad-Start aus
CharSelect warf zum Titel zurück; `npm run verify:input` FAIL 11/12 (Checks
später auf 29 erweitert) und blockierte den Input-Gate der Abnahme-Basis.

## Karten
- #10414 Fix: Pad-Startfokus Reihe 0 + row-0-confirm startet Run — **done**
- #10415 Regressionstest `tests/gamepad-charselect-start.test.ts` — **done**
- #10416 Gates (verify:input 2× PASS, tsc, npm test, Belege) — **done**

## Ursache (wie im Briefing diagnostiziert, bestätigt)
- `src/scenes/CharSelect.ts`: Pad-Startfokus war Knopfreihe — `padRow = 1`
  (create) + `buttonFocus.setIndex(1)` auf `footerButtons = [back, start]`.
- D-Pad-rechts (Button 15) wrappte in Reihe 1 `1 -> 0` = ZURÜCK; A (confirm,
  `buttonIndex === 0`) löste `action "back"` → Titel aus.
- Harness-Erwartung (`runGamepadSuite`): d-right wählt Kael (Reihe 0), A
  startet den Run — Druckfolge war korrekt, der Fix lag in der Szene.

## Fix (Karte #10414, Commit 9f7aa4b1)
Nur `src/scenes/CharSelect.ts`:
1. Startfokus `padRow = 0` (Charakter-Panel) statt 1.
2. `charSelectPadNav`: Confirm in Reihe 0 → `action "start"` (wählt den
   fokussierten Charakter und startet — `pick`-Zweig entfernt,
   `CharSelectAction = "start" | "back" | null`).
3. d-left/d-right wechselt damit IMMER den Charakter (Wrap in Reihe 0 läuft
   über die Charaktere, nie in die Knopfreihe).
4. "back" bleibt erreichbar: B-Knopf (`back`) in beiden Reihen; oder `down`
   in die Knopfreihe, `left` auf ZURÜCK, A. Maus/Tastatur unverändert.

Zusätzlich `scripts/verify-input.mjs`: WebGL-Renderer-String wird je Lauf
erfasst (Konsole + JSON `webglRenderer`), Argus-Belegregel.

## Regressionstest (Karte #10415, Commit 6a0be0ac)
- Neu: `tests/gamepad-charselect-start.test.ts` — Harness-Druckfolge als
  reine Nav-Kette: Startfokus Reihe 0, d-right → charIndex 1 (Kael), A →
  `start`; d-left wrappt nicht in die Knopfreihe; Negativfälle: back via
  B-Knopf und via down→left→A auf ZURÜCK erreichbar.
- Angepasst: `tests/gamepad-nav-scenes.test.ts` (⚠ Datei außerhalb des
  Disponenten-Claims, minimal und unvermeidbar — Begründung: der Nav-Vertrag
  selbst hat sich geändert (Startzustand Reihe 0, row-0-confirm = start),
  die alten Assertions prüften genau den defekten Vertrag „pick, NICHT
  start“). Nur Assertions/Testnamen, keine Logik.

## Gates / Belege (Karte #10416)
Belege in `~/games/.evidence/m10-gamepad-charselect-start/`:
- `verify-input-baseline-FAIL.log` — Baseline vor dem Fix: FAIL 11/12
  (Timeout beim Warten auf die Run-Szene, reproduziert B1).
- `verify-input-run1.log` / `verify-input-run2.log` — nach dem Fix zweimal
  hintereinander **PASS 29/29**, rc=0.
- Renderer-String je Gate-Lauf (beide identisch, gültig, kein SwiftShader):
  `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
- `m10-verify-input-{baseline,run1,run2}.json` inkl. `webglRenderer`.
- `npx tsc --noEmit` rc=0; `npm test` 172 Dateien / 1856 Tests grün.

## Abgrenzung
- Keine Änderungen an `src/ui/menu.ts` (Lane m10-menu-quality-55) oder
  `src/scenes/UI.ts` (Lane m10-boss-name-legibility). Befund B1 war alt
  (git diff 45c198d..HEAD zu CharSelect.ts war leer) — kein frischer
  Regressionsschaden, aber Gate-Blocker; damit behoben.
