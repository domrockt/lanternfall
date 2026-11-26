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
| 1 | mira | 101 | Tod | 15.3 | 26 | 1273 | 1 | Moorkönigin 24, Knochenfürst 26 | NEIN (Überleben) |
| 2 | kael | 101 | Tod | 7.7 | 16 | 379 | 0 | Moorkönigin 42 | NEIN (Überleben, Level, Evolution) |
| 3 | mira | 202 | Tod | 20.9 | 27 | 1934 | 1 | Moorkönigin 32, Knochenfürst 72, Der 32, Glockenturm-Golem 27 | NEIN (Boss-Dauer) |
| 4 | kael | 202 | dawn | 30.7 | 33 | 12111 | 3 | Moorkönigin 37, Knochenfürst 48, Der 24, Glockenturm-Golem 21, Hexenzirkel 20, Der 36 | Sieg |
| 5 | mira | 404 | Tod | 20.7 | 29 | 1862 | 1 | Moorkönigin 31, Knochenfürst 31, Der 25, Glockenturm-Golem 17 | NEIN (Boss-Dauer) |
| 6 | kael | 404 | dawn | 30.4 | 31 | 14432 | 3 | Moorkönigin 40, Knochenfürst 72, Der 71, Glockenturm-Golem 46, Hexenzirkel 23, Der 18 | NEIN (Boss-Dauer) |

#### Minuten-Protokoll

<details><summary>mira / Seed 101 — death @ 15.3 min, Level 26</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 140/140 | 0 | 35 | ember 11.2 (100%) |
| 2 | 8 | 140/140 | 1 | 75 | ember 19 (100%) |
| 3 | 10 | 140/140 | 2 | 122 | ember 29.5 (100%) |
| 4 | 13 | 160/160 | 9 | 181 | ember 37 (100%) |
| 5 | 15 | 160/160 | 9 | 251 | ember 46.2 (100%) |
| 6 | 16 | 145/160 | 4 | 369 | ember 104.2 (55.6%), phoenix 83.3 (44.4%) |
| 7 | 18 | 160/160 | 4 | 449 | phoenix 148.9 (100%) |
| 8 | 19 | 160/160 | 1 | 554 | phoenix 171 (100%) |
| 9 | 20 | 160/160 | 5 | 701 | phoenix 232.3 (100%) |
| 10 | 21 | 160/160 | 8 | 808 | phoenix 218.3 (99.9%), lantern 0.3 (0.1%) |
| 11 | 22 | 136/160 | 4 | 926 | phoenix 436.7 (98.9%), lantern 4.7 (1.1%) |
| 12 | 23 | 153/160 | 4 | 1002 | phoenix 235.7 (99.5%), lantern 1.1 (0.5%) |
| 13 | 24 | 180/180 | 9 | 1071 | phoenix 234.7 (99.7%), lantern 0.8 (0.3%) |
| 14 | 24 | 180/180 | 3 | 1164 | phoenix 371.6 (99.8%), lantern 0.7 (0.2%) |
| 15 | 25 | 180/180 | 16 | 1247 | phoenix 326.1 (99.5%), lantern 1.5 (0.5%) |

</details>

<details><summary>kael / Seed 101 — death @ 7.7 min, Level 16</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 5 | 163/163 | 4 | 19 | flail 12 (100%) |
| 2 | 8 | 163/163 | 6 | 57 | flail 29.2 (100%) |
| 3 | 10 | 163/163 | 19 | 84 | flail 26.1 (100%) |
| 4 | 11 | 163/163 | 28 | 117 | flail 31.4 (100%) |
| 5 | 13 | 183/183 | 32 | 185 | flail 65.6 (100%) |
| 6 | 14 | 91/183 | 37 | 267 | flail 158.7 (98%), frost 1.8 (1.1%), lantern 1.5 (0.9%) |
| 7 | 16 | 37/183 | 35 | 336 | flail 118.2 (98.9%), frost 0.9 (0.8%), lantern 0.4 (0.3%) |

</details>

