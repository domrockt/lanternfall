# Lane `input` — M8: Touch-Steuerung + Gamepad (parallel zur M6-Abnahme)

Worktree `/home/ai/games/lf-lanes/input`, Branch `m8-input`. Bereich: neue Eingabeschicht
`src/input/` + Anbindung in `src/scenes/Run.ts` / `src/scenes/UI.ts` / Menü-Szenen und
`src/ui/options-menu.ts`. **Nicht** angefasst: Auflösung/Skalierung (`GAME_WIDTH/HEIGHT`,
`applyIntegerScale`), Balance, Grafik-Generatoren, `src/data/**`, `GAME.md`.
`src/main.ts` wurde nur um die Input-Konfiguration ergänzt (`input.gamepad: true`,
`activePointers: 4`), nicht um Skalierung.

## Steuerungsmatrix

| Aktion | Tastatur | Touch | Gamepad |
|---|---|---|---|
| Bewegen | WASD / Pfeile (digital, Diagonale = 1) | schwebender Joystick links, stufenlos, Totzone 12 % | linker Stick (Totzone 18 %) oder D-Pad |
| Bestätigen | Enter / Leertaste, 1–3 im Level-up | Tippen auf Knopf/Karte | A / Kreuz (Button 0) |
| Zurück | ESC (Pause/Options) | Tippen auf ZURÜCK/AUFGABE (bzw. Pause-Knopf) | B / Kreis (Button 1) |
| Pause | ESC | Pause-Knopf oben rechts (auch als 2. Finger bei aktivem Joystick) | Start (Button 9) |
| Menü-Navigation | Pfeile/WASD + Enter | Tippen | D-Pad/Stick + A, B |
| Truhe | Laufen darüber | Truhe antippen (≤ 220 px) oder Panel-Tipp | A auf dem Truhen-Panel |

## Architektur

- `src/input/InputState.ts` — reine, Phaser-freie Logik: radialer Deadzone/Rescale,
  Normierung, Diagonale, Quellen-Priorität **Touch > Gamepad > Tastatur** (erste aktive
  Quelle gewinnt, kein Mischen), D-Pad vor Stick, A/B/Start/D-Pad-Mapping,
  flankengetriggerte Aktionen (`InputState.update`), `reset()`.
- `src/input/TouchState.ts` — globaler Snapshot zwischen Touch-Overlay und Run.
- `src/input/TouchControls.ts` — schwebender Pixel-Joystick (Ring 44 px, Knauf 14 px,
  halbtransparent, Palettenfarben, Positionen ganzzahlig) am ersten Finger auf der linken
  Bildhälfte; Pause-Knopf 30×18 oben rechts; `canMove()` blendet beides in Pause/Level-up/
  Truhe/Options aus. Koordinaten über `canvas.getBoundingClientRect()` ×
  `scene.scale.width/height` (keine 480/270-Hardcodes außerhalb der Testkoordinaten).
  Mehrfinger: Joystick merkt sich seinen `identifier`, andere Finger werden nicht
  übernommen; `preventDefault` nur für den Joystick-Touch, damit Taps bei Phaser ankommen.
- `src/input/Gamepad.ts` — Snapshot-Adapter. Phaser-Gamepad-Plugin ist in `main.ts`
  aktiviert (Hotplug); der Adapter liest bevorzugt `navigator.getGamepads()` (frischester
  Stand, funktioniert auch mit dem Test-Mock) und fällt auf `input.gamepad.pad1..4` zurück.
- Menüs: `Title`, `CharSelect`, `Results`, `Credits` pollen Gamepad-Flanken in `update()`;
  `UI` bedient Pause, Options, Level-up und Truhe; `OptionsMenu.handlePad` spiegelt die
  Tastatur-Navigation. Ein `padArmed`-Gate verhindert, dass ein über einen Szenenwechsel
  gehaltenes A den nächsten Menüpunkt sofort bestätigt (erst nach Loslassen wieder scharf).
- `index.html`: `maximum-scale=1,user-scalable=no`, `touch-action:none`,
  `overscroll-behavior:none`, `user-select:none`, kein Tap-Highlight, kein Doppeltipp-Zoom.

