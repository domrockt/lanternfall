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

## FPS-Messungen (nur mit flock /home/ai/games/.lf-perf.lock)

- Vorher (K1-Baseline): `~/tmp/m10-enemy-idle-anim-r2-perf-before.log` — TBD
