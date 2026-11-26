# Lane m9-art-heroes-bosses — Helden und Bosse (M9)

Worktree: `/home/ai/games/lf-lanes/m9-art-heroes-bosses` (Branch `m9-art-heroes-bosses`).
Bereich: Mira/Kael (32 px) und die 6 Bosse (48–96 px). Ziel: art-director-Note ≥ 4.5/5 für diesen Bereich.
Keine Gameplay-, Balance- oder Hitbox-Änderungen; Atlas-Keys, Rahmengrößen und Animationsnamen bleiben unverändert.
`src/scenes/Run.ts` (fremder Claim) wurde nicht angefasst; die Boss-Tod-Sequenz ist vorhandener Code.

## Vorher-Stand (Commit f8f8931, Karte #218)

- `shots/m9-art-heroes-bosses-before-heroes.png` — Helden-Kontaktbogen 2x
- `shots/m9-art-heroes-bosses-before-bosses.png` — Bosse-Kontaktbogen 2x (F0/F1/F2)
- `shots/m9-art-heroes-bosses-before-crowd.png` — Mira im Gewühl
- `shots/m9-art-heroes-bosses-before-boss0.png` — Moorkönigin im Spiel
- `shots/m9-art-heroes-bosses-before-boss5.png` — Hohler König im Spiel
- Kontaktbogen-Skript: `scripts/art/m9-sheet.py` (Exit 0); `npx tsc --noEmit` grün.
- Baseline: `npm run build` grün, `npm test` 175 Tests grün.

## Karten und Belege

### #218 Vorher-Belege und Kontaktbogen-Skript (pixel-artist)

- Nachbesserung: Der Heldenbogen war rechts beschnitten (Portrait-Zelle). Die letzte Zelle ist jetzt 270 px breit, der Bogen 2110 px; das Portrait 48×2 ist vollständig sichtbar.
- Commit `9a11605` (nennt `#218`).

### #598 Helden Mira und Kael (pixel-artist, Kontrolle art-director)

- Quelle: `scripts/art/gen_chars.py` → `src/gfx/gen-chars.ts`.
- Mira: breite Hexenhut-Krempe, höherer Kegel mit warmer Goldborte, breiterer Umhang, größeres warmes Laternenlicht (GOLD_L, GLOW).
- Kael: breitere Schulterplatten, Zweihandaxt auf dem Rücken, schwerer und gepanzerter Look.
- Belege: `shots/m9-art-heroes-bosses-01-heroes.png` (2x-Kontaktbogen inkl. Idle/Hit/Portrait), `shots/m9-art-heroes-bosses-01-crowd.png` (Mira im Gewühl), `shots/m9-art-heroes-bosses-01-crowd-kael.png` (Kael mit Axt im Gewühl); alle mit 0 JS-Fehlern.
- Rahmen 32×32, Portrait 48, Keys und Animationsnamen unverändert. Commits `9e544d7`, `7046e89`.

### #599 Bosse — 6 eigene Silhouetten (pixel-artist, Kontrolle art-director)

- Quelle: `scripts/art/gen_bosses.py` → `src/gfx/gen-bosses.ts`.
- Moorkönigin: breite, höhere Krone mit vier Zacken und Juwel. Die übrigen fünf Bosse behalten Pose, Größe und Keys, haben aber je einen eigenen Auftritts-Look (F0 Ruhe / F1 Atem / F2 Wind-up).
- Belege: `shots/m9-art-heroes-bosses-02-bosses.png` (alle 6, 2x), `shots/m9-art-heroes-bosses-02-boss0.png` (Moorkönigin-Auftritt mit Schockwelle), `shots/m9-art-heroes-bosses-02-boss5.png` und `...-boss5b.png` (Hohler König); 0 JS-Fehler.
- Boss-Keys `boss_0..boss_5` und Framegrößen unverändert. Commits `049d2a3`, `fcba7ce`.

### #600 Boss-Tod zur Truhe (pixel-artist, Kontrolle art-director)

- Beleg: `shots/m9-art-heroes-bosses-03-death.gif` (40 Frames) und `shots/m9-art-heroes-bosses-03-death.png`.
- Das GIF zeigt während der Wirkung lebende Gegner (bog_rat/skeleton/wisp) und den Übergang zur Truhe. Level-Ups sind während der Aufnahme unterdrückt (`setSuppressLevelUps`), damit kein Overlay den Beleg verdeckt. 0 JS-Fehler.
- Keine Gameplay- oder Hitbox-Änderung; die Sequenz liegt unverändert in `src/scenes/Run.ts` (fremder Claim). Commits `b087d5a`, `ea4c23f`.

### #601 Abnahme (lead)

- `npm run build`: grün (tsc + vite).
- `npm test`: **175/175 Tests grün** (10 Dateien).
- `flock /home/ai/games/.lf-perf.lock npm run perf`: **60,1 FPS Burst** (500 Gegner, worst 16,8 ms) und **58,4 FPS Minute 25** (300 Gegner, worst 50,1 ms), `passed: true`, 0 JS-Fehler.
- Shots: `jsErrors: []` in allen zugehörigen JSON-Dateien.
- Art-Director-Gesamturteil: **steht aus** (erster Versuch scheiterte an Modell-Wartung).

## Offene Punkte

- Art-Director-Urteil für #598/#599/#600 (PASS + Note ≥ 4.5) muss noch eingetragen werden; erst danach gehen die Karten auf `done` und `.lane-done` wird committet.
