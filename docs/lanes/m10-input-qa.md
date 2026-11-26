# Lane m10-input-qa — Touch/Gamepad unabhängig nachmessen (M10)

Worktree `/home/ai/games/lf-lanes/m10-input-qa`, Branch `m10-input-qa`.
**Basis-SHA beim Start: `f26dc4b`** (main-HEAD beim Lane-Start; der Merge der Lane `m8-display` lief parallel,
alle Zahlen hier gelten für genau diesen Basis-SHA und den daraus gebauten Worktree-Build).
Keine Fixes in dieser Lane — nur belegte PASS/FAIL-Liste und Empfehlung.

## Kartenplan (Checkliste; Board pflegt der Merge-Job)

- [x] **#1 Matrix** — `node scripts/verify-input.mjs` auf dem Worktree-Build + 7 Touch-Profile mit
      Temp-Skript (`~/tmp/m10-input-qa/profiles.mjs`, nicht committet). Belege: `shots/m10-input-profiles.json`,
      `shots/m10-input-verify.json`, `shots/m10-input-profile-*.png`.
- [x] **#2 Menü-Gamepad** — Titel, CharSelect, Pause, Results je einmal per Pad-Snapshot (`readSceneGamepad`)
      und einmal per Tastatur; welche Aktionen sind ohne Pad erreichbar? Beleg: Commit `ba178cc`,
      `shots/m10-input-menu-*.png|json` (13/13 PASS).
- [x] **#3 Report** — diese Datei mit vollständiger Tabelle, FAIL-Liste (Repro, erwartet/ist) und Empfehlung.
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
   **Einordnung (Versuch 2, deterministisch nachgestellt):** Der erste Verdacht „race den Auto-Finish“
   war falsch. Ursache ist die **Skip-Zone der Truhe**: sie füllt den ganzen View und reagiert auf
   `pointerdown` („TIPPE ODER A = ÜBERNEHMEN“). Damit beendet **derselbe Touchstart**, der den Joystick
   sperren soll, zuerst die Truhe; `TouchControls.onTouchStart` sieht danach `canTouchMove() === true`
   und übernimmt den noch gehaltenen Finger als Joystick. Messung (`shots/m10-input-chest-repro.json`,
   Pixel 7): vor dem Touch `canMove=false`, `chestOpen=true`, `stickVisible=false` (die Sperre greift also
   korrekt) → 1 ms nach `pointerdown` ist `chestOpen=false` → derselbe Finger taucht mit `identifier=4`
   als Joystick auf und bewegt den Spieler **+22 px**. Belege-Bildpaar
   `shots/m10-input-chest-open-lock.png` (Truhe offen, kein Joystick) /
   `shots/m10-input-chest-dismiss-drag.png` (Joystick sichtbar, Truhe weg). Das ist ein echter, wenn auch
   kleiner Eingabe-Bug: eine Übernehmen-Geste darf nicht in eine Bewegung übergehen.
   Fix-Richtung (für die Fix-Lane, nicht hier): Skip-Zone auf `pointerup` umstellen (oder `TouchControls`
   einen Touch verwerfen lassen, dessen Start bei `canMove=false` lag). Danach ist der Check belastbar.
3. **Pause/Level-up-Sperre, Joystick/Pause nur im Run** — PASS in allen 7 Profilen (Gegenbeleg zu #2 oben:
   dort griff die Sperre). Menüs/Results haben kein Touch-Overlay (UI-Szene inaktiv).

## #2 Menü-Gamepad (Basis `f26dc4b`, headless Chromium, gemocktes Pad)

Pad-Snapshot-Quelle: gemocktes `navigator.getGamepads()` (`id: "Mock Pad (M10-input-qa)"`, `mapping: standard`,
17 Buttons). Das ist exakt der erste Pfad, den `readSceneGamepad()` liest; das Phaser-Plugin bleibt Fallback.
Beleg: `shots/m10-input-menu-gamepad.json` (`passed: true`, 13/13 Checks, 0 JS-Fehler).

