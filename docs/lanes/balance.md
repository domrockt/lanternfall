# M6-Lane balance: Messwerte und Abnahme

Messaufbau: `scripts/balance.mjs` startet das gebaute Spiel headless, wählt den
Charakter, aktiviert den kitenden `autoPlay`-Bot (**kein god mode**) und stellt
`timeScale = 30` ein (feste 1/20-s-Substeps). Pro Sim-Minute werden Level, HP,
Gegnerzahl, Kills und Schaden je Waffe protokolliert. BOSS-Kampfdauern kommen aus
dem `bossDefeated`-Event des Runs, nicht aus dem groben Poll.

Zielkorridor (Briefing M6):

| Kriterium | Ziel |
|---|---|
| Überlebenszeit guter Bot | 20–28 min (Tod) bzw. Sieg bis 30 min |
| Level bei Minute 30 | 25–40 |
| Boss-Kampfdauer | 20–60 s |
| Boss-Grundtempo | ≤ 90 % des Spielertempos (Unit-Test `tests/m3-logic.test.ts`) |
| Evolutionen | mindestens 1 bis Minute 30 |

Weitere Lane-Änderungen (in `docs/lanes/balance.md` begründet, GAME.md bleibt unverändert):
- Mira Basis-HP 90 → 140 (schnelle Flächenhexe braucht ein Überlebenspolster für 20–28 min).
- Kael Rüstung 1 → 2, Max-HP-Mod 20 → 25 % (Tankprofil, langsamer).
- Eisenherz-Regeneration 0.2 → 0.3 HP/s pro Stufe (Heilung statt reinem HP-Polster).
- Spawner-Ring/-Stream etwas kleiner (6 + Minute/6 bzw. /5): weniger plötzliche
  Umzingelung, damit Boss-Kämpfe nicht von Trash-Wellen überlagert werden.

Alle Messläufe wurden mit `flock /home/ai/games/.lf-perf.lock` gestartet.

<!-- BALANCE-TABLE:START -->
### Hauptläufe (N = 6, autoPlay, kein god, 30x)

| # | Char | Seed | Ergebnis | Minuten | Level | Kills | Evos | Boss-Dauern (s) | Korridor |
|---|---|---|---|---|---|---|---|---|---|
| 1 | mira | 101 | Tod | 21.3 | 28 | 2138 | 2 | Moorkönigin 27, Knochenfürst 30, Der 27, Glockenturm-Golem 31 | JA |
| 2 | kael | 101 | dawn | 31 | 33 | 11735 | 3 | Moorkönigin 33, Knochenfürst 57, Der 45, Glockenturm-Golem 36, Hexenzirkel 40, Der 55 | Sieg |
| 3 | mira | 202 | Tod | 24.2 | 27 | 4674 | 2 | Moorkönigin 29, Knochenfürst 31, Der 31, Glockenturm-Golem 27 | JA |
| 4 | kael | 202 | dawn | 30.7 | 27 | 8908 | 2 | Moorkönigin 30, Knochenfürst 38, Der 32, Glockenturm-Golem 35, Hexenzirkel 37, Der 39 | Sieg |
| 5 | mira | 404 | Tod | 20.2 | 27 | 1746 | 2 | Moorkönigin 29, Knochenfürst 26, Der 28 | JA |
| 6 | kael | 404 | dawn | 30.5 | 30 | 11932 | 3 | Moorkönigin 30, Knochenfürst 39, Der 35, Glockenturm-Golem 27, Hexenzirkel 33, Der 28 | Sieg |

#### Minuten-Protokoll

