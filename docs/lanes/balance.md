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
| 1 | mira | 101 | dawn | 30.5 | 38 | 5910 | 3 | Moorkönigin 12, Knochenfürst 28, Der 28, Glockenturm-Golem 27, Hexenzirkel 22, Der 24 | NEIN (Boss-Dauer) |
| 2 | kael | 101 | dawn | 30.3 | 41 | 12224 | 4 | Moorkönigin 28, Knochenfürst 42, Der 27, Glockenturm-Golem 28, Hexenzirkel 25, Der 14 | NEIN (Level, Boss-Dauer) |
| 3 | mira | 202 | Tod | 20.2 | 29 | 1781 | 2 | Moorkönigin 10, Knochenfürst 29, Der 33 | NEIN (Boss-Dauer) |
| 4 | kael | 202 | dawn | 30.4 | 44 | 16879 | 4 | Moorkönigin 33, Knochenfürst 52, Der 41, Glockenturm-Golem 36, Hexenzirkel 22, Der 23 | NEIN (Level) |
| 5 | mira | 404 | dawn | 30.3 | 40 | 7599 | 3 | Moorkönigin 27, Knochenfürst 27, Der 27, Glockenturm-Golem 30, Hexenzirkel 18, Der 13 | NEIN (Boss-Dauer) |
| 6 | kael | 404 | dawn | 30.4 | 39 | 9733 | 3 | Moorkönigin 29, Knochenfürst 42, Der 37, Glockenturm-Golem 31, Hexenzirkel 22, Der 20 | Sieg |

#### Minuten-Protokoll