<details><summary>mira / Seed 202 — death @ 20.9 min, Level 27</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 140/140 | 1 | 29 | ember 9.8 (100%) |
| 2 | 7 | 140/140 | 0 | 57 | ember 12.8 (100%) |
| 3 | 9 | 140/140 | 7 | 98 | ember 24.2 (100%) |
| 4 | 12 | 160/160 | 8 | 169 | ember 40.6 (100%) |
| 5 | 13 | 160/160 | 8 | 216 | ember 31.7 (100%) |
| 6 | 15 | 168/200 | 7 | 308 | ember 171.5 (100%) |
| 7 | 16 | 200/200 | 13 | 401 | ember 142.2 (100%) |
| 8 | 18 | 240/240 | 9 | 520 | ember 182.3 (100%) |
| 9 | 20 | 240/240 | 11 | 663 | ember 218.9 (97.9%), storm 4.8 (2.1%) |
| 10 | 20 | 240/240 | 17 | 786 | ember 220.1 (95.8%), storm 9.5 (4.1%), frost 0.1 (0%) |
| 11 | 21 | 230/240 | 46 | 924 | ember 430.9 (97.8%), storm 8.8 (2%), frost 0.7 (0.2%) |
| 12 | 22 | 240/240 | 7 | 1103 | phoenix 298.4 (73.6%), ember 97.1 (24%), storm 9 (2.2%), frost 0.8 (0.2%) |
| 13 | 23 | 240/240 | 6 | 1184 | phoenix 322.6 (97.1%), storm 9.3 (2.8%), frost 0.2 (0.1%) |
| 14 | 24 | 240/240 | 6 | 1273 | phoenix 325.9 (97.2%), storm 9.3 (2.8%) |
| 15 | 24 | 240/240 | 11 | 1365 | phoenix 383.2 (97.6%), storm 9.1 (2.3%), frost 0.3 (0.1%) |
| 16 | 25 | 240/240 | 36 | 1445 | phoenix 827.7 (97.2%), frost 13.5 (1.6%), storm 10.6 (1.2%) |
| 17 | 25 | 218/240 | 48 | 1526 | phoenix 966.2 (97.6%), frost 12.2 (1.2%), storm 12 (1.2%) |
| 18 | 25 | 219/240 | 66 | 1598 | phoenix 886.1 (97.3%), storm 12.6 (1.4%), frost 11.6 (1.3%) |
| 19 | 26 | 240/240 | 86 | 1682 | phoenix 986.1 (97.1%), frost 16.8 (1.7%), storm 12.6 (1.2%) |
| 20 | 26 | 223/240 | 117 | 1753 | phoenix 885.2 (97%), frost 15.4 (1.7%), storm 11.6 (1.3%) |

</details>