<details><summary>mira / Seed 101 — death @ 21.3 min, Level 28</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 210/210 | 5 | 37 | ember 11.4 (100%) |
| 2 | 9 | 210/210 | 0 | 73 | ember 16.4 (100%) |
| 3 | 10 | 210/210 | 1 | 130 | ember 31.7 (100%) |
| 4 | 13 | 210/210 | 6 | 198 | ember 43.1 (99.8%), thorn 0.1 (0.2%) |
| 5 | 15 | 210/210 | 8 | 258 | ember 39.2 (96.6%), thorn 1.4 (3.4%) |
| 6 | 16 | 210/210 | 9 | 365 | ember 120.2 (68.3%), phoenix 50.5 (28.7%), thorn 5.4 (3.1%) |
| 7 | 17 | 210/210 | 6 | 510 | phoenix 165.2 (99.6%), thorn 0.7 (0.4%) |
| 8 | 18 | 210/210 | 2 | 616 | phoenix 161.5 (99.1%), thorn 1.4 (0.9%) |
| 9 | 20 | 210/210 | 7 | 720 | phoenix 167.6 (99.2%), thorn 1.4 (0.8%) |
| 10 | 21 | 210/210 | 13 | 838 | phoenix 202.2 (95.8%), thorn 8.9 (4.2%) |
| 11 | 21 | 210/210 | 7 | 1014 | phoenix 512.3 (90.3%), thorn 54.9 (9.7%) |
| 12 | 22 | 210/210 | 6 | 1095 | phoenix 243.8 (94.5%), thorn 14.3 (5.5%) |
| 13 | 23 | 230/230 | 5 | 1185 | phoenix 251.3 (89.1%), thorn 30.7 (10.9%) |
| 14 | 23 | 230/230 | 4 | 1285 | phoenix 245.6 (91.4%), thorn 23.1 (8.6%) |
| 15 | 24 | 230/230 | 14 | 1371 | phoenix 320.7 (89.2%), thorn 38.8 (10.8%) |
| 16 | 25 | 191/230 | 30 | 1476 | phoenix 697.7 (61.3%), thorn_storm 293.4 (25.8%), thorn 145.1 (12.8%), lantern 1.3 (0.1%) |
| 17 | 26 | 181/230 | 19 | 1580 | thorn_storm 903.3 (56.2%), phoenix 698.2 (43.5%), lantern 4.6 (0.3%) |
| 18 | 26 | 230/230 | 23 | 1671 | phoenix 641.7 (54%), thorn_storm 544.4 (45.8%), lantern 1.4 (0.1%) |
| 19 | 27 | 230/230 | 23 | 1763 | thorn_storm 695.1 (51.7%), phoenix 644.8 (47.9%), lantern 5.7 (0.4%) |
| 20 | 28 | 230/230 | 36 | 1855 | thorn_storm 787.8 (53.2%), phoenix 688.6 (46.5%), lantern 3.9 (0.3%) |
| 21 | 28 | 60/230 | 76 | 2067 | thorn_storm 1660.3 (64.2%), phoenix 911.4 (35.3%), lantern 13.8 (0.5%) |

</details>

