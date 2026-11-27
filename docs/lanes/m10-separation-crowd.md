# Lane m10-separation-crowd — Horden-Klumpen bei 500+ Gegnern

Stand: 2026-11-27. Worktree `/home/ai/games/lf-lanes/m10-separation-crowd`, Branch `m10-separation-crowd`.
Ziel: Der art-director-Restpunkt aus A10 („im Chaos verschwimmen einzelne Typen rechts, Horde
überlagert sich stark") wird auf **Logikebene** geschlossen — keine Renderer-Änderung, keine
Änderung an `Run.ts`, `CombatSystem.ts` oder `EnemyPool.ts`.

## Ist-Stand / Ausgangslage

`src/logic/separation.ts` hatte `separationPush`, `directionToPlayer`
und `fallbackDir`; `src/systems/SpatialHash.ts` war das Uniform Grid für Kollision/Separation.
Einzige vorhandene Zahl war `scripts/separation-check.mjs` (20 exakt gestapelte Gegner nach 2 s).

## Karte #2358 — Baseline (Commit `20e6fa5`)

`scripts/m10-crowd-probe.mjs` (auf `scripts/harness.mjs`, headless Chromium, `?debug=1&seed=1`):
500 Gegner aus 8 Typen dicht in einem 40-px-Kreis um die Weltmitte, Spieler in der Mitte,
300 rAF-Frames. Natürliche Wellen-Spawns für die Messung aus (`lf-density=0`), Gegner-HP
künstlich hoch, damit die Probe Separation statt Kampf misst.
FPS-Messung mit `flock /home/ai/games/.lf-perf.lock`.

| Metrik (500 Gegner, 300 Frames) | Baseline |
|---|---|
| Paare < 4 px (`closePairs`) | 561 von 124.750 (`closePairRatio` 0,45 %) |
| Mittlerer Nächster-Nachbar-Abstand | 3,83 px |
| Gegner im 32-px-Kreis um den Spieler | 280 |
| FPS min / median | 59,5 / 59,9 |
| NaN/Infinity-Positionen | 0 |
| JS-Fehler | 0 |

Belege: `shots/m10-separation-before.json`, `shots/m10-separation-before.png` (Chaos-Frame Minute 25).

## Karte #2359 — Separation härten (Commit `d7749ee`)

- **Massengewichtung** `separationWeight(selfRadius, otherRadius) = 2·otherMass/(selfMass+otherMass)`,
  geklemmt auf 0,25…2. Gleich große Gegner bleiben bei 1 (Verhalten wie vorher), kleine Schwarm-
  gegner weichen Tanks/Eliten stärker aus, große drücken kleine weg. Kein neues Feld nötig.
- **Deterministischer Golden-Angle-Fallback** bei (nahezu) identischer Position, aus der Spawn-UID.
  Zwei Läufe mit gleichen uids ergeben bitgleich dieselben Positionen (kein `Math.random`).
- **Mengen-Resolver** `resolveCrowdSeparation(nodes, options)`: Spatial-Hash-Nachbarsuche,
  `maxIterations` (≤8, Default 3) und `maxPairChecks` (Default 400.000) als harte Deckel,
  Verschiebung pro Durchlauf auf `2·Radius` begrenzt (kein Teleport). `separationCellSize(maxRadius)`
  leitet die Zellgröße aus dem größten Radius ab (delegiert an `SpatialHash.recommendedCellSize`).
- Bestehende Signaturen/Exporte von `separationPush`, `directionToPlayer`, `fallbackDir` unverändert,
  `Run.ts` musste nicht angefasst werden.

Tests `tests/separation-crowd.test.ts`: 20 exakt gestapelte Gegner sind nach 2 s Run-Loop-Simulation
≥ 6 px getrennt; keine NaN/Infinity bei Randfällen; 20er-Stack in zwei Läufen seed-stabil identisch;
Resolver-Deckel (Iterationen/Paar-Budget) greift deterministisch.

## Karte #2360 — SpatialHash-Nachbar-Query (Commit `8374539`)

- `SpatialHash.queryNeighbors(x, y, radius, out)`: Kreis-Query **mit** Distanzfilter, Treffermenge
  identisch zu einer Brute-Force-Referenz; liest nur die vom Kreis überdeckten Nachbarzellen.
- `SpatialHash.recommendedCellSize(maxQueryRadius) = clamp(ceil(2·r), 16, 64)`: Suchkreis fällt in
  höchstens 2×2 Zellen, damit 500 Gegner nicht quadratisch abgefragt werden.
- `separationCellSize` delegiert an diese Ableitung (keine doppelte Formel).

Test: 3 Seeds × 200 Queries Trefferzahl identisch zu Brute-Force; **500 Query-Zyklen Median 0,872 ms**
(< 5 ms auf dem Testrechner, `npx vitest run tests/separation-crowd.test.ts --reporter=verbose`).

## Karte #2361 — Nachmessen (Belege in diesem Commit)

Gleiches Probe-Skript wie #2358, `flock /home/ai/games/.lf-perf.lock … node scripts/m10-crowd-probe.mjs --tag=after`.

| Metrik (500 Gegner, 300 Frames) | Baseline | Nachher | Ziel | Status |
|---|---|---|---|---|
| Paare < 4 px (`closePairs`) | 561 | **11** | −50 % (≤ 280) | **−98,0 %, PASS** |
| `closePairRatio` | 0,45 % | **0,01 %** | – | PASS |
| Mittlerer Nächster-Nachbar-Abstand | 3,83 px | **8,81 px** | größer | PASS |
| Gegner im 32-px-Kreis um den Spieler | 280 | **38** | ≤ 40 | **PASS** |
| FPS min / median | 59,5 / 59,9 | **59,5 / 59,9** | min ≥ 55 | **PASS** |
| NaN/Infinity-Positionen | 0 | 0 | 0 | PASS |
| JS-Fehler | 0 | 0 | 0 | PASS |

Zusatz-Check `flock … npm run perf` (rc=0, `passed: true`): 500er-Burst 59,4 FPS, Minute-25-Last
56,1 FPS, 0 JS-Fehler — die stärkere Separation kostet keine Frame-Zeit.

Belege: `shots/m10-separation-after.json`, `shots/m10-separation-after.png`.

## Art-Director-Urteil (A10-Restpunkt)

**PASS — Note-Bereich 3,5/5** (art-director, Chaos-Frame `shots/m10-separation-after.png` 3x nearest,
rechte Hordenseite x≈1200–1450 / y≈350–800).

- **Mindestens 4 Gegnertypen rechts an Form + Farbe trennbar: JA.** Weiße/hellgraue Skelett-Sprites
  (hoch, schmal), rote kurzbeinige Adepten, blaugraue Panzer-/Ritter-Sprites und braun-orange
  Kolosse (breite Silhouette) sind klar unterscheidbar; die goldgelben Punkte sind Loot-Kristalle.
- **Bodenlücken statt Wand: JA.** Durchgehende grüne Bodenlücken zwischen den Clustern, 1-px-Konturen
  und Lichtkante oben-links bleiben lesbar. Im BEFORE verschmilzt genau diese Flanke zu einer
  rot/weißen Wand ohne Grund darunter.
- **Besser als BEFORE: JA.** Vorher geschlossener Kreisblock, jetzt aufgelockerte Ring-/Schwarm-
  formation mit sichtbaren Lücken auch im Kern links des Bosses.
- Abzug auf 3,5: der dichteste Kern unter der Boss-Leiste verschwimmt noch teilweise, und
  Loot-Kristalle liegen visuell über Gegnern — kein FAIL, da alle vier Typen und Bodenkonturen
  auf der geforderten rechten Seite nachweisbar sind.

**Offene Grafik-Nachbesserungen (nicht Teil dieser Logik-Lane):**
1. Boss-Silhouette (Moorkönigin) liegt im Chaos ~50 % von Gegnern verdeckt → Boss/Elite mit
   1-px-Lichthalo bzw. hellem Bodenring über die Horde legen und 2-px-Separationspuffer für Bosse.
2. Konturen zweier Einheiten < 1 px verschmelzen zu einer Doppelkante → Mindest-Konturabstand
   2 px statt nur Mittelwert.
3. Loot-Kristalle werden über Gegnern gezeichnet → Depth der Gems prüfen.

Diese Punkte sind Renderer-/Art-Themen und bewusst **nicht** in dieser Lane (keine Renderer-Änderung);
sie gehören in eine Folgekarte der Engine-/VFX-Lane.


## Testzahlen

| | Testdateien | Tests |
|---|---|---|
| vor der Lane | 24 | 268 |
| nach der Lane | 24 | **281** (+13 in `tests/separation-crowd.test.ts`) |

`npx tsc --noEmit` grün, `npm test` 281/281 grün, `npm run build` rc=0.

## Offene Punkte / ehrliche Einordnung

- Der **Iterations-/Paar-Deckel** lebt im neuen `resolveCrowdSeparation`; `Run.ts` ruft weiterhin
  pro Frame `separationPush` in einer Schleife auf. Weil `Run.ts` in dieser Lane tabu ist, ist der
  Resolver derzeit nur über Tests/Ad-hoc-Aufrufe aktiv. Die produktive Wirkung dieser Lane kommt
  aus Massengewichtung, verstärktem Radial-Push und der deterministischen Tangential-Scherung.
  Eine spätere Engine-Karte kann `resolveCrowdSeparation` in `Run.ts` einhängen (API steht).
- Die Grundverstärkung (`radial = ratio·weight·14`, Scherung `ratio·1.0`) wurde über die Probe
  getunt; sie ist bewusst konservativ begrenzt (`resolveCrowdSeparation` kappt auf `2·Radius`/Pass),
  aber `separationPush` selbst bleibt ein reiner Paar-Vektor ohne Aggregat-Cap (Caller-Summe).
- Fremde Dateien minimal berührt: `tests/pool-reuse.test.ts` und `src/logic/ai-state.ts`
  (`AiState.phase` im Recycle-Reset) — identisch zum main-Fix `#2327`, ohne den der Build rot war.
- `.opencode/board.json` wird mitcommittet (Lane-Karten #2358–#2361); der Merge behält das main-Board
  und ergänzt die Karten.
