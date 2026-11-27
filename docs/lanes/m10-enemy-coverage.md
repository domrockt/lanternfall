# Lane m10-enemy-coverage — echte Gegner-Abdeckung im 30-min-Run

Stand: 2026-11-27. Worktree `/home/ai/games/lf-lanes/m10-enemy-coverage`, Branch `m10-enemy-coverage`.
Basis-SHA beim Start: `bb4214a` (main-HEAD nach Merge der Lane `m10-input-fix`).

Ziel: Alle 30 Gegnertypen aus `src/data/enemies.ts` müssen im echten 30-min-Run
**tatsächlich spawnen** — belegt durch Simulation und In-Game-Lauf, nicht nur durch
die Datenliste. `scripts/acceptance-count.mjs` zählt bisher nur die Datentabelle (30/30 Daten).

Vorgehen in Karten:

- **#1738 / K1** — Sim-Messwerkzeug `scripts/m10-coverage-sim.json` (unten: `shots/m10-coverage-sim.json`).
- **#1739 / K2** — Ist-Stand belegen: Lückenliste, First-Spawn, Share je 5-min-Block.
- **#1740 / K3** — Lücken schliessen in der Tier-Mischung.
- **#1741 / K4** — Unit-Test `tests/wave-coverage.test.ts`.
- **#1742 / K5** — In-Game-Beleg 30 Sim-Minuten @ timeScale 30.

## K1 — Messwerkzeug `scripts/enemy-coverage.mjs` (#1738)

Reine Simulation (kein Browser, kein Phaser) über die echten Director-Funktionen:

- `waveForMinute(minute)` aus `src/data/waves.ts` (Mix + Spawnrate),
- `advanceSpawnBudget(budget, rate * spawnRateFactor(640,360), 1)` aus `src/logic/waves.ts`,
- `pickEnemy(mix, rng)` aus `src/logic/waves.ts`,
- Spezialwellen (`ring`/`stream`) und Elite-Pakete am Minutengrenzpunkt, wie in
  `Spawner.update()` (`6 + floor(minute/6)` bzw. `6 + floor(minute/5)`, `elitePackCount`).

30 Sim-Minuten in 1-s-Schritten, Seeds **101** und **202**. Ausgabe:
`shots/m10-coverage-sim.json` plus stdout-Tabelle mit Spawns je `ENEMY_ID`,
First-Spawn-Sekunde und Share je 5-min-Block.

Aufruf: `node scripts/enemy-coverage.mjs`.

## K2 — Ist-Stand: Lückenliste (#1739)

Messung aus `shots/m10-coverage-sim.json` (beide Seeds, je 30 min, 2524 Spawns):

| Kriterium | Seed 101 | Seed 202 |
|---|---|---|
| Typen mit ≥ 1 Spawn | **30/30** | **30/30** |
| IDs mit 0 Spawns | keine | keine |
| First-Spawn nach Tier-Ende | keine | keine |
| Typ mit Share > 35 % je 5-min-Block | keiner (max 32.7 %) | keiner (max 28.3 %) |

Damit ist die **Lückenliste leer**. Detaillierte Tabelle (Spawns, First-Spawn,
höchster Block-Share):

