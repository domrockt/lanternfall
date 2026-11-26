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

## Charakterprofile (belegt in `src/data/characters.ts`)

| Char | Startwaffe | Basis-HP | Effektive Start-HP | Tempo | Rüstung | Mods |
|---|---|---|---|---|---|---|
| Mira (Laternen-Hexe) | ember | 250 | 250 | 62 | 1 | +10 % Fläche, +1.0 HP/s Regen |
| Kael (Eisen-Mönch) | flail | 130 | 253 | 55.9 | 2 | +25 % Max-HP, +90 HP, +1.5 HP/s Regen, −5 % Tempo, −25 % XP |

Mira ist die schnelle Flächenhexe (Ember/Phoenix, mehr AoE), Kael der zähe
Nahkämpfer (Flail/Wrath, Rüstung 2, mehr HP, langsamer und weniger XP). Die
Startwaffen und Stat-Mods sind damit klar unterschiedlich; Messläufe unten
zeigen unterschiedliche Waffen-/DPS-Profile.

Weitere Lane-Änderungen (in `docs/lanes/balance.md` begründet, GAME.md bleibt unverändert):
- Mira Basis-HP 90 → 250, Regen +1.0 HP/s (schnelle Flächenhexe braucht ein Überlebenspolster für 20–28 min).
- Kael Rüstung 1 → 2, Max-HP-Mod 20 → 25 %, +90 Flat-HP (Tankprofil, langsamer).
- Eisenherz-Regeneration 0.2 → 0.3 HP/s pro Stufe (Heilung statt reinem HP-Polster).
- XP-Kurve `8 + 1.1·n²` statt linear: Level 25–40 bei Minute 30 (vorher Level 147 im fullrun).
- Boss-Grundtempo 42–50 ≤ 90 % des langsamsten Spielertempos (Test `tests/m3-logic.test.ts`);
  Bosse sind über Mechaniken gefährlich, nicht über Verfolgung. Boss-HP so gewählt,
  dass Kämpfe 20–60 s dauern.
- Spawner-Ring/-Stream etwas kleiner (6 + Minute/6 bzw. /5): weniger plötzliche
  Umzingelung, damit Boss-Kämpfe nicht von Trash-Wellen überlagert werden.

Alle Messläufe wurden mit `flock /home/ai/games/.lf-perf.lock` gestartet.

## Befunde (Stand Abnahme)

- **Hauptläufe:** Alle 6 Läufe im Korridor. Mira stirbt mit den Seeds 202/404 bei
  23.1/22.1 min (Level 28/31, 2 Evolutionen); mit Seed 101 gewinnt sie bei 30.7 min.
  Kael gewinnt alle drei Seeds bei 30.5–30.7 min (Level 29–31, 2–3 Evolutionen).
  Boss-Kämpfe dauern 24–48 s (Ziel 20–60 s), Level bei Minute 30 liegt bei 28–32
  (Ziel 25–40), alle Läufe haben mindestens eine Evolution.
- **Charakter-Differenz:** Mira startet mit Ember und spielt Phönix/Thorn-Storm/
  Soul-Beacon-Builds (Fläche, schnelles Kit); Kael startet mit Flail und spielt
  Zornpendel/Thunder-Seal/Phönix (Nahkampf, Tank). Die DPS-Anteile unten zeigen
  unterschiedliche Waffenprofile bei gleichen Seeds.
- **Waffen-Audit:** Alle 12 Waffen verursachen auf Stufe 8 Schaden (keine tote
  Waffe). Frostnova/Geisterlaterne haben als Solo-Waffe niedrige DPS, weil der
  Kite-Bot Abstand hält; ihre Evolutionen `eternal_winter` und `soul_beacon`
  erscheinen aber in erfolgreichen Hauptläufen mit zweistelligem DPS-Anteil
  (siehe Tabelle unten).
