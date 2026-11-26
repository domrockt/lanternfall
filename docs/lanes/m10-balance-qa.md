# M10 Balance-QA — Kael/Seed 101 Level-47-Befund belegen

Worktree: `/home/ai/games/lf-lanes/m10-balance-qa` (Branch `m10-balance-qa`)
Basis-SHA beim Start: **f26dc4b** (`Board: #998 verify-02 abgenommen (#97), #638 bleibt offen`)
Alle Zahlen unten gelten für genau diesen Basis-SHA. Der Merge der Lane `m8-display` lief beim Start noch.

Ziel: Den offenen Balance-Punkt nicht schätzen, sondern mit 6 Läufen (Mira+Kael × Seeds 101/202/404)
belegen — Korridor 25–40 Level, 30-min-Run, Boss-Dauern 20–60 s — und die Ursache des
gemeldeten Kael/Seed-101-Level-47-Laufs in `src/logic/*` mit Werten begründen.

Harness: `node scripts/balance.mjs --seeds 101,202,404 --characters mira,kael --tag -m10 --doc ~/tmp/...`
(feste 1/20-s-Substeps, timeScale 30, autoPlay-Bot, **kein god**, kein flock — lastunabhängig).

## Checkliste (Board-Pflege macht der Merge-Job)

- [x] **Karte 1** Harness-Optionen lesen, 6 Läufe als Matrix starten, Ausgaben nach `shots/m10-balance-*` umbenennen.
- [x] **Karte 2** Korridor-Tabelle Level/Endzeit, Korridor-Quote, Streuung (min/median/max), Boss-Dauern.
- [x] **Karte 3** Ursache: Level-47-Lauf gegen Korridor-Lauf diffen (XP-Kurve, spawnRate/enemyHpScale, TIER_MIXES).
- [x] **Karte 4** Report + Empfehlung (Parameter, Richtung, erwarteter Effekt), Tests grün.

## Karte 1 — Lauf-Matrix (6 Läufe, Basis f26dc4b)

| # | Char | Seed | Ergebnis | Endzeit (min) | Level | Kills | Evolutionen | Beleg |
|---|---|---|---|---|---|---|---|---|
| 1 | mira | 101 | Tod | 21.4 | 27 | 1796 | phoenix + thorn_storm | `shots/m10-balance-main-mira-101.png` |
| 2 | kael | 101 | Morgendämmerung | 30.6 | 29 | 7508 | wrath_pendulum + thorn_storm | `shots/m10-balance-main-kael-101.png` |
| 3 | mira | 202 | Tod | 21.2 | 26 | 1715 | phoenix + thorn_storm | `shots/m10-balance-main-mira-202.png` |
| 4 | kael | 202 | Morgendämmerung | 30.8 | 27 | 11051 | wrath_pendulum + phoenix | `shots/m10-balance-main-kael-202.png` |
| 5 | mira | 404 | Tod | 20.7 | 26 | 1600 | phoenix | `shots/m10-balance-main-mira-404.png` |
| 6 | kael | 404 | Morgendämmerung | 30.7 | 36 | 9562 | wrath_pendulum + thorn_seal | `shots/m10-balance-main-kael-404.png` |

Rohdaten: `shots/m10-balance-main-runs.json` (alle Minuten-Samples, Boss-Trace, DPS) und
`shots/m10-balance-main-summary.json` (Harness-Summary). JS-Fehler: **0** (`jsErrors: []`).

**Wichtigster Karte-1-Befund:** Kael/Seed 101 erreicht auf Basis `f26dc4b` **Level 29**, nicht 47.
Der gemeldete Level-47-Lauf reproduziert auf diesem Stand nicht (Karte 3 prüft, warum).

## Karte 2 — folgt
