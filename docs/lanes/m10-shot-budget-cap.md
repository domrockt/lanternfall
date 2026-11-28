# Lane m10-shot-budget-cap — Gegner-Projektil-Flut im Endgame deckeln

Ziel (Briefing): hartes Cap fuer gleichzeitige Gegner-Projektile + faire Zuteilung
(Frame-Budget mit Rotation). Letzter offener FPS-Blocker war Minute-25/fullrun bei
780x360@3 (ACCEPTANCE Versuch 3); Befund aus `docs/lanes/m10-enemy-shots-fair.md`:
500 Ranged-Gegner erzeugen 1359 Projektile in ~2 s — Draw-/Update-Kosten im Chaos
UNDE Lesbarkeitsproblem (m10-shot-clarity). Kein Anfassen von Spieler-Projektilen,
`gen-fx.ts`, `FxSystem.ts`, `CombatSystem.ts`.

## Karte 1 (#7490) — Vorher-Messung

- **Bench Schuss-Pfad** (`scripts/m10-shot-path.mjs`, 500 Gegner/71 Schuetzen,
  640x360 View, 9 Passes min): **0,026 ms/Frame** —
  `shots/m10-shot-budget-cap-before.json`.
- **Chaos** (`scripts/m10-shot-clarity.mjs`, Minute 25, 2 s Echtzeit):
  `shots/m10-shot-budget-cap-before-chaos.json` (= m10-shot-clarity-budget-cap-before.json)

| Szene | aktiv | pending | gleichzeitige |
|---|---|---|---|
| 300 Gegner | 109 | 49 | **158** |
| 500 Gegner | 162 | 78 | **240** |

- **Burst-FPS** (rootcause, 500 Gegner + 6 Waffen Stufe 8): 640x360 **60 fpsMin**,
  780x360@3 **60 fpsMin** (`shots/m10-shot-budget-cap-before-burst-*.json`).
- **Fullrun 780x360@3** (ACCEPTANCE-Versuch-3-Setup): **fpsMin 60,3**, alle 6 Bosse,
  Sieg/Morgendaemmerung — der FPS-Blocker war inzwischen durch andere Lanes
  geschlossen; rot ist dort nur noch das Heap-Gate (20,2 % vs. Ziel 15 %, nicht
  Teil dieser Lane) — `shots/m10-shot-budget-cap-before-fullrun780x3.json`.

**Akzeptanzgrenze vor dem Fix festgelegt:** gleichzeitige Gegner-Schuesse sinken
>= 20 % (Chaos 300/500), Cap wird gehalten, Fairness im Test bewiesen.

## Karte 2 (#7491) — Cap + faire Zuteilung (`src/systems/EnemyProjectiles.ts`)

- `ENEMY_SHOT_ACTIVE_CAP = 160`: hartes Maximum fuer `active + pending`. Darueber
  werden neue `spawn()`-Aufrufe verworfen (Cooldown des Schuetzen bleibt
  unangetastet — kein Queueing, kein stummes Nachfeuern).
- `ENEMY_SHOT_LAUNCH_BUDGET_PER_FRAME = 8`: max. neue Zuteilungen je Budget-Fenster
  (= zwischen zwei `update()`-Aufrufen). Zuteilung VOR der Telegraph-Anforderung:
  abgelehnte Schuesse kosten nichts.
- **Faire Rotation:** das Dienst-Fenster der Breite N rotiert um N weiter und
  wandert so ueber die Versuch-Positionen im KI-Strom (Reihenfolge der Schuetzen
  ist stabil). Bei A Versuchen je Fenster ist jede Position alle
  `ceil(A/N)` Fenster mindestens einmal dran — kein Starving. A <= N: alle feuern.
- Reihenfolge der Gates unveraendert: Offscreen-Verwerfen -> Concurrent-Cap ->
  Frame-Budget -> Telegraph-Pool -> Windup -> `canLaunchShot`. Windup-Gates,
  Offscreen-Regeln und Trefferpfad sind bitgleich: `statSnapshot()` hat dieselben
  Felder wie vorher (Budget-Zaehler liegen in `budgetSnapshot()`), die
  shot-clarity-Baseline bleibt gruen ohne Aenderung.
- Konfiguration fuer Tests/Tuning: `setShotCaps({ activeCap, launchBudgetPerFrame })`.
- Fremd-Datei per Anfrage (`.dispatch/requests.md`): `tests/enemy-shots-fair.test.ts`
  Telegraph-Flood-Test stellt `launchBudgetPerFrame: 200` (der Test floodet 96+
  Spawns in EINEM Fenster und prueft das Telegraph-Cap, nicht das neue Frame-Budget);
  Intention und Assertions unveraendert.
- Reviewer-Nachbesserung (nicht blockierend war): schlaegt `acquireTelegraph()`
  nach erteiltem Budget-Slot fehl (Telegraph-Pool-Cap 96), gibt `spawn()` den Slot
  zurueck (`frameGrants -= 1`) — kein Slot-Verbrauch ohne Schuss.

