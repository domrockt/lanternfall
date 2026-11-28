# Lane m10-balance-endgame — Endgame-Balance-Lücke (Endzeit-Fenster 25–40 min)

Basis-SHA beim Start: `5f0a6d7` (main, Branch `m10-balance-endgame`, Worktree `/home/ai/games/lf-lanes/m10-balance-endgame`).

## Zielmetrik (VOR der Vorher-Messung festgelegt, Karte K1)

- **Alle Läufe** (3 Seeds × 2 Charaktere = 6, AutoPlay, **kein god**, timeScale 30, Seeds 101/7/42,
  Viewport 960x540 @dpr 1 wie `balance.mjs`): Endzeit (Tod **oder** Morgendämmerung) in **[25, 40] Sim-Minuten**.
- **Streuung (max − min) über alle Endzeiten ≤ 4 min.**
- Begründung Fenster-Untergrenze 25: Tode vor Minute 25 sind der Befund („Endzeit außerhalb des
  Zielfensters“); Obergrenze 40 ist technisch (Run endet bei 30:00 + Dawn ≈ 30,7), schließt aber
  spätere Mortalitätsverschiebungen ein.

## Karte K1 — Ist-Messung (Vorher)

Skript: `scripts/m10-balance-endgame.mjs` (nutzt nur gemeinsame `scripts/harness.mjs`, ändert sie nicht;
läuft **ohne flock**, feste Substeps). Rohdaten: `shots/m10-balance-endgame-before.json`.

| Char | Seed | Ergebnis | Endzeit (min) | Endlevel | Kills |
|---|---|---|---|---|---|
| Mira | 101 | Tod | **20,74** | 29 | 1.579 |
| Mira | 7 | Sieg (Dawn) | 30,40 | 45 | 7.454 |
| Mira | 42 | Tod | **21,50** | 31 | 1.914 |
| Kael | 101 | Sieg (Dawn) | 30,33 | 39 | 7.353 |
| Kael | 7 | Sieg (Dawn) | 30,40 | 40 | 7.502 |
| Kael | 42 | Tod | **23,81** | 31 | 2.350 |

- **Fenster [25,40]: 3/6 erfüllt.** 3 Tode bei 20,74 / 21,50 / 23,81 min liegen unter dem Fenster.
- **Streuung: 9,66 min** (Ziel ≤ 4) — FAIL.
- Diagnose-Richtung: Tode treten im Übergang Minute 20 → 24 auf; genau dort springt der aktive
  Gegner-Deckel auf das Maximum (960x540: `maxActiveEnemies` → 500) und die Spawnrate wächst weiter
  (Minute 25–29: 1,88 → 2,12/s, Tier-4-Mix mit Splitter `abom` und Beschwörer `voidcaller`).
  Die Fix-Hebel setzen genau dort an (K2/K3).

## Karte K2/K3 — Fix-Hebel (und was die Messungen dazu gelehrt haben)

**K2 — Masse-Deckel (`maxActiveEnemies`, `src/logic/scaling.ts`):** ab Minute 18 (zwei Minuten vor
dem Golem-Boss) Basis-Deckel **200 statt 360** (960x540: 300 statt 500, −40 %; 640x360: 200 statt
360). Befund zur Startminute: der 500er-Deckel bindet bei 960x540 exakt ab Minute 18
(`round(min(360, 334)·1,5) = 500`), und die Tode (20,25–21,5 min) fallen in den Golem-Kampf —
eine Entlastung erst ab Minute 20 kommt für diesen Kampf zu spät (Nachher-r1: Kael 3/3 Sieg,
aber Mira starb unverändert bei 20,25–20,32 min).

**K3 — Minuten-Mischung 25–30 (`src/data/waves.ts`):** eigene `LATE_GAME_MIX` für Minute 25–29
ohne Mengen-Vervielfacher (`abom`/Splitter und `voidcaller`/Beschwörer → `knight`/`lich`),
`lateGameSpawnRate` 1,86→1,92 statt 1,88→2,12. Minute 0–24 bitgleich; `TIER_MIXES` unverändert,
damit die Wellen-Abdeckungs-Tests (30/30 First-Spawn vor Tier-Ende) weiter greifen.
*Datei-Begründung:* Die Minuten-Mischung lebt in `src/data/waves.ts`, nicht in `src/logic/waves.ts`;
die Datei war von keiner anderen Lane geclaimt (claims.json), der Eingriff minimal (eine Mix-Tabelle
+ eine Rate-Funktion).

