# Lane m10-input-qa — Touch/Gamepad unabhängig nachmessen (M10)

Worktree `/home/ai/games/lf-lanes/m10-input-qa`, Branch `m10-input-qa`.
**Basis-SHA beim Start: `f26dc4b`** (main-HEAD beim Lane-Start; der Merge der Lane `m8-display` lief parallel,
alle Zahlen hier gelten für genau diesen Basis-SHA bzw. den daraus gebauten Worktree-Build).
Keine Fixes in dieser Lane — nur belegte PASS/FAIL-Liste und Empfehlung.

## Kartenplan (Checkliste; Board pflegt der Merge-Job)

- [ ] **#1 Matrix** — `node scripts/verify-input.mjs` auf dem Worktree-Build, Ausgaben nach `shots/m10-input-*`;
      zusätzlich 7 Touch-Profile mit eigenem Temp-Skript (`~/tmp/m10-input-qa/profiles.mjs`, nicht committet).
      Abnahme: Profil×Check-Matrix mit PASS/FAIL.
- [ ] **#2 Menü-Gamepad** — Titel, CharSelect, Pause, Results je einmal per Pad (`readSceneGamepad`-Snapshot) und
      einmal per Tastatur; dokumentieren, welche Aktionen ohne Pad erreichbar sind.
      Abnahme: je Szene ein Beleg-Shot + Aussage „Pad: ja/nein“ mit Grund.
- [ ] **#3 Report** — diese Datei mit Tabelle, FAIL-Liste (Repro, erwartet/ist) und Empfehlung für die erste Fix-Lane.
      Abnahme: 7/7 Profile, 0 unbelegte Aussage.

## Stand (WIP, ehrlich)

_(wird nach dem finalen Profil-Lauf ersetzt)_

- `scripts/verify-m8-input` (verify-input.mjs) bricht auf dem M8-merge-Stand **vor** der Touch-Messung ab:
  `tapText("BRUDER KAEL")` findet den Knopf nicht mehr (Menü-Redesign nach M8). Das ist ein FAIL des
  bestehenden Verifikationsskripts, keine Aussage über Touch selbst.
- Temp-Profilmatrix in Arbeit; Zwischenbefund: bei geöffneter Truhe bewegt ein Joystick-Drag den Spieler
  trotz `canTouchMove() === false` (FAIL, Repro folgt).
