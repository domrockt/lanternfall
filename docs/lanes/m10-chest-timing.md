# Lane m10-chest-timing — Truhen pünktlich und auffindbar

Worktree `/home/ai/games/lf-lanes/m10-chest-timing`, Branch `m10-chest-timing`.
Ziel: Nach jedem Boss erscheint genau eine Truhe innerhalb ±0,5 s; der Randpfeil zeigt in
allen View-Seitenverhältnissen korrekt zur Truhe; der Belohnungsname steht vollständig auf
max. 2 Zeilen ohne Überlappung mit dem Panelrand. **Kein Drop-/Reward-Rebalancing.**

## Ergebnis in einem Satz

**PASS.** Im 30-min-Sim (timeScale 30, Seed 101) spawnen alle 6 Bosse exakt zu ihren
Soll-Zeiten (300/600/900/1200/1500/1800 s), jede Truhe erscheint im selben
Simulationsschritt wie der Boss-Tod (**Delta 0,000 s**, Limit 0,5 s), es gibt **0 fehlende**
und **0 doppelte** Truhen. Pfeilwinkel-Abweichung ist in 16:9, 19.5:9 und 4:3 **0°**
(Limit 5°), alle Slot-Namen bleiben auf **≤ 2 Zeilen**, kleinster Randabstand **31 Gerätepixel**
(Limit 2 px), **0 Überlappungen**, **0 JS-Fehler**. Build und alle 230 Tests grün.

## Karte 1 — Zeit-Beleg (`shots/m10-chest-timing.json`)

Befehl (FPS-/Echtzeit-Messung → flock):
`flock /home/ai/games/.lf-perf.lock timeout 360 node scripts/m10-chest-timing.mjs`
Skript: `scripts/m10-chest-timing.mjs`; Laufzeit 91 s Wall-Clock für
1827 s Run-Zeit (timeScale 30, inkl. Pausen der Truhen-/Level-up-Sequenzen).

| Boss | Soll | Boss-Spawn | Boss-Tod | Truhe | Δ zum Tod | Truhen für Boss |
|---|---:|---:|---:|---:|---:|---:|
| Moorkönigin | 300 | 300,0 | 326,996 | 326,996 | **0,000** | 1 |
| Knochenfürst | 600 | 600,0 | 629,728 | 629,728 | **0,000** | 1 |
| Der Fahle Hirte | 900 | 900,0 | 925,009 | 925,009 | **0,000** | 1 |
| Glockenturm-Golem | 1200 | 1200,0 | 1230,594 | 1230,594 | **0,000** | 1 |
| Hexenzirkel | 1500 | 1500,0 | 1536,077 | 1536,077 | **0,000** | 1 |
| Der Hohle König | 1800 | 1800,0 | 1826,215 | 1826,215 | **0,000** | 1 |

Summen: `bossesDefeated: 6`, `chestsDropped: 6`, `chestSpawnsRecorded: 6`,
`missingChests: 0`, `doubleSpawns: 0`, `jsErrors: 0`, `verdict.passed: true`.

**Soll-Anker:** Die Truhe droppt beim Boss-Tod (so ist das Spiel gebaut). Deshalb ist der
harte ±0,5-s-Check der Abstand **Truhe → Boss-Tod**. Der Abstand zur Boss-Spawn-Zeit
(25–36 s) ist die Kampfdauer und kein Timing-Fehler; die Boss-Spawns selbst liegen exakt
auf 300/600/900/1200/1500/1800 s. Das JSON weist beide Werte getrennt aus
(`deltaToBossDeath`, `deltaToSchedule`), damit die Zahl nicht schöngeredet wird.

## Karte 2 — Spawn-Robustheit (`tests/chest-timing.test.ts`)

`npx vitest run tests/chest-timing.test.ts` → **6/6 grün**:
- `bossSpawnSecond(i)` liefert exakt 300/600/900/1200/1500 und `FINAL_BOSS_AT = 1800`.
- Off-by-one an Minutenrändern: bei `Soll − 0,01` und `Soll − 0,0001` kein Spawn,
  bei `Soll` und `Soll + 0,01` Spawn (für alle 5 Zwischenbosse und den Endboss).
- Boss-Daten (`atSecond`) stimmen mit dem Zeitplan überein.
- Jeder echte Belohnungsname (6 Waffen, 6 Powerups, 6 Evolutionen) bleibt vollständig
  und passt mit `slotNameChars = 13` in höchstens 2 Zeilen; längster Name
  `SEELENLEUCHTFEUER` → `["SEELENLEU", "CHTFEUER"]`.

