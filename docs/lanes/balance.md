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
| Boss-Grundtempo | ≤ 90 % des Spielertempos |
| Evolutionen | mindestens 1 bis Minute 30 |

Alle Messläufe wurden mit `flock /home/ai/games/.lf-perf.lock` gestartet.

<!-- BALANCE-TABLE:START -->
### Hauptläufe (N = 3, autoPlay, kein god, 30x)

| # | Char | Seed | Ergebnis | Minuten | Level | Kills | Evos | Boss-Dauern (s) | Korridor |
|---|---|---|---|---|---|---|---|---|---|
| 1 | mira | 101 | Tod | 21.2 | 30 | 1897 | 1 | Moorkönigin 36, Knochenfürst 27, Der 17, Glockenturm-Golem 19 | NEIN (Boss-Dauer) |
| 2 | mira | 202 | Tod | 24.3 | 30 | 3898 | 1 | Moorkönigin 30, Knochenfürst 42, Der 27, Glockenturm-Golem 31 | JA |
| 3 | mira | 303 | Tod | 25.9 | 29 | 5199 | 2 | Moorkönigin 24, Knochenfürst 18, Der 27, Glockenturm-Golem 25, Hexenzirkel 41 | NEIN (Boss-Dauer) |

#### Minuten-Protokoll

<details><summary>mira / Seed 101 — death @ 21.2 min, Level 30</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 5 | 115/115 | 1 | 35 | ember 11.5 (100%) |
| 2 | 8 | 135/135 | 1 | 61 | ember 9.1 (100%) |
| 3 | 9 | 135/135 | 8 | 109 | ember 20.5 (100%) |
| 4 | 11 | 135/135 | 3 | 164 | ember 29.4 (100%) |
| 5 | 14 | 135/135 | 7 | 229 | ember 42.5 (100%) |
| 6 | 15 | 132/175 | 8 | 325 | ember 148.8 (100%) |
| 7 | 16 | 195/195 | 8 | 465 | ember 172.6 (100%) |
| 8 | 18 | 215/215 | 12 | 574 | ember 212.5 (100%) |
| 9 | 19 | 215/215 | 13 | 704 | ember 213 (98.4%), thorn 3.4 (1.6%) |
| 10 | 21 | 215/215 | 16 | 847 | ember 271.1 (96.7%), thorn 9.3 (3.3%) |
| 11 | 22 | 215/215 | 2 | 969 | ember 228.9 (58.9%), phoenix 140 (36%), thorn 19.7 (5.1%) |
| 12 | 23 | 215/215 | 6 | 1037 | phoenix 249.3 (98%), thorn 5.1 (2%) |
| 13 | 24 | 215/215 | 4 | 1123 | phoenix 261.1 (96%), thorn 11 (4%) |
| 14 | 25 | 215/215 | 2 | 1210 | phoenix 311.4 (96.4%), thorn 11.7 (3.6%) |
| 15 | 25 | 215/215 | 11 | 1300 | phoenix 395.9 (93.7%), thorn 26.1 (6.2%), lantern 0.3 (0.1%) |
| 16 | 26 | 215/215 | 16 | 1385 | phoenix 817.4 (91.5%), thorn 75.5 (8.5%), lantern 0.5 (0.1%) |
| 17 | 27 | 215/215 | 15 | 1478 | phoenix 999.7 (85.9%), thorn 162.5 (14%), lantern 1.3 (0.1%) |
| 18 | 28 | 215/215 | 20 | 1565 | phoenix 984.8 (87.1%), thorn 146.3 (12.9%) |
| 19 | 28 | 215/215 | 23 | 1667 | phoenix 1082.3 (84.8%), thorn 193.3 (15.1%), lantern 0.6 (0%) |
| 20 | 29 | 215/215 | 23 | 1765 | phoenix 1022.7 (82.2%), thorn 219.9 (17.7%), lantern 1.1 (0.1%) |
| 21 | 30 | 62/215 | 66 | 1865 | phoenix 1292.5 (66.1%), thorn 628.3 (32.1%), flail 21.2 (1.1%), storm 11 (0.6%), lantern 3.1 (0.2%) |

