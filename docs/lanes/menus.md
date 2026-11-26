# M6-Lane `menus` — Menüs & Meta

Stand: 2026-11-25, Branch `m6-menus`, Worktree `/home/ai/games/lf-lanes/menus`.

## Umgesetzt

- **Titel:** eigener Hintergrund/Logo, Menüknöpfe **START / OPTIONEN / CREDITS**
  (Tastatur: Pfeile/WASD + Enter, Maus/Touch; Shortcuts O/C), Bestwerte pro
  Charakter (Bestzeit, Best-Kills, Best-Level) aus `localStorage`.
- **Credits:** eigene Szene mit Rollen aus dem Team, Zurück per Knopf/ESC/Enter.
- **Charakterwahl:** beide 48×48-Porträts (2×), Namen/Titel, Stats **HP/TEMPO/
  RÜSTUNG**, Bonuszeile, **Startwaffe mit 16×16-Icon**, Meta-Zeile pro Char.
  Karten per Maus/Touch wählbar, START/ZURÜCK-Knöpfe, Tasten 1/2, Pfeile, Enter, ESC.
- **Pause:** Build-Übersicht mit Icons + Stufen aller Waffen (6/6) und Powerups
  (6/6), Fokus-Navigation **FORTSETZEN / OPTIONEN / AUFGABE**
  (Pfeile + Enter, Q für Aufgabe, Maus/Touch). Aufgabe beendet den Lauf mit
  Ergebnisgrund `giveup` (Results zeigt „AUFGEGEBEN / NIEDERLAGE“).
- **Options:** Musik, SFX, Screen-Shake, **Damage-Numbers**, **Skalierung**
  (AUTO/1X/2X/3X), ZURÜCK. Tastatur + Maus/Touch (`<`/`>` und Wert anklickbar),
  sofortige Anwendung und Persistenz in `lanternfall-options-v1`.
- **Results:** Sieg/Niederlage/Aufgabe, Zeit, Kills, Level, Schadenstabelle
  3×4 mit Icons, **NEUE RUNDE / TITEL** (Tasten 1/2, Pfeile, Enter, ESC, Maus),
  Meta-Rekord wird für ehrliche Läufe (ohne God-Mode) fortgeschrieben und als
  „NEUER BESTWERT: …“ angezeigt.
- **Skalierung:** ganzzahliges CSS-Vielfaches, AUTO = größtes passendes Vielfaches,
  Canvas per CSS-Flexbox zentriert (Phaser ohne CENTER_BOTH, keine
  Doppelzentrierung); 1X/2X/3X werden angefordert und bei kleinerem Viewport
  auf das größte passende Vielfache gekappt. `pixelArt`, `roundPixels`,
  `antialias:false` unverändert.
- **Eingabe-Robustheit:** ESC wird zentral in der UI-Szene verarbeitet, damit
  das Schließen des Pause-Optionsmenüs den Run nicht fortsetzt. Unsichtbare
  Input-Flächen (Options-Blocker, Pause-Knöpfe, Level-up-Karten) werden
  deaktiviert, statt Klicks zu schlucken. Level-up-Karten sind zusätzlich per
  Maus/Touch wählbar.
- **Damage-Numbers-Option:** `DamageNumberSystem.setEnabled(false)` blendet
  bestehende Zahlen aus und unterdrückt neue; wird pro Frame aus den Optionen
  gesetzt, kein Renderer-Umbau.

## Belege

- `node scripts/verify-menus.mjs` → **15/15 Checks PASS**, 0 JS-Fehler,
  Rohdaten `shots/m6-menus.json`. Enthalten: ESC schließt Pause-Optionen ohne
  Fortsetzen (`paused=true`), 1X-Skalierung exakt zentriert (480/270).
- Screenshots (alle mit Vision geprüft):
  `shots/m6-menus-title.png`, `-options.png`, `-credits.png`, `-charselect.png`,
  `-pause.png`, `-options-pause.png`, `-results-defeat.png`, `-results-victory.png`,
  `-title-meta.png`, `-options-changed.png`, `-options-open-final.png`,
  `-options-reload-menu.png`.
- Getestete Mauspfade: Titel-Buttons, Char-Karten/START, Pause-Optionen,
  Options-Zeilen (`<`/`>`/Wert), Results NEUE RUNDE/TITEL, Credits ZURÜCK.
- Getestete Tastaturpfade: Titel (Pfeile/Enter/O/C), CharSelect (1/2/Pfeile/Enter/ESC),
  Pause (ESC, Pfeile + Enter für Aufgabe, Q), Options (Pfeile/Enter/ESC/O),
  Results (1/2/Pfeile/Enter/ESC).
- **Options-Reload:** vor Reload `{music:0.7, sfx:0.8, shake:false,
  damageNumbers:false, scale:1}` → nach Reload identisch; der Reload-Screenshot
  zeigt 1X zentriert mit denselben Werten.
- Meta: Kael nach zwei Läufen `runs:5, victories:2` (Startwerte injiziert,
  echte Läufe danach fortgeschrieben); Titel/CharSelect zeigen die Zeilen.

## Messwerte (dieser Rechner)

- `npm run build`: grün (tsc + Vite).
- `npm test`: **132 Tests grün**, davon 9 neue M6-Tests für Optionsfelder/
  Skalierung/Meta; Font-Test deckt jetzt auch die `·`-Glyphe ab (vorher hätte
  die Meta-Zeile „?“ gerendert).
- `node scripts/verify-menus.mjs`: 15/15 Checks, 0 JS-Fehler.

## Bewusste Grenzen / offene Punkte

- Meta speichert nur Bestzeit, Best-Kills, Best-Level, Siege und Runs pro
  Charakter; kein Gold/Shop (gehört nicht zu M6 `menus`).
- God-Mode-Läufe werden nicht als Bestwert gespeichert (Results zeigt den Hinweis).
- Der Sieg-Screenshot nutzt `window.__lf.skipTo(1700)` + `finishRun("dawn")`
  (Debug nur mit `?debug=1`), um den Dawn-Results-Screen ohne 30-Minuten-Lauf
  zu belegen; die echte 30-Minuten-Schleife ist aus M5/fullrun unverändert.
- Menüs haben keine eigenen Klick-Sounds (Sound-Scope M5, keine neue Asset-Klasse).
- Credits sind statisch (Rollenliste), kein Scroll-/Lauftext.
- Keine Gamepad-Unterstützung; Tastatur + Maus/Touch sind vollständig.

## Lane-Abgrenzung

- Keine Änderungen in `src/data/**` (keine Balance-Werte), keine Renderer-/
  Performance-Umbauten. `src/systems/DamageNumbers.ts` erhielt nur den
  `setEnabled`/`clear`-Schalter für die Option.
- `index.html` wurde minimal ergänzt (Flex-Zentrierung + `overflow:hidden`),
  damit die Option „Skalierung 1X/2X/3X“ das Canvas ganzzahlig zentriert.
- GAME.md bleibt gemäß Lane-Regel unverändert; dieser Bericht wird beim Merge übernommen.
