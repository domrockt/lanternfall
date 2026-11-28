# Lane m10-vfx-restore-st2-r2 — VFX-Ruecknahme Stufe 2 (Glow-dpr-Alpha 0,6 -> 0,7)

Re-Queue (Argus 07:23Z) des Original-Jobs m10-vfx-restore-st2 (06:38:32 vom
Ancestor-Bug getoetet, 0 Agent-Laeufe). Briefing inhaltlich unveraendert.
Blocker aufgehoben: `m10-boss-fx-contrast` ist gemerged (fxAlphaForDpr/glowCapFor
in src/gfx/gen-fx.ts + src/systems/FxSystem.ts sind frei; Claim laut claims.json
rotiert an diese Lane).

**Ziel:** additive Glow-dpr-Alpha bei dpr >= 3 von 0,6 auf 0,7 zuruecknehmen
(Stufe 2 aus docs/lanes/m10-vfx-restore.md K3). Grund: Effekte wirken verwaschen;
Run.ts hat keinen Hebel auf die dpr-Alpha. **Abnahme:** Near-White A7 <= 4,16 %,
Draw-Calls <= Vorher + 10 %, art-director >= 4/5, Tests + `npx tsc --noEmit` gruen.

**Dateien (Disponent):** src/gfx/gen-fx.ts, src/systems/FxSystem.ts,
tests/vfx-restore-st2.test.ts, scripts/m10-vfx-st2.mjs,
docs/lanes/m10-vfx-restore-st2-r2.md, shots/m10-vfx-st2-*.
**Nicht angefasst:** src/scenes/Run.ts, src/logic/lod.ts (gehalten).

## Messaufbau (scripts/m10-vfx-st2.mjs)

Wie scripts/m10-vfx-restore.mjs (M25-Freeze-Frame: seed 77, skipTo 1400, 6
Basiswaffen Lv8, god, Burst-Spawn auf ~450 -> Freeze bei ~300 + Boss 4,
Pool-FX fx_spark/fx_halo/fx_shock, Banner aus, Szene pausiert) plus:

- **dprAlpha-Probe:** direkter Spawn zweier FX (NORMAL + ADD, alphaFrom 0,9)
  nach den Screenshots; `dprAlpha = (alphaFrom_ADD/0,9) / alphaScale^2`
  (additive Daempfung ist quadratisch: alphaScale * extra mit extra = alphaScale).
  Liefert den wirksamen dpr-Faktor ohne Skript-Bandage — 0,6 (vorher) bzw.
  0,7 (nachher) bei dpr 3, 1 bei dpr 1.
- **Draw-Calls:** GL-Wrapper wie perf-profile.mjs ueber ein 10-s-Live-Fenster.
  Der Median ueber alle rAF-Callbacks ist bimodal (viele 0-er) — `drawsMean`
  je Fenster ist die Vergleichsmetrik (vor/nach mit demselben Skript).
- Near-White A7 (r,g,b >= 150 und r >= 235) im A7-anteiligen Crop + fullframe;
  Profiles 640x360@1 (Kontrolle, dpr-Pfad unberuehrt) und 780x360@3 (Hebel).
- Renderer-String, 0 JS-Fehler. FPS nebenbei (vsync-geklemmt, kein Gate).

## K1 — Vorher-Messung (Stand 0,6, Commit 97912b43)

`shots/m10-vfx-st2-before.json` + Freeze-PNGs (committet); Kopien in
`~/games/.evidence/m10-vfx-restore-st2-r2/`.

| Profil | Gegner (Freeze) | lod | fxAlpha | FPS | drawsMean | NW A7 Crop | NW A7 Full | Probe dprAlpha |
|---|---|---|---|---|---|---|---|---|
| 640x360@1 | 395 | minimal | 0,65 | 59,9 | 4,7 | 3,71 % | 0,67 % | **1,0** |
| 780x360@3 | 393 | minimal | 0,65 | 60,0 | 4,7 | 4,10 % | 0,57 % | **0,6** |

Renderer-String (beide Profile): `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S),
OpenGL ES 3.2)` — iGPU-Pfad, kein SwiftShader. 0 JS-Fehler.
Beobachtung: 780@3 liegt mit 4,10 % dicht unter dem Gate — die Streuung des
Freeze-Frames (2,44 % im ersten Probelauf, 4,10 % im committeten Lauf) ist real,
daher je-Profil-Vergleich vor/nach, kein profiluebergreifender Schnitt.

## K2 — Fix (Commit 25c65f53)

`src/gfx/gen-fx.ts`: `fxAlphaForDpr` dpr > 2 (und +Infinity): 0,6 -> **0,7**.
`src/systems/FxSystem.ts`: nur Kommentare (Stufe-2-Verweis) — der Alpha-Pfad
liest `fxAlphaForDpr` an zwei Stellen und braucht keine Aenderung.
`glowCapFor`/GlowBudget (ADD-Glow-Caps) unberuehrt; `tests/fx-add-cap.test.ts`
gruen. Run.ts/lod.ts nicht angefasst.

