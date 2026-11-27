# Lane m10-chest-lock-touch — Truhen-Gesten-Sperre (M10)

Worktree `/home/ai/games/lf-lanes/m10-chest-lock-touch`, Branch `m10-chest-lock-touch`.
Bedarfsmeldung m10-input-qa (2026-11-27): 7/105 Touch-Checks FAIL "Sperre Truhe" — Touch-Gesten
sollen nicht ankommen, solange das Truhen-Panel offen ist (`TouchControls`-Regel: Gesten nur annehmen,
wenn Run läuft und nicht pausiert/Level-up/Truhe). Keine Optik-/Balance-Änderung.

## Karten

- [x] **K1 Repro** — `scripts/m10-chest-lock.mjs`: 7 Konstellationen + 3 Negativ-Checks per
      CDP-Touch (Pixel-7-Profil), pro Frame playerX/Stick/Truhe/Pause; JSON
      `shots/m10-chest-lock-baseline.json`. Commit `1eb94f9`.
- [x] **K2 Gate-Fix** — `src/input/TouchControls.ts`: Gate einmalig vor der Touch-Auswahl;
      `onTouchMove` verwirft die laufende Geste, sobald das Gate zufällt
      (`discardGesture`: Identifier weg, Stick aus, Bewegung null, Pause-Puls erhalten).
      TouchState/TouchControls-Schnittstelle unverändert. Commit `cfa7a36`.
- [x] **K3 Tests** — `tests/chest-lock-touch.test.ts`: 7 Konstellationen (C1–C7) + 4 Negativ-Checks
      als Unit-Tests mit Stubs statt Phaser. Commit `b66d773`.
- [x] **K4 Nachher + Doku** — `shots/m10-chest-lock-after.json` (`passed:true`, 7/7 + 3/3),
      Shots `m10-chest-lock-c1-drift.png` / `-c2-hold-open.png` / `-c7-new-gesture.png`, diese Datei.

## Wichtiger Befund: Die 7 FAILs der Bedarfsmeldung sind auf neuer Basis bereits geschlossen

Die Messung der Bedarfsmeldung (105 Checks, `shots/m10-input-profiles.json`) hat **Basis `f26dc4b`** —
vor dem Fix der Lane `m10-input-fix` (`3b49d41`), der die Truhen-Skip-Zone von `pointerdown` auf
`pointerup` umgestellt hat. Genau der dort dokumentierte Pfad (derselbe Touchstart schließt zuerst die
Truhe, danach akzeptiert `TouchControls` den Finger als Joystick) ist damit geschlossen:

- Baseline-Lauf dieses Commits (`1eb94f9`, neue Basis): **7/7 Konstellationen PASS, 3/3 Negativ PASS**
  → `shots/m10-chest-lock-baseline.json` (`passed:true`).

Die Lane hat trotzdem geliefert, was der Kartenplan verlangt: Gate für ALLE Gestenquellen geschlossen
und das Repro als regressionssicheres Skript + Unit-Tests fixiert.

## Die 7 Konstellationen (alle grün, vor UND nach K2)

| # | Konstellation | Erwartet | Baseline | Nach K2 |
|---|---|---|---|---|
| C1 | Touchstart bei offener Truhe + Drag halten (klassischer F1) | kein Stick, playerX konstant, Truhe bleibt offen | PASS | PASS |
| C2 | Joystick läuft, Truhe öffnet sich beim Halten | Bewegung stoppt sofort (0 px Drift) | PASS | PASS |
| C3 | Finger startet bei offener Truhe, bleibt über den Dismiss gehalten | kein Joystick nach Übernahme | PASS | PASS |
| C4 | Dash-Swipe (schneller Swipe) bei offener Truhe | keine Bewegung, kein Stick | PASS | PASS |
| C5 | Langzeit-Drift: 60 Frames Move-Versuche | 0 px, Stick nie sichtbar | PASS | PASS |
| C6 | Pause-Tap auf Pause-Knopf-Position bei offener Truhe | übernimmt nur die Truhe, kein Pause-Menü, kein Stick, 0 px | PASS | PASS |
| C7 | Kein Kleben: abgelehnter Finger bleibt tot, neue Geste startet sofort | alter Finger 0 px, neuer Touchstart bewegt | PASS | PASS |