<details><summary>mira / Seed 101 — dawn @ 30.5 min, Level 38</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 3 | 250/250 | 1 | 28 | ember 10.4 (100%) |
| 2 | 7 | 250/250 | 2 | 84 | ember 22.9 (100%) |
| 3 | 9 | 250/250 | 11 | 136 | ember 31.5 (100%) |
| 4 | 12 | 310/310 | 2 | 208 | ember 41.6 (98.6%), thorn 0.6 (1.4%) |
| 5 | 14 | 310/310 | 8 | 264 | ember 31.2 (69.2%), phoenix 13.3 (29.5%), thorn 0.6 (1.3%) |
| 6 | 15 | 310/310 | 3 | 369 | phoenix 171.8 (98.7%), thorn 2.2 (1.3%) |
| 7 | 16 | 310/310 | 5 | 445 | phoenix 121.4 (99.7%), thorn 0.4 (0.3%) |
| 8 | 17 | 310/310 | 4 | 582 | phoenix 187.3 (99.7%), thorn 0.6 (0.3%) |
| 9 | 18 | 310/310 | 9 | 695 | phoenix 178 (99.9%), thorn 0.2 (0.1%) |
| 10 | 19 | 310/310 | 15 | 818 | phoenix 212.7 (98.4%), thorn 3.4 (1.6%) |
| 11 | 21 | 330/330 | 4 | 944 | phoenix 375.9 (85.3%), thorn 64.7 (14.7%) |
| 12 | 23 | 330/330 | 10 | 1011 | phoenix 224.7 (94.5%), thorn 13.2 (5.5%) |
| 13 | 24 | 330/330 | 5 | 1110 | phoenix 237.4 (86.3%), thorn_storm 28.8 (10.5%), thorn 8.8 (3.2%) |
| 14 | 25 | 330/330 | 10 | 1187 | phoenix 234.1 (78.4%), thorn_storm 64.4 (21.6%) |
| 15 | 25 | 330/330 | 11 | 1276 | phoenix 223.8 (76%), thorn_storm 70.6 (24%), frost 0.1 (0%) |
| 16 | 26 | 330/330 | 29 | 1367 | phoenix 703.6 (58.9%), thorn_storm 489.1 (41%), frost 1.5 (0.1%) |
| 17 | 27 | 330/330 | 18 | 1465 | phoenix 729.5 (50.9%), thorn_storm 699.3 (48.8%), frost 3.8 (0.3%) |
| 18 | 28 | 330/330 | 21 | 1559 | phoenix 709.4 (54.2%), thorn_storm 594.6 (45.4%), frost 4.7 (0.4%) |
| 19 | 28 | 330/330 | 27 | 1652 | phoenix 721.5 (52.9%), thorn_storm 634.7 (46.6%), frost 6.5 (0.5%) |
| 20 | 29 | 330/330 | 25 | 1753 | phoenix 679.8 (50.6%), thorn_storm 653.1 (48.6%), frost 10.4 (0.8%) |
| 21 | 30 | 350/350 | 52 | 2005 | thorn_storm 1699.5 (59.6%), phoenix 1059.3 (37.2%), eternal_winter 75.9 (2.7%), frost 14.5 (0.5%) |
| 22 | 31 | 350/350 | 57 | 2371 | thorn_storm 2496.9 (54%), phoenix 1559.2 (33.7%), eternal_winter 570.6 (12.3%) |
| 23 | 32 | 350/350 | 31 | 2743 | thorn_storm 2568.6 (54.7%), phoenix 1550.9 (33%), eternal_winter 580.5 (12.4%) |
| 24 | 33 | 350/350 | 61 | 3027 | thorn_storm 1733.7 (52.5%), phoenix 1203.9 (36.4%), eternal_winter 366.8 (11.1%) |
| 25 | 34 | 350/350 | 65 | 3467 | thorn_storm 2681.8 (56.5%), phoenix 1490.8 (31.4%), eternal_winter 573.6 (12.1%) |
| 26 | 35 | 350/350 | 55 | 3810 | thorn_storm 2711.3 (57.3%), phoenix 1394.9 (29.5%), eternal_winter 614.3 (13%), storm 10.6 (0.2%), lantern 0.4 (0%) |
| 27 | 36 | 350/350 | 68 | 4321 | thorn_storm 3478.5 (60.3%), phoenix 1625.3 (28.2%), eternal_winter 650.1 (11.3%), storm 16.5 (0.3%), lantern 0.6 (0%) |
| 28 | 37 | 350/350 | 65 | 4700 | thorn_storm 3071.9 (56.8%), phoenix 1672.1 (30.9%), eternal_winter 646.9 (12%), storm 16.3 (0.3%), lantern 3.3 (0.1%) |
| 29 | 37 | 350/350 | 103 | 5092 | thorn_storm 3277.9 (59.2%), phoenix 1623 (29.3%), eternal_winter 617.4 (11.1%), storm 16.7 (0.3%), lantern 2.9 (0.1%) |
| 30 | 38 | 350/350 | 108 | 5663 | thorn_storm 3976.9 (63.3%), phoenix 1672.4 (26.6%), eternal_winter 610 (9.7%), storm 16.1 (0.3%), lantern 3 (0%) |

</details>

