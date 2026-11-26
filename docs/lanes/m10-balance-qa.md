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
| 6 | kael | 404 | Morgendämmerung | 30.7 | 36 | 9562 | wrath_pendulum + thunder_seal | `shots/m10-balance-main-kael-404.png` |

Rohdaten: `shots/m10-balance-main-runs.json` (alle Minuten-Samples, Boss-Trace, DPS) und
`shots/m10-balance-main-summary.json` (Harness-Summary). JS-Fehler: **0** (`jsErrors: []`).

**Wichtigster Karte-1-Befund:** Kael/Seed 101 erreicht auf Basis `f26dc4b` **Level 29**, nicht 47.
Der gemeldete Level-47-Lauf reproduziert auf diesem Stand nicht (Karte 3 prüft, warum).

## Karte 2 — Korridor-Quote und Streuung (Basis f26dc4b)

Zielkorridore des Harness (`TARGET` in `scripts/balance.mjs`): Überleben 20–28 min (Sieg zählt als
bestanden), Level am Ende 25–40, Boss-Kampfdauer je Boss 20–60 s. Ein 30-min-Run endet erst mit dem
Tod des Endbosses bei 30:00 (Sieg/Morgendämmerung).

| Lauf | Level | Ziel 25–40 | Endzeit (min) | Überleben 20–28 / Sieg | Boss-Dauern (s) | Boss 20–60 | `passedAll` |
|---|---|---|---|---|---|---|---|
| mira/101 | 27 | JA | 21.4 (Tod) | JA | 30, 26, 29, 29 | JA | JA |
| kael/101 | 29 | JA | 30.6 (Sieg) | JA | 30, 37, 36, 36, 35, 34 | JA | JA |
| mira/202 | 26 | JA | 21.2 (Tod) | JA | 23, 29, 32, 36 | JA | JA |
| kael/202 | 27 | JA | 30.8 (Sieg) | JA | 33, 52, 49, 52, 47, 47 | JA | JA |
| mira/404 | 26 | JA | 20.7 (Tod) | JA | 26, 44, 26, 26 | JA | JA |
| kael/404 | 36 | JA | 30.7 (Sieg) | JA | 34, 38, 44, 38, 44, 38 | JA | JA |

**Korridor-Quote**

- Level 25–40: **6/6 = 100 %**
- Überleben 20–28 min bzw. Sieg: **6/6 = 100 %** (3 Siege Kael, 3 Tode Mira bei 20.7–21.4 min)
- Boss-Dauer 20–60 s: **30/30 Bosse = 100 %**
- Harness `passedAll` (alle drei Kriterien + ≥1 Evolution): **6/6 = 100 %**

**Streuung**

| Größe | min | median | max |
|---|---|---|---|
| Level am Ende | 26 | 27 | 36 |
| Endzeit (min) | 20.7 | 26.0 | 30.8 |
| Boss-Dauer (s, n=30) | 23 | 35.5 | 52 |
| Kills | 1600 (mira/404) | — | 11051 (kael/202) |

Beobachtung: Kael siegt auf allen drei Seeds und tötet 7 508–11 051 Gegner, liegt aber nur bei
Level 27–36. Mira stirbt auf allen drei Seeds in einem engen Band (20.7–21.4 min, Level 26–27).
Der Level-47-Befund tritt in keinem der sechs Läufe auf; Maximum ist **36** (kael/404).
Boss-Dauern sind unauffällig bis auf kael/202 (47–52 s, nahe Obergrenze 60 s).