<details><summary>kael / Seed 101 — dawn @ 31 min, Level 33</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 253/253 | 3 | 32 | flail 17.6 (100%) |
| 2 | 7 | 253/253 | 10 | 60 | flail 21 (100%) |
| 3 | 9 | 253/253 | 16 | 114 | flail 51.5 (100%) |
| 4 | 10 | 273/273 | 25 | 153 | flail 36.2 (100%) |
| 5 | 11 | 293/293 | 26 | 222 | flail 66.6 (100%) |
| 6 | 12 | 310/313 | 37 | 304 | flail 182.8 (100%) |
| 7 | 14 | 333/333 | 50 | 394 | flail 144.6 (100%) |
| 8 | 15 | 333/333 | 64 | 467 | flail 166.1 (100%) |
| 9 | 15 | 353/353 | 82 | 556 | flail 171.4 (100%) |
| 10 | 16 | 338/353 | 117 | 633 | flail 173.1 (100%) |
| 11 | 18 | 88/353 | 117 | 908 | flail 695.3 (97.2%), ember 13.1 (1.8%), storm 7 (1%) |
| 12 | 19 | 353/353 | 95 | 1253 | wrath_pendulum 588.3 (96.8%), ember 10.5 (1.7%), storm 9 (1.5%) |
| 13 | 20 | 353/353 | 77 | 1625 | wrath_pendulum 660.6 (96%), storm 16.5 (2.4%), ember 10.8 (1.6%) |
| 14 | 23 | 353/353 | 9 | 1973 | wrath_pendulum 557.7 (81.1%), storm 119.6 (17.4%), ember 10.6 (1.5%) |
| 15 | 24 | 353/353 | 18 | 2081 | storm 257.9 (57.5%), wrath_pendulum 176.7 (39.4%), ember 13.7 (3.1%) |
| 16 | 24 | 335/353 | 34 | 2180 | storm 476.6 (42.1%), wrath_pendulum 435.2 (38.4%), thunder_seal 192.8 (17%), ember 27.4 (2.4%) |
| 17 | 25 | 353/353 | 32 | 2274 | thunder_seal 1005 (80.5%), wrath_pendulum 201.4 (16.1%), ember 41.9 (3.4%) |
| 18 | 25 | 353/353 | 23 | 2374 | thunder_seal 910.3 (76.7%), wrath_pendulum 208 (17.5%), ember 68.2 (5.7%) |
| 19 | 25 | 316/353 | 39 | 2455 | thunder_seal 889.1 (79.1%), wrath_pendulum 165.4 (14.7%), ember 69.3 (6.2%) |
| 20 | 26 | 338/353 | 45 | 2559 | thunder_seal 1217.1 (74.6%), wrath_pendulum 328.6 (20.2%), ember 85 (5.2%) |
| 21 | 26 | 353/353 | 89 | 2763 | thunder_seal 1484.8 (62.7%), wrath_pendulum 764.5 (32.3%), ember 117.1 (4.9%) |
| 22 | 27 | 340/353 | 199 | 3159 | thunder_seal 1480.4 (54.2%), wrath_pendulum 1022.6 (37.4%), ember 228.6 (8.4%) |
| 23 | 27 | 339/353 | 277 | 3760 | wrath_pendulum 1775.9 (49.4%), thunder_seal 1511.2 (42.1%), ember 306.5 (8.5%) |
| 24 | 28 | 353/353 | 349 | 4810 | wrath_pendulum 2921.6 (60.6%), thunder_seal 1528.8 (31.7%), ember 373.8 (7.7%) |
| 25 | 28 | 353/353 | 337 | 5710 | wrath_pendulum 3444.7 (63.9%), thunder_seal 1542.6 (28.6%), ember 406.6 (7.5%) |
| 26 | 29 | 353/353 | 357 | 6707 | wrath_pendulum 3775.4 (61.5%), thunder_seal 1511 (24.6%), ember 856 (13.9%) |
| 27 | 29 | 353/353 | 345 | 7754 | wrath_pendulum 3422.2 (57.8%), thunder_seal 1514.6 (25.6%), ember 980.9 (16.6%), lantern 2.7 (0%) |
| 28 | 30 | 324/353 | 351 | 8702 | wrath_pendulum 3322.1 (57%), thunder_seal 1541.8 (26.5%), ember 945.2 (16.2%), thorn 10.5 (0.2%), lantern 3.9 (0.1%) |
| 29 | 30 | 353/353 | 353 | 9632 | wrath_pendulum 3664.9 (59.2%), thunder_seal 1521.7 (24.6%), ember 975.1 (15.8%), thorn 24.2 (0.4%), lantern 2.6 (0%) |
| 30 | 31 | 353/353 | 354 | 10533 | wrath_pendulum 3736.8 (59.1%), thunder_seal 1539.9 (24.4%), ember 1009.1 (16%), thorn 29.7 (0.5%), lantern 5.8 (0.1%) |

</details>