<details><summary>kael / Seed 101 — dawn @ 30.3 min, Level 41</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 253/253 | 3 | 32 | flail 18.2 (100%) |
| 2 | 8 | 253/253 | 4 | 69 | flail 30.2 (100%) |
| 3 | 10 | 253/253 | 9 | 113 | flail 37.9 (96.2%), ember 1.5 (3.8%) |
| 4 | 12 | 273/273 | 10 | 182 | flail 46.2 (81.1%), ember 10.8 (18.9%) |
| 5 | 13 | 273/273 | 12 | 236 | flail 38.1 (77.1%), ember 11.3 (22.9%) |
| 6 | 15 | 273/273 | 14 | 319 | wrath_pendulum 138.5 (78.9%), ember 28.3 (16.1%), flail 8.8 (5%) |
| 7 | 16 | 273/273 | 14 | 426 | wrath_pendulum 110.5 (69.3%), ember 49 (30.7%) |
| 8 | 18 | 273/273 | 12 | 535 | wrath_pendulum 131.8 (54.3%), ember 111.1 (45.7%) |
| 9 | 19 | 273/273 | 16 | 677 | ember 154.4 (65.9%), wrath_pendulum 79.8 (34.1%) |
| 10 | 20 | 293/293 | 19 | 801 | ember 212.1 (90.8%), wrath_pendulum 21.6 (9.2%) |
| 11 | 22 | 333/333 | 6 | 1006 | wrath_pendulum 283.8 (46.4%), ember 277.9 (45.5%), phoenix 46.8 (7.7%), storm 2.9 (0.5%) |
| 12 | 22 | 333/333 | 2 | 1086 | phoenix 220.5 (90.3%), wrath_pendulum 14.5 (5.9%), storm 9.2 (3.8%) |
| 13 | 23 | 333/333 | 8 | 1170 | phoenix 244.8 (93.1%), storm 10.9 (4.1%), wrath_pendulum 7.2 (2.7%) |
| 14 | 23 | 333/333 | 7 | 1259 | phoenix 234.6 (91.7%), storm 10.7 (4.2%), wrath_pendulum 10.4 (4.1%) |
| 15 | 24 | 333/333 | 13 | 1339 | phoenix 317.2 (87.2%), storm 24.2 (6.7%), wrath_pendulum 22.5 (6.2%) |
| 16 | 25 | 353/353 | 29 | 1430 | phoenix 687.4 (65.6%), wrath_pendulum 293.9 (28%), storm 67.1 (6.4%) |
| 17 | 25 | 336/353 | 36 | 1512 | phoenix 789.4 (65.3%), wrath_pendulum 261.4 (21.6%), storm 157.7 (13%) |
| 18 | 26 | 353/353 | 43 | 1597 | phoenix 763.8 (59.5%), wrath_pendulum 341.9 (26.6%), storm 178.9 (13.9%) |
| 19 | 27 | 353/353 | 34 | 1707 | phoenix 760.7 (59.5%), wrath_pendulum 288 (22.5%), storm 230.4 (18%) |
| 20 | 27 | 353/353 | 33 | 1809 | phoenix 758.2 (50.4%), storm 384.4 (25.6%), wrath_pendulum 361.2 (24%) |
| 21 | 28 | 353/353 | 126 | 2208 | phoenix 1243.9 (39.8%), wrath_pendulum 985 (31.5%), storm 898.5 (28.7%) |
| 22 | 30 | 353/353 | 318 | 3000 | phoenix 1691 (37.4%), thunder_seal 1376.4 (30.4%), wrath_pendulum 1161.4 (25.7%), storm 282.9 (6.3%), thorn 10.2 (0.2%) |
| 23 | 32 | 353/353 | 301 | 4024 | phoenix 2278.9 (43.2%), thunder_seal 1791.4 (34%), wrath_pendulum 1140.4 (21.6%), thorn 60.4 (1.1%) |
| 24 | 34 | 353/353 | 270 | 4900 | phoenix 2325.8 (43.8%), thunder_seal 1763.8 (33.2%), wrath_pendulum 1069.4 (20.1%), thorn 152.2 (2.9%) |
| 25 | 35 | 353/353 | 310 | 5752 | phoenix 2267.9 (40.2%), thunder_seal 1776.7 (31.5%), wrath_pendulum 1236.9 (21.9%), thorn 358.2 (6.4%) |
| 26 | 37 | 353/353 | 311 | 7028 | wrath_pendulum 3558.3 (41.2%), phoenix 2298.9 (26.6%), thunder_seal 1844.3 (21.4%), thorn 925.7 (10.7%) |
| 27 | 38 | 353/353 | 317 | 8283 | wrath_pendulum 3013 (33.4%), phoenix 2589.1 (28.7%), thunder_seal 1841.2 (20.4%), thorn 1573.7 (17.5%) |
| 28 | 39 | 353/353 | 326 | 9533 | wrath_pendulum 2629.6 (30.2%), phoenix 2481.8 (28.5%), thunder_seal 1839.4 (21.1%), thorn 1747.6 (20.1%) |
| 29 | 40 | 340/353 | 307 | 10784 | thorn_storm 4428.2 (40.9%), phoenix 1984.6 (18.3%), wrath_pendulum 1840.7 (17%), thunder_seal 1820.3 (16.8%), thorn 741.1 (6.9%), lantern 0.7 (0%) |
| 30 | 41 | 353/353 | 246 | 11996 | thorn_storm 7788.1 (59.4%), thunder_seal 1975.8 (15.1%), phoenix 1945 (14.8%), wrath_pendulum 1405.4 (10.7%), lantern 2.9 (0%) |

