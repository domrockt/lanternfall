# Lanternfall — Design-Spec (verbindlich)

Original-Survivor-Action-Roguelite (Genre wie "Bullet Heaven"/Survivor-like). **Eigenes Spiel**: keine Namen, Figuren,
Grafiken, Sounds oder Texte aus anderen Spielen übernehmen — alles hier ist unser eigenes Setting.

Setting: Ein verfluchtes Moor in einer endlosen Nacht. Die letzte Laterne muss bis zur Morgendämmerung (30:00) überleben.

## Technik
- Phaser 3 + Vite + TypeScript, interne Auflösung **480x270**, ganzzahlig skaliert (`pixelArt: true`, `roundPixels: true`).
- Draufsicht (top-down, leichte 3/4-Perspektive bei Figuren). Große Karte, Kamera folgt dem Spieler.
- Performance-Ziel: **≥ 55 FPS mit 500 gleichzeitigen Gegnern** + Projektilen (headless gemessen). Keine Arcade-Physik für Gegner:
  eigene Bewegung + **Spatial Hash** für Kollisionen, **Object Pools** für Gegner, Projektile, Gems, Partikel, Damage-Numbers.
- **Datengetrieben**: alle Inhalte in `src/data/*.ts` (weapons, passives, evolutions, enemies, bosses, waves, characters).
  Spiellogik (Schaden, Skalierung, Wellen-Director, Level-up-Angebote, Evolution-Regeln) als reine Funktionen in `src/logic/` mit Vitest-Tests.
- Seeded RNG (`?seed=123`), damit Tests reproduzierbar sind.

## Test-/Debug-Schnittstelle (Pflicht, von Anfang an)
`window.__lf` (immer vorhanden, Cheats nur mit `?debug=1`):
- `state()` → `{ scene, time, level, xp, hp, maxHp, kills, enemies, weapons:[{id,level}], passives:[{id,level}], bossesDefeated, fps, character }`
- `setTimeScale(n)` (1..60), `skipTo(seconds)`, `god(bool)`, `giveXp(n)`, `addWeapon(id, level)`, `addPassive(id, level)`,
  `spawnEnemy(id, n)`, `spawnBoss(index)`, `openChest()`, `pickLevelUp(i)` (wählt Angebot i), `autoPlay(bool)` (simpler Ausweich-Bot).
- Ohne Eingabe/Bot darf das Spiel nicht hängen: Level-up-Dialog mit Tastatur (1-3/←→+Enter) und per `pickLevelUp`.

## Spielablauf
- Titel → Charakterwahl (2) → Run → Ergebnis (Zeit, Kills, Level, Schaden pro Waffe) → zurück zum Titel.
- Steuerung: WASD/Pfeile bewegen; Waffen feuern **automatisch**. ESC = Pause (zeigt Build: Waffen/Powerups mit Stufen).
- XP-Kristalle (3 Größen/Farben) droppen von Gegnern; Level-up pausiert und bietet **3 Optionen** (neue Waffe/Powerup oder Stufe+1);
  max **6 Waffen + 6 Powerups**. Selten: Heil-Essen (Brot/Fleisch-artig, eigenes Design), Magnet-Pickup, Gold.
- Run-Länge **30:00**. Bosse bei **5, 10, 15, 20, 25 min**; bei **30:00** erscheint der Endboss — sein Sieg = Morgendämmerung = Sieg.
- Jeder Boss droppt eine **Truhe**. Truhe öffnen = eigene Animation (Licht, Münzen, Slot-Rollen) und gibt 1 / 3 / 5 Upgrades
  (Wahrscheinlichkeit steigt mit Zeit). Ist eine **Evolution** möglich, hat sie in der Truhe Vorrang.