| Szene | Pad-Aktionen | Pad: ja/nein | Beleg-Shot |
|---|---|---|---|
| Titel | D-Pad rechts setzt Fokus auf OPTIONEN (Fokusrahmen sichtbar), links zurück, A startet CharSelect | **ja** | `shots/m10-input-menu-title-pad.png` |
| CharSelect | D-Pad rechts wählt Kael (Rahmen), A startet Run mit `character=kael` | **ja** | `shots/m10-input-menu-charselect-pad.png` |
| Pause (Run) | Start pausiert; A öffnet Optionen, Start hebt Pause im Optionsmenü nicht auf, B schließt nur das Menü, links + A setzt fort | **ja** | `shots/m10-input-menu-pause-pad.png`, `shots/m10-input-menu-options-pad.png` |
| Results | D-Pad rechts fokussiert TITEL, A wechselt zum Titel | **ja** | `shots/m10-input-menu-results-pad.png` |

Tastatur-Gegenprobe in denselben Szenen (Enter / Pfeil rechts + Enter / ESC): 4/4 PASS,
Shots `shots/m10-input-menu-charselect-kb.png`, `…-pause-kb.png`, `…-results-kb.png`.

**Welche Aktionen sind ohne Pad erreichbar?** Alle vier geprüften Szenen sind ohne Pad voll bedienbar:
Titel (START/OPTIONEN/CREDITS per Pfeilen+Enter oder Maus/Touch, VOLLBILD per Maus/Touch),
CharSelect (Wahl per Pfeilen/1/2/Maus, Start per Enter/Knopf, Zurück per ESC/Knopf),
Pause (Fortsetzen per ESC oder FORTSETZEN-Knopf/Touch, Optionen per O/Knopf, Aufgabe per Knopf/Touch),
Results (NEUE RUNDE/TITEL per Pfeilen+Enter oder Maus/Touch). Die früher bekannte Lücke „Menüs ohne Gamepad“
ist für diese vier Szenen **nicht reproduzierbar**; Credits hat ebenfalls Pad-Handling (`update()` mit
`confirm`/`back`), wurde hier aber nicht separat gespielt. Nicht per Pad erreichbar: nichts in den vier Szenen;
offen bleibt echte Hardware (kein physisches Pad am Host).

## #3 Report / Empfehlung (Basis `f26dc4b`)

### Gesamtbild

- **Touch:** 7/7 Profile × 15 Checks = 105 Checks; **98 PASS, 7 FAIL** (jeweils dieselbe Truhen-Sperre).
  Alle 7 Profile starten per Tippen, bewegen per Joystick (+55…+65 px im 1-s-Drag), pausieren per zweitem
  Finger, sind gegen Joystick bei Pause und Level-up gesperrt, haben kein Overlay in Titel/Results.
- **Gamepad Menüs:** 13/13 Checks PASS (Titel, CharSelect, Pause inkl. Options, Results; je Pad und Tastatur).
- **Bestehendes Regressionsskript:** FAIL, bricht bei CharSelect ab (Selektor veraltet).
- **Echte Hardware:** kein physisches Pad am Host; alle Pad-Aussagen beruhen auf gemocktem
  `navigator.getGamepads()` (gleicher Snapshot-Pfad wie `readSceneGamepad`).

### FAIL-Liste (priorisiert, Repro + erwartet/ist)

| # | FAIL | Repro | Erwartet | Ist | Beleg |
|---|---|---|---|---|---|
| F1 | Truhen-Übernehmen-Geste wird zur Bewegung, 7/7 Profile | Run, `window.__lf.openChest()`, Touch links (92,200) + Drag | Joystick unsichtbar, `playerX` konstant, `chestOpen=true` | `chestOpen` nach dem Touchstart `false`; derselbe Finger wird Joystick (`identifier=4`), `playerX` +22…+46 px | `shots/m10-input-profiles.json`, `shots/m10-input-chest-repro.json`, Bildpaar `m10-input-chest-open-lock.png` / `-dismiss-drag.png` |
| F2 | `scripts/verify-m8-input` bricht ab | `node scripts/verify-input.mjs` | 25/25 wie `docs/lanes/input.md` | 2/3 Checks, `tapText("BRUDER KAEL")` nicht sichtbar, keine Touch-/Pad-Messung | `shots/m10-input-verify.json` |

**Einordnung F1 (deterministisch, Versuch 2):** Die Sperre *während* die Truhe offen ist funktioniert
(`canMove=false`, kein Stick). Der Fehler entsteht durch die Reihenfolge im selben Touchstart: die
bildschirmfüllende Skip-Zone der Truhe hört auf `pointerdown` und schließt die Truhe, danach akzeptiert
`TouchControls.onTouchStart` denselben, noch gehaltenen Finger (`identifier=4`) und bewegt den Spieler.
Kein Auto-Finish-Race, sondern ein echter Eingabe-Bug. Pause-/Level-up-Sperre ist davon nicht betroffen
(Gegenprobe PASS).

