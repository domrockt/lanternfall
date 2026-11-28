# Lane `m10-game-md-sync` — GAME.md vs. Ist (Divergenz-Prüfung)

**Auftrag:** Divergenzliste GAME.md (verbindliche Spec, Zeilen 1–109 + Status-Abschnitte) vs. Ist
(Code + gemessene Belege in `shots/` + `docs/qa/`). Je Zeile: Spec-Aussage, Ist-Befund, Beleg-Pfad,
Severity, Empfehlung (Spec anpassen / Code-Fix-Job). **GAME.md wurde nicht geändert** (Lane-Regel);
die Übernahme entscheidet der Lead beim Merge.

**Basis:** Worktree `/home/ai/games/lf-lanes/m10-game-md-sync`, Branch `m10-game-md-sync`
(main @ `a8bd303`, 2026-11-28). Keine Code-/GAME.md-Änderungen.

**Methode (K1):** Alle numerischen/harten Aussagen der Spec extrahiert und mit IDs versehen
(T = Technik, D = Debug, A = Ablauf, C = Charaktere, W = Waffen, P = Powerups, E = Evolutionen,
G = Gegner, B = Bosse, F = Grafik, S = Sound, Z = Definition of Done). Historische Status-Abschnitte
(M1–M10) gelten nicht als Spec, aber dort, wo sie als aktuelles Ziel gelesen werden können
(z. B. „offener Abnahme-Blocker FPS“), werden sie mitgeprüft (K2).

**Methode (K2):** Je Aussage Ist-Beleg gesucht: Quellcode (`src/`), frische Messungen auf diesem
Branch (`npm test`, `node scripts/verify-input.mjs --tag m10-gamesync`), Beleg-Dateien in `shots/`
(`qa-reaccc-*` = Nachabnahme C vom 2026-11-27 auf iGPU, `m10-gamesync-*` = dieser Lane) und
`docs/qa/final-2026-11-27.md` / `docs/qa/reacceptance-c-2026-11-27.md`.

**Abdeckung:** **52 von 52 harten Spec-Aussagen abgeglichen = 100 %** (Kriterium ≥ 90 %).

---

## K1 — Prüfmatrix: harte Spec-Aussagen

### Technik (GAME.md Z. 9–15)
| ID | Spec-Aussage |
|---|---|
| T1 | Interne Auflösung **480x270**, ganzzahlig skaliert |
| T2 | `pixelArt: true`, `roundPixels: true` |
| T3 | Draufsicht, große Karte, Kamera folgt dem Spieler |
| T4 | Performance-Ziel **≥ 55 FPS mit 500 gleichzeitigen Gegnern** + Projektilen (headless) |
| T5 | Keine Arcade-Physik; eigene Bewegung + **Spatial Hash**, **Object Pools** (Gegner, Projektile, Gems, Partikel, Damage-Numbers) |
| T6 | Datengetrieben: alle Inhalte in `src/data/*.ts`; Logik als reine Funktionen in `src/logic/` mit Vitest-Tests |
| T7 | Seeded RNG (`?seed=123`) |

### Test-/Debug-Schnittstelle (Z. 17–22)
| ID | Spec-Aussage |
|---|---|
| D1 | `window.__lf` immer vorhanden; Cheats nur mit `?debug=1` |
| D2 | `state()` → Feldliste `{scene, time, level, xp, hp, maxHp, kills, enemies, weapons, passives, bossesDefeated, fps, character}`; `setTimeScale(n)` (1..60), `skipTo`, `god`, `giveXp`, `addWeapon`, `addPassive`, `spawnEnemy(id,n)`, `spawnBoss(index)`, `openChest`, `pickLevelUp(i)`, `autoPlay(bool)` |
| D3 | Level-up-Dialog per Tastatur (1-3 / ←→+Enter) und per `pickLevelUp` bedienbar |

### Spielablauf (Z. 24–31)
| ID | Spec-Aussage |
|---|---|
| A1 | Titel → Charakterwahl (2) → Run → Ergebnis (Zeit, Kills, Level, Schaden pro Waffe) → Titel |
| A2 | WASD/Pfeile bewegen; Waffen feuern automatisch; **ESC = Pause** (zeigt Build: Waffen/Powerups mit Stufen) |
| A3 | XP-Kristalle **3 Größen/Farben** droppen von Gegnern |
| A4 | Level-up pausiert, **3 Optionen**; max **6 Waffen + 6 Powerups** |
| A5 | Selten: **Heil-Essen**, **Magnet-Pickup**, **Gold** |
| A6 | Run-Länge **30:00**; Bosse bei **5/10/15/20/25 min**; bei 30:00 Endboss — Sieg = Morgendämmerung |
| A7 | Jeder Boss droppt eine **Truhe**; Öffnungs-Animation (Licht, Münzen, Slot-Rollen) |
| A8 | Truhe gibt **1/3/5 Upgrades** (Wahrscheinlichkeit steigt mit Zeit); **Evolution hat Vorrang** |

### Charaktere (Z. 33–35)
| ID | Spec-Aussage |
|---|---|
| C1 | Mira: Start *Glutfunke*, **+10 % Flächenwirkung, HP 90** |
| C2 | Kael: Start *Kettenflegel*, **+20 % Max-HP, 1 Rüstung, -5 % Tempo, HP 130** |
| C3 | Sprites **32x32, 4-Frame-Lauf** in 4 Richtungen (oder 2 gespiegelt) |