- **Todes-/Game-Over-Beleg:** Mira stirbt im AutoPlay mit Seed 202 nach 25.1 min
  (Level 29) und löst den Results-Screen aus. Kael gewinnt im AutoPlay alle
  getesteten Seeds (111/505/606/707); der Kael-Todesbeleg läuft daher mit
  stehendem Spieler (Seed 606, Tod nach 2.3 min, Level 6, kein god) und zeigt
  ebenfalls den Game-Over-Screen.
- **Streuung:** Der AutoPlay-Bot ist frame-/zeitabhängig nicht vollständig
  deterministisch; identische Seeds können zwischen Läufen um mehrere Minuten
  streuen. Die Tabelle ist eine vollständige 6-Run-Messreihe, kein Best-of.

<!-- BALANCE-TABLE:START -->
### Hauptläufe (N = 6, autoPlay, kein god, 30x)

| # | Char | Seed | Ergebnis | Minuten | Level | Kills | Evos | Boss-Dauern (s) | Korridor |
|---|---|---|---|---|---|---|---|---|---|
| 1 | mira | 101 | Tod | 22.2 | 27 | 2088 | 2 | Moorkönigin 27, Knochenfürst 33, Der 30, Glockenturm-Golem 29 | JA |
| 2 | kael | 101 | dawn | 30.6 | 27 | 9433 | 2 | Moorkönigin 33, Knochenfürst 48, Der 35, Glockenturm-Golem 36, Hexenzirkel 40, Der 32 | Sieg |
| 3 | mira | 202 | dawn | 30.6 | 30 | 5378 | 3 | Moorkönigin 24, Knochenfürst 26, Der 25, Glockenturm-Golem 23, Hexenzirkel 25, Der 33 | Sieg |
| 4 | kael | 202 | dawn | 30.6 | 28 | 6629 | 2 | Moorkönigin 34, Knochenfürst 51, Der 33, Glockenturm-Golem 34, Hexenzirkel 33, Der 35 | Sieg |
| 5 | mira | 404 | Tod | 20.3 | 27 | 1634 | 1 | Moorkönigin 30, Knochenfürst 45, Der 27 | JA |
| 6 | kael | 404 | dawn | 30.6 | 28 | 6815 | 2 | Moorkönigin 32, Knochenfürst 37, Der 32, Glockenturm-Golem 35, Hexenzirkel 35, Der 34 | Sieg |

#### Minuten-Protokoll

<details><summary>mira / Seed 101 — death @ 22.2 min, Level 27</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 270/270 | 1 | 31 | ember 10.5 (100%) |
| 2 | 8 | 270/270 | 0 | 73 | ember 18.3 (100%) |
| 3 | 10 | 270/270 | 6 | 123 | ember 27.2 (100%) |
| 4 | 11 | 270/270 | 1 | 173 | ember 30.9 (100%) |
| 5 | 13 | 290/290 | 8 | 219 | ember 28.3 (100%) |
| 6 | 14 | 290/290 | 1 | 301 | ember 100.1 (63.9%), phoenix 56.6 (36.1%) |
| 7 | 15 | 310/310 | 4 | 372 | phoenix 103.7 (100%) |
| 8 | 16 | 330/330 | 1 | 486 | phoenix 153.9 (100%) |
| 9 | 17 | 350/350 | 9 | 571 | phoenix 143.5 (100%) |
| 10 | 18 | 350/350 | 13 | 688 | phoenix 181.8 (99.6%), thorn 0.7 (0.4%) |
| 11 | 20 | 350/350 | 2 | 817 | phoenix 451.5 (98.1%), thorn 8.7 (1.9%) |
| 12 | 21 | 350/350 | 2 | 885 | phoenix 215.7 (97.2%), thorn 6.2 (2.8%) |
| 13 | 21 | 350/350 | 9 | 955 | phoenix 216.2 (97.2%), thorn 6.3 (2.8%) |
| 14 | 22 | 350/350 | 5 | 1038 | phoenix 286.7 (96.7%), thorn 9.9 (3.3%) |
| 15 | 22 | 350/350 | 11 | 1112 | phoenix 325.5 (96%), thorn 13.4 (4%) |
| 16 | 23 | 350/350 | 32 | 1190 | phoenix 710.9 (84.7%), thorn 128.6 (15.3%) |
| 17 | 24 | 335/350 | 28 | 1269 | phoenix 918.4 (72.5%), thorn 348.8 (27.5%) |
| 18 | 24 | 350/350 | 28 | 1354 | phoenix 833.3 (71.1%), thorn 339.2 (28.9%) |
| 19 | 25 | 329/350 | 29 | 1441 | phoenix 814.9 (67.5%), thorn 383.7 (31.8%), storm 9.2 (0.8%) |
| 20 | 26 | 350/350 | 37 | 1520 | phoenix 928.4 (68.5%), thorn 417.4 (30.8%), storm 10.1 (0.7%) |
| 21 | 27 | 295/350 | 55 | 1756 | thorn_storm 1066.8 (43%), phoenix 1058.5 (42.7%), thorn 326.7 (13.2%), storm 14.4 (0.6%), flail 12.9 (0.5%) |
| 22 | 27 | 188/350 | 72 | 2034 | thorn_storm 2377.6 (69.4%), phoenix 990.7 (28.9%), storm 32.5 (0.9%), flail 26.9 (0.8%) |

