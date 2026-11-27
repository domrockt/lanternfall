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

## #3579 Einbau (WIP, Commit 327eb83)

`src/config.ts` verdrahtet den Regler im Canvas-Setup: FPS-EWMA aus
`game.loop.actualFps`, Hysterese 45 FPS/2 s senken, 57 FPS/4 s heben, Buffer
via `canvas.width/height` + `renderer.resize`, CSS bleibt pixelated und
geraetepixelgenau. `?rbscale=0..3` als Mess-Override. `main.ts`/`view.ts`
unveraendert.

Offener Punkt: Im Messlauf (shots/m10-dpr-budget.json, Versuch 1) blieb der
Buffer bei 780x360 — Regler hat nicht gegriffen. Ursache wird in #3580 belegt
und behoben, danach #3579 abgenommen.

## #3580 Messung (offen)

`scripts/m10-eta-budget.mjs` -> `scripts/m10-dpr-budget.mjs`, M25-Last
780x360 dpr3, 3 Laeufe nachher + Vorher-Referenz (?rbscale=0), FPS und
effektive Renderbreite in `shots/m10-dpr-budget.json`. Ziel min >= 50 FPS,
640x360@1 ohne Regression >= 50.

## #3581 Pixel-Perfect-Beleg (offen)

Statische Szene bei gesenktem Massstab, 1:1-Pixelvergleich ohne weiche
Kanten -> `shots/m10-dpr-budget-pixel.png`.