### Waffen (Z. 37–45)
| ID | Spec-Aussage |
|---|---|
| W1 | **6 Waffen, je Stufe 1–8** |
| W2 | ember: zielsuchendes Projektil auf nächsten Gegner; Stufen +Projektile, +Schaden, Durchschlag |
| W3 | flail: Halbkreis-Schwung in Laufrichtung, Rückstoß; Stufen +Fläche, beidseitig |
| W4 | frost: Puls um Spieler, verlangsamt, kurzer Freeze; Stufen +Radius, +Freeze-Dauer |
| W5 | thorn: Fächer aus Dornen in Blickrichtung; Stufen +Anzahl, +Durchschlag |
| W6 | storm: Blitzschläge auf zufällige Gegner im Bild; **Kettenblitz ab Stufe 4** |
| W7 | lantern: kreisende Lichter um Spieler; Stufen +Anzahl, +Radius, +Dauer |

### Powerups (Z. 47–55)
| ID | Spec-Aussage |
|---|---|
| P1 | 6 Powerups, je Stufe 1–5 |
| P2 | boots: **+8 %** Bewegungstempo |
| P3 | tome: **-8 %** Abklingzeit |
| P4 | heart: **+20 Max-HP, +0.2 HP/s** Regeneration |
| P5 | charm: **+25 %** Aufsammelradius |
| P6 | whetstone: **+10 %** Schaden |
| P7 | hourglass: **+10 %** Effektdauer & Fläche |

### Evolutionen (Z. 57–65)
| ID | Spec-Aussage |
|---|---|
| E1 | Regel: Waffe Stufe 8 + passendes Powerup ≥ 1 → nächste Truhe |
| E2 | 6 Kombinationen: Glutfunke+Buch→Phönixschwarm, Flegel+Herz→Zornpendel, Frostnova+Sanduhr→Ewiger Winter, Dornen+Stiefel→Dornensturm, Sturm+Wetzstein→Gewittersiegel, Laterne+Magnet→Seelenleuchtfeuer |

### Gegner & Wellen (Z. 67–79)
| ID | Spec-Aussage |
|---|---|
| G1 | **30 Gegner**, 5 Zeitstufen à 6, Werte skalieren mit Zeit |
| G2 | Zuordnungstabelle id/Name/Archetyp (30 Zeilen, inkl. toad=ranged, crow=swarm(fliegend) usw.) |
| G3 | 10 Verhaltens-Archetypen: chaser, swarm, tank, ranged, charger, splitter, exploder, phaser, orbiter, summoner |
| G4 | Jeder Gegner: eigenes Sprite **16–32 px, 2–4 Frames**, Hit-Flash, Tod-Animation/Partikel, eigene Farbe/Silhouette |
| G5 | Wellen-Director: Spawnrate & Mischung pro Minute aus `waves.ts`; Spezialwellen (Ring, Ströme) **ab Minute 3** |

### Bosse (Z. 81–90)
| ID | Spec-Aussage |
|---|---|
| B1 | 6 Bosse zu 05/10/15/20/25/30 min mit Namen + Mechaniken (Moorkönigin, Knochenfürst, Fahler Hirte, Glockenturm-Golem, Hexenzirkel, Hohler König) |
| B2 | **Boss-HP-Leiste oben**, Warn-Banner + **Musik/SFX-Stinger** beim Erscheinen |
| B3 | Truhe beim Tod; Endboss-Siegsequenz |
| B4 | Endboss: 3 Phasen, Arena-Ring aus Dornen, Sieg = Morgendämmerung |

### Grafik-Qualitätslatte (Z. 92–102)
| ID | Spec-Aussage |
|---|---|
| F1 | Palette **32 Farben** (`src/palette.ts`), Off-Palette-Ausnahmen nur additive Licht/Vignette + UI-Dim |
| F2 | Figuren/Gegner: 1-px dunkle Kontur, ≥3 Schattierungsstufen, Lichtkante oben-links, **Lauf 4 Frames**, Idle/Hit/Tod |
| F3 | Karte: **Tileset 16x16** (Moorgras, Wege, Wasser, Steine, Bäume, Ruinen, Gräber, Laternenpfähle), Autotiling/Übergänge |
| F4 | Dunkle Nachtstimmung mit **Lichtkreis um den Spieler** (additive/Vignette) |
| F5 | Partikel (Treffer/Tod/Level-up/Evolution), Screen-Shake dosiert, **Hit-Stop bei Boss-Treffern**, Damage-Numbers (Bitmap-Font), Trails, Glow, Truhen-Sequenz |
| F6 | UI: eigener Pixel-Bitmap-Font, **XP-Leiste oben**, Timer, Kills, Icons 16x16 **alle 12 + 6 Evolutionen** |
| F7 | Assets per **Skript** (`scripts/art/*.py`) und/oder Asset-Server, jedes Asset visuell geprüft |

### Sound (Z. 104–105)
| ID | Spec-Aussage |
|---|---|
| S1 | 8-Bit-SFX prozedural (`scripts/gen_sfx.py`): Treffer, Tod, XP, Level-up, Truhe, Boss-Warnung, Waffen |
| S2 | Einfache Loop-Musik optional |