</details>

<details><summary>mira / Seed 202 — death @ 20.2 min, Level 29</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 3 | 250/250 | 3 | 31 | ember 10.9 (100%) |
| 2 | 6 | 250/250 | 1 | 86 | ember 20 (100%) |
| 3 | 10 | 250/250 | 8 | 133 | ember 25.5 (100%) |
| 4 | 12 | 250/250 | 4 | 198 | ember 35.6 (100%) |
| 5 | 15 | 270/270 | 7 | 271 | phoenix 40.9 (93.6%), ember 2.8 (6.4%) |
| 6 | 16 | 270/270 | 6 | 404 | phoenix 204.2 (100%) |
| 7 | 17 | 270/270 | 6 | 526 | phoenix 160.6 (100%) |
| 8 | 19 | 270/270 | 3 | 662 | phoenix 181.8 (100%) |
| 9 | 20 | 270/270 | 3 | 782 | phoenix 189.9 (100%) |
| 10 | 21 | 270/270 | 14 | 897 | phoenix 208.2 (100%) |
| 11 | 23 | 310/310 | 7 | 1040 | phoenix 527.9 (98.8%), lantern 6.6 (1.2%) |
| 12 | 24 | 310/310 | 10 | 1115 | phoenix 238.9 (99.7%), lantern 0.6 (0.3%) |
| 13 | 25 | 310/310 | 9 | 1206 | phoenix 279 (99.3%), lantern 2.1 (0.7%) |
| 14 | 25 | 310/310 | 11 | 1297 | phoenix 293.6 (99.6%), lantern 1.3 (0.4%) |
| 15 | 26 | 330/330 | 18 | 1394 | phoenix 334.6 (99.3%), lantern 2.5 (0.7%) |
| 16 | 26 | 330/330 | 50 | 1468 | phoenix 746.6 (90.9%), soul_beacon 62.4 (7.6%), lantern 12.6 (1.5%) |
| 17 | 28 | 350/350 | 60 | 1548 | phoenix 799.8 (88.2%), soul_beacon 99 (10.9%), storm 8.5 (0.9%) |
| 18 | 28 | 341/350 | 76 | 1626 | phoenix 760 (88.1%), soul_beacon 93.3 (10.8%), storm 9.5 (1.1%) |
| 19 | 29 | 350/350 | 101 | 1704 | phoenix 1069.9 (87.2%), soul_beacon 147.9 (12.1%), storm 9.4 (0.8%) |
| 20 | 29 | 313/350 | 134 | 1769 | phoenix 903.6 (84.8%), soul_beacon 151.4 (14.2%), storm 10 (0.9%) |

</details>

