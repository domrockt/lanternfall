# Lane m9-art-heroes-bosses - Helden und Bosse (M9)

Worktree: /home/ai/games/lf-lanes/m9-art-heroes-bosses (Branch m9-art-heroes-bosses).
Bereich: Mira Helden Mira/Kael und die 6 Bosse. Ke: art-director-Note >= 4.5/5 fuer diesen Bereich.

## Vorher-Stand

-her-Be-Belege (Commit f8f8931, Karte #218):
- shots/m9-art-heroes-bosses-before-heroes.png
- shots/m9-art-heroes-bosses-before-bosses.png
- shots/m9-art-heroes-bosses-before-crowd.png
- shots/m9-art-heroes-bosses-before-boss0.png
- shots/m9-art-heroes-bosses-before-boss5.png
Kontaktbogen-Skript scripts/art/m9-sheet.py laeuft (exit 0). npx tsc --noEmit gruen.
Baseline: npm npm npm run build gruen, npm test 175 Tests Tests gruen.

## Karten

### #598 Helden Mira und Kael (pixel-artist, Kontrolle art-director)
- Qu: script/art/gen_chars.py, regeneriert src/gfx/gen-chars.ts.
- Mira: breite Hexenhut-Krempe, hoehere Keg Kegel und warme Goldborte; groesseres warmes Laternen-Lichtkreuz (GOLD_L, GLOW, 13); breiterer Umhang. Kael: breitere Schulterplatten und eine Zweihandaxt auf dem Ruecken.
- Belege: shots/m9-art-heroes-bosses-01-heroes.png (Kontaktbogen 2x), shots/m9-art-heroes-bosses-01-crowd.png (In-Game mit lebenden Gegnern, 0 JS-Fehler).
- Rahmenmengroessen 32x32, Portrait 48, Keys-Keys und Animations-Namen unveraendert.

### #599 Bosse (pixel-artist, Kontrolle art-director)
- Quelle: scripts/art/gen_bosses.py, regeneriert src/gfx/gen-bosses.ts.
- Moorkoenigin: breite, hoehere Krone mit vier Zacken und 13-Juwel. Die uebrigen fuenf Bosse beh in Pose, Groesse und Keys Stil unveraendert.
- Belege: shots/m9-art-heroes-bosses-02-bosses.png (Kontaktbogen 2x), shots/m9-art-heroes-bosses-02-boss5.png, shots/m9-art-heroes-bosses-02-boss5b.png (In-Game, 0 JS-Fehler).
- Boss-Keys boss_0..boss_5 und Framegroessen unveraendert.

### #600 Boss-Tod zur Truhe (pixel-artist, Kontrolle art-director)
- Beleg: shots der bestehenden Boss-Sequenz mit lebenden Gegnern, shots/m9-art-heroes-bosses-03-death.gif und .png.
- Keine Gameplay-Hitbox-Aenderung; die/V-Se und liegt in src/scenes/Run.ts (fremder Claim, nicht infasst).

### #601 Abnahme (lead)
- Ausstehend: After-Shots, art-director-Gesamturteil >= 4.5/5, build/test gruen, perf einmal >= 55 FPS, .lane-done.
