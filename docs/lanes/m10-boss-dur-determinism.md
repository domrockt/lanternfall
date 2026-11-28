# Lane m10-boss-dur-determinism

Bedarf: m10-balance-corridor-guard, Ergänzung 2026-11-28T12:35Z in `~/games/.dispatch/requests.md` —
gleiche Seeds liefern je Lauf VERSCHIEDENE Boss-Dauern (mira/202: 30,1 s kurz vs. 15,1 s full) →
Dom-Korridor (Boss-Dauer 20–60 s, ACCEPTANCE A5) ist stochastisch und nicht verlässlich abnehmbar.
Verdacht laut Briefing: ungesäte RNG oder Frame-count-abhängiges Timing im Boss-Pfad
(Muster m10-spawn-budget-dt / m10-shot-budget-dt).

Arbeitsbereich (Disponent): `src/systems/BossSystem.ts`, `src/logic/bosses.ts`,
`tests/boss-dur-determinism.test.ts`, `scripts/m10-boss-dur-det.mjs`,
`docs/lanes/m10-boss-dur-determinism.md`, `shots/m10-boss-dur-det-*`, `.lane-done`.

## K1 — Reproduktion (#12109)

Skript: `scripts/m10-boss-dur-det.mjs` — je Seed 2 identische Browser-Läufe
(autoPlay, timeScale 30, `?detstart=1` + `resumeRun`, wie `scripts/m10-run-determinism.mjs`);
Marken werden sim-exakt im `Run.simulate`-Patch gelesen: `bossWarn` (Spawn) und
`bossDefeated` je Boss-Index → Boss-Dauer = Defeat − Spawn. Kein FPS-Messziel → ohne flock.

Vorher-Befund (`shots/m10-boss-dur-det-before.json`, kanonisch
`~/games/.evidence/m10-boss-dur-determinism/m10-boss-dur-det-before.json`, je 700 Sim-Sekunden):

| Seed | Boss #0 rep0/rep1 | Boss #1 rep0/rep1 | Urteil |
|---|---|---|---|
| 101 | 11,75 s / 11,75 s | 30,00 s / 28,25 s | divergent |
| 202 | 11,05 s / 27,70 s | 26,05 s / 27,00 s | divergent |
| 404 | 26,95 s / 8,40 s | 26,25 s / 22,55 s | divergent |

Skript-Exit 2 (= nicht deterministisch). Die Boss-Spawndauern-Abweichung aus der
Bedarfsmeldung (30,1 s vs. 15,1 s) ist damit reproduziert.

## K2 — Ursache (#12110)

**Die Ursache liegt nachweislich außerhalb des Boss-Bereichs.** Belegkette:

1. **Hit-Stop ausgeschlossen** (Probe `--nohitstop=1`, Patch von `Run.bossHitFeedback` → No-op,
   `~/games/.evidence/m10-boss-dur-determinism/m10-boss-dur-det-probe-nohitstop.json`):
   weiterhin divergent (seed 101 Boss#0 11,75/28,30 s). Hit-Stop/Slowmo sind nicht die Ursache.
2. **Divergenz startet vor dem Boss** (Zustands-Probe, `~/tmp/m10-boss-dur-determinism/probe-state.json`):
   erste Abweichungen bei s=48 (unterschiedliche Gegner-UIDs 24/27/28, Kill-Timing) und
   s=186/224 (Gegnerpositionen), bei bitgleichem RNG-Schedule — der Boss-Kampf bei 300 s
   erbt eine bereits divergierte Gegnermenge. Der Boss-Pfad ist nicht die Wurzel.
3. **Mechanismus:** Phaser setzt `camera.worldView` AUSSCHLIESSLICH in `Camera.preRender`
   (pro Render-Frame, `node_modules/phaser/src/cameras/2d/Camera.js`, `preRender` →
   `this.worldView.setTo(...)`). Der Sim läuft aber in festen `SIM_MAX_STEP`-Teilschritten
   (bei timeScale 30 bis zu ~25 Schritte pro Render-Frame); alles, was im Teilschritt-Loop
   `worldView` liest, sieht einen bis zu einen Render-Frame alten, frame-abhängigen View:
   - `src/systems/Spawner.ts:206` — `outsideView()` (Spawn-Platzierung `spawnOne`/Ring-Welle)
   - `src/systems/ProjectilePool.ts:175` — `view()` (Offscreen-Culling eigener Projektil-Pools)
   - `src/systems/EnemyProjectiles.ts:463` — `refreshView()`/`isInView` (Gegner-Schüsse)
   Frame-abhängige Spawn-/Cull-Entscheidungen verschieben Kills, Spawns und damit den
   RNG-Ziehungsstrom → der gesamte Lauf divergiert → Boss-Dauern stochastisch.
   Gleiche Fehlerklasse wie m10-spawn-budget-dt / m10-shot-budget-dt (frame-count-abhängiges
   Timing im Sim-Pfad), diesmal über die render-synchronisierte `worldView`.
4. **Kausaler Beweis per Laufzeit-Patch** (`~/games/.evidence/m10-boss-dur-determinism/probe-runtime-patch.json`,
   One-off-Probe `~/tmp/m10-boss-dur-determinism/probe-fix.mjs`, KEINE Änderung an fremden Dateien):
   Werden NUR die drei `worldView`-Leser zur Laufzeit auf den deterministischen Sim-Anker
   umgestellt (`mid = scroll + width/2`, logischer Screen `GAME_WIDTH × GAME_HEIGHT` — das ist
   die `worldView` bei erzwungener Projektion `zoom = 1/Teiler`), liefern **3 Seeds × 2 Läufe
   (700 s, 30x) bitgleiche Marken inkl. Boss-Dauern**:
   seed 101: 31,10/31,10 + 31,15/31,15 · seed 202: 12,10/12,10 + 26,65/26,65 ·
   seed 404: 13,30/13,30 + 29,50/29,50.

### Bedarfsmeldung (Fix außerhalb des Bereichs)

→ `~/games/.dispatch/requests.md`, 2026-11-28: die drei Sim-Pfad-Leser von
`camera.worldView` (`Spawner.outsideView`, `ProjectilePool.view`, `EnemyProjectiles.refreshView`)
auf den Sim-Anker umstellen (Rezept exakt wie K2-Punkt 4; Verhalten bei 1x/60 fps unverändert,
weil `worldView ≈ scroll ± (W/2, H/2)` bei `zoom = 1/Teiler` bis auf Phasers Floor-Rundung
~0,5 px). Bis dahin bleibt der Dom-Korridor (A5) stochastisch — der Korridor-Bug ist ein
Symptom dieses allgemeinen Frame-Lecks, nicht ein Boss-Datenproblem.

## K3 — In-area-Härtung: BossSystem deterministisch (#12111)

Der Boss-Bereich selbst hat zwei Rest-Leser von Render-Zustand im Sim-Pfad, die im
K2-Beweis-Patch nicht angefasst waren und trotzdem nicht divergierten (Boss spawnt mit
144 px im View, Intro-Pulse überschneiden keine Spawns) — sie werden dennoch gehärtet,
damit der Boss-Pfad nach dem externen Fix garantiert leckfrei ist:

1. `BossSystem.viewRect()` liest `camera.worldView` → ersetzt durch reine Funktion
   `simViewRect()` in `src/logic/bosses.ts` (Sim-Anker: `camera.scrollX/Y` wird pro
   Teilschritt in `Run.simulate` gesetzt; Weite/Höhe = Viewport × Render-Teiler —
   `enforceCameraProjection` setzt `camera.width = scale.width/s` und `zoom = 1/s`,
   die `worldView` ist bei ungepulstem Zoom genau `camera.width × s` breit).
2. `BossSystem.spawn()` liest live `camera.zoom` (Intro-Zoom-Puls ist ein Echtzeit-Tween) →
   Teiler jetzt deterministisch aus `game.scale.height / camera.height` abgeleitet
   (beide konstant pro Skalierung), `pulseZoom = BOSS_INTRO_ZOOM × Teiler` — bei
   `zoom = 1/Teiler` bitgleich zum bisherigen Worst-Case.

Verhalten bei vollem 60-FPS-Lauf: unverändert bis auf ≤ 0,5 px an Gate-Grenzen —
Phaser rundet die `worldView` ganzzahlig (`Camera.preRender`), die reine Funktion
rechnet mit exaktem `scrollX`; Richtung des Deltas: weg vom frame-abhängigen
Render-Stand, hin zum Sim-Anker. `pulseZoom` ist bei Teiler 1 bitgleich (1,14);
der Intro-Puls wird bewusst nicht mehr in die Sim-Gates eingerechnet (rein visuell).

## K4 — Test + Belege + Abschluss (#12112)

- `tests/boss-dur-determinism.test.ts` (7 Tests, grün):
  - `simViewRect` pure: Sim-Anker-Rect unabhängig von `worldView`-Mutationen (Regression gegen
    die K2-Leck-Klasse im Boss-Bereich), Teiler-Ableitung 1/2/3, Reinheit/Determinismus,
    Fallback ohne `game.scale` (Headless).
  - `BossSystem.spawn` mit Stub-Szene: Spawn-Position bitgleich unabhängig von `camera.zoom`
    (Intro-Puls darf die Komposition nicht frame-abhängig machen).
- Reviewer-PASS (2026-11-28): simViewRect/renderDivisor-Geometrie, Deltas dokumentiert
  (worldView-Integer-Rundung ≤ 0,5 px an Gate-Grenzen; pulseZoom bei Teiler 1 bitgleich 1,14);
  Fallback-Test + Doku-Präzisierung nach Review umgesetzt.
- End-to-End (3 Seeds × 2 Läufe, 0 Abweichung): **blockiert auf dem externen Fix**
  (Bedarfsmeldung, siehe K2) — mit dem Laufzeit-Patch belegt erreichbar
  (`probe-runtime-patch.json`), im unveränderten Build stochastisch. `npm test` grün.

## Notizen

- #12013 (Merge-Fix m10-loading-screen) gehört nicht zu dieser Lane — fremde Karte gemäß
  Briefing-Regel nicht angenommen (Stand 2026-11-28, Supervisor-Hinweis zur Kenntnis genommen).
- Probe-/Mess-Skripte: `scripts/m10-boss-dur-det.mjs` (Deliverable, 2 Edit-Iterationen),
  One-off-Probes außerhalb des Repos unter `~/tmp/m10-boss-dur-determinism/`.
- Belege: `~/games/.evidence/m10-boss-dur-determinism/` (before, probe-nohitstop,
  probe-runtime-patch), Kopie des Vorher-JSON als `shots/m10-boss-dur-det-before.json`
  (gitignored, nicht committet).