</details>

<details><summary>mira / Seed 202 — death @ 24.3 min, Level 30</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 115/115 | 2 | 35 | ember 11.7 (100%) |
| 2 | 8 | 115/115 | 1 | 67 | ember 16.7 (100%) |
| 3 | 9 | 115/115 | 8 | 108 | ember 21.9 (100%) |
| 4 | 12 | 135/135 | 3 | 189 | ember 48.8 (100%) |
| 5 | 14 | 155/155 | 8 | 271 | ember 57.3 (100%) |
| 6 | 15 | 195/195 | 4 | 357 | ember 156.1 (100%) |
| 7 | 16 | 215/215 | 4 | 444 | ember 141.4 (100%) |
| 8 | 18 | 215/215 | 12 | 527 | ember 150.8 (100%) |
| 9 | 20 | 215/215 | 14 | 671 | ember 267.5 (100%), frost 0.1 (0%) |
| 10 | 22 | 215/215 | 21 | 836 | ember 287.8 (99.9%), frost 0.3 (0.1%) |
| 11 | 23 | 215/215 | 2 | 996 | ember 271.5 (65.5%), phoenix 141.4 (34.1%), frost 1.7 (0.4%) |
| 12 | 24 | 215/215 | 1 | 1076 | phoenix 262.8 (100%) |
| 13 | 24 | 215/215 | 5 | 1151 | phoenix 249.9 (100%) |
| 14 | 25 | 215/215 | 5 | 1236 | phoenix 274.6 (100%) |
| 15 | 26 | 215/215 | 11 | 1314 | phoenix 327.6 (99.5%), frost 1.8 (0.5%) |
| 16 | 26 | 204/215 | 37 | 1398 | phoenix 797.4 (98.9%), frost 9.2 (1.1%) |
| 17 | 27 | 176/215 | 42 | 1479 | phoenix 940.1 (97.5%), frost 23.9 (2.5%) |
| 18 | 28 | 213/215 | 39 | 1581 | phoenix 1251.6 (97.6%), frost 30.4 (2.4%) |
| 19 | 28 | 191/215 | 56 | 1656 | phoenix 1007.3 (97.1%), frost 30 (2.9%) |
| 20 | 29 | 215/215 | 75 | 1742 | phoenix 1005 (96.8%), frost 33.2 (3.2%) |
| 21 | 29 | 159/215 | 134 | 1910 | phoenix 1474.4 (95.4%), frost 65.6 (4.2%), storm 5.2 (0.3%) |
| 22 | 29 | 215/215 | 286 | 2367 | phoenix 2224.5 (94.7%), frost 114.3 (4.9%), storm 11.4 (0.5%) |
| 23 | 29 | 215/215 | 312 | 2957 | phoenix 2723.9 (97%), frost 72.4 (2.6%), storm 11.1 (0.4%) |
| 24 | 29 | 215/215 | 312 | 3669 | phoenix 3372.9 (97.1%), frost 90.6 (2.6%), storm 11.4 (0.3%) |

</details>

