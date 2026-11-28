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

---

## K2 — Title.ts (Karte #9545, Commit 94f1a6b)

- Fokus-Kreis der Kern-API (`MenuFocus`) über ALLEN 4 bedienbaren Elementen:
  START, OPTIONEN, CREDITS, VOLLBILD (wrap in beide Richtungen).
- Confirm = `press()` des fokussierten Knopfs; Hover übernimmt nur den
  Fokus-Index (Start/Hover-Sync, AE=0 — Maus/Touch-Pfade unberührt).
- `get selected()` als Kompatibilitäts-Leser für den Kern-Harness
  (scripts/m10-gamepad-nav.mjs liest `t.selected`).
- Beleg: Kern-Harness 15/15 PASS (`~/games/.evidence/m10-gamepad-menu-nav/m10-gamepad-nav.json`).

## K3 — CharSelect.ts (Karte #9546, Commit e074967)

- Reine Nav-Funktion `charSelectPadNav` (unit-getestet) + 2 Fokus-Reihen:
  0 = Charakter-Panels (Fokus = derselbe Lantern-Strok wie Hover),
  1 = Knopfleiste ZURÜCK/START via Kern-`MenuFocus` (Startfokus START wie bisher).
- A = auswählen (Panel: pick; Knopf: start/back), B = zurück.
- Waffen-/Evolution-Felder: CharSelect hat KEINE interaktiven Waffen-/Evo-Felder —
  Startwaffe/Evolutionen sind reine Anzeige im Panel und damit mit dem Panel
  per D-Pad erreichbar (Befund, kein Feld ausgelassen).
- Fix während K5: `padRow` wird in `create()` resettet (Wiedereintritt über
  B→Titel→START landete sonst in der Panel-Reihe statt Knopf-Reihe).
- **Bekannte Restoptik:** Initial sind Panel 0 UND der START-Knopf umrandet
  (Panel-Reihe-Fokus + MenuFocus-Paint), identisch zum alten Verhalten
  (`start.setFocused(true)`). Bewusst so belassen (AE=0).

## K4 — Results.ts + Credits.ts (Karte #9547, Commit 83bb0b4)

- Results: `MenuFocus` über NEUE RUNDE/TITEL (wrap, confirm=press, B=TITEL).
- Credits: `MenuFocus` über ZURÜCK (A und B → Titel).
- **Scrollen mit Stick/D-Pad: N/A (Befund, kein Implementierungsversuch):**
  Results hat keine interaktive/scrollbare Liste — die Schadensbalken sind ein
  statisches Layout mit max. 12 Zeilen (rowsTop 68, Panel-Inneres bis ~306,
  m10-results-followup #4382), Credits 9 feste Zeilen. Beide passen immer
  vollständig ins Panel; es gibt nichts zu scrollen.

## K5 — UI.ts + Harness (Karte #9548, Commit f62d68f)

- Pause-Overlay (in der Area, siehe K1): `MenuFocus` über
  FORTSETZEN/OPTIONEN/AUFGABE; Back (B) = resumeRun; Optionsaufruf/Pad-Pfad im
  offenen Optionsmenü unverändert (Kern).
- Repeat-Debounce via `menuRepeatTick` wie Kern-K2; ein Pad-Frame = maximal
  EINE Aktion (Priorität back > up > down > left > right > confirm).
  **Klarstellung (Reviewer):** InputState liefert nur Rising-Edges — Halten
  wiederholt NICHT, `menuRepeatTick` erreicht seine Erstwiederholung dadurch
  faktisch nie; die Kanäle sind zukunftssicher verdrahtet (greifen sofort,
  falls InputState künftig held-states liefert) und der Harness-Check
  „250 ms gehalten = genau ein Schritt" besteht zurecht. Für
  m10-pad-start-pause-r2: Repeat-Verhalten = nur Tippen.
- **Review-Fund per Probe (belegt, behoben):** Confirm-Flanke und Repeat-Kanäle
  müssen JEDEN Frame gepflegt werden. Vorher blieb `pausePrevConfirmHeld` auf
  true, wenn das Options-Overlay den Frame konsumierte oder keine Aktion
  gehalten war („sticky edge“) → der zweite Confirm (AUFGABE) war tot
  (Probe: `~/tmp/m10-gamepad-nav-scenes-r2-probe-pause.mjs`, Ausgabe
  pausePrevConfirmHeld=true trotz Release). Fix: Flanke + `menuRepeatTick`-Ticks
  vor den Early-Returns in `handlePad()`.
- Harness `scripts/m10-gamepad-nav-scenes.mjs`: fährt mit synthetischem Pad
  Title (inkl. VOLLBILD, wrap, Options auf/zu) → CharSelect (Panels, A/B,
  ZURÜCK/START) → Run → Pause (Start-Knopf, Repeat 250 ms = 1 Schritt,
  Options, AUFGABE) → Results (wrap, B) → Credits (A und B). **32/32 PASS,
  0 JS-Fehler** (JSON: `~/games/.evidence/m10-gamepad-nav-scenes-r2/m10-gamepad-nav-scenes.json`).
- Abnahme-Screenshots 640x360 mit sichtbarem Fokusrahmen (in git):
  `shots/abnahme/m10-gamepad-nav-scenes-{title,charselect-kael,pause-fortsetzen,results,credits}.png`
  (Sichtprüfung vergrößert 2x nearest: Fokusrahmen klar, Pixel knackscharf).
- tests/gamepad-nav-scenes.test.ts: 10/10 grün; Kern-Tests
  (tests/gamepad-nav.test.ts) unangetastet grün; volle Suite 154 Dateien /
  1665 Tests grün; `npm run build` rc=0; `npx tsc --noEmit` grün.

## Befunde / offene Punkte

0. **Review (PASS, 28.11.) — Follow-up-Bedarf (Folge-Karte/Kern-Lane):**
   Der Hover-Sync hängt am Kontrakt „Hit-Zone ist das LETZTE Kind des
   Button-Containers" (menu.ts addiert die Zone zuletzt). Bekommt
   `createMenuButton` je ein weiteres Kind (Badge/Icon), bricht der Sync
   stillschweigend. Saubere Lösung: Hit-Zone auf `MenuButton` exponieren —
   Kern-API, hier nicht anfassbar (out of area).
1. **Run.ts-Anteil (Nachfolgebedarf m10-pad-start-pause-r2):** siehe K1 —
   `src/scenes/Run.ts:457-461` (Pad-Start-Trigger), `1445-1461` (togglePause),
   `1465-1471` (resumeRun). Nicht geändert (out of area).
2. **Vorhandene Optik, nicht von dieser Lane:** Im 640x360-Format liegt im
   Results-Screen der Untertitel „NIEDERLAGE“ dicht unter dem Titel
   („AUFGEGEBEN“/„MORGENDÄMMERUNG“ kollidieren optisch mit dem
   SCHADEN-Header bei oy=45). Layout in Results.ts wurde von dieser Lane
   nicht berührt (AE=0); Beleg: shots/abnahme/m10-gamepad-nav-scenes-results.png.
   → Bedarf für eine Layout-Lane (m10-results-overlap Follow-up).
3. `lf-runs/lanes/common.md` existiert nicht (siehe oben).