| id | Spawns S101 | Spawns S202 | First S101 | First S202 | max Share (Block, Seed) |
|---|---:|---:|---:|---:|---|
| bog_rat | 55 | 47 | 2s | 2s | 32.7 % (B0, 101) |
| wisp | 36 | 36 | 13s | 10s | 21.4 % (B0, 101) |
| mudling | 10 | 12 | 36s | 69s | 7.1 % (B0, 202) |
| crow | 24 | 20 | 5s | 55s | 14.3 % (B0, 101) |
| bogzombie | 34 | 34 | 7s | 31s | 20.2 % (B0, 101) |
| toad | 9 | 19 | 21s | 5s | 11.3 % (B0, 202) |
| skeleton | 68 | 79 | 300s | 300s | 28.3 % (B1, 202) |
| bat | 80 | 55 | 300s | 304s | 28.7 % (B1, 101) |
| ghoul | 55 | 43 | 300s | 303s | 19.7 % (B1, 101) |
| witchling | 22 | 32 | 300s | 300s | 11.5 % (B1, 202) |
| slime | 34 | 47 | 306s | 300s | 16.8 % (B1, 202) |
| scarecrow | 20 | 23 | 310s | 300s | 8.2 % (B1, 202) |
| wolf | 66 | 66 | 600s | 600s | 17.5 % (B2, 101) |
| banshee | 76 | 70 | 600s | 600s | 20.2 % (B2, 101) |
| golem | 29 | 44 | 600s | 604s | 11.7 % (B2, 202) |
| spider | 100 | 97 | 600s | 600s | 26.5 % (B2, 101) |
| cultist | 44 | 42 | 617s | 600s | 11.7 % (B2, 101) |
| bomber | 62 | 58 | 600s | 600s | 16.4 % (B2, 101) |
| knight | 84 | 97 | 900s | 900s | 20.6 % (B3, 202) |
| harpy | 84 | 67 | 900s | 900s | 17.8 % (B3, 101) |
| lich | 84 | 90 | 900s | 902s | 19.1 % (B3, 202) |
| wraith | 94 | 92 | 900s | 900s | 19.9 % (B3, 101) |
| treant | 38 | 51 | 903s | 900s | 10.8 % (B3, 202) |
| imp | 88 | 75 | 900s | 900s | 18.6 % (B3, 101) |
| horror | 205 | 228 | 1200s | 1200s | 20.7 % (B4, 202) |
| centipede | 223 | 244 | 1200s | 1200s | 20.3 % (B4, 202) |
| gargoyle | 251 | 247 | 1200s | 1204s | 23.1 % (B5, 202) |
| reaper_bat | 338 | 327 | 1200s | 1200s | 29.0 % (B4, 101) |
| abom | 102 | 95 | 1210s | 1207s | 8.5 % (B4, 101) |
| voidcaller | 109 | 87 | 1200s | 1200s | 10.1 % (B5, 101) |

Tier-Enden: Tier 0 = 300 s, Tier 1 = 600 s, Tier 2 = 900 s, Tier 3 = 1200 s,
Tier 4 = 1800 s. Alle First-Spawns liegen im jeweiligen Tier-Fenster; die
spätesten sind `cultist` (617 s, Tier 2), `abom` (1210 s) und `gargoyle` (1204 s, Tier 4).

## K3 — Lücken schliessen (#1740)

**Ergebnis: keine Änderung an den Tier-Mischungen nötig — die Invarianten sind
bereits erfüllt.** Die Karte verlangt als Abnahme genau diese Bedingungen; sie
sind messbar grün, also wird keine Balance ohne Befund verändert.

Geprüft gegen `src/data/waves.ts` (die Mischungen liegen dort, nicht in
`src/logic/waves.ts`; `src/data/waves.ts` ist zudem nicht im Datei-Claim dieser
Lane, daher bewusst unangetastet):

| Invariante | Ist-Stand |
|---|---|
| jede der 30 IDs in mindestens einer Tier-Mix mit Gewicht > 0 | **30/30** (keine fehlende ID) |
| jede ID im Mix ihrer eigenen Zeitstufe | **30/30** |
| Tier-Mix normalisiert (Summe > 0, alle Gewichte > 0) | 5/5 (Summen 13, 12, 11, 11, 11) |
| höchster Basis-Gewichtsanteil einer Tier-Mix | 30.8 % (bog_rat in Tier 0) |
| kein ID-Share > 35 % je 5-min-Block (Sim, beide Seeds) | **0 Verstöße**, Maximum 32.7 % |
| First-Spawn vor Tier-Ende (Sim, beide Seeds) | **30/30 je Seed** |

Damit ist die von #1739 belegte Lückenliste leer und K3 hat nichts zu schliessen.
Die 30/30-Abdeckung wird in K4 als Regressions-Test festgeschrieben, damit
spätere Balance-Änderungen die Abdeckung nicht unbemerkt verlieren.

## K4 — Unit-Test `tests/wave-coverage.test.ts` (#1741)

