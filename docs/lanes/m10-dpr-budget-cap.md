# Lane m10-dpr-budget-cap (M10: adaptiver Render-Massstab)

Ziel: Minute 25 bei 780x360 dpr3 ist fill-rate-gebunden (2,53 Mio Pixel/Frame,
42,1-46,4 FPS). Ein adaptiver, ganzzahliger Render-Teiler senkt die Pixelmenge,
ohne die logische Szene zu aendern. Ziel-FPS >= 50.

## #3578 Regler als reine Funktion (done, Commit a5eb341)

`src/logic/scale.ts`:

- `RENDER_SCALE_MIN = 1`, `RENDER_SCALE_MAX = 3` (ganzzahliger Teiler der
  Renderbuffer-Kanten; 1 = volle logische Aufloesung).
- `maxRenderScale(width, height, dpr)`: Obergrenze aus dpr und View, Buffer
  faellt nie unter 320x180.
- `chooseRenderScale(dpr, width, height, fpsEwma, budgetMs)`: Sofort-Ziel;
  unbekannte/0-FPS bleibt bei 1 (kein Schrumpfen ohne Beleg).
- `stepRenderScale(state, fpsEwma, dtMs, cap)`: Hysterese, unter 45 FPS 2 s
  senken (Teiler +1), ab 57 FPS 4 s heben (Teiler -1), Totzone haelt.
- `integerScale` unveraendert (M8-Weiterverwendung).

Tests: `tests/scale-budget.test.ts`, 13 Faelle (Grenzen, Ganzzahligkeit,
Hysterese-Timer, Totzone, dpr-/Groessen-Cap). Kein Einbau in dieser Karte.

Beleg: `npx vitest run tests/scale-budget.test.ts` -> 13/13 passed.

## #3579 Einbau (Commit 327eb83)

`src/config.ts` verdrahtet den Regler im Canvas-Setup: FPS-EWMA + Hysterese
45 FPS/2 s senken, 57 FPS/4 s heben, Buffer via `canvas.width/height` +
`renderer.resize`, CSS bleibt pixelated und geraetepixelgenau.
`?rbscale=0..3` als Mess-Override. `main.ts`/`view.ts` unveraendert.

FPS-Signal: Der erste Entwurf nutzte `game.loop.actualFps` (Phaser TimeStep).
Phaser smootht diesen Wert pro Sekunde mit `0,25 * framesThisSecond +
0,75 * actualFps` (TimeStep.js:645) — Konvergenz nach einer Lastaenderung
dauert ~15 s. Der Regler haengt dann in der Totzone (45-57 FPS) und bleibt bei
Teiler 1 (~45 FPS < Ziel 50). Fix in #3580: eigener schneller EWMA aus den
rAF-Deltas (0,9/0,1 pro Frame, Konvergenz ~0,5 s), Hysterese-Konstanten
unveraendert.

## #3580 Messung (in Arbeit)

`scripts/m10-dpr-budget.mjs`, M25-Last 780x360 dpr3, 3 Laeufe nachher +
Vorher-Referenz (?rbscale=0), FPS und effektive Renderbreite in
`shots/m10-dpr-budget.json`. Ziel min >= 50 FPS, 640x360@1 ohne Regression
>= 50.

Befund Trajektorien-Probe (~/tmp/m10-dpr-budget-cap/probe2.mjs, M25-Last,
300 Gegner gehalten, 25 s, Samples alle 500 ms):

- Teiler 1: FPS 44,9, belowMs laeuft auf; bei 2000 ms -> Teiler 2 (Buffer
  390x180) bei t≈15,4 s.
- Teiler 2: FPS erholt sich (EWMA 45,9 -> 59,0), Regler haelt Stufe 2.
- Ursache Versuch-1-FAIL (46/42,8 FPS, Buffer 780x360): `loop.actualFps`-Glattung
  zu traege -> Totzone -> nie gesenkt. Fix: schneller EWMA (siehe #3579).

## #3581 Pixel-Perfect-Beleg (offen)

Statische Szene bei gesenktem Massstab, 1:1-Pixelvergleich ohne weiche
Kanten -> `shots/m10-dpr-budget-pixel.png`.
