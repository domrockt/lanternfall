# Lane m10-input-qa — Touch/Gamepad unabhängig nachmessen (M10)

Worktree `/home/ai/games/lf-lanes/m10-input-qa`, Branch `m10-input-qa`.
**Basis-SHA beim Start: `f26dc4b`** (main-HEAD beim Lane-Start; der Merge der Lane `m8-display` lief parallel,
alle Zahlen hier gelten für genau diesen Basis-SHA und den daraus gebauten Worktree-Build).
Keine Fixes in dieser Lane — nur belegte PASS/FAIL-Liste und Empfehlung.

## Kartenplan (Checkliste; Board pflegt der Merge-Job)

- [x] **#1 Matrix** — `node scripts/verify-input.mjs` auf dem Worktree-Build + 7 Touch-Profile mit
      Temp-Skript (`~/tmp/m10-input-qa/profiles.mjs`, nicht committet). Belege: `shots/m10-input-profiles.json`,
      `shots/m10-input-verify.json`, `shots/m10-input-profile-*.png`.
- [ ] **#2 Menü-Gamepad** — Titel, CharSelect, Pause, Results je einmal per Pad-Snapshot (`readSceneGamepad`)
      und einmal per Tastatur; welche Aktionen sind ohne Pad erreichbar?
- [ ] **#3 Report** — diese Datei mit vollständiger Tabelle, FAIL-Liste (Repro, erwartet/ist) und Empfehlung.
      Abnahme: 7/7 Profile, 0 unbelegte Aussage.

## #1 Matrix (Basis `f26dc4b`, headless Chromium, Worktree-Build)

### A) Bestehendes Skript `scripts/verify-m8-input` (`node scripts/verify-m8-input`, hier `verify-input.mjs`)

**FAIL — 2/3 Checks, 1 Fehler.** Das Skript bricht ab, bevor Touch/Gamepad gemessen werden:

| Check | Ergebnis | Beleg |
|---|---|---|
| index.html: touch-action none + kein Textselect | PASS | `shots/m10-input-verify.json` |
| Touch: Menüs per Tippen bis in den Run | **FAIL (Abbruch)** | `tapText("BRUDER KAEL") nicht sichtbar` |
| keine JS-Fehler | **FAIL** | `Error: tapText: "BRUDER KAEL" nicht sichtbar` |

Repro: `node scripts/verify-m8-input` → nach `tapText("START")` ist die CharSelect-Szene aktiv, aber der
Skript-Selektor `BRUDER KAEL` existiert dort nicht mehr (Menü-Redesign nach M8; der Charaktername wird als
`PixelText`-Wert, nicht als Knopf-Label gerendert). Erwartet: Skript findet den Kael-Knopf und läuft weiter.
Ist: Abbruch bei Check 2, alle späteren Touch-/Gamepad-Checks unerreicht → **das Skript ist auf dem
M8-merge-Stand nicht mehr aussagekräftig** (Test-Schuld, nicht Spiel-Bug).

### B) Eigene Profilmatrix, 7 Touch-Profile × 15 Checks (echte Touch-Events via CDP)

Profile (Landscape, `hasTouch`/`isMobile`, `devicePixelRatio` wie Gerät): Pixel 7, iPhone 13, iPhone SE,
Galaxy S9+, Nexus 5X, iPad Mini, Galaxy Tab S4. Je Profil: Titel→CharSelect→Kael→Run per Tippen,
Joystick-Drag im Run, Pause per 2. Finger, Gesten-Sperren bei Pause/Level-up/Truhe, Pause-Knopf-Sichtbarkeit,
Results ohne Overlay, CSS-Sperren, 0 JS-Fehler.

| Profil | CSS | Kein Overlay im Titel | Tipp im Titel wirkungslos | Menü→Run per Tippen | Joystick bewegt | Pause 2. Finger | Sperre Pause | Pause-Knopf aus | Tipp in Pause | FORTSETZEN | Sperre Level-up | Level-up-Tap | **Sperre Truhe** | Truhe-Tap | Kein Overlay Results | Summe |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pixel 7 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **FAIL** | PASS | PASS | 14/15 |
| iPhone 13 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **FAIL** | PASS | PASS | 14/15 |
| iPhone SE | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **FAIL** | PASS | PASS | 14/15 |
| Galaxy S9+ | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **FAIL** | PASS | PASS | 14/15 |
| Nexus 5X | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **FAIL** | PASS | PASS | 14/15 |
| iPad Mini | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **FAIL** | PASS | PASS | 14/15 |
| Galaxy Tab S4 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **FAIL** | PASS | PASS | 14/15 |

**7/7 Profile gemessen, 0 JS-Fehler.** Maschinenlesbar: `shots/m10-input-profiles.json`
(baseSha `f26dc4b`, `passed: false`, 7 Ergebnisse).
Belege-Bilder: `shots/m10-input-profile-pause-lock.png`, `…-level-up-lock.png`, `…-chest-lock.png`
(Pixel 7, während der Wirkung) sowie `…-<profil>-results.png` für alle 7 Profile.

### FAIL-Liste #1

1. **verify-input.mjs bricht bei CharSelect ab** (Test-Selektor veraltet) — Repro oben. Erwartet: 25/25 wie
   in `docs/lanes/input.md`; Ist: 2/3 Checks, kein Touch-/Gamepad-Ergebnis. Fix-Lane: Selektor auf den
   tatsächlichen CharSelect-Text/Knopf umstellen; danach Skript erneut als Regressionsschutz fahren.
2. **Gesten-Sperre bei Truhe (7/7 Profile)** — Repro: Run starten, `window.__lf.openChest()`, 200 ms warten,
   Touchstart links (92,200) + Drag nach rechts; Messung nach ~500 ms. Erwartet: Joystick bleibt unsichtbar
   (`stickVisible=false`), `playerX` unverändert, `chestOpen=true`. Ist (alle 7 Profile): `stickVisible=true`,
   `identifier=4`, `playerX` +36…+46 px, `chestOpen` bis zur Messung bereits `false`.
   **Einordnung ehrlich:** Vor dem Touchstart war `canTouchMove() === false`, `chestOpen === true`,
   Joystick unsichtbar. Die Truhe beendet sich in diesem Debug-Pfad aber schon nach ~300–500 ms selbst
   (`finishAt`-Timer), sodass der Drag in einen bereits fortgesetzten Run fällt. Damit ist die
   **Sperre nicht schlüssig widerlegt**, aber auch **nicht belegt** — der Check raced den Auto-Finish.
   Die Fix-Lane muss die Truhe offen halten (z. B. `finishChest` erst nach Drag) und den Drag **sofort**
   (<100 ms) nach `openChest` starten; erst dann ist PASS/FAIL belastbar. Bis dahin bleibt es ein FAIL
   des Checks „Sperre Truhe“ wie spezifiziert.
3. **Pause/Level-up-Sperre, Joystick/Pause nur im Run** — PASS in allen 7 Profilen (Gegenbeleg zu #2 oben:
   dort griff die Sperre). Menüs/Results haben kein Touch-Overlay (UI-Szene inaktiv).

## #2 Menü-Gamepad

_(offen)_

## #3 Report / Empfehlung

_(offen)_