Laufzeit-Beleg „nur einmal je Boss“: `collectKills` markiert den Boss vor dem Drop als
`alive=false` und die Truhe liegt in einem eigenen Array (`ChestSystem.chests`), nicht im
Gegner-Pool/Recycling. Der 30-min-Lauf zählt 6 Drops bei 6 Bossen (keine Doppel-Spawns).

## Karte 3 — Pfeil + Panel (`shots/m10-chest-layout.json`)

Befehl: `flock /home/ai/games/.lf-perf.lock timeout 300 node scripts/m10-chest-layout.mjs`.
Drei Formate, jeweils Truhe außerhalb des Views und Truhen-Panel mit Evolution
`SEELENLEUCHTFEUER` (längster Name), Screenshot je Format.

| Format | Intern | Pfeil sichtbar | Ist-Winkel | Soll-Winkel | Abweichung | Randabstand Pfeil | min. Namens-Randabstand | Überlappungen |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 16:9 | 640×360 | ja | 36,9° | 36,9° | **0,00°** | 24 px | 31 px | 0 |
| 19.5:9 | 780×360 | ja | 36,9° | 36,9° | **0,00°** | 24 px | 31 px | 0 |
| 4:3 | 480×360 | ja | 36,9° | 36,9° | **0,00°** | 24 px | 31 px | 0 |

- Winkel-Soll = `atan2(chest.y − View-Mitte.y, chest.x − View-Mitte.x)` aus der echten
  `camera.worldView`; Ist = `arrow.rotation`. Toleranz 5°, erreicht 0°.
- Der Pfeil sitzt in jedem Format 24 px vom Bildschirmrand (Clamp-Margin 24).
- Pixel-Check: Screenshot (deviceScaleFactor 2) im Textband y = 245–267 logisch; gesucht
  werden exakt kerzenweiße Glyphen (`#F2EDD8`, PAL 12). Kleinster Abstand zur Slot-Karte
  ist 31 Gerätepixel, zur Panel-Kante 227 Gerätepixel; 0 Überlappungen. Alle sichtbaren
  Namen sind vollständig (Zeile 1 + Zeile 2 == Belohnungsname), max. 2 Zeilen.
- Belege: `shots/m10-chest-arrow-16x9.png`, `shots/m10-chest-arrow-19.5x9.png`,
  `shots/m10-chest-arrow-4x3.png`, `shots/m10-chest-panel-16x9.png`,
  `shots/m10-chest-panel-19.5x9.png`, `shots/m10-chest-panel-4x3.png`; alle gesichtet
  (Pfeil am Rand, Panel-Titel „TRUHE GEÖFFNET“, Evolution-Slot zweizeilig ohne Abschneiden).

## Abnahme

| Kriterium | Soll | Ist | Beleg |
|---|---|---:|---|
| Truhen innerhalb ±0,5 s | 6/6 | **6/6, Δ 0,000 s** | `shots/m10-chest-timing.json` |
| Genau 1 Truhe je Boss | 6, 0 Doppel | **6, 0 Doppel, 0 fehlend** | dito |
| Pfeilwinkel-Abweichung | ≤ 5° in 3 Formaten | **0° / 0° / 0°** | `shots/m10-chest-layout.json` |
| Textüberlappungen | 0 | **0** | dito (Pixel-Check) |
| Build | grün | **grün** (`npm run build`, 975 ms) | `~/tmp/m10-chest-timing/build-card3.log` |
| Tests | alle grün | **230/230, 18 Dateien** | `~/tmp/m10-chest-timing/test-card3.log` |
| JS-Fehler | 0 | **0** | beide JSONs |

## Offene Punkte / bewusst nicht geändert

- **Kein Rebalancing** an Drop-Chancen, Truhen-Inhalt oder Boss-HP (Auftrag).
- Der Soll-Anker der Truhe ist der Boss-Tod; das ist im GAME.md-Status so dokumentiert.
  Wer die Truhe direkt zur Boss-Spawn-Zeit sehen will, bräuchte einen Gameplay-Eingriff —
  hier nicht Teil der Lane.
- Die Mess-Skripte sind reproduzierbar (`scripts/m10-chest-timing.mjs`,
  `scripts/m10-chest-layout.mjs`, Seed 101, timeScale 30). Das Layout-Skript nutzt
  ImageMagick `convert` für den Pixel-Check; im Container vorhanden.