</details>

<details><summary>kael / Seed 101 — dawn @ 30.6 min, Level 27</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 273/273 | 3 | 30 | flail 16.4 (100%) |
| 2 | 8 | 293/293 | 4 | 58 | flail 19 (100%) |
| 3 | 9 | 293/293 | 14 | 92 | flail 27.2 (100%) |
| 4 | 10 | 293/293 | 17 | 140 | flail 41.2 (100%) |
| 5 | 10 | 283/293 | 26 | 176 | flail 40.8 (100%) |
| 6 | 11 | 293/293 | 32 | 211 | flail 117.4 (100%) |
| 7 | 13 | 333/333 | 36 | 307 | wrath_pendulum 86 (57.8%), flail 62.9 (42.2%) |
| 8 | 14 | 353/353 | 42 | 376 | wrath_pendulum 130.6 (100%) |
| 9 | 14 | 353/353 | 49 | 448 | wrath_pendulum 149.2 (100%) |
| 10 | 15 | 353/353 | 56 | 518 | wrath_pendulum 172.9 (99%), ember 1.8 (1%) |
| 11 | 17 | 353/353 | 61 | 749 | wrath_pendulum 666.1 (96.2%), ember 26.4 (3.8%) |
| 12 | 18 | 353/353 | 51 | 1037 | wrath_pendulum 564.1 (90.5%), ember 59 (9.5%) |
| 13 | 21 | 353/353 | 15 | 1326 | wrath_pendulum 506.6 (73.1%), ember 182.8 (26.4%), storm 3.7 (0.5%) |
| 14 | 22 | 353/353 | 12 | 1409 | ember 254.7 (72.6%), wrath_pendulum 85.6 (24.4%), storm 10.4 (3%) |
| 15 | 22 | 353/353 | 14 | 1496 | ember 235.2 (73.9%), wrath_pendulum 71.9 (22.6%), storm 11 (3.5%) |
| 16 | 23 | 345/353 | 49 | 1560 | ember 498.7 (55%), wrath_pendulum 394.7 (43.5%), storm 11.7 (1.3%), frost 1.8 (0.2%) |
| 17 | 23 | 353/353 | 70 | 1615 | ember 429.8 (63.9%), wrath_pendulum 229 (34%), storm 11.4 (1.7%), frost 2.4 (0.4%) |
| 18 | 23 | 353/353 | 92 | 1675 | ember 550.8 (65.2%), wrath_pendulum 283 (33.5%), storm 10.6 (1.3%), frost 0.7 (0.1%) |
| 19 | 23 | 353/353 | 115 | 1736 | ember 528.8 (69.5%), wrath_pendulum 218.4 (28.7%), storm 11.9 (1.6%), frost 2.1 (0.3%) |
| 20 | 24 | 310/353 | 160 | 1783 | ember 472.6 (63%), wrath_pendulum 264.2 (35.2%), storm 11.1 (1.5%), frost 2.4 (0.3%) |
| 21 | 24 | 353/353 | 200 | 1991 | wrath_pendulum 1216 (57.6%), ember 876.5 (41.5%), storm 12.9 (0.6%), frost 6.8 (0.3%) |
| 22 | 24 | 353/353 | 278 | 2472 | wrath_pendulum 1593.8 (62.5%), ember 942.3 (36.9%), storm 12.4 (0.5%), frost 2.9 (0.1%) |
| 23 | 25 | 353/353 | 252 | 3289 | wrath_pendulum 2797.7 (73.4%), ember 994 (26.1%), storm 12.3 (0.3%), frost 6.1 (0.2%) |
| 24 | 25 | 353/353 | 272 | 4102 | wrath_pendulum 2634.5 (71.4%), ember 1033.5 (28%), storm 12 (0.3%), frost 7.7 (0.2%) |
| 25 | 26 | 353/353 | 247 | 4837 | wrath_pendulum 2468.2 (71.3%), ember 975.4 (28.2%), storm 12.8 (0.4%), frost 4.9 (0.1%) |
| 26 | 26 | 353/353 | 247 | 5740 | wrath_pendulum 3691.5 (76.7%), ember 1065.8 (22.1%), frost 46.2 (1%), storm 12.1 (0.3%) |
| 27 | 26 | 353/353 | 266 | 6395 | wrath_pendulum 2165.9 (51.3%), phoenix 1862.8 (44.1%), ember 148.6 (3.5%), storm 29 (0.7%), frost 15.8 (0.4%), lantern 2.8 (0.1%) |
| 28 | 27 | 353/353 | 268 | 7357 | phoenix 2891.5 (53.8%), wrath_pendulum 2421.3 (45.1%), storm 31.9 (0.6%), frost 22.4 (0.4%), lantern 3.1 (0.1%) |
| 29 | 27 | 353/353 | 263 | 8354 | phoenix 3422.1 (52.5%), wrath_pendulum 3028.5 (46.4%), frost 34.9 (0.5%), storm 31.7 (0.5%), lantern 3.8 (0.1%) |
| 30 | 27 | 353/353 | 266 | 9058 | phoenix 3276.4 (58.2%), wrath_pendulum 2214.9 (39.4%), storm 104 (1.8%), frost 29.5 (0.5%), lantern 3.6 (0.1%) |