### Definition of Done (Z. 107–109)
| ID | Spec-Aussage |
|---|---|
| Z1 | 30-min-Run per `autoPlay` + `setTimeScale(30)` ohne Crash/JS-Fehler (alle 6 Bosse, Truhen droppen, ≥1 Evolution) |
| Z2 | Performance-Ziel erfüllt |
| Z3 | Tests grün |
| Z4 | Screenshots aller Gegner/Bosse/Waffen geprüft |

---

## K2 — Ist-Abgleich je Aussage (52/52 = 100 %)

Status: **OK** = deckungsgleich · **DIV** = Divergenz · **TEIL** = teilweise (Details in K3).

### Technik
| ID | Spec (kurz) | Ist-Befund | Beleg | Status |
|---|---|---|---|---|
| T1 | Auflösung 480x270 | Ist **640×360** dynamisch: logische Höhe 360, Breite je Seitenverhältnis (`setGameView`), seit M8/View-Lanes | `src/config.ts:6-23`, `src/main.ts:24-43`, `docs/lanes/m8-display*.md`, `shots/qa-reaccc-renderer.json` | **DIV** |
| T2 | pixelArt, roundPixels, ganzzahlig skaliert | `pixelArt:true`/`roundPixels:true`/`antialias:false` erfüllt; Skalierung: `GAME_SCALE = floor(h/360)` mit **gebrochenem** Fit-Rückfall + `RENDER_SCALE` als ganzzahliger Teiler des Renderbuffers (DPR-Budget) | `src/main.ts:41-43`, `src/config.ts:12-23`, `docs/lanes/m10-dpr-budget*` | **TEIL** |
| T3 | Top-down, große Karte, Kamera-Follow | 4096×4096 Welt (`WORLD_SIZE = TILE*WORLD_TILES`), `cameras.main.setBounds` + Follow, `setRoundPixels(true)` | `src/config.ts:218`, `src/scenes/Run.ts:289-291` | OK |
| T4 | ≥55 FPS mit 500 Gegnern (headless) | Auf iGPU-Stand Nachabnahme C **60,0/60,1 FPS** Burst (500 Gegner) und 60,0 Minute-25, vsync-gecappt, 0 JS-Fehler — Ziel erfüllt. GAME.md-Status „offener Abnahme-Blocker FPS (46,3/37,9-40,2)“ (Z. 440-443) ist durch die gemergten Fix-Lanes **überholt** | `shots/qa-reaccc-perf-iter1-640x360@1.json`, `-iter2-*`, `docs/qa/reacceptance-c-2026-11-27.md` K6 | OK (Statuszeile DIV) |
| T5 | Spatial Hash + Pools | `SpatialHash.ts`, `Pool.ts`, `ProjectilePool.ts`, `EnemyPool.ts`, `DamageNumbers.ts`, `FxSystem`-Pools — alles vorhanden und getestet | `src/systems/*.ts` | OK |
| T6 | Datengetrieben, Logik pur + Vitest | `src/data/` (characters, weapons, passives, evolutions, enemies, bosses, waves) + `src/logic/*.ts` reine Funktionen; aktueller HEAD: **1194 Tests in 111 Dateien, 0 fail** | `src/data/`, `src/logic/`, `npm test` (diese Lane, 2026-11-28) | OK |
| T7 | Seeded RNG ?seed=123 | `seedFromUrl()` parst `?seed=` aus location.search | `src/logic/rng.ts:59-60` | OK |

### Debug
| ID | Spec (kurz) | Ist-Befund | Beleg | Status |
|---|---|---|---|---|
| D1 | `__lf` immer vorhanden, Cheats nur ?debug=1 | Implementierung dokumentiert genau so; `hasFlag("debug")` steuert Cheats | `src/debug.ts:161-165` | OK |
| D2 | state()/Cheat-Funktionen | Alle genannten Funktionen vorhanden; `setTimeScale` clamp 1..60 (`timeScaleClamped`) | `src/debug.ts:208,252-281`, `src/logic/combat.ts:18-20` | OK |
| D3 | Level-up per Tastatur + pickLevelUp | Tasten 1/2/3 + Enter + Pfeile im Level-up-Zweig; `pickLevelUp(i)` wirft klar, wenn kein Level-up offen | `src/scenes/UI.ts:1084ff`, `src/debug.ts:276-279`; frischer Lauf `node scripts/verify-input.mjs --tag m10-gamesync` → **28/28 PASS** | OK |