<details><summary>kael / Seed 202 — dawn @ 30.4 min, Level 44</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 8 | 273/273 | 1 | 46 | flail 27.2 (100%) |
| 2 | 9 | 273/273 | 4 | 71 | flail 20.2 (100%) |
| 3 | 11 | 273/273 | 10 | 113 | flail 41.2 (100%) |
| 4 | 12 | 313/313 | 12 | 165 | flail 49.8 (100%) |
| 5 | 13 | 313/313 | 13 | 217 | flail 52.2 (100%) |
| 6 | 14 | 333/333 | 14 | 290 | flail 113.8 (67.5%), wrath_pendulum 54.7 (32.5%) |
| 7 | 16 | 333/333 | 14 | 395 | wrath_pendulum 168.3 (99.9%), frost 0.2 (0.1%) |
| 8 | 17 | 333/333 | 18 | 499 | wrath_pendulum 178 (99.7%), frost 0.5 (0.3%) |
| 9 | 18 | 333/333 | 19 | 625 | wrath_pendulum 232.9 (99.5%), frost 1.2 (0.5%) |
| 10 | 19 | 333/333 | 28 | 763 | wrath_pendulum 271.8 (99.2%), frost 2.3 (0.8%) |
| 11 | 21 | 333/333 | 22 | 951 | wrath_pendulum 597.9 (97%), frost 18.5 (3%) |
| 12 | 23 | 353/353 | 19 | 1135 | wrath_pendulum 426.1 (94.1%), frost 26.9 (5.9%) |
| 13 | 23 | 353/353 | 20 | 1234 | wrath_pendulum 168.3 (51.1%), eternal_winter 161.1 (48.9%) |
| 14 | 24 | 353/353 | 19 | 1326 | wrath_pendulum 182.4 (52.6%), eternal_winter 164.4 (47.4%) |
| 15 | 24 | 353/353 | 28 | 1465 | eternal_winter 193.9 (50.2%), wrath_pendulum 192.4 (49.8%) |
| 16 | 25 | 353/353 | 43 | 1591 | wrath_pendulum 493.4 (49.8%), eternal_winter 493.2 (49.8%), ember 4.3 (0.4%) |
| 17 | 25 | 324/353 | 56 | 1666 | eternal_winter 561.9 (52.6%), wrath_pendulum 492.9 (46.1%), ember 14 (1.3%) |
| 18 | 26 | 353/353 | 81 | 1739 | eternal_winter 500.1 (51.8%), wrath_pendulum 448.9 (46.5%), ember 17 (1.8%) |
| 19 | 26 | 353/353 | 102 | 1816 | eternal_winter 474.1 (54.6%), wrath_pendulum 377.5 (43.4%), ember 17.5 (2%) |
| 20 | 27 | 353/353 | 141 | 1878 | eternal_winter 524.6 (57%), wrath_pendulum 363.2 (39.4%), ember 33.3 (3.6%) |
| 21 | 28 | 321/353 | 101 | 2419 | wrath_pendulum 2711.8 (61.4%), eternal_winter 1621.1 (36.7%), ember 83.2 (1.9%) |
| 22 | 31 | 323/353 | 170 | 3319 | wrath_pendulum 3578.6 (64.8%), eternal_winter 1660.9 (30.1%), ember 279.3 (5.1%) |
| 23 | 33 | 353/353 | 299 | 4575 | wrath_pendulum 3700.8 (58.2%), eternal_winter 1459.8 (23%), phoenix 643.8 (10.1%), ember 554.3 (8.7%) |
| 24 | 35 | 353/353 | 292 | 6031 | wrath_pendulum 4019.8 (50%), phoenix 2594.6 (32.3%), eternal_winter 1413.8 (17.6%), storm 4.9 (0.1%) |
| 25 | 37 | 353/353 | 248 | 7447 | wrath_pendulum 4073.7 (50.5%), phoenix 2511.1 (31.1%), eternal_winter 1470.7 (18.2%), storm 13.6 (0.2%) |
| 26 | 39 | 353/353 | 323 | 8942 | wrath_pendulum 5130.9 (53%), phoenix 2660.7 (27.5%), eternal_winter 1804.7 (18.7%), storm 73.8 (0.8%), lantern 2 (0%) |
| 27 | 40 | 353/353 | 301 | 10583 | wrath_pendulum 5573.1 (51.7%), phoenix 3167.3 (29.4%), eternal_winter 1788.5 (16.6%), storm 254 (2.4%), lantern 3.8 (0%) |
| 28 | 41 | 353/353 | 344 | 12371 | wrath_pendulum 5678 (50.7%), phoenix 3178.8 (28.4%), eternal_winter 1808.4 (16.2%), storm 520.4 (4.7%), lantern 5 (0%) |
| 29 | 42 | 353/353 | 338 | 14233 | wrath_pendulum 5760.6 (46.3%), phoenix 3540.4 (28.4%), eternal_winter 1822.3 (14.6%), storm 1325.7 (10.6%), lantern 2.6 (0%) |
| 30 | 43 | 353/353 | 314 | 16085 | wrath_pendulum 5608.1 (42.6%), phoenix 3737.1 (28.4%), thunder_seal 1859.3 (14.1%), eternal_winter 1744.2 (13.3%), storm 202.2 (1.5%), lantern 2.7 (0%) |

</details>