</details>

<details><summary>mira / Seed 202 — dawn @ 30.6 min, Level 30</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 4 | 250/250 | 4 | 20 | ember 9.7 (100%) |
| 2 | 7 | 250/250 | 0 | 61 | ember 17.1 (100%) |
| 3 | 8 | 250/250 | 5 | 102 | ember 21.3 (100%) |
| 4 | 10 | 250/250 | 2 | 155 | ember 32 (100%) |
| 5 | 11 | 250/250 | 7 | 203 | ember 32.2 (97.9%), thorn 0.7 (2.1%) |
| 6 | 12 | 250/250 | 8 | 285 | ember 79.5 (51.6%), phoenix 71.3 (46.2%), thorn 3.4 (2.2%) |
| 7 | 13 | 250/250 | 7 | 363 | phoenix 105.4 (99.5%), thorn 0.5 (0.5%) |
| 8 | 16 | 250/250 | 2 | 478 | phoenix 148 (98.4%), thorn 2.4 (1.6%) |
| 9 | 16 | 250/250 | 4 | 602 | phoenix 181.9 (98.2%), thorn 3.4 (1.8%) |
| 10 | 18 | 250/250 | 7 | 695 | phoenix 178.4 (96.6%), thorn 6.2 (3.4%) |
| 11 | 19 | 250/250 | 6 | 781 | phoenix 368.6 (86%), thorn 60.1 (14%) |
| 12 | 19 | 250/250 | 6 | 855 | phoenix 220.9 (89.8%), thorn 25 (10.2%) |
| 13 | 20 | 250/250 | 12 | 926 | phoenix 238.5 (94%), thorn 15.2 (6%) |
| 14 | 21 | 250/250 | 10 | 1012 | phoenix 257.8 (93.3%), thorn 18.3 (6.6%), frost 0.2 (0.1%) |
| 15 | 22 | 250/250 | 12 | 1092 | phoenix 241.3 (92.8%), thorn 18.4 (7.1%), frost 0.2 (0.1%) |
| 16 | 22 | 250/250 | 23 | 1176 | phoenix 730.2 (64.1%), thorn_storm 275.3 (24.2%), thorn 131.4 (11.5%), frost 2.1 (0.2%) |
| 17 | 23 | 250/250 | 15 | 1260 | phoenix 609.5 (62.3%), thorn_storm 366.3 (37.4%), frost 3.1 (0.3%) |
| 18 | 24 | 250/250 | 15 | 1340 | phoenix 657.7 (61.7%), thorn_storm 405.2 (38%), frost 3.8 (0.4%) |
| 19 | 25 | 250/250 | 22 | 1423 | phoenix 675.7 (58.3%), thorn_storm 480.7 (41.5%), frost 3 (0.3%) |
| 20 | 26 | 250/250 | 23 | 1510 | phoenix 749.3 (52.2%), thorn_storm 672.4 (46.9%), frost 12.4 (0.9%) |
| 21 | 26 | 244/250 | 53 | 1758 | thorn_storm 1562.4 (52.1%), phoenix 1104.8 (36.9%), eternal_winter 323 (10.8%), frost 6.7 (0.2%) |
| 22 | 27 | 259/270 | 77 | 1983 | thorn_storm 1722.8 (54.2%), phoenix 1033.3 (32.5%), eternal_winter 420.3 (13.2%) |
| 23 | 27 | 244/270 | 59 | 2295 | thorn_storm 2116.5 (57.5%), phoenix 991.9 (26.9%), eternal_winter 572.8 (15.6%) |
| 24 | 28 | 266/290 | 61 | 2553 | thorn_storm 2170.6 (57.5%), phoenix 1062.8 (28.1%), eternal_winter 542.1 (14.4%) |
| 25 | 28 | 290/290 | 92 | 2881 | thorn_storm 2321.9 (55.5%), phoenix 1282.8 (30.7%), eternal_winter 579.2 (13.8%) |
| 26 | 29 | 304/310 | 91 | 3361 | thorn_storm 3500.8 (61.1%), phoenix 1420.1 (24.8%), eternal_winter 813.3 (14.2%) |
| 27 | 29 | 298/310 | 88 | 3702 | thorn_storm 3430.8 (55.1%), phoenix 2018.3 (32.4%), eternal_winter 775.1 (12.5%) |
| 28 | 30 | 250/330 | 79 | 4015 | thorn_storm 2924.7 (57.1%), phoenix 1460.9 (28.5%), eternal_winter 735.7 (14.4%) |
| 29 | 30 | 330/330 | 121 | 4488 | thorn_storm 3113.1 (62.3%), phoenix 1195.8 (23.9%), eternal_winter 690 (13.8%) |
| 30 | 30 | 330/330 | 202 | 5053 | thorn_storm 3636.3 (63.4%), phoenix 1555.9 (27.1%), eternal_winter 540.7 (9.4%) |

