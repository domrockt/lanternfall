# Lane m10-touch-latency — Touch-Steuerung ohne spürbare Verzögerung

Worktree `/home/ai/games/lf-lanes/m10-touch-latency`, Branch `m10-touch-latency`.
**Basis-SHA beim Start: `21fdd0f`** (main-HEAD beim Lane-Start).
Nur Eingabelogik; keine Gameplay-Änderung. GAME.md bleibt unangetastet.

Abnahmekriterium: **Latenz Geste → Spielerbewegung ≤ 2 Frames bei 60 Hz (Median ≤ 33 ms),
p95 ≤ 3 Frames**, kein Kleben nach Loslassen, Priorität Touch > Gamepad > Tastatur wie in M8.

## Kartenplan

- [x] **#2118 Messung** — scripted Touch-Sweep in iPhone-14-quer und Pixel-7-quer,
      Frame-Zeitstempel pro Ereignis, Median/p95 in `shots/m10-touch-latency.json`.
- [ ] **#2119 Pfad straffen + Deadzone-Hysterese**
- [ ] **#2120 Loslassen: pointerup → Achse 0 im nächsten Frame**
- [ ] **#2121 Doku + `.lane-done`**

## #2118 Messung (Ist-Stand, vor jedem Eingriff)

**Aufbau.** Playwright/Chromium headless, echte CDP-Touch-Events (`Input.dispatchTouchEvent`),
Geräteprofile `iPhone 14` (390×844, dpr 3, quer → 844×390) und `Pixel 7` (412×915, dpr 2.625, quer → 915×412),
jeweils `hasTouch` + `isMobile`. Pro Profil 12 Trials (rechts/links/runter/rauf im Wechsel).
Je Trial: `touchStart` am Joystick-Ursprung (linke Bildhälfte, Vektor 0) → 180 ms warten →
`touchMove` auf 9 % der Bildschirmbreite → 420 ms beobachten → `touchEnd`.
Gemessen wird pro DOM-`touchmove` (performance.now im Capture-Listener) bis zum ersten
Phaser-`poststep`-Frame, in dem `run.posX/posY` sich um > 0,001 px ändert. Zusätzlich wird das
Loslassen gemessen: `touchEnd` bis zum ersten Frame ohne Positionsänderung.
Frame-Intervall lokal aus den letzten 30 poststep-Stempeln.

**Ergebnis (24 gültige Trials, 0 verworfene durch Level-up/Truhe, 0 JS-Fehler):**

| Profil | Trials | Median ms | p95 ms | Median Frames | p95 Frames | Loslassen Median Frames | p95 Frames |
|---|---|---|---|---|---|---|---|
| iPhone 14 quer | 12 | **0,85** | **1,5** | **1** | **1** | **1** | **1** |
| Pixel 7 quer | 12 | **0,70** | **1,4** | **1** | **1** | **1** | **1** |
| Gesamt | 24 | **0,70** | **1,1** | **1** | **1** | **1** | **1** |

**Bewertung.** Das Ist ist bereits deutlich innerhalb des Kriteriums: sub-frame Median (< 1 ms),
p95 1,5 ms, d. h. die Bewegung erscheint im unmittelbar folgenden Sim-Frame (1 Frame Delay,
weil das Touchmove-Ereignis zwischen zwei Frames eintrifft und der nächste Frame den Snapshot liest).
Kein zusätzliches Frame in der Kette `TouchControls → TouchState → InputState → Run.movePlayer`.
Der Pfad braucht daher in #2119 **keine** Frame-Straffung; offen ist nur die Hysterese gegen Zittern.

**Belege.**
- `shots/m10-touch-latency.json` (maschinenlesbar, `passed: true`,
  `jsErrors: []`, 2 Profile × 12 Trials mit allen Rohwerten).
- `shots/m10-touch-latency-iphone14-landscape-drag.png` / `-released.png` (gehaltener Joystick mit
  lebenden Torfgolems im Bild / nach Loslassen).
- `shots/m10-touch-latency-iphone14-landscape-drag.gif`, `…-pixel7-landscape-drag.gif` (Bewegung
  während des Drags, 8 fps, nearest-neighbor, lebende Gegner).
- Mess-Skript: `docs/lanes/m10-touch-latency-measure.mjs` (Repro; Temp-Kopien unter `~/tmp/m10-touch-latency/`).

**Offene Punkte aus #2118.**
- Zwei Trials im ersten Lauf wurden durch einen Level-up pausiert (Geste korrekt blockiert); das Skript
  verwirft pausierte Trials und wiederholt sie. Im finalen Lauf 0 verworfene Trials.
- iOS-Safari-Realgerät nicht gemessen (nur Chromium-Emulation); DOM-Event-Zustellung ist dort
  potenziell anders, der Code-Pfad ist aber derselbe.