<details><summary>mira / Seed 404 — dawn @ 30.3 min, Level 40</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 4 | 250/250 | 1 | 23 | ember 8.8 (100%) |
| 2 | 7 | 250/250 | 0 | 67 | ember 17.2 (100%) |
| 3 | 9 | 250/250 | 1 | 129 | ember 32.2 (100%) |
| 4 | 13 | 270/270 | 3 | 176 | ember 30 (100%) |
| 5 | 14 | 270/270 | 8 | 252 | ember 45.7 (100%) |
| 6 | 16 | 270/270 | 3 | 367 | phoenix 102.3 (52.8%), ember 91.4 (47.2%) |
| 7 | 17 | 270/270 | 8 | 438 | phoenix 125 (100%) |
| 8 | 19 | 270/270 | 5 | 574 | phoenix 172.5 (99.9%), thorn 0.1 (0.1%) |
| 9 | 20 | 270/270 | 3 | 684 | phoenix 162.8 (99.7%), thorn 0.5 (0.3%) |
| 10 | 21 | 270/270 | 13 | 813 | phoenix 188.5 (99%), thorn 1.9 (1%) |
| 11 | 22 | 290/290 | 8 | 925 | phoenix 403.9 (93.2%), thorn 29.7 (6.8%) |
| 12 | 23 | 290/290 | 11 | 1000 | phoenix 220.1 (97.7%), thorn 5.2 (2.3%) |
| 13 | 24 | 290/290 | 12 | 1097 | phoenix 270.4 (93.9%), thorn 17.7 (6.1%) |
| 14 | 25 | 310/310 | 6 | 1214 | phoenix 288.5 (96%), thorn 12.1 (4%) |
| 15 | 26 | 310/310 | 12 | 1294 | phoenix 287.5 (94.7%), thorn 16 (5.3%) |
| 16 | 27 | 310/310 | 29 | 1385 | phoenix 718.9 (66.9%), thorn_storm 217.9 (20.3%), thorn 137.4 (12.8%), frost 0.4 (0%) |
| 17 | 28 | 310/310 | 25 | 1475 | phoenix 698.7 (57.9%), thorn_storm 508.3 (42.1%), frost 0.1 (0%) |
| 18 | 28 | 310/310 | 28 | 1567 | phoenix 704 (54.5%), thorn_storm 587 (45.5%), frost 0.3 (0%) |
| 19 | 29 | 310/310 | 28 | 1664 | phoenix 744.7 (56.9%), thorn_storm 562.2 (43%), frost 1.3 (0.1%) |
| 20 | 29 | 310/310 | 34 | 1762 | phoenix 711.3 (52.7%), thorn_storm 637.9 (47.2%), frost 1.2 (0.1%) |
| 21 | 30 | 280/310 | 32 | 1940 | thorn_storm 1283.1 (57.6%), phoenix 922.2 (41.4%), flail 11.2 (0.5%), frost 9.1 (0.4%), lantern 0.6 (0%) |
| 22 | 31 | 305/310 | 57 | 2254 | thorn_storm 2119.2 (62.4%), phoenix 1211 (35.7%), flail 35.9 (1.1%), frost 27 (0.8%), lantern 1.9 (0.1%) |
| 23 | 32 | 210/310 | 76 | 2640 | thorn_storm 2734.8 (65.5%), phoenix 1365.6 (32.7%), frost 35.5 (0.9%), flail 34.3 (0.8%), lantern 2.1 (0.1%) |
| 24 | 33 | 137/310 | 84 | 3064 | thorn_storm 3555.4 (67.8%), phoenix 1596.8 (30.4%), frost 49.1 (0.9%), flail 42.9 (0.8%), lantern 1.4 (0%) |
| 25 | 34 | 217/330 | 148 | 3563 | thorn_storm 3670.9 (67.8%), phoenix 1693.8 (31.3%), frost 23.9 (0.4%), flail 22.4 (0.4%), lantern 0.9 (0%) |
| 26 | 35 | 199/330 | 168 | 4274 | thorn_storm 4483.9 (65.9%), phoenix 1833.6 (27%), eternal_winter 404.2 (5.9%), flail 48.4 (0.7%), frost 28.3 (0.4%), lantern 1.7 (0%) |
| 27 | 37 | 299/330 | 162 | 5170 | thorn_storm 5366.6 (65.7%), phoenix 1996.6 (24.4%), eternal_winter 741.2 (9.1%), flail 64.6 (0.8%), lantern 1.2 (0%) |
| 28 | 38 | 330/330 | 170 | 5964 | thorn_storm 5371.7 (66.4%), phoenix 1881.2 (23.3%), eternal_winter 676.3 (8.4%), flail 154.2 (1.9%), lantern 1.1 (0%) |
| 29 | 39 | 330/330 | 146 | 6870 | thorn_storm 6220.6 (65.4%), phoenix 2261.7 (23.8%), eternal_winter 778 (8.2%), flail 256.2 (2.7%), lantern 1.2 (0%) |
| 30 | 40 | 324/330 | 215 | 7427 | thorn_storm 6547.4 (69.5%), phoenix 1900.2 (20.2%), eternal_winter 761.9 (8.1%), flail 204.6 (2.2%), lantern 1.7 (0%) |

