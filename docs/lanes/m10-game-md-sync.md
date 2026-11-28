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
