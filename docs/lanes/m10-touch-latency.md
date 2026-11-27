# Lane m10-touch-latency — Touch-Steuerung ohne spürbare Verzögerung

Worktree `/home/ai/games/lf-lanes/m10-touch-latency`, Branch `m10-touch-latency`.
**Basis-SHA beim Start: `21fdd0f`** (main-HEAD beim Lane-Start).
Nur Eingabelogik; keine Gameplay-Änderung. GAME.md bleibt unangetastet.
Diff: `src/input/InputState.ts` (Hysterese) + `tests/input-latency.test.ts`, sonst keine `src/`-Datei.

Abnahmekriterium: **Latenz Geste → Spielerbewegung ≤ 2 Frames bei 60 Hz (Median ≤ 33 ms),
p95 ≤ 3 Frames**, kein Kleben nach Loslassen, Priorität Touch > Gamepad > Tastatur wie in M8.

## Kartenplan

- [x] **#2118 Messung** — scripted Touch-Sweep in iPhone-14-quer und Pixel-7-quer,
      Frame-Zeitstempel pro Ereignis, Median/p95 in `shots/m10-touch-latency.json` (Commit `48a16e9`).
- [x] **#2119 Pfad straffen + Deadzone-Hysterese** — Hysterese in `InputState`, kein Frame-Umbau nötig
      (Commit `a3ebd2e`).
- [x] **#2120 Loslassen** — Tests: `touchend` → Achse 0 im nächsten Frame, Pause/Level-up/Truhe sperren
      (Commit `e33e07f`).
- [x] **#2121 Doku + `.lane-done`** — diese Datei, Messwerte vorher/nachher, Urteil.

## Messaufbau (#2118)

Playwright/Chromium headless, echte CDP-Touch-Events (`Input.dispatchTouchEvent`),
Geräteprofile `iPhone 14` (390×844, dpr 3, quer → 844×390) und `Pixel 7` (412×915, dpr 2.625, quer → 915×412),
jeweils `hasTouch` + `isMobile`. Pro Profil 12 Trials (rechts/links/runter/rauf im Wechsel).
Je Trial: `touchStart` am Joystick-Ursprung (linke Bildhälfte, Vektor 0) → 180 ms warten →
`touchMove` auf 9 % der Bildschirmbreite → 420 ms beobachten → `touchEnd`.
Gemessen wird pro DOM-`touchmove` (`performance.now()` im Capture-Listener) bis zum ersten
Phaser-`poststep`-Frame, in dem `run.posX/posY` sich um > 0,001 px ändert (Frame-Intervall lokal
aus den letzten 30 poststep-Stempeln). Loslassen: `touchEnd` bis zum ersten Frame ohne Positionsänderung.
Pausierte Trials (Level-up/Truhe) werden verworfen und wiederholt, damit die Geste nicht mit einer
absichtlich blockierten Szene verwechselt wird.

## Ergebnis: vorher / nachher

| Profil | Trials | Median ms | p95 ms | Median Frames | p95 Frames | Loslassen Median/p95 Frames |
|---|---|---|---|---|---|---|
| iPhone 14 quer, **vorher** | 12 | 0,85 | 1,5 | 1 | 1 | 1 / 1 |
| Pixel 7 quer, **vorher** | 12 | 0,70 | 1,4 | 1 | 1 | 1 / 1 |
| iPhone 14 quer, **nachher** | 12 | 0,80 | 1,6 | 1 | 1 | 1 / 1 |
| Pixel 7 quer, **nachher** | 12 | 0,65 | 3,4 | 1 | 1 | 1 / 1 |
| **Gesamt nachher** | **24** | **0,70** | **1,6** | **1** | **1** | **1 / 1** |

**Bewertung.** Median und p95 liegen weit unter dem Kriterium (Median 1 Frame statt ≤ 2,
p95 1 Frame statt ≤ 3; ms-Werte 0,65–3,4 ms statt 33 ms). Das Ist war schon vor jedem Eingriff
innerhalb des Kriteriums; die Kette `TouchControls → TouchState → InputState → Run.movePlayer`
hat **kein** zusätzliches Frame. Daher wurde in #2119 kein Snapshot-Puffer umgebaut, sondern nur
die Deadzone-Hysterese ergänzt. 24/24 Trials zeigten Bewegung, 0 verworfene Trials, 0 JS-Fehler
in beiden Profilen.

## #2119 Deadzone-Hysterese

Problem: eine feste Totzone (12 %) ohne Hysterese lässt einen ruhenden Finger am Rand zwischen
„bewegt“ und „steht“ springen (Zittern), wenn die Touch-Koordinaten minimal rauschen.

Lösung in `src/input/InputState.ts`:
- **Eingangsschwelle** `TOUCH_DEADZONE = 0.12`, **Ausgangsschwelle** `TOUCH_RELEASE_DEADZONE = 0.09`
  (75 %).
