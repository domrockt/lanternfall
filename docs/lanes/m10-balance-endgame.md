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