### Spielablauf
| ID | Spec (kurz) | Ist-Befund | Beleg | Status |
|---|---|---|---|---|
| A1 | Szenenfluss + Ergebnis-Daten | Boot → Title → CharSelect (2) → Run → Results (Zeit/Kills/Level/Schaden pro Waffe, zweispaltiger Screen) → Titel; verify-menus 15/15 | `src/scenes/`, `shots/m6-menus-*.png`, `shots/final-results-victory.png` | OK |
| A2 | WASD/Pfeile, Auto-Fire, ESC-Pause mit Build | Bewegung + Auto-Fire OK; ESC togglePause + Build-Anzeige OK. **Historie:** Auf PIN `43fd9eb` (19 Drain-Merges) war „ESC setzt fort“ stabil FAIL (27/28) — auf aktuellem HEAD wieder **28/28 PASS** | `src/scenes/UI.ts:1052`, `shots/m10-gamesync-verify-input.json` (28/28), `docs/qa/reacceptance-c-2026-11-27.md` K4 | OK |
| A3 | XP-Kristalle 3 Größen/Farben | PickupSystem: „XP-Kristalle (3 Größen)“, Texturen klein/mittel/groß mit eigener Farbe | `src/systems/PickupSystem.ts:78`, `src/gfx/textures.ts:244` | OK |
| A4 | 3 Optionen, 6+6 Slots | `generateOffers(count=3)`; `MAX_WEAPON_SLOTS = 6`, `MAX_PASSIVE_SLOTS = 6` | `src/logic/levelup.ts:66,77-78`, `src/config.ts:220-221` | OK |
| A5 | Heil-Essen, Magnet-Pickup, Gold | **Keine der drei Pickups existiert.** Es gibt nur XP-Gems; Magnet wirkt nur als Aufsammelradius + Beacon-/Feld-Magnetik, kein aufsammelbares Item, kein Gold, kein Heil-Essen | `src/systems/PickupSystem.ts` (vollständig gelesen), `grep -ri "gold\|food\|magnet" src/` | **DIV** |
| A6 | 30:00 Run, Bosse 5-25, Endboss 30:00 | `RUN_LENGTH` 1800 s, Bosse `atSecond` 300/600/900/1200/1500/1800; iGPU-Realtime: 6/6 Bosse ±0 s, Sieg `dawn` bei 30,3 Sim-min | `src/data/bosses.ts:5-10`, `shots/qa-reaccc-realtime-30min.json` | OK |
| A7 | Truhe pro Boss, Öffnungs-Animation | ChestSystem mit Sequenz (Deckel, Lichtstrahl, Münzen, Slot-Rollen); 6 Truhen im Realtime-Lauf | `src/systems/ChestSystem.ts`, `shots/m2-chest.gif`, `shots/qa-reaccc-realtime-30min.json` | OK |
| A8 | 1/3/5 Upgrades, Zeit-Steigerung, Evo-Vorrang | `chestUpgradeCount(): 1|3|5` mit Wahrscheinlichkeit über `t/1800`; `chestRewards` legt Evolution zuerst in die Truhe (Vorrang, getestet) | `src/logic/evolution.ts:85-141` | OK |

### Charaktere
| ID | Spec (kurz) | Ist-Befund | Beleg | Status |
|---|---|---|---|---|
| C1 | Mira: Glutfunke, +10 % Fläche, HP 90 | Glutfunke ✓, `areaPct:10` ✓ — aber **HP 250 statt 90**; zusätzlich `armor:1` und `regen:1.0` (in Spec nicht vorgesehen) | `src/data/characters.ts:7-16` | **DIV** |
| C2 | Kael: Kettenflegel, +20 % Max-HP, 1 Rüstung, -5 % Tempo, HP 130 | Kettenflegel ✓, Tempo -5 % ✓ (59), HP 130 ✓ — aber **Rüstung 2 statt 1**, **+25 % Max-HP statt +20 %** plus `maxHpFlat:90`, `regen:1.5`, `xpPct:-25` (nicht in Spec) | `src/data/characters.ts:20-28` | **DIV** |
| C3 | 32x32, 4-Frame-Lauf 4 Richtungen | Mira/Kael 32 px, 4 Richtungen × 4 Laufposen + 2 Idle + Trefferpose (M4/M4b), Art-Director-Abnahme | `src/gfx/gen-chars.ts`, `shots/m4b-sheet-chars.png` | OK |

### Waffen
| ID | Spec (kurz) | Ist-Befund | Beleg | Status |
|---|---|---|---|---|
| W1 | 6 Waffen, Stufe 1–8 | 6 Waffen-Defs, alle `maxLevel: 8`; `acceptance-count` 6/6 | `src/data/weapons.ts`, `node scripts/acceptance-count.mjs` → `ok:true` | OK |
| W2 | ember: Homing auf nächsten Gegner | Homing/Projektil implementiert, verify-weapons 12/12 mit VFX-Peak-Asserts | `src/systems/CombatSystem.ts`, `shots/m2-weapon-ember.png` | OK |
| W3 | flail: Halbkreis in Laufrichtung, Rückstoß | Halbkreis-Schwung + Richtung + Knockback; Kette/Smear nachgerüstet (M2/M5) | `src/data/weapons.ts:17ff`, `shots/m2-weapon-flail.png` | OK |
| W4 | frost: Puls, Slow + kurzer Freeze | Level-Daten mit `slow`/`freeze` (z. B. L4: slow 0.33, freeze 0.5 s), Eis-Siegel-VFX | `src/data/weapons.ts:55`, `shots/m5-*.gif` | OK |
| W5 | thorn: Fächer in Blickrichtung, Pierce | Fächer-Verhalten + `pierce` in Stufen-Daten | `src/data/weapons.ts:69ff` | OK |
| W6 | storm: Kettenblitz ab Stufe 4 | `chain: 0` (L1-3), `chain: 2` **ab Level 4** (L4), 3 ab L6 — exakt wie Spec | `src/data/weapons.ts:90-96` | OK |
| W7 | lantern: kreisende Lichter | Orbit-Orbs implementiert, Regressions-Test „keine ewigen Basis-Orbs“ nach Evolution | `src/systems/CombatSystem.ts`, `shots/m2-evolution-phoenix.png` | OK |

