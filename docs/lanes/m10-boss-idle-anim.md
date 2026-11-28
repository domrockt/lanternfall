# Lane m10-boss-idle-anim — Boss-Idle-Animation (Optik-Job, 2026-11-27)

## Auftrag
Die 6 Bosse wirkten als Standbilder, während Gegner Lauf-Frames haben.
Ziel: pro Boss ein sichtbares 2-Frame-Idle (Atmung, <= 1 px ganzzahliger Versatz)
plus ein 1-Frame-Telegraph-Zucken. Nur `src/gfx/gen-bosses.ts` (Disponent-Bereich),
BossSystem/Run.ts unangetastet. Mixel-Regel: eine Pixelgröße, Frames im Bake.

## Ist-Analyse (Karte #6518, Beleg: `shots/m10-boss-idle-anim-before.json` + `-before-640.png`)
Alle 6 Bosse hatten zwar bereits 3 Frames (Ruhe/Atmen/Wind-up, 0 Duplikate), aber:
- **Idle-Versatz 2–3 px** (F1 war das komplette Sprite 2 px nach oben verschoben,
  coven 3 px) — verletzte die <=1-px-Regel, wirkt wie Hüpfen/Wackeln.
- **Telegraph-Frame kaum sichtbar** bei bone_lord (F0–F2-Diff 110 px) und
  hollow_king (472 px) — nahezu Duplikat des Ruheframes.
- Laufzeit: `runFrameIndex()` zyklisiert alle 3 Frames bei 6 fps
  (src/logic/enemy-frames.ts), während Telegraph greift frames[2].

## Fix (Karten #6519, #6520)
Frames werden deterministisch aus F0 im Skript abgeleitet und in den Bake
(`src/gfx/gen-bosses.ts`) gespliced — keine Laufzeit-Skalierung, Palette unverändert:
- **F1 = Atmen (Squash):** Oberkörper (bis 65 % der Silhouettenhöhe) 1 px nach
  unten, Füße bleiben fix, oberste Content-Reihe wird frei. Versatz = +1 px.
- **F2 = Telegraph-Zucken:** ganzes Sprite 1 px hoch (Versatz −1 px). Im Spiel
  kommt während des Telegraphen zusätzlich der rote Tint aus Run.ts — die
  Lesebarkeit des Telegraphen bleibt dadurch erhalten.
- Die bisherigen Wind-up-Posen (F2) entfallen: sie wurden (weil der Idle-Zyklus
  alle 3 Frames zeigt) alle 500 ms während des Idle eingespielt — ein Grund,
  warum die Bosse unruhig/leblos wirkten. Der ruhige Squash/Lunge-Zyklus
  (Ruhe → 1 px Squash → 1 px Lunge) wirkt lebendig ohne Wackel-Artefakte.

Messwerte nachher (`shots/m10-boss-idle-anim-after.json`):

| Boss | Frames | Duplikate | F0–F1-Diff | F0–F2-Diff | Idle-Versatz | Telegraph-Versatz |
|---|---|---|---|---|---|---|
| moor_queen | 3 | 0 | 431 | 733 | +1 | −1 |
| bone_lord | 3 | 0 | 634 | 849 | +1 | −1 |
| pale_shepherd | 3 | 0 | 630 | 898 | +1 | −1 |
| bell_golem | 3 | 0 | 619 | 1104 | +1 | −1 |
| coven | 3 | 0 | 731 | 1260 | +1 | −1 |
| hollow_king | 3 | 0 | 887 | 1593 | +1 | −1 |

## Tests (Karte #6521)
`tests/boss-idle-anim.test.ts` (9 Tests): 6/6 Bosse mit >= 2 Idle-Frames,
0 Frame-Duplikate, Atmung sichtbar (F0–F1-Diff > 100 px), Telegraph lesbar
(F0–F2-Diff > 100 px), Idle-Versatz <= 1 px, Palette-Compliance (nur Indizes
0–31), Frame-Grid w×h konsistent, Frame-Budget neutral (3 Frames je Boss).

## Belege (Karte #6522)
- `shots/m10-boss-idle-anim-after-640.png` — After-Kontaktbogen (4x, F0|F1|F2
  nebeneinander, F2 rot beschriftet)
- `shots/m10-boss-idle-anim-idle.gif` — Idle-Zyklus als 2-Frame-GIF (400 ms/Frame)
- **Beleg-Korrektur in #6520:** die zuerst erzeugten Kontaktbögen (Karten #6518/
  #6519/#6520) hatten einen Layout-Bug — die 3 Frames wurden übereinander statt
  nebeneinander gerendert (Bogen zeigte effektiv nur F2). Das Layout wurde im
  Skript gefixt; `before-640.png` und `after-123-640.png` wurden in Commit
  1237d3c regeneriert (Messwerte in before.json unverändert).
- art-director-Sichtprüfungen: siehe „Sichtprüfungen" (Note >= 4/5 gefordert)
- FPS-Burst: `flock /home/ai/games/.lf-perf.lock npm run perf` — **60.2 FPS**
  (600 Frames / 10014 ms, worstFrame 33.4 ms, 300 Gegner, Level 45, passed=true,
  0 JS-Fehler) — unverändert zur Baseline, >= 55 FPS erfüllt.

## Offene Punkte / Hinweise
- **Idle-Zyklus zeigt F2 mit** (art-director-Hinweis aus K2): `runFrameIndex()`
  zyklisiert bei 6 fps alle 3 Frames inkl. Telegraph-Zucken — semantisch ist F2
  damit doppelt belegt (Idle-Strecken + Telegraph). Sieht im Kontaktbogen wie ein
  plausibles 3-Phasen-Atmen aus; falls das Spiel das Idle auf F0/F1 begrenzen
  will, wäre das eine eigene Karte in `src/logic/enemy-frames.ts`/`Run.ts`
  (nicht im Disponent-Bereich dieser Lane).
- Der Telegraph-Zucken ist bewusst dezent (1 px) gehalten; die starke
  Telegraph-Lesbarkeit kommt im Spiel vom roten Tint + HP-Leisten-Banner.
- `scripts/m10-boss-idle-anim.mjs` kennt `gen`-Modus (F1/F2 aus F0 ableiten,
  splice in gen-bosses.ts) und `gif`-Modus (ffmpeg). Werkzeug, kein Spielcode.
- Die alten Wind-up-Posen sind in der Git-Historie von `src/gfx/gen-bosses.ts`
  wiederfindbar (vor diesem Lane-Commit), falls sie für einen späteren
  Angriffs-Animation-Pass gebraucht werden.

## Sichtprüfungen
- Karte #6519 (Bosse 1-3): art-director **PASS**, je Boss Note 4/5 — Belege:
  eigene 4x-Seit-an-Seit-Messung (Füsse fix: unterste Reihe gleiche Y/X-Position,
  dy_top=+1, dy_bot=0; F2 dy=-1, kein Schräglauf), Palette byte-identisch (F0
  unverändert, F1/F2 ohne neue Chars), Pixel-Grid intakt.
- Karte #6520 (Bosse 4-6): art-director **PASS** (alle Kriterien >= 4) —
  eigene Pixelmessung aus den Grids: Squash genau im oberen 65-%-Bereich,
  unterste 5 Content-Reihen F0==F1 (Füsse fix), F2 bit-identisch zu F0 nach
  1-px-De-Shift, Paletten-Charmengen je Frame identisch, Grid w×h exakt.
  Optionaler Nachbesserungs-Vorschlag (kein Blocker): F2 könnte zusätzlich
  1-2 px Posen-Akzent (Glutaugen heller) vertragen — Backlog.