Die Simulation aus K1 wurde als reine Funktion `simulateEnemyCoverage(seed, seconds, ids, rateFactor)`
in `src/logic/waves.ts` extrahiert (kein Phaser, keine Zeitabhängigkeit) und wird von
Skript und Test gemeinsam genutzt. Vier Assertions-Gruppen:

- **(a)** 30/30 IDs stehen in mindestens einer Tier-Mix mit Gewicht > 0 **und** in der
  Mischung ihrer eigenen Zeitstufe.
- **(b)** jede der 5 Tier-Mixes ist normalisiert: nur bekannte IDs, alle Gewichte > 0,
  Summe > 0, Share-Summe = 100 %.
- **(c)** deterministische 30-min-Simulation (Seeds 101/202) deckt 30/30, jeder
  First-Spawn liegt vor dem Tier-Ende.
- **(d)** kein ID-Anteil > 35 % in einem 5-min-Block (beide Seeds).

Beleg: `npx vitest run tests/wave-coverage.test.ts` → **4/4 Tests grün** (1 Datei, 148 ms).
Der Test ist per CI/Vitest Teil von `npm test`.

## K5 — In-Game-Beleg: 30 Sim-Minuten @ timeScale 30 (#1742)

Headless-Chromium-Lauf über `scripts/enemy-coverage.mjs --ingame`:
Viewport 640×360, `?debug=1&seed=101`, `god(true)` + `autoPlay(true)` + `setTimeScale(30)`,
30 Sim-Minuten (Abbruch bei `state.time >= 1800`), Poll alle 250 ms.

Der Spawn-Zähler wurde minimal ergänzt, ohne Spawning zu steuern:

- `src/systems/Spawner.ts`: `spawnCounts` zählt in `spawnAt()` jeden tatsächlichen
  Gegner-Spawn je `EnemyId` (Splitter-Kinder und Summoner-Minions inklusive;
  Boss-Spawns laufen direkt über `pool.spawn` und werden nicht mitgezählt).
- `src/debug.ts`: `window.__lf.state()` und `window.__lf.stats()` hängen `spawnCounts`
  aus der Registry (`lf-spawner`) an. Keine Debug-Steuerung geändert.

Messwerte (`shots/m10-coverage-ingame.json`):

| Messwert | Wert |
|---|---|
| Sim-Zeit | **1802.7 s** (30:02.7) |
| Echtzeit | 97.9 s |
| abgedeckte Typen | **30/30**, `missing: []` |
| minimale Spawns eines Typs | 10 (`toad`) |
| maximale Spawns eines Typs | 6968 (`reaper_bat`, inkl. Voidcaller-Beschwörungen) |
| insgesamt gezählte Spawns | 9403 |
| **max. gleichzeitig aktive Gegner** | **274** |
| JS-Fehler | **0** |
| Gate | **PASS** (`ok: true`) |

Beleg-Screenshot während des Laufs: `shots/m10-coverage-ingame-minute25.png`
(Minute 25, lebende Gegner im Bild).

Unterschied Sim vs. In-Game (2524 vs. 9403 Spawns): die reine Simulation zählt nur
Director-Spawns; in-game zählen zusätzlich Splitter-Kinder (`mudling`/`slime`/`abom`)
und Summoner-Minions (`cultist`/`voidcaller` → u. a. `reaper_bat`), die über
denselben `spawnAt()`-Pfad entstehen. Für die Abdeckung ist das gewollt: auch diese
Typen werden real gespawnt.

## Abnahme-Status

- Sim-JSON: **30/30** in beiden Seeds (101, 202) — `shots/m10-coverage-sim.json`.
- In-Game-JSON: **30/30**, max. **274** aktive Gegner, 0 JS-Fehler — `shots/m10-coverage-ingame.json`.
- `tests/wave-coverage.test.ts`: **4/4 grün**.
- `npm run build`: grün (via Harness vor dem In-Game-Lauf, `✓ built in 902ms`).
- `npm test`: **15 Dateien / 208 Tests grün**, keine neuen roten Tests.
- Offene Punkte: keine. `src/data/waves.ts` blieb unverändert, weil die Invarianten
  bereits erfüllt waren; die Abdeckung ist jetzt durch K4 gegen Regression gesichert.
