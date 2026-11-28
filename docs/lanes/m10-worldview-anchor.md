# Lane m10-worldview-anchor-pools

Bedarf: m10-boss-dur-determinism K2 (`~/games/.dispatch/requests.md`, 2026-11-28 13:4xZ) —
Phaser setzt `camera.worldView` nur in `Camera.preRender`; der Sim läuft in festen
SIM_MAX_STEP-Teilschritten. Die Sim-Pfad-Leser von `worldView` sehen daher einen
frame-abhängigen View → RNG-Divergenz → stochastische Boss-Dauern (Korridor-A5-Verletzung).
Laufzeit-Patch mit deterministischem Sim-Anker (mid = scroll + width/2, logischer Screen
GAME_WIDTH × GAME_HEIGHT) macht 3 Seeds × 2 Läufe bitgleich — Beleg
`~/games/.evidence/m10-boss-dur-determinism/probe-runtime-patch.json`, Rezept:
`docs/lanes/m10-boss-dur-determinism.md` K2 (Lane-Worktree `m10-boss-dur-determinism`).

Schnitt: Diese Lane übernimmt DIE ZWEI FREIEN Leser — `src/systems/ProjectilePool.ts`
(view, ~Z.175) und `src/systems/EnemyProjectiles.ts` (refreshView, ~Z.463). Der dritte
Leser (`Spawner.ts` outsideView) gehört zu m10-frame-tail-followup und wird als
Folgekarte nach deren Merge geschnitten (Dora) — **Boss-Dauer-Determinismus ist komplett
erst mit dem Spawner-Teil** (siehe K4/offen).

Arbeitsbereich (Disponent): `src/systems/ProjectilePool.ts`, `src/systems/EnemyProjectiles.ts`,
`tests/worldview-anchor.test.ts`, `scripts/m10-worldview-anchor.mjs`,
`docs/lanes/m10-worldview-anchor.md`, `shots/m10-worldview-*`, `.lane-done`.

## K1 — Leser + Ankerfunktion + Vorher-Gegenprobe (#12455)

**Lokalisierung** (Stand dieses Worktrees, Stand 2026-11-28):

| Leser | Datei | Wirkung im Sim-Pfad |
|---|---|---|
| `ProjectilePool.view()` | `src/systems/ProjectilePool.ts:175` (vor Fix) | Offscreen-Culling/Recycle eigener Projektile |
| `EnemyProjectilePool.refreshView()` | `src/systems/EnemyProjectiles.ts:463` (vor Fix) | Sichtbarkeits-Gate für Gegner-Schüsse |
| `Spawner.outsideView()` | `src/systems/Spawner.ts:330` | NICHT diese Lane (m10-frame-tail-followup) |

