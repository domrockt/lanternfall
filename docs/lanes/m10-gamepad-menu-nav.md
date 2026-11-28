# Lane m10-gamepad-menu-nav — Gamepad-/Fernbedienungs-Navigation auf Widget-Ebene

Ziel (Dom-Freigabe 2026-11-28 06:00Z, „Meta-Gold/Shop + Gamepad" Punkt b): Gamepad-Navigation in
allen Menüs. Diese Lane baut den **Kern auf Widget-Ebene** (src/ui/menu.ts, src/ui/options-menu.ts).
Szenen-Wiring (Title/CharSelect/Pause/Results/Credits) ist ein **separater Folgejob** — Szenen-Dateien
werden hier bewusst NICHT angefasst.

## K1 — Befund: Wie erreicht Gamepad-Input heute die Menüs?

**1. Snapshot-Erzeugung — src/input/Gamepad.ts (74 Zeilen)**
- `snapshotFromPad()` (Z. 15–30): Pad (Phaser-Plugin oder Browser-API) → reiner
  `GamepadSnapshot { axes, buttons }` aus `InputState.ts` (Z. 75–78). Defensiv: fehlende
  Achsen/Buttons → 0/false.
- `readNavigatorGamepad()` (Z. 33–45): erstes verbundenes Pad aus `navigator.getGamepads()`
  (frischester Stand, funktioniert in Tests via gemockter API).
- `readSceneGamepad(scene)` (Z. 53–74): Browser-API bevorzugt, Phaser-Gamepad-Plugin
  (`scene.input.gamepad.pad1..4`) als Fallback.

**2. Aktionen — src/input/InputState.ts**
- `readGamepadMoveActions()` (Z. 285–307): A(0)=confirm, B(1)=back, Start(9)=pause;
  D-Pad 12/13/14/15 = up/down/left/right; Stick-Achsen 0/1 mit `PAD_DEADZONE = 0.18`
  wirken zusätzlich als Richtungen.
- `InputState.update()` (Z. 338–367): meldet Aktionen **nur als Rising-Edge**
  (`held && !previous`, Z. 359–365). **Kein Repeat/Debounce**: gedrückt gehaltene
  Richtung feuert genau einmal. `allActionsReleased()` (Z. 309–317) dient Szenen als
  „Pad wieder scharf"-Gate nach Szenenwechsel.

**3. Fokus — src/ui/menu.ts (Widget-Ebene)**
- `MenuButton` (Z. 7–15): Fokus/Hover über `setFocused(value)` (Z. 107–110);
  Sichtbarkeit über `menuButtonVisual()` (Z. 41–48): focus||hover||pressed → Lanternfarbe +
  1-px-Rahmen, pressed zusätzlich `BUTTON_PRESSED_ALPHA = 0.72` (Z. 18).
- Hover kommt **ausschließlich vom Pointer** (`hit.on("pointerover")`, Z. 91) — Gamepad
  hat auf Widget-Ebene bislang **keinen eigenen Fokus-Pfad**; es gibt kein
  `moveFocus/confirm/back` und kein Repeat.

**4. Belege: Szenen setzen Fokus selbst (Duplikat-Code, der später auf die neue API umstellt)**
- `Title.ts` Z. 223–238: `pad.update({gamepad: readSceneGamepad(this)})` → eigene
  `selected`-Arithmetik + `refreshButtons()` → `b.setFocused(i === selected)` (Z. 258–260).
  Options-Overlay: `this.options.handlePad(a)` (Z. 228).
- `Results.ts` Z. 211–227: identisches Muster (Zwei-Knopf-Menü).
- `CharSelect.ts` Z. 122: Pad-Actions, Start-Knopf via `setFocused(true)` (Z. 94).
- `Credits.ts` Z. 93, Back-Knopf `setFocused(true)` (Z. 75).
- `UI.ts` (Pause/Shop) Z. 901–916: eigenes `handlePad` + `pauseButtons`-Fokus (Z. 639–650);
  Shop-Zeilen Z. 1148–1153. Options: `options.handlePad(a)` (Z. 906).

**5. Options-Menü — src/ui/options-menu.ts (bereits pad-tauglich, aber ohne Repeat)**
- `handlePad(actions)` (Z. 173–194): back/up/down/left/right/confirm vorhanden; 7 Zeilen
  (`OPTION_ROWS` inkl. MASTER MUTE als letzte Wert-Zeile), ZURÜCK = letzte Zeile.
- Wiederholung beim Halten fehlt (Rising-Edges), und „ein Pad-Frame = eine Aktion"
  ist implizit, nicht abgesichert.

**Lücke (diese Lane):** Widget-Ebene hat keine Fokus-API (moveFocus/confirm/back), kein
Repeat-Debounce (~200 ms Erstwiederholung, ~100 ms Folgerepeat) und keinen Test/Harness für
Sackgassen/Doppel-Events. Szenen duplizieren Fokus-Arithmetik und warten auf den Folgejob.

## Karten

| Karte | Inhalt | Status |
|---|---|---|
| K1 (#9097, Commit 7f06c21) | Befund (Abschnitt oben) | done |
| K2 (#9098, Commit 2b36dce) | menu.ts: `press()`, `MenuFocus` (moveFocus/setIndex/confirm/back), `menuRepeatTick` (200/100 ms, driftfrei) + 9 Tests | done |
| K3 (#9099, Commit e145493) | options-menu.ts: `handlePadFrame(a, nowMs)` — Repeat für up/down/left/right, Confirm/Back nur Rising-Edge, Reset bei open/close, Priorität back > up > down > left > right > confirm → **ein Pad-Frame = eine Aktion**; 7 weitere Tests (16 gesamt) | done |
| K4 (#9100, Commit 22e204a) | tests/gamepad-nav.test.ts (16 Tests) + scripts/m10-gamepad-nav.mjs: Harness mit synthetischem Pad (gemocktes `navigator.getGamepads`), 15/15 PASS, **0 Sackgassen, 0 Doppel-Events** | done |
| K5 (#9101) | After-Belege + .lane-done | done |

## Ergebnisse / Messwerte

- **Widget-Ebene (neu, K2/K3):**
  - `MenuFocus`: Fokus-Kreis über `MenuButton`-Listen, visualisiert wie Hover
    (Lanternfarbe + 1-px-Rahmen via `setFocused`); `confirm()` feuert genau ein Event
    (Knopf-`onClick` via neuem `press()`), deaktivierte Knöpfe sind No-Ops.
    `BUTTON_PRESSED_ALPHA`/`ButtonVisualState`/Maus-/Touch-Pfade unangetastet (AE=0).
  - `menuRepeatTick`: Press-Flanke sofort, Erstwiederholung nach 200 ms, Folgerepeat 100 ms,
    driftfrei (`lastFireMs += interval`); drückt man neu, feuert es sofort wieder.
  - `OptionsMenu.handlePadFrame(actions, nowMs)`: Repeat-fähiger Pad-Pfad auf Widget-Ebene,
    Confirm absichtlich KEIN Repeat-Kanal (Toggles sollen beim Halten nicht durchschalten).
    `handlePad()` delegiert (Bestandspfad bleibt kompatibel).
- **Harness (K4):** `node scripts/m10-gamepad-nav.mjs` → 15/15 Checks PASS,
  0 Sackgassen, 0 Doppel-Events, keine JS-Fehler. Geprüft: Titel-Fokus, Options öffnen,
  alle 7 Zeilen inkl. Wrap, alle 6 Wertzeilen left/right änderbar, MASTER MUTE toggle +
  Persistenz (A7) in `lanternfall-options-v1`, ZURÜCK per Confirm und B-Knopf,
  ein Press = genau eine Zeile (auch 250 ms halten).
- **Tests/Build:** `npx tsc --noEmit` grün; `npm test` 146 Files / 1538 Tests grün;
  `npm run build` grün.

## Belege (`~/games/.evidence/m10-gamepad-menu-nav/`)

- `m10-gamepad-nav.json` — Harness-Report (15/15 Checks, 0 Sackgassen, 0 Doppel-Events)
- `m10-gamepad-nav-options-zeile0.png` — Optionsmenü, Zeile 0 MUSIK per Gamepad fokussiert
- `m10-gamepad-nav-options-master-mute.png` — MASTER MUTE (Zeile 4) per Gamepad fokussiert/änderbar

## Offene Punkte / Bedarf

1. **verify-menus 14/15 (Skalierungs-Check):** Der Check „Skalierung 2X gestellt, Fit-View
   zentriert" (erwartet 720x540, gemessen 960x540) schlägt **bereits an der Branch-Basis
   f1c3057 ohne jegliche Lane-Änderung fehl** (nachgewiesen: Basis-Build + verify:menus 2×,
   identischer Fehler). Keine Regression dieser Lane; die 14 anderen Checks (Maus-/Touch-Pfade,
   Persistenz) sind PASS und verhalten sich mit/ohne Lane-Änderungen gleich. Bedarf ist in
   `~/games/.dispatch/requests.md` gemeldet (Zuständig: View-/Scale-Lane).
2. **Szenen-Wiring (Folgejob):** Title/CharSelect/Pause/Results/Credits nutzen die neue API
   noch über ihre eigenen `selected`-Pfade (Befund K1 Abschnitt 4). Umstellung auf
   `MenuFocus` + `handlePadFrame` (Repeat beim Halten auch im Titelmenü) ist der geplante
   Folgejob — Szenen-Dateien hier bewusst nicht angefasst.

## Abnahme (Ist)
- verify-menus: 14/15 — der eine FAIL ist basisseitig (Punkt 1 oben), durch Lane-Änderungen unverändert.
- npm test + tsc: grün (1538 Tests).
- Harness: jede Menü-Zeile per Gamepad erreichbar/bedienbar, 0 Sackgassen, 0 Doppel-Events. ✔
- Master-Mute-Persistenz wie heute (A7): Harness-Check PASS. ✔