## Charaktere (2, eigene Designs, 32x32, 4-Frame-Lauf in 4 Richtungen oder 2 Richtungen gespiegelt)
1. **Mira Ashwick** — junge Laternen-Hexe, rotes Tuch, Laterne in der Hand. Start: *Glutfunke*. Bonus: +10 % Flächenwirkung, HP 90.
2. **Bruder Kael** — Eisen-Mönch mit Kettengewand. Start: *Kettenflegel*. Bonus: +20 % Max-HP, 1 Rüstung, -5 % Tempo, HP 130.

## Waffen (6, je Stufe 1–8, Stufe 8 = max)
| id | Name | Verhalten |
|---|---|---|
| ember | Glutfunke | zielsuchendes Feuerprojektil auf nächsten Gegner; Stufen: +Projektile, +Schaden, Durchschlag |
| flail | Kettenflegel | Halbkreis-Schwung in Laufrichtung (Nahkampf, Rückstoß); Stufen: +Fläche, beidseitig, +Schaden |
| frost | Frostnova | Puls um den Spieler, verlangsamt, kurzer Freeze; Stufen: +Radius, +Freeze-Dauer |
| thorn | Dornensalve | Fächer aus Dornen in Blickrichtung; Stufen: +Anzahl, +Durchschlag, +Tempo |
| storm | Sturmrune | Blitzschläge auf zufällige Gegner im Bild, Kettenblitz ab Stufe 4 |
| lantern | Geisterlaterne | kreisende Lichter um den Spieler; Stufen: +Anzahl, +Radius, +Dauer |

## Powerups / Passive (6, je Stufe 1–5)
| id | Name | Effekt |
|---|---|---|
| boots | Windstiefel | +8 % Bewegungstempo |
| tome | Arkanes Buch | -8 % Abklingzeit |
| heart | Eisenherz | +20 Max-HP, +0.2 HP/s Regeneration |
| charm | Magnetamulett | +25 % Aufsammelradius |
| whetstone | Wetzstein | +10 % Schaden |
| hourglass | Sanduhr | +10 % Effektdauer & Fläche |

## Evolutionen (Waffe Stufe 8 + passendes Powerup ≥1 → nächste Truhe)
| Basis + Powerup | Evolution | Effekt (deutlich stärker, eigene VFX) |
|---|---|---|
| Glutfunke + Arkanes Buch | **Phönixschwarm** | Feuervögel, die explodieren und Brandflächen hinterlassen |
| Kettenflegel + Eisenherz | **Zornpendel** | 360°-Schwung, heilt pro Treffer minimal |
| Frostnova + Sanduhr | **Ewiger Winter** | dauerhafte Frost-Aura + periodische Eisspitzen |
| Dornensalve + Windstiefel | **Dornensturm** | Dornen-Wirbel in alle Richtungen, Durchschlag ∞ |
| Sturmrune + Wetzstein | **Gewittersiegel** | Blitz-Siegel am Boden, Kettenblitz über 8 Ziele |
| Geisterlaterne + Magnetamulett | **Seelenleuchtfeuer** | kreisende Seelen ziehen XP an und brennen |