<details><summary>mira / Seed 202 — death @ 24.2 min, Level 27</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 5 | 210/210 | 0 | 35 | ember 12.5 (100%) |
| 2 | 8 | 210/210 | 1 | 86 | ember 22 (100%) |
| 3 | 10 | 210/210 | 1 | 153 | ember 37.3 (100%) |
| 4 | 11 | 210/210 | 1 | 196 | ember 27 (100%) |
| 5 | 13 | 230/230 | 8 | 245 | ember 30.3 (99.7%), thorn 0.1 (0.3%) |
| 6 | 14 | 230/230 | 6 | 354 | ember 109.7 (58.6%), phoenix 72.6 (38.8%), thorn 5 (2.7%) |
| 7 | 16 | 230/230 | 1 | 484 | phoenix 145.4 (99.2%), thorn 1.1 (0.8%) |
| 8 | 18 | 230/230 | 3 | 589 | phoenix 154.9 (99.6%), thorn 0.7 (0.4%) |
| 9 | 19 | 250/250 | 6 | 725 | phoenix 203.2 (99.5%), thorn 1.1 (0.5%) |
| 10 | 20 | 250/250 | 14 | 813 | phoenix 164 (99.3%), thorn 1.2 (0.7%) |
| 11 | 21 | 270/270 | 3 | 936 | phoenix 486.1 (95.3%), frost 9.9 (1.9%), thorn 9.7 (1.9%), storm 4.6 (0.9%) |
| 12 | 22 | 270/270 | 11 | 1002 | phoenix 208.5 (94.8%), storm 8.9 (4%), thorn 1.8 (0.8%), frost 0.8 (0.4%) |
| 13 | 22 | 270/270 | 10 | 1082 | phoenix 266.6 (95.1%), storm 8.9 (3.2%), thorn 2.6 (0.9%), frost 2.2 (0.8%) |
| 14 | 23 | 270/270 | 5 | 1186 | phoenix 323.7 (95.3%), storm 9.1 (2.7%), thorn 3.5 (1%), frost 3.3 (1%) |
| 15 | 24 | 270/270 | 13 | 1271 | phoenix 298.9 (95.6%), storm 9 (2.9%), thorn 3.2 (1%), frost 1.7 (0.5%) |
| 16 | 24 | 270/270 | 45 | 1369 | phoenix 753.3 (77.7%), eternal_winter 139.4 (14.4%), thorn 52.2 (5.4%), frost 15.3 (1.6%), storm 8.9 (0.9%) |
| 17 | 25 | 260/270 | 37 | 1470 | phoenix 836.2 (66.2%), eternal_winter 370.9 (29.3%), thorn 47.7 (3.8%), storm 9 (0.7%) |
| 18 | 26 | 270/270 | 38 | 1565 | phoenix 787.3 (67.9%), eternal_winter 305 (26.3%), thorn 58.4 (5%), storm 8.9 (0.8%) |
| 19 | 26 | 270/270 | 40 | 1654 | phoenix 859.9 (65.9%), eternal_winter 333.6 (25.5%), thorn 103.2 (7.9%), storm 9 (0.7%) |
| 20 | 27 | 248/270 | 43 | 1761 | phoenix 742.6 (59.1%), eternal_winter 385.6 (30.7%), thorn 118.8 (9.5%), storm 9 (0.7%) |
| 21 | 27 | 272/290 | 122 | 2053 | phoenix 1448.5 (62.7%), eternal_winter 515.1 (22.3%), thorn 337.2 (14.6%), storm 9.8 (0.4%) |
| 22 | 27 | 290/290 | 278 | 2666 | phoenix 2614.9 (70.8%), eternal_winter 625.9 (16.9%), thorn 441.4 (12%), storm 11.1 (0.3%) |
| 23 | 27 | 269/290 | 309 | 3576 | phoenix 3892.1 (77.2%), eternal_winter 733.1 (14.5%), thorn 406.7 (8.1%), storm 10.7 (0.2%) |
| 24 | 27 | 82/290 | 277 | 4578 | phoenix 4250.1 (77.1%), eternal_winter 830.8 (15.1%), thorn 420.1 (7.6%), storm 10.6 (0.2%) |

