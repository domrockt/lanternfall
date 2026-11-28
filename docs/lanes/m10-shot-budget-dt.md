# Lane m10-shot-budget-dt — Gegner-Schuss-Budget deterministisch (Teil 2 Determinismus-Schnitt)

Datum: 2026-11-28 · Worktree: `lf-lanes/m10-shot-budget-dt` · Branch: `m10-shot-budget-dt`
Bedarfsmeldung: m10-pause-freeze #7505 (Befundklasse „frame-abhängiges Budget“) · disjunkt zu `m10-spawn-budget-dt` (anderes File: `src/systems/Spawner.ts`)
Basis: Karte #7491 (Merge b90c229, shot-budget-cap) + Reviewer-Nachbesserung 2ae0087.

## Ziel und Akzeptanz (VOR der Messung festgelegt, K1)

Gleicher Seed + gleiche Versuche an gleichen Sim-Zeiten → **identische Schuss-/Telegraph-Marken**
(Launch-Zeitpunkt + Ursprungs-Identität) unabhängig von der dt-Folge. Referenz für Verhaltens-
Erhalt: feste 16,67-ms-Frames (dt = 1/60, Versuche je Frame) müssen **bitgleich zum #7491-Stand**
sein; Fairness-Invarianten (#7491) bleiben exakt; `tests/enemy-shots-fair.test.ts` ohne inhaltliche
Änderung grün.

## Vorher (shots/m10-shotbudget-dt-before.json, Commit 8f0f714)

Probe `scripts/m10-shot-budget-dt.mjs` führt den **echten** `EnemyProjectilePool` headless
(node `--experimental-strip-types`, phaser/atlas per Loader-Stub — kein Renderer, ohne flock).
Versuche werden seed-abhängig an festen **Sim-Zeiten** (1/30-Raster, je Schritt 9 Versuche auf 40
fixen Plätzen, stationär vx=vy=0 → Ursprung = Identität) erzeugt; verglichen werden drei Läufe
mit gleichem Seed 7505 und 8 s Sim-Zeit:

| Lauf | dt | Versuch-Raster | Ergebnis |
|---|---|---|---|
| seq60sparse | 1/60 | 1/30 | erste Launch-Divergenz **t = 0,4 s** (ids `[5,7,8,**11**,13,31,33,36]` vs `[5,7,8,**20**,13,31,33,36]`), `cancelledBudgetRotation` **19** |
| seq30 | 1/30 | 1/30 | `cancelledBudgetRotation` **168** |
| seq60dense | 1/60 | 1/60 | Referenz (#7491-Baseline), `cancelledBudgetRotation` 183 |

`deterministic = false`. `fired` ist in beiden Folgen gleich (1440) — die Divergenz liegt in den
**Marken/Identitäten**: das Budget-Fenster rotierte je Frame, leere Frames setzten den
Dienst-Fensterstart auf 0 zurück (Start-Reset) → bei 60 FPS gewannen dauerhaft dieselben
Versuchs-Positionen, bei 30 FPS rotierte die Zuteilung fair.

## Der exakte Hebel (K2, Commit a0b9e0c)

`src/systems/EnemyProjectiles.ts`:

- Neu: `ENEMY_SHOT_BUDGET_WINDOW_SECONDS = 1/60` — Budget-Fensterbreite in **Sim-Zeit**.
- `simTime`-Akkumulator über die dt der `update()`-Aufrufe; `advanceBudgetClock(dt)` am Anfang
  von `update()` dreht alle abgelaufenen Fenster weiter (`windowIndex = floor(simTime/Fenster + 1e-9)`).
- `launchBudget` (Name/Default 8 unverändert) gilt jetzt **je Sim-Zeit-Fenster** statt je Frame:
  `frameAttempts/frameGrants` → `windowAttempts/windowGrants`; `admitByBudget()` und die Rotation
  nutzen Fenstergrößen, Logik unverändert.
- **Leere Fenster rotieren nicht**: die Rotation ist eine Funktion der Versuche, nicht der
  Frame-Anzahl — genau das eliminiert den Start-Reset und macht die Zuteilung bei groben
  dt-Häppchen fair (vorher verhungerten bei dt=0,1 9 von 12 Plätzen; Test (b) in K3).
- `clear()` setzt die Budget-Uhr vollständig zurück (deterministischer Szenen-Start).
- FP: Epsilon 1e-9 s beim Fenster-Index absorbiert Akkumulator-Rauschen (~1e-13 nach 10⁵ Frames).

Nicht angefasst (Grenze eingehalten): Telegraph-Cap 96, Budget-Rückgabe bei Telegraph-Mangel
(2ae0087), Rotation gegen Starving, Windup-/Offscreen-Gates, Treffer-/Trail-Pfad.
Keine Assertions-Kollision → **keine Bedarfsmeldung** in `~/games/.dispatch/requests.md` nötig.

## Nachher (shots/m10-shotbudget-dt-after.json)

| Kennzahl | before | after |
|---|---|---|
| deterministic (seq60sparse ≡ seq30) | **false** | **true** |
| denseMatchesBaseline (seq60dense ≡ #7491-Baseline) | – | **true** |
| cancelledBudgetRotation 60/30 FPS | 19 / 168 | **168 / 168** (identisch) |
| fired (beide Folgen) | 1440 | 1440 |

Bonus: bei 60 FPS mit Versuchs-Clumps war die Zuteilung vorher *ungerecht* (Start-Reset);
jetzt rotiert sie fair und **frame-raten-unabhängig**.

## Tests (K3, Commit 6f2410d)

`tests/shot-budget-dt.test.ts` (8 Tests, echter Pool + Atlas-Mock): Budget je Sim-Zeit-Fenster,
`update(dt>Fenster)` dreht mehrere Fenster, leere Fenster rotieren nicht (Fairness bei dt=0,1),
dt-Determinismus (bitgleiche Marken bei 1/60 vs 1/30), Budget-Rückgabe bei Telegraph-Mangel,
Rotation gegen Starving, festes 1/60-dt = genau ein Fenster je Frame, `clear()`-Reset.
Gesamt: **118 Testdateien / 1287 Tests grün** — inkl. `enemy-shots-fair.test.ts` und
`shot-budget-cap.test.ts` **ohne inhaltliche Änderung**. `npx tsc --noEmit`, `npm run build` grün.

## Grenzen und offene Punkte

- Dateien: nur eigene (EnemyProjectiles.ts, Test, Probe, Doku, shots/m10-shotbudget-dt-*).
  `CombatSystem.ts`/`gen-fx.ts`/`Spawner.ts` nicht berührt.
- **Scope-Hinweis (ehrlich):** dieser Hebel macht die **Zuteilung** sim-zeit-deterministisch. Ob
  die Versuche selbst an gleichen Sim-Zeiten ankommen, liegt beim KI-/Spawner-Strom (frame-getaktet)
  — das ist Sache von `m10-spawn-budget-dt` bzw. der AI-Lane. Die Probe erzeugt Versuche deshalb
  sim-zeit-getaktet; damit ist das Akzeptanzkriterium dieser Lane messbar und erfüllt.
- Beobachtet (nicht meine Lane): `shots/m10-passive-math-*.json` wurden 03:28 von einem fremden
  Job in diesem Worktree regeneriert (nur `generatedAt`); auf HEAD zurückgesetzt, nicht committet.