## Gegner (30) — 5 Zeitstufen à 6 Typen, Werte skalieren mit Zeit
Verhaltens-Archetypen: `chaser` (läuft direkt), `swarm` (Schwärme, schnell, schwach), `tank` (langsam, viel HP, Rückstoß-resistent),
`ranged` (hält Abstand, schießt), `charger` (Anlauf + Sprint), `splitter` (teilt sich beim Tod), `exploder` (explodiert nahe Spieler),
`phaser` (blinkt/teleportiert), `orbiter` (umkreist), `summoner` (ruft kleine Gegner).
| Stufe (min) | Gegner (id: Name — Archetyp) |
|---|---|
| 0–5 | bog_rat: Moorratte — swarm · wisp: Irrlicht — chaser · mudling: Schlammling — splitter · crow: Aaskrähe — swarm(flieg.) · bogzombie: Moorleiche — chaser · toad: Giftkröte — ranged |
| 5–10 | skeleton: Knochenwächter — chaser · bat: Blutfledermaus — swarm · ghoul: Ghul — charger · witchling: Hexenlehrling — ranged · slime: Moorschleim — splitter · scarecrow: Strohmann — tank |
| 10–15 | wolf: Schattenwolf — charger · banshee: Klageweib — phaser · golem: Torfgolem — tank · spider: Grabspinne — swarm · cultist: Kultist — summoner · bomber: Pilzbomber — exploder |
| 15–20 | knight: Verfluchter Ritter — tank · harpy: Moorharpyie — orbiter · lich: Kleiner Lich — ranged · wraith: Wiedergänger — phaser · treant: Faulbaum — tank · imp: Glutimp — exploder |
| 20–30 | horror: Augenhorror — ranged · centipede: Knochenläufer — charger · gargoyle: Wasserspeier — orbiter · reaper_bat: Nachtsense — swarm · abom: Fleischkoloss — splitter · voidcaller: Leerenrufer — summoner |
Jeder Gegner: eigenes Sprite (16–32 px, 2–4 Frames Lauf), Hit-Flash, Tod-Animation/Partikel, eigene Farbe/Silhouette.
Wellen-Director: Spawnrate & Mischung pro Minute aus `waves.ts`; Spezialwellen (Ring-Einkesselung, Schwarm-Ströme) ab Minute 3.

## Bosse (6)
| Zeit | Boss | Mechanik |
|---|---|---|
| 05:00 | Moorkönigin (riesige Kröte) | Sprünge mit Landungs-Schockwelle, spuckt Gift-Pfützen |
| 10:00 | Knochenfürst | beschwört Skelett-Ringe, Knochen-Bumerang |
| 15:00 | Der Fahle Hirte | ruft Wolfsrudel, Sichel-Schwung |
| 20:00 | Glockenturm-Golem | langsame Stampfer, Steinregen mit Bodenmarkierung |
| 25:00 | Hexenzirkel (3 Hexen) | Teleport-Wechsel, kreuzende Feuerstrahlen |
| 30:00 | Der Hohle König (Endboss) | 3 Phasen, Arena-Ring aus Dornen, Sieg = Morgendämmerung |
Boss-HP-Leiste oben, Warn-Banner + Musik/SFX-Stinger beim Erscheinen, Truhe beim Tod (Endboss: Siegsequenz).

## Grafik-Qualitätslatte (hart)
- Einheitliche Palette: **32 Farben** (`src/palette.ts`, dunkle Nachtpalette mit warmen Lichtakzenten). Keine Off-Palette-Farben
  (Ausnahme: additive Licht-/Vignette-Überblendungen und dunkle UI-Dim-Overlays aus Palettenfarben).
- Figuren/Gegner: 1-px dunkle Kontur (nicht reines Schwarz), mind. 3 Schattierungsstufen, klare Silhouette, Lichtkante von oben-links,
  keine "Pillow-Shading"-Blobs, keine Einzelpixel-Rauschen. Animationen: Lauf 4 Frames, Idle/Hit/Tod.
- Karte: Tileset 16x16 (Moorgras-Varianten, Wege, Wasser/Moorlöcher mit Rand-Tiles, Steine, tote Bäume, Ruinen, Gräber, Laternenpfähle),
  Autotiling/Übergänge, Dekoration zufällig aber gruppiert. Dunkle Nachtstimmung mit **Lichtkreis um den Spieler** (Additive Light/Vignette).
- Effekte: Partikel für Treffer/Tod/Level-up/Evolution, Screen-Shake dosiert, Hit-Stop bei Boss-Treffern, Damage-Numbers (Bitmap-Font),
  Projektil-Trails, Glow für Magie (additive blend), Truhen-Öffnungs-Sequenz.