</details>

<details><summary>kael / Seed 202 — dawn @ 30.7 min, Level 27</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 253/253 | 4 | 30 | flail 17.8 (100%) |
| 2 | 8 | 253/253 | 8 | 85 | flail 45.1 (100%) |
| 3 | 10 | 253/253 | 9 | 127 | flail 29.4 (76.8%), thorn 8.9 (23.2%) |
| 4 | 11 | 253/253 | 11 | 181 | flail 40.8 (81.8%), thorn 9.1 (18.2%) |
| 5 | 13 | 293/293 | 11 | 243 | flail 56.4 (84.6%), thorn 10.3 (15.4%) |
| 6 | 14 | 293/293 | 15 | 323 | flail 112.2 (64.7%), wrath_pendulum 45.7 (26.4%), thorn 15 (8.7%), frost 0.5 (0.3%) |
| 7 | 15 | 293/293 | 15 | 423 | wrath_pendulum 158.3 (90.1%), thorn 17.3 (9.8%), frost 0.1 (0.1%) |
| 8 | 16 | 293/293 | 17 | 515 | wrath_pendulum 145.5 (87.1%), thorn 21.4 (12.8%), frost 0.1 (0.1%) |
| 9 | 17 | 293/293 | 16 | 625 | wrath_pendulum 167.1 (80.6%), thorn 39.7 (19.2%), frost 0.4 (0.2%) |
| 10 | 18 | 293/293 | 25 | 730 | wrath_pendulum 166.5 (76.2%), thorn 52.1 (23.8%) |
| 11 | 20 | 313/313 | 16 | 891 | wrath_pendulum 447.4 (71.8%), thorn 174.3 (28%), frost 1.1 (0.2%), lantern 0.1 (0%) |
| 12 | 21 | 313/313 | 21 | 997 | wrath_pendulum 193.6 (56.5%), thorn 148 (43.2%), frost 0.6 (0.2%), lantern 0.4 (0.1%) |
| 13 | 22 | 333/333 | 11 | 1133 | wrath_pendulum 273.7 (60.5%), thorn 178 (39.3%), frost 0.5 (0.1%), lantern 0.5 (0.1%) |
| 14 | 22 | 333/333 | 18 | 1247 | wrath_pendulum 170.2 (60.2%), thorn 111.7 (39.5%), lantern 0.4 (0.1%), frost 0.2 (0.1%) |
| 15 | 23 | 333/333 | 16 | 1385 | wrath_pendulum 284.5 (60.8%), thorn 181.5 (38.8%), frost 1.2 (0.3%), lantern 0.8 (0.2%) |
| 16 | 23 | 316/333 | 61 | 1465 | wrath_pendulum 466 (51.1%), thorn 433.5 (47.5%), frost 8.9 (1%), lantern 3.6 (0.4%) |
| 17 | 24 | 333/333 | 41 | 1572 | thorn_storm 990.1 (77.8%), wrath_pendulum 238.6 (18.8%), thorn 37.3 (2.9%), frost 3.9 (0.3%), lantern 2.6 (0.2%) |
| 18 | 24 | 328/333 | 43 | 1666 | thorn_storm 971.8 (77.5%), wrath_pendulum 278.4 (22.2%), frost 3.1 (0.2%), lantern 1.2 (0.1%) |
| 19 | 25 | 333/333 | 42 | 1763 | thorn_storm 1002 (79.8%), wrath_pendulum 249.3 (19.9%), frost 2.7 (0.2%), lantern 1.6 (0.1%) |
| 20 | 25 | 333/333 | 49 | 1859 | thorn_storm 1206.5 (78.3%), wrath_pendulum 323 (21%), frost 7.8 (0.5%), lantern 2.8 (0.2%) |
| 21 | 25 | 333/333 | 73 | 2097 | thorn_storm 2274.2 (76.8%), wrath_pendulum 667 (22.5%), frost 15.2 (0.5%), lantern 4.1 (0.1%) |
| 22 | 26 | 333/333 | 106 | 2464 | thorn_storm 2851.2 (78.1%), wrath_pendulum 773.2 (21.2%), frost 21.7 (0.6%), lantern 3.3 (0.1%) |
| 23 | 26 | 353/353 | 255 | 3004 | thorn_storm 3419 (77.7%), wrath_pendulum 949.1 (21.6%), frost 23.7 (0.5%), storm 7.4 (0.2%), lantern 1.8 (0%) |
| 24 | 26 | 353/353 | 299 | 3738 | thorn_storm 3588.4 (80%), wrath_pendulum 871 (19.4%), frost 15.6 (0.3%), storm 8.2 (0.2%), lantern 1.3 (0%) |
| 25 | 26 | 353/353 | 353 | 4281 | thorn_storm 3403.2 (78.7%), wrath_pendulum 886.2 (20.5%), frost 24.1 (0.6%), storm 8.9 (0.2%), lantern 1.6 (0%) |
| 26 | 26 | 329/353 | 295 | 5177 | thorn_storm 5311.9 (69.9%), wrath_pendulum 2183.7 (28.7%), frost 92 (1.2%), storm 8 (0.1%), lantern 6.6 (0.1%) |
| 27 | 26 | 353/353 | 291 | 6114 | thorn_storm 5973.8 (80%), wrath_pendulum 1433.4 (19.2%), frost 40.8 (0.5%), storm 10.9 (0.1%), ember 8.5 (0.1%), lantern 2.1 (0%) |
| 28 | 26 | 319/353 | 316 | 6955 | thorn_storm 4365.2 (71%), wrath_pendulum 1646.1 (26.8%), frost 99.4 (1.6%), ember 13.1 (0.2%), storm 11.1 (0.2%), lantern 9 (0.1%) |
| 29 | 27 | 344/353 | 121 | 8055 | thorn_storm 7856.6 (62.9%), wrath_pendulum 4185.3 (33.5%), frost 375.2 (3%), lantern 42.2 (0.3%), ember 15.6 (0.1%), storm 11.2 (0.1%) |
| 30 | 27 | 338/353 | 211 | 8404 | thorn_storm 3312.6 (73.3%), wrath_pendulum 1095.3 (24.2%), frost 75.2 (1.7%), ember 16.1 (0.4%), storm 11.4 (0.3%), lantern 9.6 (0.2%) |