**Fremd-Dateien minimal angepasst (offengelegt in `.dispatch/requests.md`):**
`tests/fx-overdraw.test.ts` + `tests/boss-fx-contrast.test.ts` pinnen den
Altwert 0,6 (dpr-Treppe bzw. normal-FX-Zusammensetzung 0,9*0,5*0,5*0,6) — die
Pins wurden auf 0,7 repointet, sonst unveraendert (Muster
m10-texture-glow-swap-r2, 10:55Z). tsc clean; fx-overdraw/boss-fx-contrast/
fx-add-cap/boss-death-shards 69/69 gruen.

## K3 — Tests (Commit 9893f335)

`tests/vfx-restore-st2.test.ts`: Treppe (dpr <= 2 unberuehrt), Alpha-Boden
(>= 0,7 im dpr>2-Pfad, ungueltige Werte -> 1), Gates aus dem committeten
Vorher-Report (minimal-LOD, NW <= 4,16 %, Probe 0,6/1,0, kein SwiftShader,
0 JS-Fehler, PNG-Belege per existsSync verlangt — f71c3be-Muster). Die
Nachher-Blocks sind via `it.runIf` an `shots/m10-vfx-st2-after.json` geklemmt
und greifen mit K4.

## K4 — Nachher-Messung + art-director

`shots/m10-vfx-st2-after.json` + Freeze-PNGs (committet); Kopien + 3x-nearest
Vergrößerungen in `~/games/.evidence/m10-vfx-restore-st2-r2/`.
Abnahme-Screenshot: `shots/abnahme/m10-vfx-st2-after.png` (= Freeze-Frame 780@3).

| Profil | Gegner (Freeze) | lod | fxAlpha | FPS | drawsMean (vorher) | NW A7 Crop (vorher) | NW A7 Full | Probe dprAlpha |
|---|---|---|---|---|---|---|---|---|
| 640x360@1 | 398 | minimal | 0,65 | 60,0 | 4,7 (4,7) | 4,15 % (3,71 %) | 0,70 % | **1,0** |
| 780x360@3 | 389 | minimal | 0,65 | 59,9 | 4,9 (4,7, +4,3 %) | 3,03 % (4,10 %) | 0,45 % | **0,7** |

- Renderer-String (beide Profile): `ANGLE (Intel, Mesa Intel(R) Graphics
  (RPL-S), OpenGL ES 3.2)` — iGPU-Pfad, kein SwiftShader. 0 JS-Fehler.
- **Gates:** Near-White A7 Crop ≤ 4,16 %: 640@1 = 4,15 %, 780@3 = 3,03 % — beide
  erfuellt (knapp; der 640@1-Kontrolldieser Lane ist vom Fix unberuehrt, die
  Streuung zwischen Laeufen 2,44-4,15 % ist Kompositionszufall des Freeze-Frames).
  Draw-Calls ≤ Vorher + 10 %: drawsMean 4,7 -> 4,7 / 4,9 (+0 % / +4,3 %) — erfuellt.
- **Probe beweist den Hebel direkt im Spiel:** dprAlpha 0,6 -> 0,7 bei dpr 3,
  unveraendert 1,0 bei dpr 1 (additive FX ueber FxSystem-Spawn gemessen).
- Tests: tests/vfx-restore-st2.test.ts 13/13 (after-Blocks aktiv), Regression
  fx-overdraw/boss-fx-contrast/fx-add-cap/vfx-restore gruen — 80/80, tsc clean.

### art-director-Urteil

**PASS, Note 4/5** (Abnahmekriterium >= 4/5 erfuellt):

- Effekte deutlich praesenter: fx_shock-Ringe im Nachher satter und lesbar
  (vorher blassrosa, im Horde-Chaos untergehend; nachher kraeftig mit klarer
  Ringkante), fx_halo-Glows kerniger statt milchig.
- Keine Ueberstrahlung: Gegner-Silhouetten, XP-/Drop-Kristalle, HUD bleiben
  voll unterscheidbar — konsistent mit NW-A7-Full 0,45-0,70 % (< 4,16 %).
- Hinweis (kein Blocker): 0,6 -> 0,7 ist an der Saettigungsgrenze von
  fx_shock; eine weitere Erhoehung nur mit neuem Gate-Beleg.
- Belege: 3x-nearest Vergrößerungen in
  `~/games/.evidence/m10-vfx-restore-st2-r2/m10-vfx-st2-{before,after}-780x360@3-3x.png`.

**Gewaehlte Stufe: 2** — alle Abnahmekriterien erfuellt (NW <= 4,16 %,
Draw-Calls <= +10 %, art-director 4/5, 80/80 Tests + tsc gruen).

## Offene Punkte

- drawsMedian ist wegen bimodaler rAF-Verteilung unbrauchbar (0) — die Lane
  wertet drawsMean je Fenster aus; fuer kuenftige Draw-Call-Vergleiche
  das drawSummary um eine feste Fensterzaehlung erweitern (Backlog, kein Blocker).
- Freeze-Frame-Komposition streut zwischen Laeufen (NW-A7-Crop 640@1:
  2,44-4,15 % ueber vier Laeufe) — das 4,16-%-Gate bleibt haerte Grenze, aber
  Einzellaeufe an der Grenze sind moeglich. Gegebenenfalls Medium: 3 Laeufe
  mitteln (nicht Teil dieser Lane).

