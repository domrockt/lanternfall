# Lane m10-chest-spawn-cell-fair-r2 — Truhe: Spawn-Zelle mit geringster Gegnerdichte

Folgekarte aus m10-chest-spawn-fair (dort „Metrik-Limitierungen / offene Punkte“): die Truhe
bleibt per Design an der Boss-Todestelle (VS-Referenzmoment), kann aber in Gegnerdichte von bis
~66 Gegnern in 96 px liegen — „hinter der Gegnermasse“. Diese Lane setzt die Fairness-Stufe um:
**innerhalb r = 64 px um die faire Spawn-Zelle die Zelle mit der geringsten Gegnerdichte wählen
(suchen, nicht teleportieren)**. `textures.ts` und der Truhe-Randpfeil bleiben unangetastet
(m10-chest-arrow-texture-r2 fixt die Textur separat, chronologisch danach).

Re-Queue-Hinweis: das Original m10-chest-spawn-cell-fair wurde dispatcht, aber nie gelaufen
(kein Runner-Lauf, kein Lane-Doc, kein Merge); Briefing inhaltlich unverändert, neue ID (r2).

## Regel (K2, `src/systems/ChestSystem.ts`)

`fairChestSpawn` erhält ein optionales `enemyCount(x, y)` (lebende Gegner im 48-px-Radius um
eine Kandidaten-Zelle, Konstante `CHEST_CELL_DENSITY_RADIUS_PX = 48`):

1. Kanten-Margin + Wasser-Ausschluss + Spiral-Fallback **unverändert** (m10-chest-spawn-fair).
2. Danach: Kandidaten auf dem 16-px-Raster innerhalb `CHEST_CELL_SEARCH_RADIUS_PX = 64` px um
   die faire Zelle, nur freie Zellen (Margin + nicht blockiert). Gewinnen tut die Kandidaten-
   Zelle mit der geringsten Dichte; **Gleichstand → naeherste Zelle**, und das Zentrum gewinnt
   den Gleichstand gegen sich selbst → **Fallback alte Position, wenn kein Kandidat strikt
   besser ist** (`reason: "cell"`).
3. Ohne `enemyCount` bitgleich zum Stand m10-chest-spawn-fair (alle alten Tests grün).

`ChestSystem.spawn()` liest den Gegner-Snapshot **lesend** über `run.enemies.active`
(Run.ts bleibt unangetastet, Disponent-Claim respektiert) im selben Sim-Schritt wie der
Boss-Tod. Spawn-Distanz (Truhe bleibt nahe am VS-Moment) und Timing (`lf-elapsed`, gleicher
Schritt wie `collectKills`) sind unverändert; `ChestSpawnRecord` um `fromX/fromY` erweitert
(Diagnose). Randpfeil (`computeChestArrow`) unberührt.

## Vorher / Nachher (K1/K4, 3 Seeds × 6 Bosse, timeScale 30, god + autoplay)

Skript `scripts/m10-chest-spawn-cell.mjs` — zählt lebende Gegner im 48-px-/96-px-Radius um die
TATSÄCHLICHE Spawn-Zelle im selben Sim-Schritt wie der Spawn. Belege:
`~/games/.evidence/m10-chest-spawn-cell-fair-r2/m10-chest-cell-before.json` / `…-after.json`
(Kopien `shots/m10-chest-cell-before.json` / `-after.json`, gitignored — nur Zahlen hier).

