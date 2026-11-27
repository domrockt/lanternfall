# Lane m10-esc-pause-fix — verify-input-Regression „ESC setzt Pause nicht fort" schließen

Worktree `/home/ai/games/lf-lanes/m10-esc-pause-fix`, Branch `m10-esc-pause-fix`.
Auftrag: Nachabnahme C (`43fd9eb`) hatte den harten FAIL **verify-input 27/28 —
„Tastatur: ESC setzt fort"** (2× stabil reproduziert, `shots/qa-reaccc-verify-input.json`
+ `-run2.json`). Diese Lane schließt die Regression. Tabu eingehalten: nur
`src/scenes/Run.ts`, `src/input/InputState.ts`, `tests/esc-pause.test.ts`,
`scripts/m10-esc-pause.mjs`, `docs/lanes/m10-esc-pause-fix.md`, `shots/m10-esc-pause-*`.
GAME.md nicht geändert.

## K1 — Repro + Ist-Zustand (Karte #5898, Commit `412c3ce`)

`scripts/m10-esc-pause.mjs` fährt den verify-input-Keyboard-Pfad (ESC → Pause →
ESC → fortsetzen) plus Gegenproben (10×-Wechsel, Hold, Untermenü, Touch-Pfade).
Zwei Läufe, beide FAIL — `shots/m10-esc-pause-before.json` + `-before-2.json`:
„ESC setzt fort" bleibt pausiert, 0 JS-Fehler. Probe (togglePause-Protokoll,
20-ms-Poll): ein ESC-Press löst **4 togglePause-Aufrufe in 2 Paaren** aus
(~0,1 ms innerhalb eines DOM-Dispatch, ~0,6 ms Abstand), alle `repeat=false`,
`levelUpOpen/chestOpen/finished=false` → Netto kein Umschalten.

## K2 — Ursache (Karte #2, Commit `7a9ca7a`)

Emit-Protokoll über die KeyboardPlugin-Instanzen (einmalige Diagnose-Probe in
`~/tmp/m10-esc-pause-fix/`, nicht committet):

1. Ein Press = keydown + keyup landen im **selben Game-Step** in der
   Keyboard-Queue (der Harness presset ESC#2 ~4 ms nach ESC#1, weil das
   Zustands-Polling schnell lief; unter Last noch enger).
2. Jede Queue-Abarbeitung (ein MANAGER_PROCESS je DOM-Dispatch) arbeitet die
   **komplette Queue** ab; der eingebaute Duplikat-Bailout merkt sich nur das
   **zuletzt verarbeitete** Event (Single-Slot), deshalb wird bei 4 Events in
   der Queue **jedes** Event in **jedem** Durchlauf erneut emittiert.
3. Folge: der UI-Keydown-Handler feuert mehrfach pro Press — teilweise mit
   altem Keydown-Payload während des keyup-Dispatch (deshalb `evType=keyup` im
   togglePause-Protokoll). Gerade Aufrufzahl → Netto null → FAIL. Frühere Läufe
   PASS-ten, weil die Presses in unterschiedliche Steps fielen (Timing/Lang).

## K3 — Fix (Karte #2, Commit `7a9ca7a`)

- **`src/input/InputState.ts`**: neue reine Funktion `escToggleAllowed(ev, lastTs)`
  — ein physischer Press togglet genau einmal: nur `keydown`, nie `repeat=true`,
  Dedup je `event.timeStamp`; `ev === null` (Touch/Gamepad/Frame-Pfad, kein
  DOM-Dispatch) und fremde Events (z. B. resize für Portrait-Autopause) togglen
  unangetastet.
- **`src/scenes/Run.ts`**: `togglePause()` wendet die Entscheidung an
  (`window.event` ist nur während des DOM-Dispatch gesetzt — genau dort liegen
  die Duplikat-Aufrufe); Merker `lastEscToggleTs` wird in `create()` zurückgesetzt.
  `resumeRun()` (FORTSETZEN/Gamepad-B) unberührt.
- Nachweis: `shots/m10-esc-pause-after.json` — **8/8 PASS** (Grundpfad, 10×
  Wechsel, Hold-Test, Untermenü, Touch-Pause + FORTSETZEN, 0 JS-Fehler).

## K4 — Tests (Karte #3, Commit `97896ec`)

`tests/esc-pause.test.ts`: 10 Tests über die reine Funktion — Grundpfad,
Doppel-Dispatch, keyup-Replay, OS-Key-Repeat, Queue-Replay im Folge-Dispatch,
Touch/Gamepad-Pfad, fremde DOM-Events, Submenü-Pfad. `npx tsc --noEmit` grün,
10/10 grün.

## K5 — verify-input 28/28 (Karte #4, dieser Commit)

`node scripts/verify-input.mjs --tag esc-pause-r1` und `--tag esc-pause-r2`,
zweimal hintereinander, Belege nach `shots/m10-esc-pause-verify-run1/2.*`
umbenannt (Disponent-Claim `shots/m10-esc-pause-*`):

| Lauf | Ergebnis | JS-Fehler |
|---|---|---|
| `shots/m10-esc-pause-verify-run1.json` | **PASS 28/28** | 0 |
| `shots/m10-esc-pause-verify-run2.json` | **PASS 28/28** | 0 |

Dazu `npm run build` rc=0, Ganzsuite grün (siehe Commit-Notiz), tsc grün.

## Offene Punkte

- Die eigentliche Doppel-Abarbeitung der Keyboard-Queue liegt in Phaser
  (Single-Slot-Dedupe + Queue-Lebensdauer) — bewusst **nicht** angefasst
  (node_modules/Patch wäre Tabu-Bruch). Der Dedup in `Run.togglePause` ist
  robust gegen alle beobachteten Duplikat-Muster (Reviewer-PASS 2026-11-27).
  **Plan B, falls die Regression je zurückkommt:** Reviewer-Hinweis — der Guard
  hängt an `window.event`-Semantik (nur während DOM-Dispatch gesetzt). Würden
  Duplikat-Aufrufe künftig außerhalb eines Dispatches ankommen (Frame-Replay,
  `window.event === null`), greife stattdessen ein frame-basierter
  Suppression-Merker in `Run.togglePause`. Zuerst hier nachsehen.