Startwert 160: Vorher-Chaos 500er 240 gleichzeitige -> <= 160 (−33 %), 300er
158 -> 108 (−32 %). Normaler Spielbetrieb (Bench 13 % Schuetzen, ~86 aktiv +
~15 pending) liegt deutlich unter dem Cap und bleibt unberuehrt.

## Karte 3 (#7492) — Pool-Recycle (Tests in `tests/shot-budget-cap.test.ts`)

- **EnemyProjectilePool:** Steady-State ohne Allokation belegt — 120 Frames nach
  Warmup: 0 zusaetzliche `makeImage`-Aufrufe, `free + active` konstant; Expire ->
  Free-Liste -> Wiederverwendung ueber 5 Launch/Expire-Zyklen ohne neues Objekt.
  Pools: `free` (Runtimes), `pendingFree` (PendingShot), `telegraphFree` (Cap 96),
  `trailPool` (Cap 320).
- **ProjectilePool.ts (Spieler-Pool): geprueft, keine Aenderung noetig** —
  `stats.spawned/reused/created` + `stealCullable()` recyceln im Steady-State
  (Bestandteil von m10-projectile-cull); `created` bleibt nach dem Warmup flach.

## Karte 4 (#7493) — Tests (`tests/shot-budget-cap.test.ts`, 8 Tests)

Cap haelt je Frame (120 Frames, 30 Schuetzen, max. 10 gleichzeitig, exakt am Cap),
Frame-Budget (50 Versuche/1 Fenster -> genau 3 zugelassen, 47 verworfen, `fired==3`
— Ueberschuss wird nicht gefeuert), Offscreen-Gate vor dem Budget (kein
Slot-Verbrauch), Fairness (12 Schuetzen/Budget 3: alle 12 feuern, volle Abdeckung
<= 30 Fenster, faires Mindestanteil je Schuetze; unter Budget 0 Verwerfungen).

## Karte 5 (#7494) — Nachher-Messung

- **Bench** (`shots/m10-shot-budget-cap-after.json`): 0,027 ms/Frame — wie vorher
  (0,026) innerhalb der Messstreuung; der Bench hat nur ~5 Versuche/Fenster und
  ~100 gleichzeitige, liegt also unter Cap/Budget — normaler Spielbetrieb unberuehrt.
- **Chaos** (`shots/m10-shot-budget-cap-after-chaos.json`):

| Szene | aktiv | pending | gleichzeitige | Vorher | Delta |
|---|---|---|---|---|---|
| 300 Gegner | 63 | 45 | **108** | 158 | **−31,6 %** |
| 500 Gegner | 109 | 50 | **159** | 240 | **−33,8 %** |

  Gleichzeitige <= Cap 160 in beiden Szenen; `windupOk` 261/261 bzw. 606/606
  (100 %) — Fairness in-game intact; 0 JS-Fehler. Screenshots:
  `shots/m10-shot-clarity-budget-cap-after-{300,500}.png`.
- **Burst-FPS nachher:** 640x360 60 fpsMin, 780x360@3 60 fpsMin
  (`shots/m10-shot-budget-cap-after-burst-*.json`) — unverändert (vsync-gebunden,
  Szene hat 0 Gegner-Schuesse); keine Verschlechterung.
- **Fullrun 780x360@3 nachher:** **fpsMin 60,2, passed: true** (diesmal auch das
  Heap-Gate gruen) — `shots/m10-shot-budget-cap-after-fullrun780x3.json`; FPS
  vorher 60,3 / nachher 60,2 = vsync-Decke, keine Verschlechterung.

**Abnahme:** gleichzeitige Gegner-Projektile <= 160 (Cap) in beiden Chaos-Szenen ✓;
Fairness-Kriterium im Test ✓; Draw-Beitrag (gleichzeitige Schuesse, Draw-Objekte:
aktive Sprites + Telegraphs + Trails) sinkt 32–34 % >= 20 % ✓; Tests + tsc gruen ✓.

## Grenzen / offene Punkte

- Cap 160 und Budget 8 sind Startwerte laut Briefing; Sim-Daten (Chaos) zeigen,
  dass beide im Chaos binden und im Normalbetrieb nicht. Falls der Disponent ein
  anderes Chaos-Ziel setzt: `setShotCaps()` existiert, Werte sind exportiert.
- Der rootcause-Burst spawnt bog_rat (kaum Schuetzen) — dort kann das Cap nichts
  beweisen; die shot-relevanten Szenen sind Chaos (oben) und Fullrun.
- `budgetSnapshot()`-Zaehler (cancelledBudgetCap/Rotation) sind nicht in
  `statSnapshot()` — bewusst, damit der Trefferpfad bitgleich bleibt. Die
  Debug-Hook-Ausgabe (`__lfEnemyShots`) zeigt sie damit nicht; bei Bedarf in
  `snapshot()` ergaenzen (dann shot-clarity-Baseline anfassen).
- Heap-Gate im Fullrun (20,2 % vs. 15 %) ist nicht diese Lane (kein Projektil-Leak:
  Recycle-Test belegt konstante Objektzahl).