| Metrik (18 Truhen) | Vorher | Nachher |
|---|---|---|
| nearEnemies48px Median | 0 | 0 |
| nearEnemies48px Mean | 1,28 | **0,06 (−95 %)** |
| nearEnemies48px Max | 10 (Seed 101 #4) | **1** |
| Truhen mit ≥ 1 Gegner im 48 px | 4/18 | **1/18** |
| nearEnemies96px Mean | 5,28 | **2,61 (−51 %)** |
| nearEnemies96px Max | 36 (Seed 101 #3) | **18** |
| Distanz Truhe↔Spieler Mean/Max | 115 / 209 px | 111 / 186 px (unverändert) |
| JS-Fehler | 0 | 0 |

**Akzeptanzgrenze (vor der Messung festgelegt, präzisiert nach K1):** der K1-Lauf zeigte, dass
der nearEnemies48px-**Median** bereits 0 ist (15/18 Truhen hatten keine Gegner im 48 px) —
„Median deutlich gesenkt“ ist also messtechnisch nicht greifbar. Verbindliche Auswertung stattdessen
über Tail/Spread: Max 48 px 10 → 1, Mean 48 px 1,28 → 0,06 (−95 %), Max 96 px 36 → 18, Mean 96 px
5,28 → 2,61 (−51 %). Das Erfolgsziel „deutlich gesenkt“ ist im Tail klar erreicht; der Median
bleibt 0 (nicht schlechter). Hinweis: Spawn-Läufe sind nicht bitdeterministisch über timeScale-Läufe
(m10-run-determinism-fix); die positionsreine Regel ist von dieser Varianz unabhängig, ein Teil der
Differenz ist Lauf-Varianz — die Größenordnung (−95 % Mean 48 px) ist aber deutlich über Rauschen.

## Guard-Tests (K3, `tests/chest-spawn-cell.test.ts`, 11 Tests)

Dichte-Regel (mindere Dichte gewinnt, Bewegung ≤ 64 px), Gleichstand → naeherste Zelle, Fallback
ohne strikt besseren Kandidaten, ohne `enemyCount` bitgleich, Wasser-Kandidaten nicht wählbar
(Köder-Zelle im Wasser wird nicht genommen), Kanten-/Ecken-Margins respektiert, Spiral-Fallback +
Dichte kombiniert. Komplette Suite: 157 Dateien / 1701 Tests grün; `npx tsc --noEmit` rc=0.

## Sichtprüfung (K4)

- `shots/abnahme/m10-chest-cell-visible.png` — Boss-Tod → „EINE TRUHE ERSCHEINT“, Truhe sichtbar
  auf freier Landzelle neben dem Spieler.
- `shots/abnahme/m10-chest-cell-arrow.png` — Spieler weit wegteleportiert (Debug-Repro,
  `~/tmp/m10-chest-spawn-cell-fair-r2/arrow-repro.mjs`): Randpfeil links mittig, zeigt exakt zur
  Truhe (Winkelabweichung zur Soll-Richtung 0,001 rad, Pfeilposition (24, 180) bei 640×360).
- Erreichbarkeit/Tap-Range: Truhen-Timing-Lauf zeigt Bot-Öffnung (autoplay öffnet Truhe); Pfeil-
  Logik unangetastet (chest-arrow-Suiten grün).

## Timing

`scripts/m10-chest-timing.mjs` (30-min-Sim, timeScale 30): 6/6 Bosse, **6/6 Truhen ± 0,5 s**,
genau 1 Truhe pro Boss, 0 Doppel-Spawns, 0 JS-Fehler — unverändert. Beleg:
`~/games/.evidence/m10-chest-spawn-cell-fair-r2/m10-chest-timing-after.json` (verdict.passed = true).

## Abnahme

| Kriterium | Beleg | Status |
|---|---|---|
| nearEnemies48px deutlich gesenkt (Tail) | Max 10 → 1, Mean 1,28 → 0,06 (−95 %), before/after-JSON in `~/games/.evidence/m10-chest-spawn-cell-fair-r2/` | ✅ |
| Truhen-Timing 6/6 ± 0,5 s unverändert | timing-after.json verdict.passed, `chest-timing`-Suite grün | ✅ |
| Erreichbarkeit (Randpfeil + Tap-Range) | `shots/abnahme/m10-chest-cell-arrow.png` (0,001 rad), `visible.png`, chest-arrow-Suiten grün | ✅ |
| Tests grün | 1701/1701, `npx tsc --noEmit` rc=0, `npm run build` rc=0 | ✅ |
| Wasser/Kanten-Regel + Pfeil + Texturen unangetastet | `fairChestSpawn`-Anteil unverändert, `computeChestArrow`/`textures.ts` nicht angefasst (git log) | ✅ |

## Metrik-Limitierungen / offene Punkte

- Dichte ist ein **Snapshot im Spawn-Schritt**: Gegner bewegen sich; eine kurz danach leere
  Zelle kann sich füllen und umgekehrt. Die Regel maximiert die Fairness am VS-Referenzmoment,
  nicht für die Ankunftszeit des Spielers.
- nearEnemies48px-Median ist als Zielmetrik schwach (vorher schon 0) — Tail-Metriken (Max/Mean)
  sind hier die entscheidende Kennzahl (siehe Tabelle).
- `r = 64 px` ist bewusst klein („suchen, nicht teleportieren“); im dichtesten Fall (Seed 101 #3,
  vorher 36 Gegner in 96 px) bleibt nachher 18 in 96 px — ein Teil des Schwarms folgt dem Spieler
  und ist mit einer Spawn-Zelle nicht wegzureparieren. Ein größerer Radius müsste gegen den
  VS-Referenzmoment („Truhe liegt da, wo der Boss kämpft“) abgewogen werden.
- Spawns variieren zwischen Läufen (nicht bitdeterministisch, m10-run-determinism-fix).
