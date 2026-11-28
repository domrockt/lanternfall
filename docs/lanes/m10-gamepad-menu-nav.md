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
| K1 (#8916) | Befund (dieser Abschnitt) | doing |
| K2 (#8917) | menu.ts Fokus-API + Repeat-Debounce | todo |
| K3 (#8918) | options-menu.ts Gamepad-Zeilen + Repeat | todo |
| K4 (#8919) | tests/gamepad-nav.test.ts + scripts/m10-gamepad-nav.mjs | todo |
| K5 (#8920) | After-Belege + .lane-done | todo |

## Abnahme
- verify-menus bleibt 15/15 PASS (Touch/Maus-Pfade bitgleich), npm test + tsc grün.
- Harness: jede Menü-Zeile per Gamepad erreichbar/bedienbar, 0 Sackgassen, 0 Doppel-Events.
- Master-Mute-Persistenz wie heute (A7).

## Belege
- (Pfade nach `~/games/.evidence/m10-gamepad-menu-nav/` folgen in K4/K5.)
