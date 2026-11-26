# Lane m10-balance-kael — Balance-Korridor / Kael Level 47

Basis-SHA beim Start: **252fd98** (main, Worktree `/home/ai/games/lf-lanes/m10-balance-kael`, Branch `m10-balance-kael`).

## Karte m10-balance-kael-01 — Reproduktion (Basis 252fd98)

Harness: `npm run build` (grün, warm) danach `node scripts/balance.mjs` **ohne flock**,
timeScale 30, viewport 960x540, dpr 1, autoPlay, kein god.
Rohdaten aus `shots/balance-main-runs.json`, konsolidiert in `shots/m10-balance-kael-repro.json`.

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

## Karte m10-balance-kael-02 — Diagnose XP-Budget (Basis 252fd98)

Beleg: `shots/m10-balance-kael-xp-budget.json` (je Lauf effektives Budget = Summe `xpToNext(1..Level-1)`,
Roh-Budget = effektiv / XP-Mod, Potenzial = Kills × 3,92 Ø-Gem-Wert, Sammelquote = Roh/Potenzial).

| Lauf | Endlevel | Effektives XP-Budget | Roh-Budget | Potenzial aus Kills | Sammelquote |
|---|---|---|---|---|---|
| Kael/101 | 28 | 7.039 | 9.385 | 33.077 | 28,4 % |
| Kael/202 | 29 | 7.849 | 10.465 | 29.259 | 35,8 % |
| Kael/303 | 29 | 7.849 | 10.465 | 24.410 | 42,9 % |
| Kael/404 | 26 | 5.591 | 7.455 | 36.284 | 20,5 % |
| Kael/505 | 24 (Tod 15,3 min) | 4.359 | 5.812 | 5.962 | 97,5 % |
| Kael/606 | 31 | 9.652 | 12.869 | 39.129 | 32,9 % |
| Mira/101 | 26 | 5.591 | 5.591 | 6.072 | 92,1 % |
| Mira/202 | 26 | 5.591 | 5.591 | 7.240 | 77,2 % |

**Befund (Ursache, nicht geraten):** Die Kurve selbst ist nicht zu flach — die Läufe erreichen
mit dem *tatsächlich gesammelten* Budget Level 26–31 (Ziel 25–40). Der alte A5-Wert Level 47
entstand, weil Kael/101 im M6-Lauf 11.689 Kills machte und fast das ganze Roh-Budget einsammelte;
heute sind es 8.438 Kills und nur ~28 % Sammelquote, weil der Kristall-Cap im Minimal-LOD
(90 statt 180) und die größere 960x540-View die Drops früher verwerfen/verstreuen. Das
Kill-Potenzial (bis 39.129 Roh-XP) liegt aber weiterhin über der Level-40-Schwelle (21.235 XP),
d. h. ohne Sammelverlust wäre Level 47+ weiter möglich. Genau dort setzt der Fix an: die Kurve
ab Level 25 steiler machen, damit auch ein voll eingesammeltes 30-min-Budget ≤ Level 40 bleibt.
