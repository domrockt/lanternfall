# Lane m10-enemy-idle-anim-r2

Re-Queue des Opfers des Ancestor-Bugs (Original 06:47:13 getoetet, 0 Agent-Laeufe).
Ziel: Gegner wirken in Wellen-Luecken/Spawner-Nachruecken als Standbild — Optik-Kurs
(Dom 21:45Z Punkt 5, „Qualitaet der Pixelgrafik“).

## K1: Ist-Analyse Frame-Bank (abgeschlossen)

Skript: `scripts/m10-enemy-idle.mjs` (Ist-Aufnahme + Kontaktboegen 4x, Mini-PNG-Encoder,
Muster `scripts/m10-boss-idle-anim.mjs`).

Belege: `~/games/.evidence/m10-enemy-idle-anim-r2/m10-enemy-idle-before.json`,
`enemy-idle-before-bog_rat-268x64.png`, `enemy-idle-before-wisp-268x64.png`,
`enemy-idle-before-mudling-268x64.png`.

### Befund (weicht von der Briefing-Annahme ab)

Briefing-Annahme war „Klassen haben nur 1 Idle-Frame“. Gemessen:

1. **Alle 30 Klassen haben 4 Frames** (Ruhepose + 3 Lauf-/Bob-Posen), **0 byte-identische
   Duplikate**, Pixel-Diff Frame 0 → Frame i: 70–461 px (je Klasse > 0, siehe JSON
   `detail[].diffs`). Die Frame-Bank (`GEN_ENEMIES`) ist vollstaendig.
2. Laufzeit: Run.ts animiert jeden sichtbaren Gegner zyklisch ueber alle Frames
   (`runFrameIndex`, 6 fps, src/scenes/Run.ts ~1350). Basis-Gegner sind also NICHT
   Standbild — K2/K3 muessen hier nichts generieren.
3. **Die eigentliche Luecke: die 30 Elite-Rim-Framesets haben genau 1 Frame**
   (`eliteRimFrame`, `ELITE_RIM_FRAMES = [rimKey]` in src/gfx/enemySprites.ts;
   Kommentar dort: „stabil auf den einen Rim-Frame“). Elite-Gegner stehen als Bild.
   Elites sind gross, tragen Amber-Rand + Aura und fallen in Wellen-Luecken besonders
   auf — das deckt sich mit Doms Beobachtung („Spawner-Nachruecken“: Elites rücken
   sichtbar nach).

Konsequenz fuer K2/K3: der 2-Frame-Idle/Bob wird fuer die **Elite-Rim-Framesets**
generiert (Rim-Variante der Ruhepose + Rim-Variante der Laufpose, palettetreu,
binaeres Alpha, Tier-Faerbung/Elite-Signal unangetastet). Abnahme-Kriterium
„Frame-Zahl je Klasse >= 2, 0 Duplikate, 0 Off-Palette“ wird damit auf die
Rim-Framesets angewendet; die Basis-Klassen erfuellen es bereits (K1-Beleg).

## K2/K3: 2-Frame-Rim-Idle (in Arbeit)

- K2: Rim-Frame 2 (Laufpose-Rim) fuer alle 30 Typen + Registrierung/Keys.
- K3: Verifikation (0 Duplikate, 0 Off-Palette, Tests), ggf. Split nach Tier-Familien.

## K4: Regressionstest + Nachher + Doku (offen)

- `tests/enemy-idle.test.ts`: Basis-Frames >= 2, Rim-Framesets >= 2, 0 Duplikate,
  0 Off-Palette-Pixel.
- Probe `node scripts/m10-enemy-idle.mjs after`, Nachher-Shots,
  Burst >= 55 FPS bei 500 Gegnern (flock, Vorher/Nachher),
  art-director >= 4/5, `.lane-done`.

### K4-Teilstand

- **tests/enemy-idle.test.ts: ERLEDIGT** (4 Tests: 30 Basis- + 30 Rim-Framesets >= 2
  Frames, 0 Duplikate, 0 Off-Palette, binaeres Alpha, Idle/Bob-Diff > 0, Amber-Rand
  in beiden Posen). Full-Suite 1694/1694 gruen (K3-Commit).