Negativ-Checks (normale Gesten außerhalb der Truhe, keine Regression): N1 normaler Drag bewegt
(+20,1 px), N2 Pause-Tap pausiert, N3 nach Resume bewegt der Joystick wieder (+18,4 px). 3/3 PASS.

## Was K2 trotzdem geschlossen hat (echte Lücke, deterministisch belegt)

`TouchControls.onTouchMove` hatte **keinen canMove-Check**. Öffnet sich das Panel während einer
gehaltenen Geste, schrieb der Move weiter Bewegung in den Touch-Snapshot, bis `update()` im nächsten
UI-Frame die Geste verworfen hat — der Run liest den Snapshot aber pro Frame, d. h. es gab ein
Drift-Fenster von bis zu einem Frame (Spieler z. B. ~1–2 px bei 60 FPS, bei Frame-Jitter mehr).
Unit-Test C2 (`tests/chest-lock-touch.test.ts`) deckt genau das ab und schlägt gegen den alten Code fehl.
Zusätzlich prüft `onTouchStart` das Gate jetzt einmalig vor der Touch-Auswahl statt mitten in der
Schleife (Gate-Wechsel innerhalb derselben Geste können den Touch nicht mehr "durchslippen").

## Harness-Lektion (für künftige Touch-Messungen)

1. **Truhen-Auto-Finish**: `UI.onChestOpen` plant `finishChest()` bei `1650 + rewards*220` ms; der
   Dismiss per Tasten/Tipp entfernt nur `chestHideTimer`, nicht den Finish-Timer. Läuft eine Messung
   mit mehreren Cases über eine Seite, schließen alte Timer die Truhen späterer Cases vorzeitig
   (C5 zeigte sichtbaren Stick + id=1, obwohl die Truhe längst zu war). **Eine frische Seite pro Case**
   behebt das deterministisch.
2. **View-Breite**: Der M10-View ist 860×360 (nicht 480×270). Der Pause-Knopf hängt an
   `view.width - 10` Margin — Position dynamisch aus `ui.touch.pauseContainer` lesen, nicht hartkodieren.
3. CDP `Input.dispatchTouchEvent`: `pointerdown` kommt vor `touchstart` (deshalb griff der alte
   pointerdown-Skip vor dem TouchControls-Gate); `touchEnd` mit leerer Liste released sauber,
   Touch-IDs sind wiederverwendbar.

## Messbefehle / Belege

- `node scripts/m10-chest-lock.mjs --out shots/m10-chest-lock-baseline.json` (ohne flock, read-only)
- `node scripts/m10-chest-lock.mjs --out shots/m10-chest-lock-after.json --shots`
- `npx tsc --noEmit` rc=0; `npx vitest run tests/chest-lock-touch.test.ts` 11/11;
  `npm test` 545/545 (54 Dateien); `npm run build` grün.
- Sichtprüfung Shots: `m10-chest-lock-c1-drift.png` zeigt Truhe offen **ohne** Joystick während des
  Drags; `m10-chest-lock-c7-new-gesture.png` zeigt Truhe übernommen + Joystick aktiv (neue Geste).

## Offene Punkte

- Die Zahlen der Bedarfsmeldung (7/105 FAIL) sollten bei der nächsten Touch-Abnahme mit aktuellem
  Basis-SHA neu gemessen werden; dieses Skript (`scripts/m10-chest-lock.mjs`) ist dafür die
  schlanke Regression (kein flock, ~40 s).
- Echte Hardware (Touch, kein Emulator) bleibt ungetestet wie in m10-input-qa notiert.