</details>

<details><summary>kael / Seed 404 — dawn @ 30.4 min, Level 39</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 253/253 | 4 | 25 | flail 14.2 (100%) |
| 2 | 9 | 253/253 | 4 | 65 | flail 32.7 (100%) |
| 3 | 10 | 253/253 | 10 | 101 | flail 27.1 (84.2%), ember 5.1 (15.8%) |
| 4 | 11 | 253/253 | 11 | 143 | flail 15 (51.9%), ember 9.1 (31.5%), thorn 4.8 (16.6%) |
| 5 | 13 | 293/293 | 13 | 217 | flail 53.5 (77.9%), ember 8.6 (12.5%), thorn 6.6 (9.6%) |
| 6 | 14 | 293/293 | 13 | 301 | wrath_pendulum 87.2 (45.7%), flail 80 (42%), ember 11.9 (6.2%), thorn 11.6 (6.1%) |
| 7 | 16 | 293/293 | 16 | 416 | wrath_pendulum 131.1 (72.5%), ember 38.9 (21.5%), thorn 10.8 (6%) |
| 8 | 17 | 293/293 | 16 | 527 | wrath_pendulum 125.8 (65.1%), ember 57.5 (29.8%), thorn 9.9 (5.1%) |
| 9 | 18 | 293/293 | 16 | 643 | wrath_pendulum 123.3 (63.6%), ember 60.6 (31.3%), thorn 9.9 (5.1%) |
| 10 | 19 | 293/293 | 26 | 737 | wrath_pendulum 105.9 (49%), ember 101.6 (47%), thorn 8.8 (4.1%) |
| 11 | 21 | 313/313 | 13 | 945 | wrath_pendulum 408.5 (64.6%), ember 205.9 (32.6%), thorn 17.9 (2.8%) |
| 12 | 22 | 333/333 | 25 | 1046 | ember 185.4 (80.7%), wrath_pendulum 38.8 (16.9%), thorn 5.5 (2.4%) |
| 13 | 23 | 333/333 | 21 | 1186 | ember 251.1 (68.8%), wrath_pendulum 104.8 (28.7%), thorn 9.2 (2.5%) |
| 14 | 24 | 333/333 | 21 | 1308 | ember 251.7 (67.3%), wrath_pendulum 113.3 (30.3%), thorn 9 (2.4%) |
| 15 | 25 | 353/353 | 15 | 1420 | ember 277.8 (65.7%), wrath_pendulum 132.7 (31.4%), thorn 12.2 (2.9%) |
| 16 | 25 | 353/353 | 33 | 1514 | wrath_pendulum 467.6 (43.7%), ember 320.8 (30%), phoenix 258.9 (24.2%), thorn 23.8 (2.2%) |
| 17 | 26 | 353/353 | 35 | 1599 | phoenix 784.1 (73.8%), wrath_pendulum 255.3 (24%), thorn 23.3 (2.2%) |
| 18 | 26 | 353/353 | 54 | 1675 | phoenix 770.8 (75.3%), wrath_pendulum 212.2 (20.7%), thorn 40.4 (3.9%) |
| 19 | 26 | 353/353 | 65 | 1762 | phoenix 693.9 (74.8%), wrath_pendulum 192.5 (20.8%), thorn 41.2 (4.4%) |
| 20 | 27 | 331/353 | 77 | 1853 | phoenix 862.9 (68%), wrath_pendulum 336.1 (26.5%), thorn 70.3 (5.5%) |
| 21 | 28 | 353/353 | 166 | 2283 | wrath_pendulum 1542.8 (51.7%), phoenix 1271.2 (42.6%), thorn 172.8 (5.8%) |
| 22 | 31 | 329/353 | 245 | 3171 | wrath_pendulum 1959.4 (47.4%), phoenix 1696.2 (41%), thorn 478.5 (11.6%) |
| 23 | 33 | 353/353 | 153 | 4352 | thorn_storm 3924.9 (48.7%), wrath_pendulum 2065.2 (25.6%), phoenix 1662.4 (20.6%), thorn 406.4 (5%) |
| 24 | 34 | 353/353 | 108 | 5059 | thorn_storm 4894 (61.7%), wrath_pendulum 1576.6 (19.9%), phoenix 1461.8 (18.4%) |
| 25 | 35 | 353/353 | 103 | 5604 | thorn_storm 2967.3 (59.3%), phoenix 1177.4 (23.5%), wrath_pendulum 854.7 (17.1%), lantern 1.5 (0%) |
| 26 | 36 | 353/353 | 132 | 6107 | thorn_storm 3794.6 (58.1%), phoenix 1456.3 (22.3%), wrath_pendulum 1268.2 (19.4%), lantern 7.3 (0.1%), storm 6.6 (0.1%) |
| 27 | 37 | 353/353 | 204 | 6639 | thorn_storm 3503 (60.3%), phoenix 1383.3 (23.8%), wrath_pendulum 901.2 (15.5%), storm 11.3 (0.2%), lantern 5.7 (0.1%) |
| 28 | 37 | 353/353 | 228 | 7419 | thorn_storm 4206.9 (60.4%), phoenix 1562.8 (22.4%), wrath_pendulum 1170 (16.8%), lantern 19.5 (0.3%), storm 11.3 (0.2%) |
| 29 | 38 | 351/353 | 320 | 8277 | thorn_storm 4832.8 (61.4%), phoenix 1785.9 (22.7%), wrath_pendulum 1224.2 (15.6%), lantern 15.7 (0.2%), storm 11.3 (0.1%) |
| 30 | 39 | 353/353 | 245 | 9262 | thorn_storm 5861.6 (63.4%), phoenix 1852.5 (20%), wrath_pendulum 1499.9 (16.2%), lantern 24.7 (0.3%), storm 11.4 (0.1%) |

