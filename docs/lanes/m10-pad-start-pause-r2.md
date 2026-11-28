# Lane m10-pad-start-pause-r2 (28.11.2026)

Nachfolger der versehentlich getöteten Lane m10-pad-start-pause (Disponent-Bug 06:47:40Z, 0 Agent-Läufe).
Ziel (Dom-Freigabe 06:00Z): Pause im RUN per Pad-Start/Options-Button (TV-Fernbedienung hat kein ESC),
 routed durch den bestehenden ESC-Dedup-Pfad `escToggleAllowed` (src/input/InputState.ts), 0 Doppel-Events.

## K1 — Ist-Befund: löst Pad-Start aktuell die Run-Pause aus?

**Befund: Ja, Pause per Pad-Start funktioniert auf aktuellem main — aber WITHOUT Dedup-Pfad.**

Code-Lage (main, f71c3be):
- Gamepad-Button 9 (Start/Options) → `readGamepadMoveActions()` setzt `a.pause` (InputState.ts:293) →
  `InputState.update()` flankengetriggert (rising edge) → `frame.actions.pause` →
  `Run.ts:459-462` ruft `this.togglePause()` → Pause.
- Touch-Pause läuft über denselben Frame-Pfad (`TouchControls`-Pulse → TouchSnapshot.pause →
  `readTouchActions` → `frame.actions.pause`).
- **Lücke:** der Frame-Pfad ruft `togglePause()` ohne Event auf — `window.event` ist dort null,
  `escToggleAllowed(null, …)` erlaubt immer. Der bestehende Dedup (gleicher timeStamp = derselbe
  physische Press) greift für Pad/Touch also NICHT; es gibt keine zweite Verteidigung gegen
  Doppel-Dispatch, falls die Quelle (Browser-Pad-Polling, WebView) je doppelt liefert.
- ESC-Pfad (UI.ts:1115 → `run.togglePause()` während DOM-Dispatch, `window.event` gesetzt) ist vom
  Fix unberührt; Portrait-Auto-Pause (main.ts:88) ruft ohne Event → `allowed` (bitgleich).

Beleg Vorher-Lauf (committet NICHT in git, liegt in ~/.evidence):
- `npm run verify:input -- --tag padstart-before` → **PASS 28/28**, u. a.
  „Gamepad: Start pausiert“, „Gamepad: Start im Optionsmenue hebt Pause nicht auf“,
  „Tastatur: ESC pausiert/setzt fort“ — 0 JS-Fehler.
- Artefakte: `~/games/.evidence/m10-pad-start-pause-r2/m10-verify-input-padstart-before.json`
  + 10 PNGs (u. a. `gamepad-pause-focus.png`).

Konsequenz für K2: Verhalten ist funktional korrekt, aber der Toggle muss in den bestehenden
Dedup-Pfad geführt werden (synthetisches Pad-Event → `escToggleAllowed`), damit „keine neuen
Toggle-Quellen ohne Dedup“ gilt. ESC-/Touch-Verhalten bleibt bitgleich.

## K2 — Fix

(offen)

## K3 — verify-input (Ergebnis)

Genau EIN neuer Fall: „Gamepad: Start-Start-Zyklus togglet genau einmal (Pause stabil, Start setzt
fort)“ — erster Start-Press pausiert; nach dem kompletten Press/Release-Zyklus muss die Pause noch
an stehen (ein Doppel-Toggle hätte sie sofort aufgehoben); zweiter Start setzt fort. Ergebnis:
**verify-input PASS 29/29**, 0 JS-Fehler, ESC-Fälle („ESC pausiert“, „ESC setzt fort“) grün.
Beleg: `~/games/.evidence/m10-pad-start-pause-r2/m10-verify-input-padstart-after.json` + PNGs.

## K4 — Regressionstest (Ergebnis)

`tests/pad-start-pause.test.ts` (12 Fälle, grün):
- `padToggleEvent`-Form; Dedup: gleicher ms-Floor → nur der erste Toggle erlaubt, neuer ts → erlaubt;
  ESC und Pad teilen den Dedup-Merker (ESC-Keydown mit Pad-ts wird abgelehnt → kein Doppel-Event im Mix);
  keyup/Repeat → nie; ev=null (Portrait) → immer; fremde Keys → immer, Merker unberührt.
- `InputState`: gehaltener Pad-Start feuert genau eine pause-Edge (10 Frames halten → 0 weitere),
  Release ohne Edge, zweiter Press wieder genau eine Edge.
- `MOVE_SOURCE_PRIORITY` unberührt: touch > gamepad > keyboard, Deadzone-Remap unverändert,
  Pad-Start (Button 9) beeinflusst den Bewegungsvektor nicht.

## Abnahme

- verify-input: **PASS 29/29** (28 Bestand + 1 neuer Pad-Start-Zyklus-Fall), 0 JS-Fehler;
  ESC-Fälle („ESC pausiert“, „ESC setzt fort“) grün. Belege in ~/.evidence (vorher+nachher, siehe K1/K3)
- `npm test`: 154 Dateien / 1667 Tests grün (inkl. esc-pause-Bestand + pad-start-pause 12)
- `npx tsc --noEmit` grün, `npm run build` grün
- src/ui/menu.ts / options-menu.ts nicht angerufen; außerhalb der Disponent-Dateien nur .opencode/board.json (Board-Buchung)
