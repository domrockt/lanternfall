# Lane m10-gamepad-nav-scenes-r2 — Szenen-Wiring Gamepad-Menü-Navigation

Wiedereinreihung (Argus 06:58Z): das Original m10-gamepad-nav-scenes wurde 28.11. 06:27:11 vom
Disponent-Bug getötet (0 Agent-Läufe). Diese Lane verdrahtet die Szenen (Title, CharSelect,
Results, Credits, UI) auf die gemergte Kern-Lane m10-gamepad-menu-nav (29c310e:
Fokus-API `moveFocus`/`confirm`/`back` in `src/ui/menu.ts`, `handlePadFrame` in
`src/ui/options-menu.ts`, Harness `scripts/m10-gamepad-nav.mjs` 15/15 PASS).

Area (Disponent): src/scenes/{Title,CharSelect,Results,Credits,UI}.ts,
tests/gamepad-nav-scenes.test.ts, scripts/m10-gamepad-nav-scenes.mjs, diese Doku.
**Nicht anfassen:** src/ui/menu.ts, src/ui/options-menu.ts, src/input/Gamepad.ts (Kern),
src/scenes/Run.ts (Konfliktbereich fx-bakes-evo/run-Jobs; Pause-Trigger gehört m10-pad-start-pause-r2).

Hinweis: `lf-runs/lanes/common.md` ist im Repo (Stand 28.11.) nicht auffindbar
(kein Treffer unter ~/games/lf-runs/ und lanternfall/lf-runs/) — die Lane-Regeln aus dem
Briefing gelten unverändert weiter.

---

## K1 — Befund: Wo sitzt das Pause-Menü? (Karte #9544)

**Befund: Das Pause-Overlay sitzt vollständig in `src/scenes/UI.ts` (in der Area) — NICHT in Run.ts.**
Die Szene UI ist eine parallele HUD-Szene; Run.ts hält nur den Pause-**Zustand/Trigger**.

| Teil | Ort | Datei:Zeile |
|---|---|---|
| Pause-Overlay-Aufbau (dim, Rahmen, „PAUSE“, Build-Spalten) | UI.ts `createPauseUI()` | `src/scenes/UI.ts:617-647` |
| Pause-Buttons FORTSETZEN / OPTIONEN / AUFGABE (MenuButton) | UI.ts | `src/scenes/UI.ts:634-637` |
| Fokus-Refresh der Pause-Buttons (`pauseSelected`) | UI.ts `refreshPauseButtons()` | `src/scenes/UI.ts:649-651` |
| Aktivierung des fokussierten Pause-Buttons | UI.ts `activatePauseButton()` | `src/scenes/UI.ts:653-656` |
| Gamepad-Pfad im Pause-Zustand (up/down/left/right/confirm/back) | UI.ts `handlePad()`, `s.paused`-Zweig | `src/scenes/UI.ts:926-938` |
| Options-Delegation (Kern-`handlePadFrame` via `options.handlePad`) | UI.ts | `src/scenes/UI.ts:905-907` |
| Pause-**Trigger** (Pad-Start-Knopf → togglePause) | Run.ts `frame.actions.pause` | `src/scenes/Run.ts:457-461` |
| Pause-Zustand + ESC-Toggle-Logik | Run.ts `togglePause()` / `resumeRun()` | `src/scenes/Run.ts:1445-1471` |
| Pause-Sichtbarkeitsgate (kein Overlay bei Level-up/Truhe) | UI.ts `update()` | `src/scenes/UI.ts:880-886` |

**UI.ts-seitige Nutzung für K5:** Das Pause-Overlay nutzt bereits `MenuButton`-Widgets
(`this.pauseButtons`, `setFocused`-Pfad). K5 verdrahtet es auf die Kern-API
(`MenuFocus` über `pauseButtons`, `confirm` → `press()`/`activatePauseButton()`,
Back → `run.resumeRun()`), Repeat-Debounce via `menuRepeatTick` wie Kern-K2, ein Pad-Frame =
eine Aktion. Der Optionsaufruf aus der Pause (`UI.ts:635` → `this.options.open()`) und der
Pad-Pfad im offenen Optionsmenü (`UI.ts:905-907`) existieren bereits und bleiben unangetastet
(OptionsMenu selbst = Kern, out of area).

**Run.ts-Anteil als Nachfolgebedarf (m10-pad-start-pause-r2):** Der Pause-**Trigger** liegt in
Run.ts und ist explizit außerhalb dieser Area:
- `src/scenes/Run.ts:457-461` — `frame.actions.pause` öffnet/schließt die Pause
  (Start-Knopf), mit Options-Off-Check; Edge-Handling über InputState (kein Repeat-Problem).
- `src/scenes/Run.ts:1445-1461` — `togglePause()` mit ESC-Duplikat-Guard (m10-esc-pause-fix).
- `src/scenes/Run.ts:1465-1471` — `resumeRun()`.
Bedarf dort: Pad-Start-Knopf analog zur Kern-API prüfen (ein Press = ein Toggle,
kein Doppel-Event über die InputState-Edge-Pfade) — gehört zu m10-pad-start-pause-r2,
wurde hier NUR dokumentiert, nicht geändert.

Status K1: ✅ Befund dokumentiert, keine Code-Änderung.
