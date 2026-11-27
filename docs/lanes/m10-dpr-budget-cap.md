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

## #3580 Messung (blocked: Perf-Lock belegt)

`scripts/m10-dpr-budget.mjs`, M25-Last 780x360 dpr3, 3 Laeufe nachher +
Vorher-Referenz (?rbscale=0), FPS und effektive Renderbreite in
`shots/m10-dpr-budget.json`. Ziel min >= 50 FPS, 640x360@1 ohne Regression
>= 50.

Messversuche 2026-11-27 (alle unter flock /home/ai/games/.lf-perf.lock):

- Versuch 1 (vor EWMA-/Freeze-Fix): 46 / 42,8 / 42,8 FPS, Buffer 780x360 in
  3/3 -> FAIL, Ursache siehe #3579 (actualFps-Glaettung) + Totzone-Reset.
- Versuch 2 (nach EWMA-Fix, vor Freeze-Fix): 39,2-43,3 FPS, Buffer 780x360
  in 3/3 -> FAIL, Ursache Totzone-Reset bei Last-Jitter (siehe oben).
- Versuch 3 (nach Freeze-Fix, 18:22 Uhr): flock -w 60 -> rc=1 nach 60 s.
  Inhaber der Sperre: PID 29053 `realtime-run.mjs --minutes 30` (fremde Lane,
  Laufzeit ~30 min), Warteschlange mit 4 weiteren flock-Aufrufen inkl. Lane-Probe.
  Vorheriger unendlicher flock-Aufruf wurde abgebrochen. Zwei vergebliche
  Lock-Versuche -> Karte blocked nach Supervisor-Vorgabe.
- Versuch 4 (19:35 Uhr, nach #3581): flock -w 60 -> rc=1 erneut. Inhaber:
  PID 119292, ZWEITER 30-min `realtime-run.mjs` (flock -w 900), dahinter
  atlas-pack (3 Laeufe) + fullrun 780 dpr3 in der Warteschlange; Load ~17,7.
  Auto-Retry alle 30 min eingerichtet (Automation, expiert nach ~3 h).
- Systemlast beim Versuch 2: Load ~15 (Parallel-Lanes), Chromium ~800 % CPU
  fremder Lane -> FPS-Zahlen auch ohne LockKonflikt lastverrauscht.

Nachholen: sobald die Sperre frei ist (realtime-run beendet), Versuch 3 mit
`flock -w 60 ... node scripts/m10-dpr-budget.mjs --after-runs 3` nachziehen
und diese Notiz ergaenzen. Regler-Verhalten ist unabhaengig durch Probes
belegt: Teiler 2 wird unter Last erreicht (Buffer 390x180, FPS-Erholung).

## #3581 Pixel-Perfect-Beleg (Commit 48925da)

`scripts/m10-dpr-pixel-proof.mjs`: statische Szene (hitStop-Freeze, kein
Overlay) bei 780x360 dpr3, Stufe 2 (Buffer 390x180) vs. Stufe 1
(`window.__rbOverride = 1`, gleiche Szene).

**Kritischer Befund dabei**: Der gesenkte Buffer war ohne weitere Massnahmen
ein **Zoom-Crop** des obersten linken Quadranten (Spieler off-screen; Beleg:
Stufe-2-Shot entsprach dem B-Viertel mit AE 1464/70200). Commit 327eb83s
"Sichtpruefung Szene voll" war falsch.

**Fix in `src/config.ts`** (`enforceCameraProjection`, laeuft je Frame):
je Kamera `Zoom = 1/Teiler` + `Viewport = W/s x H/s` + Midpoint-Erhaltung
ueber die Aenderung. Sieger-Konfig empirisch aus 6er-(Zoom x Viewport)-Matrix
(`scripts/m10-dpr-camera-matrix.mjs`); ohne Midpoint-Erhaltung verspringen
UI-Panel/HUD (setViewport aendert den Kamera-Ausschnitt).

Belege (`shots/m10-dpr-budget-pixel*`):

- `uniformAE = 0` ueber 2 527 200 Geraete-Pixel: jedes 6x6-Block ist eine
  Farbe -> hartes nearest-neighbor Upscale, keine weichen Kanten.
- Layout identisch zur Vollstufe (Panel zentriert, HUD Ecken, Spieler
  Mitte); Rest-AE ist Text-/Detail-Resampling — der beabsichtigte
  Kompromiss des halben Rasters.
- `overview`/`full-overview` = verkleinerte Sichten, `zoom` = 4x-Crop.

Bekannte Randaerfahrungen (offen, nicht blockierend fuer M25-Messung):

- **Reviewer-PASS mit Auflagen** (Review ueber Diff 4b6adc0..HEAD, 14/14
  Tests, tsc rc=0): Weitere `camera.width`-Leser, die bei Teiler >= 2 anders
  rechnen als bei `GAME_WIDTH`: `BossSystem.ts:200` (Boss-HUD-Guard
  `bossHudRects(this.camera.width)` — genau im M25-Szenario aktiv),
  `GroundRenderer.ts:229/230` (On-Screen-Cull ohne Margin) und
  `GroundRenderer.ts:358-369` (Sternenfeld/Floaters auf halber Spanne).
  `Run.ts:555` nutzt korrekt `GAME_WIDTH`. -> Folge-Karte im Board
  (m10-dpr-budget-cap #5), Lane-Doku-Zeile hier korrigiert.
- HitStop-Dim haengt an `camera.width` (kuenstlicher Freeze-Zustand, nicht
  spielbar relevant).
- Eingabemapping (Touch/Joystick/Klicks) bei gesenktem Massstab ungetestet —
  Regler senkt nur unter Dauerlast; UX-Check in derselben Folge-Karte.
- Reviewer-Nits umgesetzt: tote Bindung `const forced = forcedRenderScale`
  entfernt, `renderer.type` aus BudgetGame-Typ entfernt, Probe-Wegwerp-
  Skripte `scripts/probe-budget*.mjs` geloescht (waren Claim-fremd),
  Unit-Tests fuer `parseRenderScaleOverride` (inkl. `Number(null)`-Fall) und
  `renderBufferSize` ergaenzt (21/21).