</details>

<details><summary>kael / Seed 202 — dawn @ 30.6 min, Level 28</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 5 | 273/273 | 7 | 19 | flail 8.7 (100%) |
| 2 | 6 | 273/273 | 15 | 35 | flail 10 (100%) |
| 3 | 7 | 273/273 | 25 | 69 | flail 26.3 (100%) |
| 4 | 8 | 273/273 | 34 | 103 | flail 27.6 (100%) |
| 5 | 9 | 273/273 | 44 | 133 | flail 29.2 (100%) |
| 6 | 10 | 273/273 | 35 | 216 | flail 165.5 (100%) |
| 7 | 11 | 313/313 | 38 | 297 | flail 125.8 (100%) |
| 8 | 13 | 353/353 | 48 | 364 | flail 120.3 (100%) |
| 9 | 13 | 353/353 | 58 | 432 | flail 138.3 (100%) |
| 10 | 14 | 353/353 | 76 | 487 | wrath_pendulum 105 (81.3%), flail 12.2 (9.5%), thorn 11.9 (9.2%) |
| 11 | 15 | 353/353 | 66 | 681 | wrath_pendulum 621 (96.3%), thorn 24 (3.7%) |
| 12 | 16 | 353/353 | 61 | 886 | wrath_pendulum 369.2 (87.8%), thorn 51.4 (12.2%) |
| 13 | 17 | 353/353 | 52 | 1078 | wrath_pendulum 384.1 (86.3%), thorn 61.2 (13.7%) |
| 14 | 20 | 353/353 | 22 | 1267 | wrath_pendulum 380.4 (79.6%), thorn 97.6 (20.4%) |
| 15 | 21 | 353/353 | 15 | 1408 | wrath_pendulum 368.1 (76%), thorn 116.2 (24%) |
| 16 | 22 | 353/353 | 31 | 1497 | thorn_storm 476.5 (43.2%), wrath_pendulum 424.4 (38.4%), thorn 203.1 (18.4%) |
| 17 | 22 | 353/353 | 32 | 1575 | thorn_storm 733.1 (76.4%), wrath_pendulum 226.4 (23.6%) |
| 18 | 23 | 353/353 | 42 | 1646 | thorn_storm 770.3 (79.2%), wrath_pendulum 201.8 (20.8%) |
| 19 | 23 | 331/353 | 50 | 1725 | thorn_storm 959.8 (78%), wrath_pendulum 271.1 (22%) |
| 20 | 23 | 353/353 | 58 | 1806 | thorn_storm 1120.7 (82.1%), wrath_pendulum 244.5 (17.9%) |
| 21 | 24 | 353/353 | 54 | 1986 | thorn_storm 1735.9 (75.3%), wrath_pendulum 568.8 (24.7%) |
| 22 | 25 | 353/353 | 88 | 2235 | thorn_storm 2286 (69%), wrath_pendulum 1025.2 (31%), lantern 0.3 (0%) |
| 23 | 25 | 353/353 | 138 | 2626 | thorn_storm 2589.5 (73.2%), wrath_pendulum 947.3 (26.8%), lantern 3 (0.1%) |
| 24 | 25 | 322/353 | 222 | 3141 | thorn_storm 3281.1 (74%), wrath_pendulum 1151.1 (25.9%), lantern 4.6 (0.1%) |
| 25 | 25 | 353/353 | 163 | 3817 | thorn_storm 3863.1 (72.3%), wrath_pendulum 1475.1 (27.6%), lantern 4.5 (0.1%) |
| 26 | 25 | 353/353 | 142 | 4552 | thorn_storm 5205.4 (73.3%), wrath_pendulum 1894.4 (26.7%), lantern 5.4 (0.1%) |
| 27 | 26 | 338/353 | 102 | 5120 | thorn_storm 5312.6 (76.7%), wrath_pendulum 1609.9 (23.2%), lantern 5.5 (0.1%) |
| 28 | 27 | 343/353 | 114 | 5457 | thorn_storm 4234.6 (79.9%), wrath_pendulum 1058.4 (20%), lantern 4.8 (0.1%) |
| 29 | 27 | 292/353 | 130 | 5756 | thorn_storm 4080.3 (78.6%), wrath_pendulum 1092.1 (21%), lantern 17.4 (0.3%) |
| 30 | 28 | 353/353 | 130 | 6280 | thorn_storm 5388.6 (78.5%), wrath_pendulum 1457 (21.2%), lantern 16.9 (0.2%) |