## Abnahme / Messwerte (dieser Rechner, headless Chromium)

- `node scripts/verify-input.mjs`: **PASS, 25/25 Checks**, 0 JS-Fehler, JSON
  `shots/m8-input.json`.
  - Touch (Pixel-7-Profil: `hasTouch`/`isMobile`, Landscape 915×412): Menüs per Tippen
    bis in den Run; Joystick-Drag **x 2048 → 2119**; Pause per **zweitem Finger** bei
    aktivem Joystick; FORTSETZEN per Tippen; Level-up-Karten per Tippen (Loadout ändert
    sich); Truhe per Tippen übernommen; **64,4 s Spiel** nur per Touch-Gesten
    (Joystick-Drag + Level-up-Taps), Scene bleibt `run`; Results/Titel per Tippen.
  - Gamepad (gemocktes `navigator.getGamepads`, Hotplug erst nach Titel verbunden):
    A startet CharSelect; D-Pad rechts + A wählt **Kael** und startet; Stick bewegt
    **x 2048 → 2108**; getrenntes Pad bewegt **0 px** (2108 → 2108); Reconnect bewegt
    wieder (2127 → 2168); Start pausiert; B setzt fort; A bestätigt Fokus (Fortsetzen);
    Level-up und Truhe per A; Results per D-Pad+A zurück zum Titel. Fokus ist sichtbar
    (`shots/m8-input-gamepad-pause-focus.png`).
  - Tastatur-Regression: Pfeil rechts **x 2048 → 2101**, ESC pausiert/setzt fort.
- `npm run build`: grün. `npm test`: **168/168 Tests grün** (neu: 21 InputState-Tests in
  `tests/input.test.ts`: Totzone/Rescale, Normierung/Diagonale, Quellenpriorität,
  D-Pad>Stick, A/B/Start, Flanken press/hold/release/repeat, reset, defensive NaN/kurze
  Arrays).
- Shots: `shots/m8-input-{touch-menus,joystick-touch,pause-touch,levelup-touch,chest-touch,
  touch-run,touch-results,gamepad-run,gamepad-pause-focus,gamepad-levelup,gamepad-results,
  keyboard-run}.png`; alle gesichtet (Joystick + Pause-Knopf im Run, Fokus-Rahmen im
  Gamepad-Pause-Menü, Truhen-Panel mit „TIPPE ODER A = ÜBERNEHMEN“).

## Bekannte Grenzen / offene Punkte (ehrlich)

- Am Host ist **kein physisches Gamepad** angeschlossen; Hotplug/Achsen/Buttons wurden mit
  einem gemockten `navigator.getGamepads()` belegt. Das Phaser-Plugin ist aktiviert, der
  Adapter nutzt aber bewusst die frischere Browser-API (Plugin als Fallback). Ein Test auf
  echter Xbox-/PlayStation-/Android-TV-Hardware bleibt offen.
- `scripts/verify-menus.mjs` ist nach dem M6-final-Master-Mute nicht mehr aktuell (die
  Klick-Koordinaten für „Skalierung“ zeigen auf die verschobene Zeile); bei diesem Lauf
  **13/15** (Skalierung/1X-Zentrierung), die übrigen 13 Checks grün, 0 JS-Fehler. Das ist
  eine vorbestehende Testkoordinate außerhalb dieser Lane, keine Input-Regression;
  „Skalierung“ selbst funktioniert weiter über Optionen/Debug.
- Touch-Layout ist fest an die logische View gekoppelt (Joystick-Radius 44, Pause-Knopf
  oben rechts); bei einer späteren M8-display-Auflösungsänderung skalieren die Relativ-
  Koordinaten automatisch mit, die Radien sind aber konstante logische Pixel.
- Der Pause-Puls des Touch-Knopfs läuft über `scene.time` der UI-Szene; bei pausierter
  Szene kann er verzögert feuern, bleibt aber eine einmalige Flanke.
- Keine Gamepad-Glyphen, kein Rumble/Remap, kein Touch-Layout-Option; das bleibt späteren
  Karten vorbehalten.