### Powerups
| ID | Spec (kurz) | Ist-Befund | Beleg | Status |
|---|---|---|---|---|
| P1 | 6 Powerups, Stufe 1–5 | 6 Defs, alle `maxLevel: 5`, kumulativ pro Stufe | `src/data/passives.ts` | OK |
| P2 | boots +8 % | `moveSpeedPct: 8` pro Stufe | `src/data/passives.ts:11` | OK |
| P3 | tome -8 % | `cooldownPct: 8` pro Stufe | `src/data/passives.ts:18` | OK |
| P4 | heart +20 HP, **+0.2 HP/s** | `maxHpFlat: 20` ✓, aber **`regen: 0.3` pro Stufe statt 0.2** | `src/data/passives.ts:25-26` | **DIV** |
| P5 | charm +25 % | `pickupRadiusPct: 25` | `src/data/passives.ts:32` | OK |
| P6 | whetstone +10 % | `damagePct: 10` | `src/data/passives.ts:39` | OK |
| P7 | hourglass +10 % Dauer & Fläche | `areaPct: 10, durationPct: 10` | `src/data/passives.ts:46` | OK |

### Evolutionen
| ID | Spec (kurz) | Ist-Befund | Beleg | Status |
|---|---|---|---|---|
| E1 | Stufe 8 + Powerup ≥1 → nächste Truhe | `canEvolve` prüft genau diese Bedingung; Evolution ersetzt Basiswaffe im Slot | `src/logic/evolution.ts`, Tests in `tests/` | OK |
| E2 | 6 Kombinationen | Alle 6 Paarungen deckungsgleich: phoenix(ember+tome), wrath_pendulum(flail+heart), eternal_winter(frost+hourglass), thorn_storm(thorn+boots), thunder_seal(storm+whetstone), soul_beacon(lantern+charm) | `src/data/evolutions.ts:6-59` | OK |

### Gegner & Wellen
| ID | Spec (kurz) | Ist-Befund | Beleg | Status |
|---|---|---|---|---|
| G1 | 30 Gegner, 5 Zeitstufen à 6 | 30 Enemy-Defs, `tierForMinute = floor(minute/5)` (5 Stufen), Werte skalieren (`scaling.ts`); `acceptance-count` 30/30 | `src/data/enemies.ts`, `src/data/waves.ts:13-14`, `src/logic/scaling.ts` | OK |
| G2 | Zuordnungstabelle 30 Zeilen | **Alle 30 id/Archetyp-Paare exakt wie Spec** (skriptgestützt extrahiert: bog_rat swarm, wisp chaser, … voidcaller summoner) | `src/data/enemies.ts` (Vergleich in dieser Lane, 2026-11-28) | OK |
| G3 | 10 Archetypen | Alle 10 implementiert als reine KI-Logik; verify:enemies 30/30 mit harten Verhaltens-Asserts | `src/logic/enemy-ai.ts`, `shots/m3-enemy-*.png` | OK |
| G4 | Sprite 16–32 px, 2–4 Frames, Hit-Flash, Tod | Tiergrößen 16/20/24/28/32 px, Hit-Flash + 4 Tod-Klassen; Frames 2–4 (Tier 0–1: 2 Frames) — Spec-Z. 78 erlaubt 2–4, Spec-Z. 96 sagt pauschal „Lauf 4 Frames“ (interne Spannung) | `src/gfx/gen-enemies.ts`, `shots/m4-sheet-enemies.png` | TEIL |
| G5 | Wellen aus waves.ts, Spezialwellen ab Minute 3 | `specialForMinute`: `minute < 3 → null`, sonst ring (ungerade) / stream (gerade); Elite-Packs ab Minute 8 (Mehr, nicht Widerspruch) | `src/data/waves.ts:20-22` | OK |

### Bosse
| ID | Spec (kurz) | Ist-Befund | Beleg | Status |
|---|---|---|---|---|
| B1 | 6 Bosse, Zeiten, Namen, Mechaniken | Alle 6 mit `atSecond` 300–1800, Namen und Mechanik-Strings deckungsgleich mit Spec-Tabelle | `src/data/bosses.ts:5-10` | OK |
| B2 | HP-Leiste oben, Banner + Musik/SFX-Stinger | `bossHudRects`: HP-Bar bei **y=40 (oben)**, Banner darunter; Musik wechselt `run → boss` beim Spawn; Boss-Warn-SFX vorhanden | `src/systems/BossSystem.ts:59-64`, `src/scenes/UI.ts:218-223`, `src/audio/AudioSystem.ts:27,156-167` | OK |
| B3 | Truhe beim Tod, Siegsequenz | Truhen-Drop bestätigt (6 Truhen im Realtime-Lauf); Endboss-Tod → Morgendämmerung/Siegsequenz | `shots/qa-reaccc-realtime-30min.json`, `shots/m3-fullrun.json` | OK |
| B4 | Endboss 3 Phasen, Dornenring | `mechanic: "3 Phasen, Arena-Ring aus Dornen"`; Phasen 1/2/3 in verify:bosses/fullrun gesehen | `src/data/bosses.ts:10`, `shots/m3-fullrun.json` (`phasesSeen`) | OK |