- `applyTouchDeadzoneHysteresis(x, y, engaged)`: oberhalb 0,12 wird der Stick aktiv; ein aktiver
  Stick bleibt bis unter 0,09 aktiv. Im Band 0,09–0,12 wird **exakt 0** ausgegeben, damit weder
  Bewegung noch Zittern entsteht.
- Die Magnitude wird weiterhin relativ zur Eingangsschwelle remappt, der Übergang bei 0,12 bleibt
  stetig (kein Sprung).
- `InputState` merkt sich `touchEngaged` über Frames; `reset()` und ein inaktiver Snapshot
  (Loslassen, Pause, Level-up, Truhe) setzen die Hysterese zurück.
- Priorität unverändert `MOVE_SOURCE_PRIORITY = ["touch","gamepad","keyboard"]`; gibt die
  Hysterese 0 aus, fällt die Bewegung wie bisher auf Gamepad/Tastatur zurück.

Testabdeckung (`tests/input-latency.test.ts`): inaktiv unter der Eingangsschwelle, aktivieren
oberhalb, Zustand halten im Band mit 0-Ausgabe, Freigabe unter der Release-Schwelle, keine
Bewegung bei Ruhe-Rauschen, Prioritätsreihenfolge, `reset()` verwirft die Historie.

## #2120 Loslassen

`TouchControls.onTouchEnd` ruft `resetTouchSnapshot()` synchron im `touchend`/`touchcancel`-Handler;
der nächste `InputState.update` liest `{active:false,x:0,y:0}` und liefert `move = (0,0)`.
Tests decken ab:
- `touchend` setzt den Snapshot sofort auf inaktiv, der nächste Frame ist exakt 0 (kein Nachlauf).
- Ein später anliegender alter Fingerwert reaktiviert nichts.
- `canMove=false` (Pause/Level-up/Truhe) verwirft `touchstart`; wird während eines gehaltenen
  Fingers pausiert, nullt `TouchControls.update()` die Achse.
- `InputState.reset()` verwirft die Hysterese-Historie.

## Tests / Build

- Gezielt: `npx vitest run tests/input-latency.test.ts tests/input.test.ts tests/input-adapters.test.ts`
  → **40/40 grün** (3 Dateien).
- Voll: `npm test` → **235/235 grün** (18 Dateien).
- `npm run build` → **grün** (tsc + vite, ~0,9 s).
- Messung: `flock /home/ai/games/.lf-perf.lock node ~/tmp/m10-touch-latency/measure.mjs`
  (siehe Skript-Kopie unten) → `passed: true`, 0 JS-Fehler.
- Input-Regression: `node scripts/verify-input.mjs` → **PASS 28/28 Checks, 0 JS-Fehler**
  (Touch-Menüs/Run/Pause/Level-up/Truhe/Results, Gamepad Hotplug + Sperren, Tastatur ESC).

## Belege

- `shots/m10-touch-latency.json` — maschinenlesbar, 2 Profile × 12 Trials, alle Rohwerte
  (`latencyMs`, `latencyFrames`, `releaseMs`, `releaseFrames`, `frameMs`), `passed: true`, `jsErrors: []`.
- `shots/m10-touch-latency-iphone14-landscape-drag.png` / `-released.png`,
  `shots/m10-touch-latency-pixel7-landscape-drag.png` / `-released.png` — gehaltener Joystick mit
  lebenden Torfgolems im Bild bzw. nach Loslassen ohne Stick.
- `shots/m10-touch-latency-iphone14-landscape-drag.gif`, `…-pixel7-landscape-drag.gif` —
  Bewegung während des Drags (8 fps, nearest-neighbor, lebende Gegner).
- `docs/lanes/m10-touch-latency-measure.mjs` (Repro-Skript; Temp-Kopien unter `~/tmp/m10-touch-latency/`).

## Urteil

**PASS.** Median 1 Frame (0,70 ms), p95 1 Frame (1,6 ms) in beiden Touch-Profilen, Loslassen
1 Frame, 40/40 gezielte bzw. 235/235 Gesamt-Tests grün, Build grün, 0 JS-Fehler. Nur
Eingabelogik geändert. Hysterese verhindert Zittern bei Ruhe ohne die M8-Priorität zu verändern.

## Offene Punkte

- iOS-Safari auf echtem Gerät nicht gemessen (nur Chromium-Emulation mit echten CDP-Touch-Events);
  der Code-Pfad ist identisch, die DOM-Zustellung kann dort um wenige ms abweichen.
- Pixel-7-ms-p95 im Nachher-Lauf 3,4 ms (ein Ausreißer) — weiterhin weit unter 33 ms und 1 Frame.
- Die Messung zeigt nur Geste → Sim-Frame, nicht zusätzliche Display-Latenz des Geräts.
- `.lane-done` wird gemäß Merge-Regel vom Merge-Job entfernt; Messwerte stehen hier und im JSON.