<details><summary>kael / Seed 202 — dawn @ 30.7 min, Level 33</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 7 | 157/163 | 4 | 33 | flail 18.1 (100%) |
| 2 | 10 | 157/163 | 1 | 72 | flail 31.7 (94.6%), ember 1.8 (5.4%) |
| 3 | 12 | 203/203 | 6 | 114 | flail 19 (66.4%), ember 9.6 (33.6%) |
| 4 | 14 | 223/223 | 10 | 163 | flail 42.4 (82.5%), ember 9 (17.5%) |
| 5 | 15 | 223/223 | 8 | 228 | flail 40.5 (73.9%), ember 8.8 (16.1%), storm 5.5 (10%) |
| 6 | 17 | 223/223 | 9 | 308 | flail 91.7 (53.6%), wrath_pendulum 60.1 (35.1%), ember 10.5 (6.1%), storm 7.5 (4.4%), frost 1.2 (0.7%) |
| 7 | 18 | 223/223 | 12 | 438 | wrath_pendulum 183 (85.7%), ember 22.7 (10.6%), storm 7.8 (3.7%), frost 0.1 (0%) |
| 8 | 20 | 223/223 | 18 | 522 | wrath_pendulum 97.1 (64.3%), ember 46.6 (30.9%), storm 7.3 (4.8%) |
| 9 | 21 | 223/223 | 15 | 654 | wrath_pendulum 173.8 (71.6%), ember 61.4 (25.3%), storm 7.6 (3.1%), frost 0.1 (0%) |
| 10 | 23 | 223/223 | 19 | 801 | wrath_pendulum 152.5 (55.7%), ember 113 (41.3%), storm 8.1 (3%) |
| 11 | 24 | 223/223 | 8 | 969 | wrath_pendulum 364.5 (60.4%), ember 187.1 (31%), phoenix 42 (7%), storm 9.3 (1.5%), frost 0.7 (0.1%) |
| 12 | 25 | 223/223 | 6 | 1051 | phoenix 240.4 (91.2%), wrath_pendulum 12.5 (4.7%), storm 10.6 (4%) |
| 13 | 25 | 223/223 | 10 | 1126 | phoenix 198.2 (88.5%), wrath_pendulum 14.2 (6.3%), storm 11.5 (5.1%) |
| 14 | 26 | 223/223 | 5 | 1222 | phoenix 254 (88.6%), wrath_pendulum 22 (7.7%), storm 10.7 (3.7%) |
| 15 | 26 | 223/223 | 13 | 1310 | phoenix 268.6 (84.3%), wrath_pendulum 39.2 (12.3%), storm 10.8 (3.4%), frost 0.2 (0.1%) |
| 16 | 27 | 223/223 | 37 | 1389 | phoenix 765.6 (71.7%), wrath_pendulum 282.6 (26.5%), storm 12.8 (1.2%), frost 7 (0.7%) |
| 17 | 27 | 211/223 | 45 | 1466 | phoenix 845.8 (77%), wrath_pendulum 231.7 (21.1%), storm 13.3 (1.2%), frost 7.2 (0.7%) |
| 18 | 28 | 223/223 | 45 | 1560 | phoenix 804.2 (77.5%), wrath_pendulum 210 (20.2%), storm 13.5 (1.3%), frost 10 (1%) |
| 19 | 28 | 223/223 | 62 | 1636 | phoenix 909.6 (79%), wrath_pendulum 217.2 (18.9%), storm 13.4 (1.2%), frost 11.3 (1%) |
| 20 | 28 | 221/223 | 71 | 1733 | phoenix 1118 (76.1%), wrath_pendulum 323.2 (22%), frost 15.2 (1%), storm 13.5 (0.9%) |
| 21 | 28 | 223/223 | 127 | 1954 | phoenix 1353.5 (58.9%), wrath_pendulum 903.8 (39.3%), frost 27.8 (1.2%), storm 13.3 (0.6%) |
| 22 | 29 | 223/223 | 188 | 2353 | phoenix 1867.2 (65%), wrath_pendulum 950.7 (33.1%), frost 42.5 (1.5%), storm 13.3 (0.5%) |
| 23 | 30 | 223/223 | 276 | 2998 | phoenix 2527.4 (69.6%), wrath_pendulum 1038 (28.6%), frost 36.8 (1%), storm 28.7 (0.8%) |
| 24 | 30 | 223/223 | 353 | 4056 | phoenix 3559.3 (65.7%), wrath_pendulum 1784.3 (33%), frost 39.2 (0.7%), storm 32.1 (0.6%) |
| 25 | 31 | 223/223 | 351 | 5249 | phoenix 3940.6 (62%), wrath_pendulum 2336.7 (36.7%), frost 50.8 (0.8%), storm 32.3 (0.5%) |
| 26 | 31 | 223/223 | 343 | 6612 | phoenix 3979 (55.1%), wrath_pendulum 3117.8 (43.2%), frost 93 (1.3%), storm 32.7 (0.5%) |
| 27 | 31 | 223/223 | 325 | 7811 | phoenix 4578.9 (67.9%), wrath_pendulum 2095.2 (31.1%), frost 34.3 (0.5%), storm 31.3 (0.5%) |
| 28 | 32 | 223/223 | 337 | 9095 | phoenix 4486.7 (63.3%), wrath_pendulum 2514.7 (35.5%), frost 56.8 (0.8%), storm 31.5 (0.4%), lantern 1.2 (0%) |
| 29 | 32 | 223/223 | 355 | 10210 | phoenix 4488.9 (56.4%), wrath_pendulum 3333.2 (41.9%), frost 104.4 (1.3%), storm 31.9 (0.4%), lantern 2.5 (0%) |
| 30 | 33 | 223/223 | 334 | 11337 | phoenix 4561.8 (52.4%), wrath_pendulum 3166.9 (36.4%), eternal_winter 835.4 (9.6%), storm 126.5 (1.5%), frost 10.6 (0.1%), lantern 1.2 (0%) |

</details>