### Grafik
| ID | Spec (kurz) | Ist-Befund | Beleg | Status |
|---|---|---|---|---|
| F1 | 32 Farben, Off-Palette-Regel | Genau **32** Palettenfarben; M10-Palette-Guard: 458 Assets/432 418 px, **0 off-palette** | `src/palette.ts` (gezählt), `docs/qa/final-2026-11-27.md` | OK |
| F2 | Kontur, 3 Stufen, Lichtkante, 4-Frame-Lauf | Für Figuren/Bosse erfüllt (4 Frames + Idle/Hit/Tod); Gegner: 2–4 Frames nach Tier (siehe G4); 1-px-Kontur/Lichtkante oben-links via ART.md Pipeline validiert | `scripts/art/lib.py`, `shots/m4b-art-review.md`, `shots/m4-art-review.md` | TEIL |
| F3 | Tileset 16x16 mit Autotiling | **Ersetzt:** per-Pixel-Klassifikation aus domain-warped fBm + Blob-47-/Wang-Masken statt 16-px-Kacheln (M4b, bewusste Verbesserung); Inhalt (Wege, Wasser/Ufer, Props, Gräber, Laternenpfähle) vollständig vorhanden | `src/gfx/tiles.ts`, `src/logic/autotile.ts`, `docs/lanes/` M4b-Abschnitt in GAME.md | **DIV** |
| F4 | Lichtkreis um Spieler | Vignette/Lichtkreis aktiv, Laternenpfähle als kleine Lichtquellen | `src/gfx/vignette-bg.ts`, `shots/m4b-probe-terrain.png` | OK |
| F5 | Partikel/Shake/Hit-Stop/Damage-Numbers/Trails/Glow/Truhe | Alles implementiert mit Limits: `clampShake` ≤ 6 px, Hit-Stop nur Boss (60 ms), Damage-Numbers Bitmap-Font-Pool, verify-vfx 18/18 GIFs | `src/systems/FxSystem.ts`, `src/systems/DamageNumbers.ts`, `shots/m5-vfx.json` | OK |
| F6 | Font, XP-Leiste oben, Icons 18 | 5×7-Bitmap-Font mit Umlauten; HUD oben (`HUD_TOP_Y = 1`); **18 Icons 16×16** (6+6+6) in `GEN_ICONS` | `src/gfx/font.ts`, `src/scenes/UI.ts:55-56`, `src/gfx/gen-icons.ts:1-4` | OK |
| F7 | Assets per Skript | `scripts/art/*.py` (lib.py, gen_*.py, contact.py) + Kontaktbögen + Art-Director-Reviews (Runden dokumentiert) | `scripts/art/`, `shots/m4-art-review.md`, `shots/m4b-art-review.md`, `shots/m5-vfx-review.md` | OK |

### Sound
| ID | Spec (kurz) | Ist-Befund | Beleg | Status |
|---|---|---|---|---|
| S1 | Prozedurale SFX, Event-Liste | `scripts/gen_sfx.py` erzeugt **24 WAVs** (geprüft: 24 Dateien in `public/sfx/`), Mixing/Priorität/Cooldown im AudioSystem | `scripts/gen_sfx.py`, `ls public/sfx | wc -l` = 24, `src/audio/AudioSystem.ts` | OK |
| S2 | Loop-Musik optional | `music_run`/`music_boss` Loops, Wechsel beim Boss-Spawn | `src/audio/AudioSystem.ts:27,156-167` | OK |

### Definition of Done
| ID | Spec (kurz) | Ist-Befund | Beleg | Status |
|---|---|---|---|---|
| Z1 | 30-min-autoPlay ohne Crash | iGPU-Realtime 30 min (1854 s): Sieg `dawn`, 6/6 Bosse ±0 s, 6 Truhen, 3 Evolutionen, **0 JS-Fehler** | `shots/qa-reaccc-realtime-30min.json` | OK |
| Z2 | Performance-Ziel erfüllt | Burst + Minute-25 auf iGPU 60 FPS (vsync-Cap), FPS-Tor PASS; Historie: auf Vor-Drain-Stand FAIL (37,9-46,3) — seit Fix-Lanes erledigt | `docs/qa/reacceptance-c-2026-11-27.md` K6, `shots/qa-reaccc-perf-summary.json` | OK |
| Z3 | Tests grün | Aktueller HEAD: **1194/1194** in 111 Dateien, 0 fail (diese Lane, 2026-11-28) | `npm test` | OK |
| Z4 | Screenshots aller Gegner/Bosse/Waffen | m2-weapon-* (12), m3-enemy-* (30), m3-boss-* (6) + Kontaktbögen m4/m4b — alle vorhanden und abgenommen | `shots/` (Inventar dieser Lane) | OK |

**Abgleichszahl: 52/52 = 100 %** — davon **43 OK, 6 Divergenzen (T1, A5, C1, C2, P4, F3), 3 TEIL (T2, G4, F2)**. Details und Empfehlungen in K3.

---

## K3 — Divergenzliste (GAME.md vs. Ist)

Sortiert nach Irrtum-Risiko. Severity: **HOCH** = künftige Lanes zielen auf falsche Werte/Inhalte;
**MITTEL** = Spec-Zeile erklärt das Ist falsch oder unvollständig; **NIEDRIG** = kosmetisch/interne Spannung.