</details>

<details><summary>mira / Seed 404 — death @ 20.2 min, Level 27</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 7 | 210/210 | 1 | 34 | ember 12.4 (100%) |
| 2 | 9 | 210/210 | 0 | 86 | ember 26.3 (100%) |
| 3 | 10 | 210/210 | 3 | 126 | ember 23 (100%) |
| 4 | 12 | 210/210 | 2 | 200 | ember 43.9 (99.3%), thorn 0.3 (0.7%) |
| 5 | 14 | 210/210 | 7 | 264 | ember 39.6 (98.3%), thorn 0.7 (1.7%) |
| 6 | 15 | 210/210 | 6 | 370 | ember 108.8 (54.3%), phoenix 86.5 (43.2%), thorn 5.1 (2.5%) |
| 7 | 16 | 210/210 | 2 | 468 | phoenix 122.2 (99.3%), thorn 0.9 (0.7%) |
| 8 | 17 | 210/210 | 3 | 560 | phoenix 156 (99.4%), thorn 0.9 (0.6%) |
| 9 | 18 | 210/210 | 8 | 647 | phoenix 139.3 (97.8%), thorn 3.2 (2.2%) |
| 10 | 19 | 210/210 | 13 | 807 | phoenix 227.1 (95%), thorn 12 (5%) |
| 11 | 20 | 146/210 | 4 | 910 | phoenix 397.3 (87.1%), thorn 59.1 (12.9%) |
| 12 | 21 | 188/210 | 6 | 987 | phoenix 213.1 (91.9%), thorn 18.8 (8.1%) |
| 13 | 22 | 230/230 | 3 | 1075 | phoenix 264.3 (91.2%), thorn 25.6 (8.8%) |
| 14 | 23 | 230/230 | 12 | 1145 | phoenix 305.3 (94.3%), thorn 18.5 (5.7%) |
| 15 | 23 | 230/230 | 12 | 1247 | phoenix 329.1 (92.3%), thorn 27.3 (7.7%) |
| 16 | 24 | 240/250 | 28 | 1341 | phoenix 735.1 (59.5%), thorn_storm 388.1 (31.4%), thorn 110.9 (9%), flail 2.1 (0.2%) |
| 17 | 24 | 206/250 | 29 | 1428 | thorn_storm 683.6 (52.3%), phoenix 611.8 (46.8%), flail 10.6 (0.8%) |
| 18 | 25 | 80/250 | 24 | 1526 | thorn_storm 787.3 (52.3%), phoenix 700.8 (46.6%), flail 16.8 (1.1%) |
| 19 | 26 | 132/250 | 32 | 1613 | phoenix 625 (50.7%), thorn_storm 590.9 (47.9%), flail 17.2 (1.4%) |
| 20 | 27 | 62/250 | 34 | 1715 | thorn_storm 933.4 (54.1%), phoenix 762 (44.2%), flail 29.2 (1.7%) |