<details><summary>mira / Seed 303 — death @ 25.9 min, Level 29</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 5 | 115/115 | 0 | 35 | ember 12.8 (100%) |
| 2 | 7 | 115/115 | 2 | 61 | ember 10.1 (100%) |
| 3 | 9 | 115/115 | 7 | 97 | ember 20.4 (100%) |
| 4 | 10 | 115/115 | 10 | 144 | ember 31.3 (100%) |
| 5 | 13 | 115/115 | 7 | 206 | ember 43 (100%) |
| 6 | 15 | 123/155 | 7 | 289 | ember 96.4 (67.1%), phoenix 47.2 (32.9%) |
| 7 | 16 | 175/175 | 7 | 398 | phoenix 156.6 (100%) |
| 8 | 17 | 175/175 | 3 | 548 | phoenix 199 (100%) |
| 9 | 19 | 175/175 | 3 | 680 | phoenix 210.1 (100%) |
| 10 | 20 | 175/175 | 14 | 784 | phoenix 211.7 (99.9%), frost 0.2 (0.1%) |
| 11 | 21 | 195/195 | 8 | 884 | phoenix 356.6 (99.5%), thorn 1.3 (0.4%), frost 0.6 (0.2%) |
| 12 | 22 | 195/195 | 9 | 961 | phoenix 230.4 (99.1%), thorn 2.2 (0.9%) |
| 13 | 23 | 195/195 | 5 | 1055 | phoenix 276.1 (99.1%), thorn 1.4 (0.5%), frost 1.2 (0.4%) |
| 14 | 24 | 195/195 | 4 | 1153 | phoenix 335.2 (98.5%), thorn 3.4 (1%), frost 1.6 (0.5%) |
| 15 | 24 | 195/195 | 13 | 1236 | phoenix 328.9 (98.1%), thorn 4 (1.2%), frost 2.3 (0.7%) |
| 16 | 25 | 187/195 | 23 | 1336 | phoenix 793.1 (79.5%), eternal_winter 175.7 (17.6%), thorn 18.2 (1.8%), frost 10 (1%) |
| 17 | 26 | 195/195 | 30 | 1413 | phoenix 847.3 (66.8%), eternal_winter 377.9 (29.8%), thorn 43.3 (3.4%) |
| 18 | 27 | 195/195 | 31 | 1504 | phoenix 829.6 (60.1%), eternal_winter 489.8 (35.5%), thorn 61.1 (4.4%) |
| 19 | 27 | 192/195 | 40 | 1591 | phoenix 940.5 (70.8%), eternal_winter 329.2 (24.8%), thorn 57.8 (4.4%) |
| 20 | 28 | 172/195 | 39 | 1697 | phoenix 939.9 (63.2%), eternal_winter 432.3 (29.1%), thorn 114.7 (7.7%) |
| 21 | 29 | 171/195 | 85 | 1845 | phoenix 1025.3 (59.7%), eternal_winter 501.9 (29.2%), thorn 183.7 (10.7%), storm 5.5 (0.3%) |
| 22 | 29 | 181/195 | 229 | 2313 | phoenix 1656.5 (60.2%), eternal_winter 795.2 (28.9%), thorn 287.4 (10.5%), storm 10.8 (0.4%) |
| 23 | 29 | 185/195 | 357 | 3076 | phoenix 2978.9 (77.5%), eternal_winter 595.1 (15.5%), thorn 259.4 (6.7%), storm 10.6 (0.3%) |
| 24 | 29 | 159/195 | 286 | 3899 | phoenix 4044.3 (75.6%), eternal_winter 988.6 (18.5%), thorn 308.1 (5.8%), storm 10.9 (0.2%) |
| 25 | 29 | 170/195 | 344 | 4547 | phoenix 3644.1 (81%), eternal_winter 591.4 (13.1%), thorn 255.1 (5.7%), storm 10.5 (0.2%) |

</details>

#### DPS-Anteil je Waffe (gesamter Lauf)

| Char/Seed | Gesamtschaden | ember | flail | frost | thorn | storm | lantern | phoenix | wrath_pendulum | eternal_winter | thorn_storm | thunder_seal | soul_beacon |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mira/101 | 648149 | 12.7% | 0.2% | – | 15.3% | 0.1% | 0.1% | 71.5% | – | – | – | – | – |
| mira/202 | 1169159 | 7.5% | – | 3.1% | – | 0.2% | – | 89.2% | – | – | – | – | – |
| mira/303 | 1896487 | 0.7% | – | 0.1% | 6% | 0.2% | – | 73.6% | – | 19.5% | – | – | – |

<!-- BALANCE-TABLE:END -->