<details><summary>mira / Seed 404 — death @ 20.7 min, Level 29</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 7 | 140/140 | 0 | 34 | ember 11 (100%) |
| 2 | 8 | 140/140 | 1 | 74 | ember 18.3 (100%) |
| 3 | 9 | 140/140 | 6 | 126 | ember 29.5 (100%) |
| 4 | 12 | 160/160 | 1 | 209 | ember 50.9 (100%) |
| 5 | 14 | 180/180 | 7 | 259 | ember 38.3 (100%) |
| 6 | 16 | 176/180 | 1 | 380 | ember 119.9 (58.6%), phoenix 84.8 (41.4%) |
| 7 | 18 | 220/220 | 6 | 502 | phoenix 161.4 (100%) |
| 8 | 19 | 240/240 | 1 | 647 | phoenix 198.8 (100%) |
| 9 | 21 | 240/240 | 5 | 749 | phoenix 173.4 (100%) |
| 10 | 22 | 239/240 | 22 | 860 | phoenix 200.8 (100%) |
| 11 | 22 | 240/240 | 8 | 985 | phoenix 466.9 (99.8%), frost 0.9 (0.2%) |
| 12 | 23 | 240/240 | 6 | 1073 | phoenix 226.9 (100%) |
| 13 | 24 | 240/240 | 9 | 1152 | phoenix 265.4 (99.9%), frost 0.2 (0.1%) |
| 14 | 25 | 240/240 | 10 | 1244 | phoenix 303.2 (100%) |
| 15 | 26 | 240/240 | 17 | 1329 | phoenix 341.5 (100%) |
| 16 | 26 | 240/240 | 27 | 1419 | phoenix 932.6 (99.2%), frost 6.5 (0.7%), lantern 0.7 (0.1%) |
| 17 | 27 | 240/240 | 25 | 1512 | phoenix 1126.4 (98.1%), frost 20 (1.7%), lantern 1.5 (0.1%) |
| 18 | 28 | 240/240 | 34 | 1592 | phoenix 1118.7 (98.1%), frost 20.4 (1.8%), lantern 0.7 (0.1%) |
| 19 | 28 | 240/240 | 48 | 1680 | phoenix 1124.4 (98.1%), frost 20.8 (1.8%), lantern 0.8 (0.1%) |
| 20 | 29 | 240/240 | 62 | 1768 | phoenix 1062.6 (96.1%), frost 30.6 (2.8%), flail 12 (1.1%), lantern 0.9 (0.1%) |

</details>