</details>

<details><summary>kael / Seed 404 — dawn @ 30.5 min, Level 30</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 7 | 253/253 | 2 | 27 | flail 16.4 (100%) |
| 2 | 9 | 253/253 | 5 | 76 | flail 40.6 (96.2%), ember 1.6 (3.8%) |
| 3 | 10 | 253/253 | 8 | 121 | flail 23.9 (70.1%), ember 10.2 (29.9%) |
| 4 | 11 | 273/273 | 14 | 177 | flail 41.4 (82.6%), ember 8.7 (17.4%) |
| 5 | 13 | 273/273 | 10 | 250 | flail 69.5 (87%), ember 10.4 (13%) |
| 6 | 15 | 273/273 | 5 | 341 | flail 96.9 (49.1%), wrath_pendulum 78 (39.6%), ember 22.3 (11.3%) |
| 7 | 16 | 273/273 | 13 | 445 | wrath_pendulum 133.7 (74%), ember 47 (26%) |
| 8 | 17 | 273/273 | 15 | 551 | wrath_pendulum 115.7 (60.9%), ember 74.3 (39.1%) |
| 9 | 18 | 273/273 | 13 | 661 | ember 121.3 (65.6%), wrath_pendulum 63.5 (34.4%) |
| 10 | 19 | 273/273 | 20 | 776 | ember 150.7 (59.2%), wrath_pendulum 103.9 (40.8%) |
| 11 | 20 | 293/293 | 12 | 943 | ember 309.5 (52.3%), wrath_pendulum 281.7 (47.6%), frost 0.5 (0.1%) |
| 12 | 21 | 293/293 | 9 | 1040 | ember 216.9 (78.1%), wrath_pendulum 60.5 (21.8%), frost 0.3 (0.1%) |
| 13 | 22 | 293/293 | 17 | 1147 | ember 255.7 (73.6%), wrath_pendulum 91.2 (26.3%), frost 0.3 (0.1%) |
| 14 | 22 | 293/293 | 23 | 1262 | ember 251.5 (71.9%), wrath_pendulum 98.1 (28%), frost 0.3 (0.1%) |
| 15 | 23 | 293/293 | 16 | 1414 | ember 299.9 (69.1%), wrath_pendulum 133.6 (30.8%), frost 0.3 (0.1%) |
| 16 | 24 | 293/293 | 44 | 1496 | wrath_pendulum 406.9 (38.8%), phoenix 321.7 (30.7%), ember 316.4 (30.2%), frost 3.4 (0.3%) |
| 17 | 24 | 283/293 | 57 | 1576 | phoenix 745.5 (80.9%), wrath_pendulum 173.8 (18.9%), frost 2 (0.2%) |
| 18 | 24 | 288/293 | 66 | 1658 | phoenix 1061.4 (78.2%), wrath_pendulum 293.6 (21.6%), frost 2.7 (0.2%) |
| 19 | 25 | 293/293 | 83 | 1735 | phoenix 735.1 (79%), wrath_pendulum 192.8 (20.7%), frost 3 (0.3%) |
| 20 | 25 | 292/293 | 99 | 1826 | phoenix 790.8 (73.7%), wrath_pendulum 278.3 (25.9%), frost 4.2 (0.4%) |
| 21 | 26 | 293/293 | 111 | 2153 | phoenix 1555.6 (50.8%), wrath_pendulum 1487.8 (48.6%), frost 18.1 (0.6%) |
| 22 | 27 | 293/293 | 165 | 2566 | phoenix 1975.9 (66%), wrath_pendulum 1006 (33.6%), frost 11.6 (0.4%) |
| 23 | 27 | 293/293 | 232 | 3256 | phoenix 2464.8 (61.6%), wrath_pendulum 1518 (37.9%), frost 18.6 (0.5%) |
| 24 | 27 | 269/293 | 342 | 4193 | phoenix 3022.4 (64.9%), wrath_pendulum 1620.6 (34.8%), frost 15 (0.3%) |
| 25 | 28 | 293/293 | 361 | 5209 | phoenix 3731.1 (65.4%), wrath_pendulum 1956.5 (34.3%), frost 18.8 (0.3%) |
| 26 | 28 | 279/293 | 336 | 6487 | wrath_pendulum 4512.2 (54.1%), phoenix 3683.1 (44.1%), frost 147.1 (1.8%) |
| 27 | 28 | 293/293 | 305 | 7623 | phoenix 4178 (65.7%), wrath_pendulum 2151.3 (33.8%), frost 33.1 (0.5%) |
| 28 | 29 | 293/293 | 311 | 8570 | phoenix 3621.7 (51%), wrath_pendulum 2669.3 (37.6%), eternal_winter 806 (11.3%), frost 5.7 (0.1%) |
| 29 | 29 | 293/293 | 302 | 9914 | phoenix 5078.7 (53.5%), wrath_pendulum 3317.9 (34.9%), eternal_winter 1097.4 (11.6%) |
| 30 | 30 | 293/293 | 319 | 11169 | phoenix 5565.7 (56.7%), wrath_pendulum 3205.9 (32.7%), eternal_winter 1037.1 (10.6%) |

</details>

#### DPS-Anteil je Waffe (gesamter Lauf)

| Char/Seed | Gesamtschaden | ember | flail | frost | thorn | storm | lantern | phoenix | wrath_pendulum | eternal_winter | thorn_storm | thunder_seal | soul_beacon |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mira/101 | 769898 | 2% | – | – | 2.6% | – | 0.3% | 53.2% | – | – | 41.9% | – | – |
| kael/101 | 4275572 | 10.4% | 2.4% | – | 0.2% | 1.3% | 0.1% | – | 56.5% | – | – | 29.1% | – |
| mira/202 | 1543588 | 0.9% | – | 0.1% | 8% | 0.5% | – | 73.5% | – | 16.9% | – | – | – |
| kael/202 | 4411081 | 0.1% | 0.4% | 1.3% | 2% | 0.1% | 0.2% | – | 27.5% | – | 68.5% | – | – |
| mira/404 | 608756 | 2.6% | 0.9% | – | 2.9% | – | – | 57.4% | – | – | 36.2% | – | – |
| kael/404 | 4687390 | 2.7% | 0.4% | 0.4% | – | – | – | 51.9% | 39.2% | 5.5% | – | – | – |

<!-- BALANCE-TABLE:END -->