- UI: eigener Pixel-Bitmap-Font, XP-Leiste oben, Timer, Kills, Waffen/Powerup-Icons (16x16, alle 12 + 6 Evolutionen).
- Assets entstehen per **Skript** (reproduzierbar, `scripts/art/*.py`) und/oder Asset-Server + Nachbearbeitung; jedes Asset visuell geprüft.

## Sound
8-Bit-SFX (prozedural generiert, `scripts/gen_sfx.py`): Treffer, Tod, XP, Level-up, Truhe, Boss-Warnung, Waffen. Einfache Loop-Musik optional.

## Definition of Done (gesamt)
Alle Listen oben vollständig umgesetzt; 30-min-Run per `autoPlay` + `setTimeScale(30)` ohne Crash/JS-Fehler durchlaufbar (alle 6 Bosse
erscheinen, Truhen droppen, mind. 1 Evolution erreichbar); Performance-Ziel erfüllt; Tests grün; Screenshots aller Gegner/Bosse/Waffen geprüft.

## Status — M1 (Architektur + Core-Loop), 2026-11-25

**Fertig:**
- Interne Auflösung **480x270**, `pixelArt`/`roundPixels`/`antialias:false`, ganzzahlige CSS-Skalierung (2x/3x/…), Szenen **Boot → Title → CharSelect (2 Charaktere) → Run + UI → Results**.
- Ordner: `src/data/` (characters, weapons 6x8 Stufen, passives 6x5, evolutions, enemies 30, bosses 6, waves 30), `src/logic/` (rng, stats, xp, levelup, waves, combat), `src/systems/` (Pools, SpatialHash, Spawner, Combat, Pickup, LevelUp), `src/scenes/`, `src/gfx/`.
- Spieler: 8-Wege (WASD/Pfeile), Kamera-Follow, 4096x4096 prozedurale Chunk-Karte (16px-Tiles, Moor/Wasser/Pfad/Dekor), I-Frames 0.8 s, Regeneration/Rüstung.
- Gegner: Object-Pools, Spatial Hash, Separation; Archetypen `chaser`/`swarm`; **bog_rat, wisp, bogzombie** mit Platzhalter-Sprites (Palette, Hit-Flash, 2-Frame-Animation).
- Waffe **ember** Stufe 1–8, generisches Framework (Cooldown, Projektil-Pool, sanftes Ziel-Homing, Durchschlag, Schaden, Rückstoß, Waffen-DPS-Tracking).
- XP-Kristalle 3 Größen, Magnet/Aufsammelradius; Level-up pausiert, 3 Angebote, Tastatur 1–3 / Pfeile+Enter; Slot-Limits 6+6 und maxed-Filter als reine Funktion getestet.
- Wellen-Director aus `waves.ts` (Spawnrate/Mix pro Minute, Ring-Welle ab Minute 3, Spawns im Ring außerhalb des Bildschirms); Boss-Hooks für M4 vorbereitet.
- **Debug-API `window.__lf`** vollständig: `state, setTimeScale, skipTo, god, giveXp, addWeapon, addPassive, spawnEnemy, spawnBoss, openChest, pickLevelUp, autoPlay`. Cheats nur mit `?debug=1`. `spawnBoss`/`openChest` werfen bis M4/M5 einen klaren Fehler; nicht-implementierte Waffen/Gegner ebenfalls.
- Palette: 32 eigene Nacht-/Licht-Farben in `src/palette.ts`, dokumentiert. Alle sichtbaren Pixel/Textfarben daraus, Bitmap-Font (5x7) selbst erzeugt.
- Perf-Harness `scripts/perf.mjs`, Verifikation `scripts/verify.mjs` (Playwright, Screenshots `shots/m1-*.png`).