**Ankerfunktion** `simAnchorView(scrollX, scrollY, cameraWidth, cameraHeight)` in
`src/systems/ProjectilePool.ts` (rein, exportiert, von `EnemyProjectiles` importiert):
Zentrum = `scroll + cameraWidth/2` (scrollX/Y wird pro Teilschritt in `Run.simulate`
aus der SIM-Position gesetzt, m10-run-determinism-fix), Weite/Höhe = logischer Screen
`GAME_WIDTH × GAME_HEIGHT` (#4658-Konvention). Rezept exakt wie
m10-boss-dur-determinism K2 Punkt 4.

**Vorher-Gegenprobe** (`scripts/m10-worldview-anchor.mjs`, ohne flock — sim-exakte
Marken, lastunabhängig; 3 Seeds × 2 Läufe, 700 Sim-Sekunden, timeScale 30, mira):

| Seed | erste Divergenz | abweichende Felder |
|---|---|---|
| 101 | mark s=42 | `culled` |
| 202 | mark s=52 | `culled` |
| 404 | mark s=50 | `culled` |

Beleg: `~/games/.evidence/m10-worldview-anchor-pools/m10-worldview-anchor-before.json`
(Skript-Exit 2). Die erste Divergenz liegt exakt im `culled`-Zähler des
Projektil-Pools — kausale Signatur des `view()`- worldView-Lesers, lange vor dem
ersten Boss (konsistent mit m10-boss-dur-determinism K2 Punkt 2: Divergenz startet
vor dem Boss).

## K2 — Beide Leser auf den Sim-Anker (#12456)

- `ProjectilePool.view()`: liest `simAnchorView(cam.scrollX, cam.scrollY, cam.width, cam.height)`
  statt `cam.worldView` (Frame-Cache/Scratch-Objekt unverändert, m10-heap-pool-fix).
- `EnemyProjectilePool.refreshView()`: dieselbe Umstellung in `viewProbe`.
- Verhalten bei 1x/60 fps unverändert: bei Teiler 1 ist `camera.width = GAME_WIDTH`
  und der Anker exakt `scroll ± (W/2, H/2)` = worldView; bei Teiler n ist
  Anker-Weite = `camera.width · n = GAME_WIDTH` = worldView-Weite bei
  `zoom = 1/n`, bis auf Phasers Floor-Rundung (~0,5 px). Beleg: Unit-Tests
  `tests/worldview-anchor.test.ts` (Teiler 1 exakt, Teiler 2 Mitte/Weite).
- Test-Stubs angepasst (minimal, begründet): die Stubs in
  `tests/projectile-cull`, `tests/heap-pool-fix` (Zähl-Kamera zählt jetzt den
  scrollX-Read statt worldView-Read — Cache-Verhalten unverändert ein Read/Frame),
  `tests/enemy-shots-fair` (worldView-Mutation → scrollX-Mutation, gleiche Rects),
  `tests/shot-clarity`, `tests/shot-budget-cap`, `tests/shot-budget-dt`,
  `tests/shot-path-budget` liefern der Kamera jetzt scrollX/scrollY/width/height
  statt nur worldView. Die getesteten Rects sind identisch (Geometrie-Rechnung
  in der Lane-Doku K1/K2). Begründung: die Leser-Quelle hat sich geändert,
  die Stubs müssen die neue Quelle füttern; getestete Spiellogik unverändert.

## K3 — Guard-Tests (#12457)

`tests/worldview-anchor.test.ts`:
- `simAnchorView` pure: Teiler 1 exakt worldView-Geometrie; Teiler 2 Mitte =
  scroll + cameraWidth/2, Weite/Höhe = logischer Screen; Mitte unabhängig vom
  logischen Screen (#4658).
- **Leck-Guard:** Kamera-Stub mit `worldView`-Getter, der wirft — `compact()`
  bzw. `spawn()` dürfen den Sim-Pfad nie über worldView führen (Regression gegen
  die K2-Leck-Klasse).
- Fairness-Invarianten der enemy-shots-Tests (`tests/enemy-shots-fair`) bleiben grün.

## K4 — Nachher: 3 Seeds × 2 Läufe (#12458)

**Zweite Leck-Schicht im eigenen Bereich gefunden und geschlossen:** die erste
Nachher-Probe divergierte weiter im `culled`-Zähler. Ursache: der Frame-Cache in
`ProjectilePool.view()` (m10-heap-pool-fix) friert den View PRO RENDER-FRAME ein —
`compact()` läuft aber je SIM-Teilschritt, bei timeScale 30 also bis zu ~25
Teilschritte pro Frame, die den Anker des ersten Teilschritts sehen. Der Rezept-
Beweis-Patch (m10-boss-dur-determinism, `~/tmp/m10-boss-dur-determinism/probe-fix.mjs`)
hat `view()` komplett ersetzt — also ohne Cache. Konsequenz: **Frame-Cache entfernt**,
`view()` liest den Anker frisch je Aufruf (billige Arithmetik, viewScratch bleibt,
0 Allokationen — Heap-Invarianten bleiben, `tests/heap-pool-fix` entsprechend
geschärft: frisch je Aufruf statt ein Read pro Frame).

Belege (`scripts/m10-worldview-anchor.mjs`, je 3 Seeds × 2 Läufe, 700 Sim-Sekunden,
timeScale 30, mira, ohne flock):

| Probe | Urteil | erste Divergenz | Datei |
|---|---|---|---|
| Vorher (unverändert) | divergent | s=42/52/50, Feld `culled` | `m10-worldview-anchor-before.json` |
| Nachher (K1+K2-Fix) | divergent | s=205/173 — frühe Cull-Divergenzen weg | `m10-worldview-anchor-after.json` |
| Nachher + Spawner-Isolation (`--patch-spawner=1`) | **DETERMINISTISCH (0 Abweichung)** | — | `m10-worldview-anchor-after-spawner-isolated.json` |

Alle in `~/games/.evidence/m10-worldview-anchor-pools/`. Renderer-String im Beleg:
`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (kein SwiftShader).

**Interpretation:** Mit den beiden hiesigen Lesern am Sim-Anker (frisch je
Teilschritt) und NUR dem fremden Leser `Spawner.outsideView` zur Laufzeit gepatcht
sind 3 Seeds × 2 Läufe bitgleich — die beiden hiesigen Leser sind leckfrei. Die
Rest-Divergenz des ungepatchten Builds (s=205/173, deutlich später als Vorher)
ist der dritte Leser `Spawner.outsideView` (Z.330) und wird mit der Folgekarte
nach m10-frame-tail-followup geschlossen (Dora schneidet).

Offen: **Boss-Dauer-Determinismus komplett erst mit dem Spawner-Teil** — der
End-to-End-Beweis über Boss-Dauern (wie probe-runtime-patch.json in der
Bedarfs-Lane) wird dann mit allen drei Lesern am Anker erwartet.

## K5 — Doku + Abschluss (#12459)

Offen: **Spawner-Leser (`Spawner.outsideView`, Z.330)** — Boss-Dauer-Determinismus
komplett erst mit der Folgekarte nach m10-frame-tail-followup (Dora schneidet).
Der Nachher-Beleg dieser Lane belegt die Schuss-Marken (culled/stolen/fired/hits);
die End-to-End-Boss-Dauern werden erst nach dem Spawner-Teil bitgleich erwartet.