### Empfehlung: erste Fix-Lane

1. **F1 fixen (klein, deterministisch belegt):** Skip-Zone von `pointerdown` auf `pointerup` umstellen,
   damit der Übernehmen-Tipp den Joystick nicht startet; alternativ in `TouchControls.onTouchStart` einen
   Touch verwerfen, dessen Start bei `canMove=false` lag. Danach `verify-input`-Check auf „Joystick bleibt
   unsichtbar und `playerX` konstant“ verschärfen.
2. **F2 Skript-Selektor reparieren** (klein, hoher Wert): `BRUDER KAEL` an den aktuellen CharSelect-Text/Knopf
   anpassen; danach `verify-input.mjs` als Regressionsschutz wieder grün fahren. Solange F2 offen ist, ist die
   Touch-/Pad-Abnahme im bestehenden Skript blind.
3. **Echte-Hardware-Test** (Xbox/PlayStation/Android-TV) bleibt offen und ist keine Code-Fix-Karte, sondern
   ein manueller Abnahmeschritt.

### Messbefehle / Belege

- `node scripts/verify-input.mjs` (read-only, ohne flock) → `~/tmp/m10-input-qa/verify-input.log`,
  JSON nach `shots/m10-input-verify.json`, Shot `shots/m10-input-verify-touch-menus.png`.
- `BASE_SHA=f26dc4b node ~/tmp/m10-input-qa/profiles.mjs` (Temp, nicht committet) → voller Lauf in
  `~/tmp/m10-input-qa/profiles-final2.log`, JSON `shots/m10-input-profiles.json`, 12 Profil-Shots.
- `BASE_SHA=f26dc4b node ~/tmp/m10-input-qa/menu.mjs` (Temp) → `~/tmp/m10-input-qa/menu.log`,
  JSON `shots/m10-input-menu-gamepad.json`, 8 Shots.
- `BASE_SHA=f26dc4b node ~/tmp/m10-input-qa/chest-repro.mjs` (Temp, Versuch 2) → deterministischer
  F1-Nachweis `shots/m10-input-chest-repro.json` + Bildpaar `shots/m10-input-chest-open-lock.png` /
  `-dismiss-drag.png`; Ereignis-Reihenfolge in `~/tmp/m10-input-qa/chest-order.json`.
- `npx tsc --noEmit` rc=0; `npx vitest run tests/input.test.ts` **23/23 Tests grün**.

### Versuch 2 — Abschlussprüfung (2026-11-26)

- Karten #1–#3 waren bereits committet (`234f437`, `ba178cc`, `eceee34`, Basis `f26dc4b`); offen waren nur
  die Checkliste für #2 und ein belastbarer F1-Nachweis. Beides hier nachgezogen.
- `npm run build` **grün**; `npx vitest run` **192/192 Tests grün** (12 Dateien).
- F1 deterministisch: Sperre bei offener Truhe greift (`canMove=false`, `stickVisible=false`); der
  Übernehmen-Touchstart selbst startet danach den Joystick (`identifier=4`, +22 px). Ursache Skip-Zone
  auf `pointerdown`. Bleibt **FAIL**, jetzt mit Repro + Fix-Richtung statt Vermutung.
- Ergebnis: **Touch 7/7 Profile** (98/105 Checks, 7× F1), **Gamepad-Menüs 13/13 PASS**, **F2 offen**
  (veralteter Selektor im M8-Regressionsskript). Keine Fixes in dieser Lane, keine geschützten Pfade
  angefasst.

**Abnahme dieser Lane:** 7/7 Profile gemessen (105 Checks), jede Aussage oben hat JSON-/Shot-Pfad oder
Befehl; keine unbelegte Behauptung. Keine Datei unter `src/**`, `scripts/**`, `tests/**`, `index.html`,
`public/**`, `shots/m8-*`, `shots/balance-*`, `shots/perf-*`, `.opencode/board.json` wurde von dieser Lane
verändert oder committet (Ausnahme: der Supervisor-WIP-Commit `72a883d` enthielt das vorbestehende
`board.json`-Diff; nicht von dieser Lane erzeugt, nicht erneut angefasst).