**Messwerte (dieser Rechner, headless Chromium):**
- `npm test`: **35 Tests grün** (RNG, Level-up-Regeln, XP, Wellen, Stats inkl. kumulativer Passive-Stufen, SpatialHash, Datentabellen, Sprite-Grids).
- `npm run perf` mit 500 Gegnern über 10 s: **60,1 FPS** (Ziel ≥ 55), 497 Gegner aktiv, 0 JS-Fehler.
- `npm run verify`: 10x-Zeitskalierung, AutoPlay, **66,3 s Spielzeit** im Testfenster, Level 5, 36 Kills, Level-up/Pause/Results erreicht, 0 JS-Fehler. Simulation läuft in festen 1/20-s-Teilschritten (Tunnel-Kollisionen bei hoher Zeitskalierung deutlich reduziert; Streifschüsse bleiben möglich).
- Sichtprüfung `shots/m1-*.png`: Palette, Schärfe und HUD lesbar; Platzhalter-Art bewusst einfach.
- **Fix-Runde:** Separation deckungsgleicher Gegner nutzt eine deterministische UID-Richtung (goldener Winkel) statt (0,0) — `src/logic/separation.ts` + 4 Unit-Tests + `npm run sepcheck` (20 Gegner exakt übereinander, nach 2 s minDist 1,68 px, 0 Überlappungen). Pause-Build-Spalte „STUFE n“ ist rechtsbündig auf fester x-Position.

**Bekannte Lücken / offene Punkte:**
- Nur `ember` ist spielbar; die anderen 5 Waffen sind Daten + Schema für M2 (Angebote zeigen sie deshalb noch nicht an).
- Nur 3 der 30 Gegner sind gespielt; nicht-implementierte Wellen-Einträge fallen in M1 auf bog_rat/wisp/bogzombie zurück.
- **Bruder Kael** startet laut Spec mit Kettenflegel; da dieser erst in M2 spielbar ist, erhält er in M1 ersatzweise Glutfunke (CharSelect zeigt weiterhin die Spec-Startwaffe).
- Bosse, Truhen, Evolutionen, Endboss/Sieg, Sound, Damage-Numbers, Partikel-VFX und Meta fehlen (M2–M6).
- Karte/Deko sind Platzhalter: weiche Kanten per Pixel-Knabbern statt vollem Rand-Tileset-Autotiling; Charakter-/Gegner-Animationen sind 1–2 Frames, keine 4-Frame-Läufe.
- Balance ist M1-Rohbau (XP-Kurve 8 + 7/Level, Gegner-HP skaliert mit Zeit).

## Status — M2 (Waffen, Powerups, Evolutionen, Truhen, UI), 2026-11-25