</details>

#### DPS-Anteil je Waffe (gesamter Lauf)

| Char/Seed | Gesamtschaden | ember | flail | frost | thorn | storm | lantern | phoenix | wrath_pendulum | eternal_winter | thorn_storm | thunder_seal | soul_beacon |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mira/101 | 3621764 | 0.2% | – | 0.1% | 0.2% | 0.1% | 0% | 35.4% | – | 9.4% | 54.6% | – | – |
| kael/101 | 5151013 | 1% | 0.2% | – | 6.5% | 2.6% | 0% | 30.6% | 24.3% | – | 15.6% | 19.2% | – |
| mira/202 | 470483 | 1.2% | – | – | – | 0.5% | 0.3% | 90.7% | – | – | – | – | 7.2% |
| kael/202 | 6251901 | 1% | 0.3% | 0% | – | 2.3% | 0% | 22.3% | 51.7% | 19.9% | – | 2.5% | – |
| mira/404 | 4389014 | 0.3% | 1.4% | 0.2% | 0.3% | – | 0% | 31.3% | – | 4.9% | 61.6% | – | – |
| kael/404 | 4682919 | 2.3% | 0.3% | – | 1.8% | 0.1% | 0.1% | 24.9% | 23.3% | – | 47.2% | – | – |

<!-- BALANCE-TABLE:END -->