| # | ID | Spec-Aussage | Ist-Befund | Beleg-Pfad | Severity | Empfehlung |
|---|---|---|---|---|---|---|
| 1 | T1 | Interne Auflösung **480x270**, ganzzahlig skaliert | Ist **640×360 dynamisch**: logische Höhe 360, Breite je Seitenverhältnis (7 Display-Profile pixelgenau), plus DPR-Budget-Regler (`RENDER_SCALE`) auf dem Renderbuffer | `src/config.ts:1-23`, `src/main.ts:24-43`, `shots/qa-reaccc-renderer.json`, `docs/lanes/m8-display.md` | **HOCH** | **Spec anpassen** (M8/M10-Display-Stand: „logische Höhe 360, Breite dynamisch, DPR-Budget-Regler; 7 Profile“). 480x270 existiert nirgends mehr — wer danach baut, bricht Display-Lanes. |
| 2 | A5 | Selten-Pickups: **Heil-Essen, Magnet-Pickup, Gold** | **Fehlen komplett.** Nur XP-Kristalle (3 Größen) werden gedroppt; Magnet existiert nur als Aufsammelradius/Magnetfeld (`MAGNET_RADIUS_FACTOR`), nicht als aufsammelbares Item; kein Gold, kein Heil-Essen | `src/systems/PickupSystem.ts` (Volltext gelesen), `grep -ri "gold\|food\|magnet" src/` | **HOCH** | **Lead-Entscheidung:** (a) Spec streichen (Design-Reduktion, Meta ohne Gold/Shop ist dokumentierte M6-Lücke) oder (b) **Code-Fix-Job** „Selten-Pickups“ starten. Beides legitim — aber Spec und Ist müssen dieselbe Aussage treffen. |
| 3 | C1 | Mira: +10 % Fläche, **HP 90** | HP **250**; zusätzlich Rüstung 1 und Regeneration 1.0 HP/s (nicht in Spec); +10 % Fläche ✓, Glutfunke ✓ | `src/data/characters.ts:7-16`, Balance-Korridor `docs/lanes/balance.md`, `shots/balance-main.json` | **HOCH** | **Spec anpassen** auf M6-Balance-Werte (Mira 250 HP, Rüstung 1, Regen 1.0). Die 90-HP-Zeile stammt aus M1 und macht jede Balance-Karte falsch. |
| 4 | C2 | Kael: **+20 % Max-HP, 1 Rüstung**, -5 % Tempo, HP 130 | **Rüstung 2**, **+25 % Max-HP** plus +90 flach, Regen 1.5, **XP -25 %**; -5 % Tempo ✓, HP 130 ✓ | `src/data/characters.ts:20-28`, `docs/qa/final-2026-11-27.md` (Kael-Korridor 6/6 Level 27-30) | **HOCH** | **Spec anpassen** auf Ist (M6-Werte inkl. XP-Malus), sonst charakterbezogene Lanes (Start-Bonus, Porträt-Text) divergieren. |
| 5 | F3 | Karte: **Tileset 16x16** mit Autotiling | **Bewusst ersetzt** (M4b): per-Pixel-Klassifikation aus domain-warped fBm + Blob-47-/Wang-Masken; 16-px-Kachelgitter nicht mehr lesbar. Inhaltliche Pflicht (Wege, Wasser/Ufer, Steine, Bäume, Ruinen, Gräber, Laternenpfähle) erfüllt und über Spec hinaus (Props mit Tiefe/Schatten) | `src/gfx/tiles.ts`, `src/logic/autotile.ts`, `shots/m4b-sheet-tiles.png` | **MITTEL** | **Spec anpassen**: „Terrain per-Pixel (fBm) mit Ufer-/Weg-Masken, Props in Clustern“ statt Tileset 16x16. Kein Code-Fix — das Ist ist die gewollte Verbesserung. |
| 6 | P4 | heart: +20 Max-HP, **+0.2 HP/s** | **+0.3 HP/s** pro Stufe (+20 HP stimmt) | `src/data/passives.ts:25-26`, `shots/m10-passive-math-caps.json` | **NIEDRIG** | **Spec anpassen** (0.3). Ein-Wert-Fix, kein eigener Code-Job nötig. |
| 7 | T2 | „ganzzahlig skaliert“ | PixelArt/roundPixels ✓; aber Fit-Rückfall ist **gebrochen** skaliert und `RENDER_SCALE` teilt den Renderbuffer ganzzahlig (DPR-Budget) — „ganzzahlig“ stimmt nicht mehr uneingeschränkt | `src/config.ts:12-23`, `docs/lanes/m10-dpr-budget*` | **MITTEL** | **Spec anpassen**: Formulierung „pixelgenau pro Profil; DPR-Budget teilt Renderbuffer ganzzahlig“ statt pauschal „ganzzahlig skaliert“. |
| 8 | G4/F2 | Z. 96: „Lauf 4 Frames, Idle/Hit/Tod“ vs. Z. 78: „2–4 Frames“ | Gegner Tier 0–1 haben **2 Frames** (bescheidene Posen, dokumentiert), Tier 2–4 vier; Figuren/Bosse 4 Frames + Idle/Hit/Tod | `src/gfx/gen-enemies.ts`, `shots/m4-sheet-enemies.png`, GAME.md Z. 261 | **NIEDRIG** | **Spec präzisieren**: Gegner 2–4 Frames (nach Tier), Figuren/Bosse 4 Frames — beseitigt die interne Spannung der Spec. |
| 9 | Status Z. 440-443 | „Offener Abnahme-Blocker: FPS … Fix-Lanes **noch nicht gemerged**; danach neu messen“ | Fix-Lanes sind gemergt und neu gemessen: iGPU Burst 60,0 / Minute-25 60,0 / Realtime-30min min 60,1 FPS — FPS-Blocker **erledigt** | `docs/qa/reacceptance-c-2026-11-27.md` K6/K7, `shots/qa-reaccc-perf-summary.json` | **MITTEL** | **Spec-Status aktualisieren** (bei Übernahme): FPS-Blocker abschließen, Verweis auf Nachabnahme C ergänzen. Veraltet-„offen“-Status verleitet zu Doppel-Jobs. |
| 10 | Status Z. 438 | „Kael-Balance-Korridor 6/6 Level 27–30 (Level-47-Befund widerlegt)“ vs. M6-Zeilen 366/372/421 („Kael/101 Level 47 … Restmangel“) | M10-Widerlegung ist korrekt (frischere Balance-Läufe); die alten M6-Befundzeilen bleiben aber stehen und erzählen Gegenteiliges | GAME.md Z. 366/372/421-422 vs. Z. 438, `shots/balance-main.json` | **NIEDRIG** | **Spec aufräumen**: M6-Restmangel-Zeilen als widerlegt markieren (ein Verweis genügt). |
| 11 | (robust-Lane, kein Spec-Wert) | Heap-Ziel ≤ +15 % (GAME.md robust-Abschnitt) | Nachabnahme C: **+21 %** (GC-Sägezahn, endMB < Minute-1-Wert, kein monotoner Leak) — Hard-Gate FAIL, Folge-Job offen | `docs/qa/reacceptance-c-2026-11-27.md` K7 | **MITTEL** | Kein Spec-Fix, sondern **offener Punkt ins Board**: Heap-Gate-Definition (Sägezahn-robust messen, z. B. gleitendes Minimum) + Folge-Job `m10-heap-margin`. |