**Fertig (dieser Abschnitt ersetzt die M1-Lückenliste):**
- **6 Basiswaffen** komplett spielbar, je **8 Stufen**, datengetrieben + im gemeinsamen `CombatSystem`: Glutfunke (Homing/Projektil), Kettenflegel (Halbkreis, Richtung, Rückstoß), Frostnova (Puls, Slow/Freeze), Dornensalve (Fächer, Pierce), Sturmrune (Blitzschläge, Kettenblitz ab Stufe 4), Geisterlaterne (kreisende Lichter). Gepoolte Trails/Bursts/Ringe/Beams im `FxSystem` (Cap 360), additive Magie-VFX, Statusfelder (Slow/Freeze) im EnemyPool.
- **6 Powerups** Stufe 1–5 wirken kumulativ auf echte Stats (Tempo, Abklingzeit, Max-HP/Regen, Aufsammelradius, Schaden, Dauer/Fläche); für jede Stufe per Unit-Test gegen die `effective*`-Funktionen belegt.
- **6 Evolutionen** (`phoenix`, `wrath_pendulum`, `eternal_winter`, `thorn_storm`, `thunder_seal`, `soul_beacon`) mit eigenen Behaviors/VFX und deutlich stärkeren Werten. Sie **ersetzen die Basiswaffe im Slot** (Stufe 8). Reine Regeln `canEvolve` / `evolvableList` / `chestUpgradeCount` / `chestRewards` mit Tests; Evolution hat in der Truhe Vorrang, Basiswaffe wird dann nicht erneut angeboten.
- **Truhen:** eigener Drop beim Boss-Tod (M2-Platzhalterboss), Glanz-Puls, Bildschirmrand-Pfeil außerhalb des Views, Öffnungs-Sequenz mit Deckel, Lichtstrahl, Münzen, Slot-Rollen und 1/3/5 Belohnungen (Chance steigt mit der Run-Zeit). Run pausiert während der Sequenz. `window.__lf.openChest()` und `spawnBoss(0..5)` funktionieren jetzt (Platzhalter).
- **UI:** 18 eigene 16×16-Icons (6 Waffen, 6 Powerups, 6 Evolutionen; dunkle Kontur, Palettenfarben, Distinktheit zur Laufzeit validiert) in Level-up-Karten, HUD-Leiste, Pause-Build (2 Spalten) und Truhen-Slots. Bitmap-Font hat echte **Ä Ö Ü ä ö ü ß**; alle UI-Texte auf Umlaute umgestellt (kein AE/OE/UE mehr).
- **Karte:** Grasfläche beruhigt (keine Pixelrauschflecken mehr, Grasbüschel in 2×2-Blöcken gruppiert), Deko weiter blockweise gruppiert.
- **Ergebnis-Screen:** 3-spaltige Schadenstabelle mit Waffen-/Evolutions-Icons, absteigend sortiert, 0-Schaden gefiltert, max. 12 Einträge; reine Funktion `damageTable` + Tests.

**Messwerte (dieser Rechner, headless Chromium):**
- `npm test`: **56 Tests grün** (RNG, XP, Level-up, Wellen, Stats/Powerups, Evolution/Truhe, Schadenstabelle, SpatialHash, Daten, Sprite-Grids, Font-Umlaute).
- `node scripts/verify-weapons.mjs`: **12/12 Waffen** (6 Basen + 6 Evolutionen) als Stufe 8 mit je 50 Gegnern, 5 s + Wirkphase; Schaden je Waffe **1.400–9.090**, 0 JS-Fehler. Screenshots `shots/m2-weapon-<id>.png` alle gesichtet. Truhe → **Phönixschwarm** im Slot bewiesen (`shots/m2-evolution-phoenix.png`), Sequenz als `shots/m2-chest.gif` (48 Frames, 480×270).
- `npm run perf`: **56,9 FPS** (Ziel ≥ 55) mit allen **6 Waffen auf Stufe 8** und gehaltenen **≥ 500 Gegnern** (Ziel 580, min. 505, ø 575) über 10 s; 1.002 Kills, 0 JS-Fehler. Screenshot `shots/perf-500.png`.

**Bekannte Lücken / offene Punkte (ehrlich):**
- **Bosse sind Platzhalter:** `spawnBoss(i)` erzeugt einen vergrößerten Moorzombie mit 9× HP; echte Boss-Mechaniken, HP-Leiste, Warn-Banner und 6 Bosse folgen in M4. Truhen droppen daher aktuell nur über den Platzhalterboss/Debug.
- Nur **3 der 30 Gegner** sind implementiert; M3 bringt Archetypen/Spezialwellen. Wasser-/Moorflächen der Karte sind noch flache Platzhalter, ebenso Gegner-/Spieleranimationen (1–2 Frames).
- **Sound, Damage-Numbers, Meta/Shop** und der Endboss (30:00) fehlen (M5/M6). Die 30-Minuten-Sieg/Niederlage-Schleife ist noch nicht end-to-end abgenommen.
- Balance ist Rohbau: Evolutionen sind bewusst deutlich stärker; Truhen-Chancen und Waffenwerte brauchen Playtesting.
- Debug-Cheats nur mit `?debug=1`; `openChest` verweigert sich, wenn bereits eine Truhe oder ein Level-up offen ist.