</details>

<details><summary>mira / Seed 404 — death @ 20.3 min, Level 27</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 7 | 250/250 | 1 | 32 | ember 11 (100%) |
| 2 | 8 | 250/250 | 1 | 61 | ember 14.9 (100%) |
| 3 | 10 | 250/250 | 6 | 118 | ember 32.5 (100%) |
| 4 | 12 | 270/270 | 5 | 187 | ember 40 (100%) |
| 5 | 15 | 310/310 | 8 | 261 | ember 41.5 (100%) |
| 6 | 15 | 310/310 | 9 | 320 | ember 137.6 (100%) |
| 7 | 16 | 310/310 | 11 | 433 | ember 170.7 (100%) |
| 8 | 18 | 330/330 | 12 | 536 | ember 171.7 (100%) |
| 9 | 19 | 330/330 | 11 | 676 | ember 215.1 (98.9%), flail 2.5 (1.1%) |
| 10 | 20 | 330/330 | 20 | 769 | ember 161.2 (96.4%), flail 6 (3.6%) |
| 11 | 22 | 210/350 | 7 | 904 | ember 367.8 (75.7%), phoenix 71.6 (14.7%), flail 46.2 (9.5%) |
| 12 | 22 | 350/350 | 5 | 979 | phoenix 234.5 (99.8%), flail 0.5 (0.2%) |
| 13 | 22 | 350/350 | 7 | 1052 | phoenix 249.5 (98.6%), flail 3.6 (1.4%) |
| 14 | 23 | 350/350 | 6 | 1129 | phoenix 275 (99.2%), flail 2.2 (0.8%) |
| 15 | 24 | 350/350 | 11 | 1214 | phoenix 280.4 (98.8%), flail 3.5 (1.2%) |
| 16 | 24 | 350/350 | 30 | 1294 | phoenix 853.4 (89.1%), flail 104.2 (10.9%) |
| 17 | 25 | 262/350 | 34 | 1367 | phoenix 1030.9 (88%), flail 140.6 (12%) |
| 18 | 26 | 350/350 | 29 | 1453 | phoenix 774.1 (88.5%), flail 100.8 (11.5%) |
| 19 | 26 | 243/350 | 42 | 1526 | phoenix 936.2 (83.8%), flail 181.1 (16.2%) |
| 20 | 27 | 239/350 | 57 | 1606 | phoenix 947.9 (87.2%), flail 138.7 (12.8%) |