### Zusätzlich geprüft, kein Befund (Auswahl mit frischem Beleg dieser Lane)

- **ESC-Pause** (A2): Auf PIN `43fd9eb` der Nachabnahme C stabil FAIL („ESC setzt fort“, 27/28) — auf dem aktuellen Stand dieser Lane wieder **28/28 PASS** (`shots/m10-gamesync-verify-input.json`, inkl. 12 Screenshots `shots/m10-gamesync-*.png`). Kein Code-Fix-Job nötig; die Reacceptance-C-Verdachtsliste kann um „auf HEAD nicht mehr reproduzierbar“ ergänzt werden.
- **Inhaltszählung** (`node scripts/acceptance-count.mjs`): `ok:true`, 30/6/6/6/6/2 — Spec-Listen Waffen/Powerups/Evolutionen/Bosse/Charaktere/Gegner sind vollständig umgesetzt.
- **Gegner-Zuordnungstabelle G2** (30 Zeilen) und **Boss-Tabelle B1** wortgleich mit Spec geprüft (skriptgestützter Vergleich der `id`/Archetyp-Felder bzw. `atSecond`/Mechanik-Strings).

---

## Zusammenfassung

**Umfang:** 52/52 harte Spec-Aussagen abgeglichen (**100 %**, Kriterium ≥ 90 % erfüllt).
**Ergebnis:** 43 OK, **6 Divergenzen** (2× HOCH-Cluster: Auflösung T1, Selten-Pickups A5, Charakterwerte C1/C2), 3 TEIL.

Kernbefunde für den Lead:

1. **Spec-Techikblock ist an zwei Stellen falsch** (T1 Auflösung 640×360 statt 480x270; T2 Skalierung):
   Empfehlung überall „Spec anpassen“, kein Code-Job.
2. **Charakter- und Herz-Werte** (C1, C2, P4) sind M6/M10-Balance-Stand, Spec kennt nur M1-Werte:
   „Spec anpassen“.
3. **Echte Inhaltslücke**: Heil-Essen / Magnet-Pickup / Gold (A5) existieren nicht — hier muss der Lead
   zwischen Spec-Streichung und Code-Fix-Job entscheiden (einziger Punkt mit Code-Fix-Option).
4. **Statuszeilen in GAME.md sind überholt** (FPS-Blocker erledigt, Kael-Level-47 widerlegt, Heap-Gate offen):
   bei Übernahme der Lane-Doku Status-Abschnitt nachziehen.
5. **Keine Änderungen** an Code, GAME.md oder ACCEPTANCE.md durch diese Lane — nur diese Datei +
   Belege (`shots/m10-gamesync-verify-input.json`, 12 PNGs).

**Neue Messwerte dieser Lane (Worktree/Branch `m10-game-md-sync`, Basis main `a8bd303`, 2026-11-28):**
- `npm test`: **1194/1194** in 111 Dateien, 0 fail.
- `node scripts/verify-input.mjs --tag m10-gamesync`: **28/28 PASS**, 0 JS-Fehler
  (`shots/m10-gamesync-verify-input.json`).
- `node scripts/acceptance-count.mjs`: `ok:true` (30/6/6/6/6/2).
- Palette: 32 Farben gezählt (`src/palette.ts`).