<details><summary>kael / Seed 404 — dawn @ 30.4 min, Level 31</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 163/163 | 6 | 23 | flail 12.6 (100%) |
| 2 | 10 | 183/183 | 4 | 65 | flail 31.6 (100%) |
| 3 | 11 | 183/183 | 12 | 93 | flail 26.6 (100%) |
| 4 | 12 | 203/203 | 19 | 141 | flail 47 (100%) |
| 5 | 14 | 203/203 | 29 | 195 | flail 53.2 (100%) |
| 6 | 15 | 175/203 | 44 | 282 | flail 171.5 (99.2%), frost 1.4 (0.8%) |
| 7 | 17 | 223/223 | 52 | 372 | wrath_pendulum 146.7 (99.1%), flail 0.9 (0.6%), frost 0.4 (0.3%) |
| 8 | 18 | 223/223 | 70 | 426 | wrath_pendulum 108.4 (99.4%), frost 0.6 (0.6%) |
| 9 | 19 | 223/223 | 89 | 470 | wrath_pendulum 98.4 (99.5%), frost 0.5 (0.5%) |
| 10 | 19 | 223/223 | 116 | 548 | wrath_pendulum 181 (98.2%), frost 3.4 (1.8%) |
| 11 | 21 | 223/223 | 109 | 869 | wrath_pendulum 772.2 (96.6%), frost 27.3 (3.4%) |
| 12 | 22 | 243/243 | 107 | 1323 | wrath_pendulum 703.1 (97.3%), frost 19.7 (2.7%) |
| 13 | 23 | 263/263 | 134 | 1807 | wrath_pendulum 719.6 (98.1%), frost 14.2 (1.9%) |
| 14 | 24 | 263/263 | 150 | 2481 | wrath_pendulum 1100.9 (97.2%), frost 22.3 (2%), ember 9.6 (0.8%) |
| 15 | 25 | 263/263 | 195 | 3403 | wrath_pendulum 1372.3 (97.4%), frost 24.5 (1.7%), ember 12 (0.9%) |
| 16 | 26 | 242/263 | 74 | 4197 | wrath_pendulum 1828 (95%), frost 84.2 (4.4%), ember 12.3 (0.6%) |
| 17 | 27 | 257/263 | 98 | 4346 | wrath_pendulum 709 (74.5%), eternal_winter 197.6 (20.8%), frost 33 (3.5%), ember 12.5 (1.3%) |
| 18 | 27 | 263/263 | 140 | 4486 | eternal_winter 575.1 (50.8%), wrath_pendulum 541.7 (47.9%), ember 15.1 (1.3%) |
| 19 | 28 | 263/263 | 179 | 4627 | eternal_winter 595.9 (50.1%), wrath_pendulum 560.8 (47.2%), ember 32.5 (2.7%) |
| 20 | 29 | 254/263 | 231 | 4760 | eternal_winter 566.1 (51.7%), wrath_pendulum 479.2 (43.8%), ember 49.8 (4.5%) |
| 21 | 30 | 250/263 | 155 | 5214 | wrath_pendulum 2753.5 (68.1%), eternal_winter 1171.1 (29%), ember 119.5 (3%), storm 1.1 (0%) |
| 22 | 31 | 263/263 | 257 | 5767 | wrath_pendulum 1906.3 (53.7%), eternal_winter 823.7 (23.2%), ember 808.8 (22.8%), storm 11.8 (0.3%) |
| 23 | 31 | 263/263 | 354 | 6442 | wrath_pendulum 2557.9 (57.9%), ember 1045 (23.6%), eternal_winter 804.3 (18.2%), storm 12.9 (0.3%) |
| 24 | 31 | 263/263 | 298 | 7369 | wrath_pendulum 3295.9 (60.9%), ember 1125.2 (20.8%), eternal_winter 980.9 (18.1%), storm 14 (0.3%) |
| 25 | 31 | 263/263 | 346 | 8161 | wrath_pendulum 3402.1 (61.7%), ember 1060.7 (19.2%), eternal_winter 1036.4 (18.8%), storm 14 (0.3%) |
| 26 | 31 | 263/263 | 346 | 9071 | wrath_pendulum 3756.7 (59.9%), eternal_winter 1186 (18.9%), ember 1029.3 (16.4%), phoenix 289.6 (4.6%), storm 13.1 (0.2%) |
| 27 | 31 | 263/263 | 361 | 10260 | phoenix 3997.8 (55.9%), wrath_pendulum 2276.8 (31.8%), eternal_winter 866.8 (12.1%), storm 13.5 (0.2%) |
| 28 | 31 | 263/263 | 364 | 11482 | phoenix 4921.2 (61.4%), wrath_pendulum 2267.3 (28.3%), eternal_winter 817.3 (10.2%), storm 13.3 (0.2%) |
| 29 | 31 | 263/263 | 338 | 12824 | phoenix 4721.1 (52.7%), wrath_pendulum 3223.8 (36%), eternal_winter 1001 (11.2%), storm 13.6 (0.2%) |
| 30 | 31 | 263/263 | 337 | 13956 | phoenix 4868.2 (50.8%), wrath_pendulum 3555.8 (37.1%), eternal_winter 1142.6 (11.9%), storm 13.4 (0.1%) |

</details>

#### DPS-Anteil je Waffe (gesamter Lauf)

| Char/Seed | Gesamtschaden | ember | flail | frost | thorn | storm | lantern | phoenix | wrath_pendulum | eternal_winter | thorn_storm | thunder_seal | soul_beacon |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mira/101 | 181289 | 8.2% | – | – | – | – | 0.6% | 91.2% | – | – | – | – | – |
| kael/101 | 32289 | – | 98.6% | 0.9% | – | – | 0.5% | – | – | – | – | – | – |
| mira/202 | 534246 | 17.9% | – | 1.3% | – | 1.5% | – | 79.4% | – | – | – | – | – |
| kael/202 | 4446519 | 0.6% | 0.3% | 0.7% | – | 0.9% | 0% | 58.3% | 36.6% | 2.4% | – | – | – |
| mira/404 | 551815 | 2.9% | 0.4% | 1.6% | – | – | 0.1% | 95% | – | – | – | – | – |
| kael/404 | 4740743 | 6.7% | 0.4% | 0.3% | – | 0.2% | – | 25.1% | 51.5% | 15.8% | – | – | – |

<!-- BALANCE-TABLE:END -->