**Zweiter Hebel nachschärfen (K4-Tuning, `enemyHpScale`):** Nachher-r1 (Deckel 260 ab Min 20) und
r2 (Deckel 200 ab Min 18) zeigten: der Masse-Deckel allein verschiebt die Todeschwelle nicht
sicher — r2 noch 1 Tod (mira/42, 22,11 min), und zwischen r1/r2 flippten Seeds an der Schwelle
(mira/7 tot→Sieg, mira/42 Sieg→tot). Ursache: die Gegnerdichte am Spieler wird von der
Spawn-Ankunftsrate bestimmt, nicht vom globalen Deckel; sie sinkt nur über schnellere Kills.
Deshalb `enemyHpScale` ab Minute 18 über 240 s Rampe auf max. **−25 % HP** entlastet (Minute 0–18
bitgleich, Relief startet exakt bei t = 1080 s mit 0; Boss-HP kommt aus `src/data/bosses` und ist
nicht berührt — Boss-Dauern bleiben im 20–60-s-Korridor). Das ist bewusst der zweite, nicht der
zehnte Hebel: Deckel (Masse) und HP-Relief (Kill-Rate) sind die zwei Komponenten des gefundenen
Todesmechanismus.

**Fremde Test-Dateien (minimal, unclaimed):** `tests/spawn-view.test.ts`, `tests/m3-logic.test.ts`,
`tests/endgame-budget.test.ts` — nur die hart codierten Deckel-Expectations (360/439/500 → 200/244/300)
angepasst, kein Test entfernt oder abgeschwächt.

## Karte K4 — Nachher-Messung (finale r3, verbindlich)

Gleiche Parameter wie K1 (`scripts/m10-balance-endgame.mjs after`). Rohdaten:
`shots/m10-balance-endgame-after.json`.

| Char | Seed | Vorher | Nachher | Endlevel (vorher→nachher) |
|---|---|---|---|---|
| Mira | 101 | Tod 20,74 | **Sieg (Dawn) 30,39** | 29 → 37 |
| Mira | 7 | Sieg 30,40 | Sieg (Dawn) 30,46 | 45 → 38 |
| Mira | 42 | Tod 21,50 | **Sieg (Dawn) 30,32** | 31 → 40 |
| Kael | 101 | Sieg 30,33 | Sieg (Dawn) 30,60 | 39 → 39 |
| Kael | 7 | Sieg 30,40 | Sieg (Dawn) 30,49 | 40 → 36 |
| Kael | 42 | Tod 23,81 | **Sieg (Dawn) 30,53** | 31 → 39 |

- **Fenster [25, 40] min: 6/6 erfüllt** (vorher 3/6). Alle Endzeiten 30,32–30,60 min (Sieg/Dawn).
- **Streuung: 0,28 min** (vorher 9,66; Ziel ≤ 4) — erfüllt.
- **0 JS-Fehler** in allen 12 Läufen (Vorher + Nachher). Endlevel 36–40 — damit zusätzlich der
  alte Level-Korridor 25–40 aus M6/A5 für beide Charaktere erfüllt (vorher: Mira/7 bei Level 45
  darüber).
- Iterationshistorie ehrlich: r1 (Deckel 260 ab Min 20) 3/6 im Fenster; r2 (Deckel 200 ab Min 18)
  5/6; r3 (+ HP-Relief) 6/6. Die Vorher-/Nachher-JSONs sind die Belege, die r1/r2-Zwischenstände
  stehen in den Commit-Message-Beifunden (`git log --grep m10-balance-endgame`).

### Review

- `reviewer` (Subagent, 2026-11-28): **PASS** — reine Funktionen nachgerechnet (Minute-Grenzen,
  View-Faktoren 1,5/1,21875/0,75, Relief-Ramp), angepasste Expectations korrekt, Messskript ehrlich
  (`god(false)`, Timeout ≠ Endzeit, `accepted` verlangt alle Läufe + 0 JS-Fehler), GAME.md
  unangetastet, keine Secrets/Temp-Dateien. Nits behoben: stale „Minute 20“-Kommentar,
  tautologischer Mix-Vergleich (jetzt gegen `TIER_MIXES`), `giveup` wird nicht mehr als `death`
  gemeldet.

### Nebeneffekte / Restpunkte

- mehr Siege ⇒ mehr Kills/Level: kein Korridor-Bruch beobachtet (Level 36–40).
- Der Endgame-Massedruck ist spürbar niedriger (300 statt 500 aktive Gegner bei 960x540); das
  entlastet auch den Endgame-FPS-Pfad, ist hier aber nicht gemessen (flock-Sperre: gehört in die
  FPS-Lanes). Boss-Dauern unverändert im Ziel (Boss-HP unberührt); im r3-Lauf wurden keine
  Boss-Dauern aufgezeichnet — das Messskript misst bewusst nur Endzeit/Level/Kills.
- Falls künftig wieder Tode < 25 min auftreten: nächster konkreter Hebel wäre eine Spawnraten-
  Dämpfung für Minute 18–24 in `src/data/waves.ts` (Ankunftsrate direkt), nicht ein weiterer Deckel.
