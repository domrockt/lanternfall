# Lane m10-mira-dps-corridor — mira-DPS-Drift: Bosse unter das Korridor-Minimum

Lane: `m10-mira-dps-corridor` (Worktree, Branch `m10-mira-dps-corridor`), 2026-11-28.
Karten: #12164 (K1 Vorher), #12165 (K2 Ursache+Fix), #12166 (K3 Rebaseline), #12167 (K4 Abschluss).
Fund der Guard-Lane m10-balance-corridor-guard (docs/lanes/m10-balance-corridor-guard.md, Bedarf in
`.dispatch/requests.md` 28.11.).

## Auftrag

mira meltet Bosse unter das Dom-Korridor-Minimum (ACCEPTANCE A5, Dom-Zustimmung 06:00Z:
Boss-Dauer 20–60 s). MINIMALER Fix, der alle mira-Boss-Dauern in [20, 60] s bringt.
**kael und die Korridor-Schwellen bleiben UNVERÄNDERT.**

## K1 — Vorher (Baselines der Guard-Lane, kein neuer Messlauf)

Quelle: `shots/m10-balance-corridor-short.json` (generatedAt 2026-11-28T12:19Z) und
`shots/m10-balance-corridor-full.json` (12:35Z), committet in main durch Lane
m10-balance-corridor-guard. Korridor: Boss-Dauer [20, 60] s.

### Vorher — mira Boss-Dauern (s)

**short (bis Boss 3):**

| Seed | Moorkönigin | Knochenfürst | Fahle Hirte | Verstoß |
|---|---|---|---|---|
| 101 | **12,9** | 23,1 | 28,6 | 1 |
| 202 | 30,1 | 29,2 | 29,0 | 0 |
| 404 | 31,3 | 29,5 | 33,4 | 0 |

**full (30-min-Referenz):**

| Seed | Moorkönigin | Knochenfürst | Fahle Hirte | Glockenturm-Golem | Hexenzirkel | Hohler König | Verstoß |
|---|---|---|---|---|---|---|---|
| 101 | **11,8** | 26,5 | 32,0 | 28,5 | 28,1 | 22,6 | 1 |
| 202 | **15,1** | 29,8 | 31,3 | 26,1 | 25,5 | 25,4 | 1 |
| 404 | **10,1** | 22,3 | 23,7 | 21,1 | **19,6** | **17,5** | 3 |

mira-Verstöße gesamt: 6 (alle unter 20 s); alle im [20,60]-Fenster liegenden mira-Werte:
kurz 23,1–33,4, full 21,1–32,0. Endlevel full: 35/36/36 (Fenster 25–40 erfüllt).
Kein Tod vor Minute 15 (6/6 Dawn).

### Vorher — kael (Referenz für Nebenwirkungsfreiheit, K2/K3-Kriterium d: ±10 %)

| Seed | short: M/K/H | full: M/K/H/G/Hex/HK |
|---|---|---|
| 101 | 26,9 / 30,1 / 36,3 | 29,0 / 48,9 / 40,3 / 39,9 / 34,7 / 30,5 |
| 202 | 29,3 / 51,9 / 47,1 | 30,1 / 45,2 / 29,3 / 26,0 / 28,1 / 23,1 |
| 404 | 27,3 / 42,4 / 39,8 | 28,4 / 50,4 / 53,5 / 43,3 / 37,8 / 39,4 |

Alle kael-Läufe im Korridor. Endlevel full: 34/35/35. Historic-Referenz 2026-11-26
(shots/m10-balance-kael-final.json, lane m10-balance-kael): mira/202 24/26/25/23/25/33 —
dort alles im Fenster.

## K2 — Ursachenklärung + Fix

(Befund folgt)

## K3 — Rebaseline

(folgt)

## K4 — Abnahme

(folgt)