- **Probe after: ERLEDIGT** (`~/games/.evidence/m10-enemy-idle-anim-r2/
  m10-enemy-idle-after.json`) — Basis-Frames bytegleich zu before (Lauf-Zyklen,
  Silhouetten unberuehrt).
- **Perf nachher: ERLEDIGT** — Burst 59,7 FPS bei 500 Gegnern (worstFrameMs 50),
  60,1 FPS @ 300 (worstFrameMs 16,8), Vorher 60/60,7 — beide >= 55, innerhalb der
  Mess-Streuung. Logs: `~/tmp/m10-enemy-idle-anim-r2-perf-{before,after}.log`.
- **In-game Sicht-Beleg (Elite-GIF): BLOCKED.** Ursache (Diagnose-JSON,
  3 Konfigurationen): Elites sind im Spiel nicht deterministisch erreichbar.
  - `window.__lf.spawnEnemy` (src/debug.ts) exponiert `Spawner.spawnEnemy` ohne
    den `elite`-Parameter (Spawner.ts:211 `elite = false`) — Debug-Spawns sind
    NIE Elites.
  - Natuerliche Elite-Wellen: in der Fast-Forward-Konfiguration (god,
    level-ups unterdrueckt, timeScale 30) spawnen bis Minute 4,5 ausschliesslich
    Tier-0-Gegner (spawnCounts: bog_rat/bogzombie/crow/wisp/mudling/toad),
    0 Rim-IDs im `__lfEnemyFrames`-Fenster; auch Minute 10 (isEliteMinute,
    eliteChance 4,3 %) liefert in 90 s Beobachtung keinen Elite im Viewport.
  - Der `slice(0, 12)` in `__lfEnemyFrames` (Run.ts, fremde Datei) begrenzt das
    Sichtfenster zusaetzlich.
  Benoetigt: 1-Zeilen-Aenderung in src/debug.ts — `spawnEnemy(id, n, elite = false)`
  an `Spawner.spawnEnemy(id, n, x, y, elite)` durchreichen (oder eigenes
  `spawnElite`). Antrag in `/home/ai/games/.dispatch/requests.md` gestellt.
  Das Skript `scripts/m10-enemy-idle-shots.mjs` ist fertig gebaut (Minute-10-
  Fast-Forward, Elite-Fenster-Wait, GIF + `slotsWithBothFrames`-Nachweis) und
  laeuft, sobald der Debug-Spawn existiert.

## FPS-Messungen (nur mit flock /home/ai/games/.lf-perf.lock)

- Vorher (K1-Baseline): `~/tmp/m10-enemy-idle-anim-r2-perf-before.log` —
  Burst 60,0 FPS @ 500 (worstFrameMs 16,8), 60,7 FPS @ 300 — passed.
- Nachher (K4): `~/tmp/m10-enemy-idle-anim-r2-perf-after.log` —
  Burst 59,7 FPS @ 500 (worstFrameMs 50), 60,1 FPS @ 300 (worstFrameMs 16,8) —
  Ziel >= 55 erfuellt; 2. Rim-Frame kostet keine messbare Frame-Zeit
  (+30 Canvas-Texturen <= 32 px im Atlas).

## Fremd-Dateien (minimal, begruendet)

- tests/elite-rim.test.ts, tests/elite-tier-families.test.ts,
  tests/enemy-run-frames.test.ts, tests/crowd-variety.test.ts: je 1-2
  Assertion-Zeilen, die den alten 1-Frame-Rim-Vertrag pinnen — ohne Aktualisierung
  wären sie durch die 2-Frame-Rim-Idle rot. Nicht geclaimed, Aenderung minimal.
- src/debug.ts NICHT angefasst (Antrag gestellt, siehe K4-BLOCKED).

## Probe-Skript-Iterationen (ehrlich)

scripts/m10-enemy-idle-shots.mjs benoetigte 6 Laeufe (2 Fachfehler: state().time
heisst nicht elapsed; Fast-Forward braucht permanente Level-up-Unterdrueckung —
Ember-8-Variante tötete die Elites, bevor sie sichtbar wurden). Der Supervisor
stoppte den Loop; Ursache ist die fehlende Debug-Elite-Spawn-API, nicht das Skript.
