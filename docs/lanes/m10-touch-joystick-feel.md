# Lane m10-touch-joystick-feel — Touch-Joystick-Feel (Deadzone, Richtungs-Glättung, Snapping)

Worktree `/home/ai/games/lf-lanes/m10-touch-joystick-feel`, Branch `m10-touch-joystick-feel`.
Nur `src/input/TouchControls.ts` (+ Tests/Messbelege) — `InputState.ts` (esc-pause-fix-Wartebereich)
und `Run.ts` unberührt. Kein Balance-Eingriff: Bewegungsbudget/Speed unverändert, die
Magnitude-Remap passiert weiterhin in `InputState.applyTouchDeadzoneHysteresis`.

## Problem

Der Touch-Joystick schrieb bei **jedem** `touchmove` den Rohvektor in den Snapshot
(Update-Rate 1,0/Frame). Mikro-Jitter (< 1 px) erzeugte damit:
- Positions-Updates ohne sinnvolle Bewegung (22–56 Frames je Serie im Ist),
- Richtungsflackern, solange der Finger nahe am Ursprung steht (Fehlrichtung 4,67 %
  der Geraden-Samples), und Bewegungs-Output bereits bei Sub-Pixel-Jitter.

## Fix (`src/input/TouchControls.ts`, Commit 5fa9af5)

Nur die **Ausgabe** des Joysticks wird gefiltert, die Magnitude bleibt exakt:

1. **Deadzone** `joystickDeadzonePx(viewWidth)` = 16 % des Ring-Radius (44 px),
   **skaliert mit der Viewport-Breite** (7 px @480, 9 px @640, 11 px @780 — der Daumen
   hat auf großen Screens mehr Platz). Unter der Totzone: Knauf ruht, Vektor exakt 0.
2. **8-Richtungs-Snapping** (`sectorIndex8`, Sektorbreite 45°) **nur jenseits der
   Deadzone**; die Magnitude (`len / RING_RADIUS`) bleibt unangetastet.
3. **Sektor-Hysterese** (`sectorWithHysteresis`, Marge 5,625°): an Sektorgrenzen bleibt
   der bisherige Sektor stehen, bis der Rohwinkel mehr als 22,5° + 5,625° vom
   Sektorzentrum entfernt ist — kein Flackern zwischen Nachbarsektoren.
4. **Output-Eps** (0,02 ≈ 0,9 px): Snapshot/Knauf werden erst geschrieben, wenn sich
   der Vektor merklich ändert — Mikro-Jitter erzeugt keine Positions-Updates mehr,
   echte Bewegung bleibt synchron (0 Frames Latenz).

Chest-lock-Gate-Verhalten (C1–C7, Gate einmalig bei Touchstart + Move-Sperre) ist
unverändert; Hysterese/lastSent werden bei `touchstart`, `discardGesture()` und
`update()` bei `canMove=false` zurückgesetzt.

## Messung (`scripts/m10-touch-joystick.mjs`, Karte #6678/#6681)

Echtes `TouchControls.ts` per tsc kompiliert, DOM-Stub (Technik wie
`tests/chest-lock-touch.test.ts`), synthetische Drag-Seren (deterministisches Rauschen,
Seed fix): Gerade 150 Frames ±1,6 px, Kreis 240 Frames Radius 30, Zickzack 180 Frames.
1 Frame = 1 `touchmove`. Belege: `shots/m10-touch-joystick-before.json` (39b6568) und
`shots/m10-touch-joystick-after.json` (178..K4).

### Verbindliche Gate-Definition (vor der Nachher-Auswertung festgelegt)

**Fehlrichtung** = |Ausgabewinkel − Sollwinkel| > 22,5° (halber Sektor = 8-Snapping-
Quantisierung) + 5,625° (dokumentierte Hysterese-Marge) = 28,125°. Beides ist
Feel-Design, kein Richtungsfehler; gepoolt über Gerade + Kreis.

| Serie | Update-Rate vor→nach | leere Updates vor→nach | Richtungswechsel/Jitter vor→nach | Fehlrichtung nach |
|---|---|---|---|---|
| Gerade | 1,00 → 0,14 | 22 → 1 | 2/2 → 1/1 | 2,08 % (3/144) |
| Kreis | 1,00 → 0,39 | 56 → 2 | 10/0 → 8/0 (8 = legitime Sektor-Schritte) | 0,83 % |
| Zickzack | 1,00 → 0,14 | 16 → 0 | 3/0 → 1/0 | n/a |
| **Gates** | ≤ 1,0 | — | — | **pooled 1,3 % < 2 % PASS** |

- **Latenz** (Sprung 20 px nach 3 Mikro-Jitter-Frames): **0 Frames** (≤ 2 PASS);
  Mikro-Jitter emittiert keine Bewegung mehr (vorher: ja).
- **Updates/Frame**: 0,24 gepoolt vs. Baseline 1,0 (nicht erhöht, −76 % PASS).

Die 3 verbleibenden Geraden-Fehlrichtungssamples stammen aus akkumuliertem
Random-Walk-Drift des Rauschens, der den Rohwinkel echt über die Sektorgrenze trägt —
folgerichtig gerastet, kein Jitter-Artefakt.

## Tests / Build

- `tests/touch-joystick-feel.test.ts` (K3, Commit 178f41b): Deadzone-Semantik +
  Viewport-Skalierung, 8-Snapping mit Magnitude-Erhalt, Sektor-Hysterese
  (Jitter-Serie → ≤ 1 Richtungswechsel pro 4 Frames — Ist: 0), Output-Eps
  (60 Jitter-Moves → ≤ 1 Update), Latenz 0 Frames, chest-lock-Gate-Semantik.
- Gezielt: feel + chest-lock **25/25 grün**; `npm test` **863/863 (84 Dateien)**;
  `npx tsc --noEmit` rc=0; `npm run build` rc=0.
- `node scripts/verify-input.mjs`: **Touch-Checks 9/9 OK**, gesamt 27/28 — der eine
  FAIL („Tastatur: ESC setzt fort") ist **pre-existing**: die esc-pause-fix-Lane
  (Merge f3dfcbf, „verify-input 28/28 PASS") ist nicht in dieser Lane-Basis
  (`git merge-base --is-ancestor f3dfcbf HEAD` → nein). Touch-Verhalten unverändert.
  Regenerierte fremde Shots/JSONs (`m8-input-*`, `m10-passive-math-*`) wurden
  zurückgesetzt, nicht committet.

## Board / Disposition

- K1 #6678 Ist-Messung (39b6568), K2 #6679 Fix (5fa9af5), K3 #6680 Tests (178f41b),
  K4 #6681 Nachher + Doku + `.lane-done`.
- Supervisor-Hinweis befolgt: before-Lauf genau 1×; die beim ersten gescheiterten
  tsc-CLI-Aufruf (TS5112) nach `src/` emittierten **ungetrackten** Build-Artefakte
  (`src/input/*.js`, `src/palette.js`) wurden gelöscht (nie in git, kein Claim).

## Offene Punkte

- Die 8 Richtungen sind ab jetzt die Ausgabe-Auflösung des Touch-Joysticks; ob Dom
  die Diagonalen-Quantisierung im Spielgefühl positiv bewertet, zeigt die Sichtprüfung
  auf dem Gerät (hier nur synthetisch belegt).
- iOS-Safari auf echtem Gerät nicht gemessen (Code-Pfad identisch, DOM-Zustellung kann
  um wenige ms abweichen — siehe m10-touch-latency-Lane).
