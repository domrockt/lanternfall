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

## K3 — verify-input

(offen)

## K4 — Regressionstest

(offen)

## Abnahme

- Vorher: verify-input 28/28 PASS, 0 JS-Fehler (Belege in ~/.evidence, siehe K1)
