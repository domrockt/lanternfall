# Lane m10-balance-kael — Balance-Korridor / Kael Level 47

Basis-SHA beim Start: **252fd98** (main, Worktree `/home/ai/games/lf-lanes/m10-balance-kael`, Branch `m10-balance-kael`).

## Karte m10-balance-kael-01 — Reproduktion (Basis 252fd98)

Harness: `npm run build` (grün, warm) danach `node scripts/balance.mjs` **ohne flock**,
timeScale 30, viewport 960x540, dpr 1, autoPlay, kein god.
Rohdaten aus `shots/balance-main-runs.json`, konsolidiert in `shots/m10-kael-repro.json`.

| Char | Seed | Ergebnis | Minuten | Endlevel | Kills | Evos | Boss-Dauern (s) |
|---|---|---|---|---|---|---|---|
| Kael | 101 | Sieg (Dawn) | 30,6 | **28** | 8.438 | wrath_pendulum, phoenix | 32/45/39/40/24/30 |
| Kael | 202 | Sieg (Dawn) | 30,6 | 29 | 7.464 | wrath_pendulum, thunder_seal, thorn_storm | 34/53/34/38/39/35 |
| Kael | 303 | Sieg (Dawn) | 30,5 | 29 | 6.227 | wrath_pendulum, thorn_storm, eternal_winter | 31/37/33/35/34/29 |
| Kael | 404 | Sieg (Dawn) | 30,5 | 26 | 9.256 | wrath_pendulum, phoenix | 34/48/39/37/27/29 |
| Kael | 505 | Tod | 15,3 | 24 | 1.521 | – | 29/48 |
| Kael | 606 | Sieg (Dawn) | 30,7 | 31 | 9.982 | wrath_pendulum, eternal_winter, soul_beacon | 33/47/47/40/38/37 |
| Mira | 101 | Tod | 20,7 | 26 | 1.549 | phoenix | 25/42/31/31 |
| Mira | 202 | Tod | 21,3 | 26 | 1.847 | phoenix | 30/46/33/35 |

Korridor-Quote: **7/8** (Kael/505 stirbt bei 15,3 min außerhalb 20–28 min; alle Boss-Dauern 24–53 s).

**Befund Reproduktion:** Der in ACCEPTANCE A5 genannte Level-47-Fall (Kael/Seed 101) ist auf
Basis 252fd98 **nicht reproduzierbar**. Kael/101 endet bei Level 28. Ursache ist nicht die XP-Kurve,
sondern die seit dem A5-Lauf gemergte M8-Balance der breiten Viewports (`a58ade6`): bei 960x540
drosseln `spawnRateFactor` (×0,85) und `maxActiveEnemies`/`gemCap` die Gegner- und Kristallmenge,
Kael/101 kommt auf 8.438 statt 11.689 Kills. Ausreißer nach oben: keiner der 8 Läufe verlässt
den Level-Korridor (25–40); Ausreißer nach unten/außen: nur Kael/505 (früher Tod 15,3 min).
