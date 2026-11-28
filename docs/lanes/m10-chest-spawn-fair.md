# Lane m10-chest-spawn-fair — Truhen-Spawn-Fairness

Ziel (Dom): „alle 5 min eine Art Boss, der eine Truhe spawnt wie in Vampire
Survivors" — die Truhe ist ein Kernmoment und muss erreichbar sein. Bisher war
nur das **Timing** belegt (6/6 ± 0 s, Randpfeil); nicht **WO** die Truhe landet.

## Befund Vorher (`shots/m10-chestfair-before.json`, K1)

Messmatrix: 3 Seeds (7, 101, 4242) × 6 Truhen, timeScale 30, god + autoplay,
Skript `scripts/m10-chest-fair.mjs` (Terrain an der Spawn-Zelle, Kantenabstand,
Distanz zum Spieler, Gegner-Nähe, grober Grid-Pfad mit Wasser als blockiert).

- **13/18 Truhen auf fairer Zelle, 5 unfair**:
  - 2× in einem **Moorwasser-Tile** (40 % Slow direkt am Kernmoment; Seed 7 #4, Seed 4242 #2)
  - 3× **20 px von der Feldkante** (fast immer Boss #5 „Der Hohle König", der
    am Rand gekämpft wird; Seed 7/101/4242 #5) — plus 1× Wasser nahe der Kante (Seed 4242 #2, edge 146)
- Kontext: Das Spielfeld hat **keine Wände** — „Wand/Ecke" ist die Spielfeldkante
  (Spieler ist bei 10 px geklemmt), „Hindernis" ist Moorwasser.

## Fix (K2, `src/systems/ChestSystem.ts`)

Reine Funktion `fairChestSpawn(x, y, opts)`:

1. **Kanten-Margin**: Klemme in `[CHEST_EDGE_MARGIN_PX = 48 px (3 Tiles), worldSize − 48]`.
2. **Wasser-Ausschluss**: Primärzelle blockiert (kindAt an der **Tile-Mitte** =
   identischer Referenzpunkt wie der 40-%-Slow in `Run.terrainFactorAt`) →
   Spiralsuche über 16-px-Tiles, **EUCLID-nächste** freie Zelle gewinnt
   (früher Abbruch, sobald kein äußerer Ring mehr besser sein kann).
3. **Notfall-Klemme**: nichts frei bis `CHEST_SPAWN_SEARCH_TILES = 24` Tiles
   (384 px) → geklemmte Primärzelle (nie schlechter als Ist-Zustand).

Angewendet in `ChestSystem.spawn()` — der Aufrufort in `Run.collectKills`
(`chests.spawn(e.x, e.y)`) und damit **Run.ts bleiben unangetastet** (fremd
beansprucht). Wasser-Abfrage optional über die vorhandene `Run.isWaterAt`
(`run?.isWaterAt?.(...)` — Methoden-Extraktion würde `this` verlieren, das war
der erste Laufzeitfehler im Nachher-Lauf). **Timing ± 0 s** (gleicher Aufruf im
gleichen Sim-Schritt wie der Boss-Tod) und **Belohnungslogik bitgleich**.
Randpfeil (`scripts/m10-chest-arrow.mjs`, `computeChestArrow`) unberührt.

## Guard-Tests (K3, `tests/chest-spawn-fair.test.ts`, 8 Tests)

Freie Zelle unverschoben; Kanten-Klemme x/y/Ecke; Wasser → Euclid-nächste freie
Zelle (16 px und 48-px-Disk inkl. Gleichstand-Auswertung); Notfall-Klemme
innerhalb des Margins; fernes Wasser wirkungslos; Reinheit + Bewegungs-Cap.
`npx vitest run` über alle chest-*-Suiten: 90/90 grün.

## Nachher (`shots/m10-chestfair-after.json`, K4)

Dieselbe 3-Seed-Matrix nach dem Fix:

- **18/18 Truhen auf fairer Zelle (0 Wasser-Tiles, 0 Kanten-Spawns < 48 px)**,
  0 JS-Fehler
- Grid-Pfad (Wasser blockiert, 16-px-Raster): 6–14 Tiles zu Spieler; 2× `null`,
  weil der **Spieler** selbst in einem Wasser-Tile stand (Modell „Wasser
  blockiert" — Start/Ziel-Limit, kein Spawn-Befund)
- Timing: alle 18 Truhen im selben Schritt wie der Boss-Tod (Match ± 0,5 s),
  6/6 Boss-Tode pro Seed
- Beobachtete Bewegungen: Wasser-Fälle wurden um 1–3 Tiles auf Land verschoben,
  Rand-Fälle in den 48-px-Margin geklemmt

## Abnahme

| Kriterium | Beleg | Status |
|---|---|---|
| 6/6 Truhen × 3 Seeds auf freier Zelle, 0 Wand-/Ecken-Spawns | `shots/m10-chestfair-after.json` (totals: 18/18 ok, unfair 0) | ✅ |
| Vorher-Beleg | `shots/m10-chestfair-before.json` (13/18, 5 unfair) | ✅ |
| Pfeil-Logik unveraendert | `scripts/m10-chest-arrow.mjs` nicht angefasst (git log), `chest-arrow`-Tests grün | ✅ |
| Truhen-Timing ± 0,5 s | after-JSON: chest↔bossDeath-Match ± 0,5 s, 18/18 | ✅ |
| `npx tsc --noEmit` rc=0 | Läufe während K2/K4 | ✅ |
| `npm test` grün inkl. neuer Tests | 8 neue Tests + Suite | ✅ |
| UI.ts nicht angefasst | nur ChestSystem.ts + Tests + Skript + Doku | ✅ |

## Metrik-Limitierungen / offene Punkte

- `pathStepsWaterBlocked` im **before**-JSON durchgängig `null` (String-Truthiness-Bug
  im BFS des Mess-Skripts, nach dem K1-Lauf gefixt — Vorher-Lauf nicht rückwirkend
  wiederholt; decisive Metriken Terrain/Kante/Distanz sind unberührt).
- Spawn-Läufe variieren zwischen Runs (Boss-Todespositionen nicht bitdeterministisch
  über timeScale-Läufe — Thema der Lane m10-run-determinism-fix). Die Fairness-Regel
  ist positionsrein und daher von dieser Varianz unabhängig.
- **„Hinter der Gegnermasse"** ist nicht Teil der Spawn-Regel: ChestSystem kennt
  keine Gegner; die Messung liefert `nearEnemies96px` als Kontext (vorher bis 80,
  nachher 0–66). Truhe bleibt per Design an der Boss-Todestelle (VS-Referenzmoment),
  Erreichbarkeit via Randpfeil + Tap-Range 220 px. Falls gewünscht: Folgekarte
  „Spawn-Zelle mit geringster Gegnerdichte in r=64 px".