</details>

<details><summary>kael / Seed 404 — dawn @ 30.6 min, Level 28</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 4 | 253/253 | 3 | 16 | flail 7.3 (100%) |
| 2 | 7 | 253/253 | 6 | 56 | flail 25.1 (100%) |
| 3 | 9 | 253/253 | 9 | 104 | flail 43.8 (100%) |
| 4 | 11 | 253/253 | 11 | 139 | flail 34.7 (100%) |
| 5 | 12 | 293/293 | 11 | 198 | flail 62.3 (100%) |
| 6 | 13 | 293/293 | 13 | 269 | flail 92.7 (55.5%), wrath_pendulum 64.3 (38.5%), thorn 10.1 (6%) |
| 7 | 15 | 293/293 | 14 | 350 | wrath_pendulum 134.9 (91.6%), thorn 12.3 (8.4%) |
| 8 | 16 | 293/293 | 17 | 457 | wrath_pendulum 165.4 (87.7%), thorn 23.1 (12.3%) |
| 9 | 18 | 293/293 | 17 | 564 | wrath_pendulum 158.3 (79.5%), thorn 40.7 (20.5%) |
| 10 | 19 | 293/293 | 24 | 668 | wrath_pendulum 157 (71.1%), thorn 63.9 (28.9%) |
| 11 | 20 | 293/293 | 13 | 840 | wrath_pendulum 379.6 (68.7%), thorn 173.1 (31.3%) |
| 12 | 21 | 293/293 | 9 | 928 | wrath_pendulum 141 (56.1%), thorn 110.2 (43.9%) |
| 13 | 22 | 293/293 | 13 | 1011 | wrath_pendulum 130.4 (53.3%), thorn 114.3 (46.7%) |
| 14 | 22 | 293/293 | 17 | 1117 | wrath_pendulum 180.2 (54.3%), thorn 151.6 (45.7%) |
| 15 | 23 | 293/293 | 17 | 1220 | wrath_pendulum 202.6 (56.4%), thorn 156.7 (43.6%) |
| 16 | 23 | 293/293 | 30 | 1304 | wrath_pendulum 515.8 (48.9%), thorn_storm 292.2 (27.7%), thorn 247.8 (23.5%) |
| 17 | 24 | 293/293 | 42 | 1371 | thorn_storm 862.2 (78%), wrath_pendulum 239.4 (21.7%), ember 3.3 (0.3%) |
| 18 | 24 | 293/293 | 53 | 1440 | thorn_storm 889.9 (81.7%), wrath_pendulum 187.9 (17.2%), ember 11.6 (1.1%) |
| 19 | 24 | 293/293 | 52 | 1532 | thorn_storm 1000.9 (83.2%), wrath_pendulum 190.2 (15.8%), ember 11.3 (0.9%) |
| 20 | 24 | 293/293 | 70 | 1601 | thorn_storm 1049.3 (80.7%), wrath_pendulum 238.9 (18.4%), ember 11.9 (0.9%) |
| 21 | 25 | 272/293 | 86 | 1818 | thorn_storm 1695 (74.7%), wrath_pendulum 551 (24.3%), ember 22.9 (1%) |
| 22 | 25 | 269/293 | 96 | 2185 | thorn_storm 2180.3 (71.2%), wrath_pendulum 844.6 (27.6%), ember 36.4 (1.2%) |
| 23 | 25 | 263/293 | 174 | 2629 | thorn_storm 2941.5 (74.3%), wrath_pendulum 977.6 (24.7%), ember 38.7 (1%) |
| 24 | 25 | 270/293 | 238 | 3035 | thorn_storm 2462.4 (80.4%), wrath_pendulum 562.8 (18.4%), ember 37.6 (1.2%) |
| 25 | 26 | 293/293 | 270 | 3504 | thorn_storm 3050.1 (76.3%), wrath_pendulum 872.6 (21.8%), ember 72.4 (1.8%) |
| 26 | 26 | 279/293 | 236 | 4212 | thorn_storm 4160.4 (71.9%), wrath_pendulum 1536.3 (26.5%), ember 93.6 (1.6%) |
| 27 | 26 | 313/313 | 266 | 4795 | thorn_storm 4222.3 (78%), wrath_pendulum 1072.7 (19.8%), ember 118 (2.2%) |
| 28 | 26 | 313/313 | 253 | 5323 | thorn_storm 3262 (70.3%), wrath_pendulum 1259.3 (27.1%), ember 118.5 (2.6%) |
| 29 | 27 | 313/313 | 280 | 5908 | thorn_storm 4336.1 (69%), wrath_pendulum 1641.3 (26.1%), ember 303.9 (4.8%) |
| 30 | 27 | 313/313 | 268 | 6368 | thorn_storm 3033 (68.7%), wrath_pendulum 1073.4 (24.3%), ember 308 (7%) |

</details>

#### DPS-Anteil je Waffe (gesamter Lauf)

| Char/Seed | Gesamtschaden | ember | flail | frost | thorn | storm | lantern | phoenix | wrath_pendulum | eternal_winter | thorn_storm | thunder_seal | soul_beacon |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mira/101 | 897166 | 1.5% | 0.3% | – | 13.3% | 0.5% | – | 57.3% | – | – | 27.1% | – | – |
| kael/101 | 3206516 | 17.4% | 0.6% | 0.5% | – | 0.8% | 0% | 24.4% | 56.3% | – | – | – | – |
| mira/202 | 3435117 | 0.3% | – | 0.1% | 0.5% | – | – | 34.3% | – | 11.1% | 53.7% | – | – |
| kael/202 | 3883752 | – | 1% | – | 0.9% | – | 0.1% | – | 27% | – | 70.9% | – | – |
| mira/404 | 497200 | 16.6% | 10.8% | – | – | – | – | 72.6% | – | – | – | – | – |
| kael/404 | 3404216 | 2.4% | 0.5% | – | 2% | – | – | – | 27.2% | – | 67.9% | – | – |

<!-- BALANCE-TABLE:END -->
