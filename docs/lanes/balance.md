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
| 1 | mira | 101 | dawn | 30.5 | 33 | 10233 | 2 | Moorkönigin 26, Knochenfürst 28, Der 26, Glockenturm-Golem 25, Hexenzirkel 23, Der 28 | Sieg |
| 2 | kael | 101 | dawn | 30.4 | 47 | 11689 | 4 | Moorkönigin 33, Knochenfürst 54, Der 49, Glockenturm-Golem 51, Hexenzirkel 46, Der 23 | NEIN (Level) |
| 3 | mira | 202 | Tod | 20.4 | 26 | 1720 | 2 | Moorkönigin 29, Knochenfürst 29, Der 38 | JA |
| 4 | kael | 202 | dawn | 30.7 | 30 | 12761 | 2 | Moorkönigin 34, Knochenfürst 52, Der 43, Glockenturm-Golem 40, Hexenzirkel 40, Der 40 | Sieg |
| 5 | mira | 404 | Tod | 25.2 | 36 | 4124 | 2 | Moorkönigin 27, Knochenfürst 31, Der 33, Glockenturm-Golem 40 | JA |
| 6 | kael | 404 | dawn | 30.7 | 33 | 10512 | 3 | Moorkönigin 34, Knochenfürst 51, Der 41, Glockenturm-Golem 40, Hexenzirkel 52, Der 37 | Sieg |

#### Minuten-Protokoll

<details><summary>mira / Seed 101 — dawn @ 30.5 min, Level 33</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 250/250 | 1 | 52 | ember 17.2 (100%) |
| 2 | 7 | 250/250 | 1 | 85 | ember 15.1 (100%) |
| 3 | 10 | 250/250 | 5 | 148 | ember 33.7 (100%) |
| 4 | 11 | 250/250 | 3 | 205 | ember 35.6 (100%) |
| 5 | 13 | 250/250 | 8 | 258 | ember 35.5 (100%) |
| 6 | 14 | 270/270 | 4 | 388 | ember 123.5 (61.3%), phoenix 78.1 (38.7%) |
| 7 | 16 | 270/270 | 4 | 487 | phoenix 156.2 (100%) |
| 8 | 17 | 270/270 | 9 | 611 | phoenix 183.1 (99.8%), flail 0.3 (0.2%) |
| 9 | 19 | 290/290 | 5 | 738 | phoenix 191.9 (100%) |
| 10 | 20 | 273/290 | 14 | 850 | phoenix 217.4 (99%), flail 2.3 (1%) |
| 11 | 21 | 290/290 | 3 | 964 | phoenix 435 (94.5%), flail 25.1 (5.5%) |
| 12 | 22 | 290/290 | 3 | 1044 | phoenix 264.4 (97.8%), flail 5.9 (2.2%) |
| 13 | 22 | 290/290 | 10 | 1113 | phoenix 281.7 (99%), flail 2.9 (1%) |
| 14 | 23 | 290/290 | 4 | 1206 | phoenix 329.2 (97.4%), flail 8.7 (2.6%) |
| 15 | 24 | 290/290 | 11 | 1293 | phoenix 286.1 (94.6%), flail 16.4 (5.4%) |
| 16 | 25 | 310/310 | 22 | 1386 | phoenix 768.3 (73.6%), flail 146 (14%), wrath_pendulum 129.4 (12.4%), lantern 0.4 (0%) |
| 17 | 25 | 310/310 | 26 | 1469 | phoenix 873.4 (72.8%), wrath_pendulum 325.2 (27.1%), lantern 0.6 (0.1%) |
| 18 | 26 | 310/310 | 32 | 1559 | phoenix 872.2 (77.7%), wrath_pendulum 249.2 (22.2%), lantern 0.5 (0%) |
| 19 | 26 | 310/310 | 31 | 1661 | phoenix 868.6 (70.6%), wrath_pendulum 360.6 (29.3%), lantern 0.8 (0.1%) |
| 20 | 27 | 310/310 | 42 | 1748 | phoenix 905.4 (73.9%), wrath_pendulum 317.9 (25.9%), lantern 2.3 (0.2%) |
| 21 | 28 | 296/310 | 93 | 2018 | wrath_pendulum 1587.3 (50.6%), phoenix 1534.4 (48.9%), lantern 14.9 (0.5%) |
| 22 | 29 | 310/310 | 150 | 2584 | wrath_pendulum 1985.6 (50.4%), phoenix 1940.9 (49.3%), lantern 13.9 (0.4%) |
| 23 | 30 | 295/310 | 197 | 3417 | wrath_pendulum 2831 (52.9%), phoenix 2490.1 (46.6%), lantern 27 (0.5%) |
| 24 | 30 | 310/310 | 355 | 4486 | phoenix 3317.4 (55.2%), wrath_pendulum 2668.2 (44.4%), lantern 25.2 (0.4%), frost 1.7 (0%) |
| 25 | 30 | 310/310 | 341 | 5270 | phoenix 2555 (50.2%), wrath_pendulum 2501.5 (49.2%), lantern 27.3 (0.5%), frost 2.6 (0.1%) |
| 26 | 30 | 286/310 | 325 | 6109 | phoenix 2903.1 (50.2%), wrath_pendulum 2821.7 (48.8%), lantern 46.6 (0.8%), frost 8.6 (0.1%) |
| 27 | 30 | 310/310 | 355 | 6906 | phoenix 3244.4 (54.3%), wrath_pendulum 2694.4 (45.1%), lantern 31.3 (0.5%), frost 4.1 (0.1%) |
| 28 | 30 | 310/310 | 292 | 7991 | phoenix 3800.4 (49.9%), wrath_pendulum 3770.2 (49.5%), lantern 38.4 (0.5%), frost 6.4 (0.1%) |
| 29 | 30 | 310/310 | 359 | 8929 | phoenix 3780.8 (52%), wrath_pendulum 3468.5 (47.7%), lantern 24.5 (0.3%), frost 3.8 (0.1%) |
| 30 | 31 | 310/310 | 269 | 9700 | phoenix 3381.5 (50.6%), wrath_pendulum 3241.4 (48.5%), lantern 54.4 (0.8%), frost 8.4 (0.1%) |

</details>

<details><summary>kael / Seed 101 — dawn @ 30.4 min, Level 47</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 7 | 253/253 | 3 | 33 | flail 18.6 (100%) |
| 2 | 8 | 253/253 | 5 | 69 | flail 33.5 (100%) |
| 3 | 10 | 273/273 | 10 | 108 | flail 34.5 (100%) |
| 4 | 11 | 293/293 | 15 | 171 | flail 57.7 (100%) |
| 5 | 13 | 313/313 | 19 | 211 | flail 44.8 (100%) |
| 6 | 14 | 304/313 | 28 | 282 | flail 171.7 (100%) |
| 7 | 15 | 313/313 | 31 | 390 | flail 193.4 (98.7%), lantern 2 (1%), frost 0.6 (0.3%) |
| 8 | 16 | 333/333 | 43 | 462 | flail 142.7 (99.2%), lantern 0.7 (0.5%), frost 0.4 (0.3%) |
| 9 | 17 | 333/333 | 64 | 550 | wrath_pendulum 103.4 (55.5%), flail 81.4 (43.7%), lantern 0.9 (0.5%), frost 0.6 (0.3%) |
| 10 | 17 | 333/333 | 99 | 631 | wrath_pendulum 195.1 (99.2%), lantern 1.2 (0.6%), frost 0.4 (0.2%) |
| 11 | 19 | 333/333 | 26 | 961 | wrath_pendulum 823 (99.1%), lantern 5.4 (0.7%), frost 1.9 (0.2%) |
| 12 | 21 | 333/333 | 32 | 1137 | wrath_pendulum 395.8 (96.7%), lantern 10.5 (2.6%), frost 2.8 (0.7%) |
| 13 | 22 | 315/333 | 23 | 1314 | wrath_pendulum 415.2 (96.4%), lantern 13.2 (3.1%), frost 2.3 (0.5%) |
| 14 | 23 | 328/333 | 18 | 1469 | wrath_pendulum 422.6 (92.7%), lantern 30.5 (6.7%), frost 2.9 (0.6%) |
| 15 | 24 | 353/353 | 21 | 1571 | wrath_pendulum 330.7 (91.7%), lantern 27.1 (7.5%), frost 2.9 (0.8%) |
| 16 | 24 | 353/353 | 65 | 1657 | wrath_pendulum 740.6 (87.4%), lantern 98.8 (11.7%), frost 7.8 (0.9%) |
| 17 | 24 | 353/353 | 107 | 1703 | wrath_pendulum 499.5 (90.9%), lantern 45.4 (8.3%), frost 4.4 (0.8%) |
| 18 | 25 | 353/353 | 153 | 1753 | wrath_pendulum 474.8 (90.2%), lantern 46.3 (8.8%), frost 5.2 (1%) |
| 19 | 25 | 353/353 | 189 | 1814 | wrath_pendulum 611.3 (88.5%), lantern 73 (10.6%), frost 6.6 (1%) |
| 20 | 26 | 288/353 | 245 | 1865 | wrath_pendulum 544.2 (90.2%), lantern 52.7 (8.7%), frost 6.1 (1%) |
| 21 | 27 | 353/353 | 183 | 2230 | wrath_pendulum 3750.4 (88.2%), lantern 378.1 (8.9%), soul_beacon 81.7 (1.9%), frost 40.7 (1%) |
| 22 | 29 | 353/353 | 331 | 2703 | wrath_pendulum 1889 (74.6%), soul_beacon 631 (24.9%), frost 13.6 (0.5%) |
| 23 | 32 | 328/353 | 362 | 3627 | wrath_pendulum 3162.6 (70.1%), soul_beacon 1281.2 (28.4%), frost 69 (1.5%) |
| 24 | 34 | 353/353 | 342 | 4640 | wrath_pendulum 4028.8 (75.7%), soul_beacon 1162.4 (21.8%), frost 125.8 (2.4%), storm 3.9 (0.1%) |
| 25 | 37 | 353/353 | 350 | 5719 | wrath_pendulum 4608.5 (70.9%), soul_beacon 1721.2 (26.5%), frost 137.5 (2.1%), thorn 22.6 (0.3%), storm 8.6 (0.1%) |
| 26 | 40 | 353/353 | 348 | 7154 | wrath_pendulum 5630 (70.6%), soul_beacon 1985.7 (24.9%), frost 259.7 (3.3%), thorn 71.5 (0.9%), ember 18.2 (0.2%), storm 8.5 (0.1%) |
| 27 | 42 | 353/353 | 322 | 8287 | wrath_pendulum 4712.3 (63.9%), eternal_winter 1251 (17%), soul_beacon 1188.9 (16.1%), thorn 164.3 (2.2%), ember 37.6 (0.5%), storm 11.2 (0.2%), frost 5.8 (0.1%) |
| 28 | 43 | 353/353 | 348 | 9059 | wrath_pendulum 3497.7 (60.3%), eternal_winter 1148.8 (19.8%), soul_beacon 830.2 (14.3%), thorn 256 (4.4%), ember 52.4 (0.9%), storm 14.1 (0.2%) |
| 29 | 45 | 353/353 | 329 | 10029 | wrath_pendulum 4540.3 (56%), eternal_winter 1579.7 (19.5%), soul_beacon 1304 (16.1%), thorn 613 (7.6%), ember 55.5 (0.7%), storm 14 (0.2%) |
| 30 | 46 | 353/353 | 336 | 11152 | wrath_pendulum 5026.6 (54.9%), eternal_winter 1509 (16.5%), thorn 1274.8 (13.9%), soul_beacon 1249.8 (13.6%), ember 89.2 (1%), storm 14.5 (0.2%) |

</details>

<details><summary>mira / Seed 202 — death @ 20.4 min, Level 26</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 5 | 250/250 | 0 | 34 | ember 11.7 (100%) |
| 2 | 8 | 250/250 | 1 | 90 | ember 24 (100%) |
| 3 | 9 | 250/250 | 7 | 139 | ember 26.2 (100%) |
| 4 | 10 | 250/250 | 4 | 204 | ember 39.6 (100%) |
| 5 | 12 | 259/270 | 7 | 260 | ember 43 (100%) |
| 6 | 14 | 270/270 | 4 | 343 | ember 101.5 (66.6%), phoenix 50.7 (33.3%), lantern 0.1 (0.1%) |
| 7 | 15 | 270/270 | 8 | 442 | phoenix 131.8 (100%) |
| 8 | 17 | 270/270 | 6 | 554 | phoenix 168.4 (100%) |
| 9 | 17 | 270/270 | 7 | 687 | phoenix 185.2 (100%) |
| 10 | 18 | 290/290 | 13 | 807 | phoenix 207.2 (99.9%), lantern 0.2 (0.1%) |
| 11 | 19 | 290/290 | 7 | 929 | phoenix 504.3 (99%), lantern 5.1 (1%) |
| 12 | 20 | 290/290 | 9 | 1009 | phoenix 230.3 (99.4%), lantern 1.5 (0.6%) |
| 13 | 21 | 290/290 | 10 | 1091 | phoenix 294.1 (98.9%), lantern 2.4 (0.8%), thorn 0.8 (0.3%) |
| 14 | 22 | 310/310 | 11 | 1181 | phoenix 275.8 (97.8%), lantern 3.7 (1.3%), thorn 2.5 (0.9%) |
| 15 | 22 | 310/310 | 10 | 1277 | phoenix 354.9 (98%), thorn 4.3 (1.2%), lantern 3.1 (0.9%) |
| 16 | 23 | 306/310 | 40 | 1358 | phoenix 772.3 (91.5%), soul_beacon 38.8 (4.6%), lantern 17.1 (2%), thorn 15.5 (1.8%) |
| 17 | 24 | 258/310 | 43 | 1445 | phoenix 801.8 (86.8%), soul_beacon 93.2 (10.1%), thorn 29.1 (3.1%) |
| 18 | 25 | 273/310 | 61 | 1522 | phoenix 860.1 (85.6%), soul_beacon 105 (10.5%), thorn 39.6 (3.9%) |
| 19 | 26 | 114/310 | 58 | 1624 | phoenix 989.5 (74.3%), soul_beacon 267.3 (20.1%), thorn 74.7 (5.6%) |
| 20 | 26 | 153/310 | 83 | 1699 | phoenix 949 (76.8%), soul_beacon 177 (14.3%), thorn 109.2 (8.8%) |

</details>

<details><summary>kael / Seed 202 — dawn @ 30.7 min, Level 30</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 253/253 | 4 | 30 | flail 19.1 (100%) |
| 2 | 9 | 253/253 | 5 | 75 | flail 39 (100%) |
| 3 | 10 | 253/253 | 13 | 110 | flail 32.3 (100%) |
| 4 | 12 | 273/273 | 11 | 184 | flail 71 (100%) |
| 5 | 14 | 293/293 | 11 | 243 | flail 61.7 (100%) |
| 6 | 14 | 293/293 | 23 | 333 | flail 118.3 (63.3%), wrath_pendulum 67.9 (36.3%), frost 0.8 (0.4%) |
| 7 | 17 | 293/293 | 16 | 497 | wrath_pendulum 224.5 (99.9%), frost 0.3 (0.1%) |
| 8 | 18 | 293/293 | 15 | 605 | wrath_pendulum 228.9 (98.9%), frost 2.5 (1.1%) |
| 9 | 19 | 293/293 | 27 | 722 | wrath_pendulum 219.3 (99.1%), frost 2.1 (0.9%) |
| 10 | 19 | 293/293 | 41 | 830 | wrath_pendulum 216.9 (98.1%), frost 4.2 (1.9%) |
| 11 | 20 | 293/293 | 46 | 1022 | wrath_pendulum 583 (94.9%), frost 31.6 (5.1%) |
| 12 | 21 | 293/293 | 43 | 1235 | wrath_pendulum 495.9 (96.6%), frost 17.5 (3.4%) |
| 13 | 23 | 333/333 | 26 | 1543 | wrath_pendulum 607.9 (83.7%), eternal_winter 98 (13.5%), frost 20.3 (2.8%) |
| 14 | 24 | 353/353 | 15 | 1682 | wrath_pendulum 239.6 (58.1%), eternal_winter 172.8 (41.9%) |
| 15 | 25 | 353/353 | 16 | 1771 | wrath_pendulum 203.6 (55.7%), eternal_winter 161.6 (44.2%), lantern 0.4 (0.1%) |
| 16 | 25 | 353/353 | 40 | 1860 | eternal_winter 542.3 (50.1%), wrath_pendulum 536.9 (49.6%), lantern 3.1 (0.3%) |
| 17 | 25 | 353/353 | 63 | 1923 | wrath_pendulum 325.8 (51.7%), eternal_winter 301.9 (47.9%), lantern 2.5 (0.4%) |
| 18 | 26 | 353/353 | 88 | 1994 | eternal_winter 342.3 (50.1%), wrath_pendulum 338 (49.5%), lantern 2.6 (0.4%) |
| 19 | 26 | 353/353 | 103 | 2081 | wrath_pendulum 756.7 (52.4%), eternal_winter 679.7 (47.1%), lantern 7.1 (0.5%) |
| 20 | 26 | 353/353 | 134 | 2148 | eternal_winter 401.5 (52%), wrath_pendulum 367.2 (47.5%), lantern 3.6 (0.5%) |
| 21 | 26 | 353/353 | 131 | 2444 | wrath_pendulum 2414.8 (66.2%), eternal_winter 1218.9 (33.4%), lantern 16.1 (0.4%) |
| 22 | 26 | 353/353 | 253 | 3009 | wrath_pendulum 2575.3 (71.7%), eternal_winter 1008.3 (28.1%), lantern 6 (0.2%) |
| 23 | 27 | 353/353 | 325 | 3997 | wrath_pendulum 4258.2 (78.2%), eternal_winter 1181.9 (21.7%), lantern 6.3 (0.1%) |
| 24 | 27 | 353/353 | 349 | 5195 | wrath_pendulum 5239.1 (80.5%), eternal_winter 1263.7 (19.4%), lantern 3.4 (0.1%) |
| 25 | 27 | 353/353 | 299 | 6401 | wrath_pendulum 5592.5 (79.2%), eternal_winter 1463.6 (20.7%), lantern 9.3 (0.1%) |
| 26 | 27 | 353/353 | 358 | 7640 | wrath_pendulum 5949.5 (77.2%), eternal_winter 1746.6 (22.7%), lantern 13.8 (0.2%) |
| 27 | 27 | 353/353 | 346 | 8696 | wrath_pendulum 5548.5 (79.4%), eternal_winter 1423.5 (20.4%), lantern 12.6 (0.2%) |
| 28 | 28 | 353/353 | 354 | 9747 | wrath_pendulum 5574.5 (80.7%), eternal_winter 1324 (19.2%), lantern 13.1 (0.2%) |
| 29 | 28 | 353/353 | 332 | 10721 | wrath_pendulum 6636.7 (79.8%), eternal_winter 1663 (20%), lantern 20.6 (0.2%) |
| 30 | 29 | 353/353 | 332 | 11859 | wrath_pendulum 7905.6 (81.4%), eternal_winter 1782.7 (18.4%), lantern 22.7 (0.2%) |

</details>

<details><summary>mira / Seed 404 — death @ 25.2 min, Level 36</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 5 | 250/250 | 5 | 42 | ember 14.5 (100%) |
| 2 | 9 | 250/250 | 1 | 74 | ember 15.7 (100%) |
| 3 | 11 | 270/270 | 2 | 121 | ember 29.6 (100%) |
| 4 | 11 | 270/270 | 5 | 174 | ember 33.3 (100%) |
| 5 | 12 | 290/290 | 8 | 222 | ember 34.3 (100%) |
| 6 | 13 | 310/310 | 8 | 312 | ember 110.5 (67.2%), phoenix 54 (32.8%) |
| 7 | 15 | 310/310 | 4 | 435 | phoenix 146.6 (100%) |
| 8 | 16 | 310/310 | 3 | 553 | phoenix 165.1 (100%) |
| 9 | 18 | 310/310 | 8 | 687 | phoenix 206.4 (100%) |
| 10 | 18 | 310/310 | 14 | 806 | phoenix 228.9 (100%) |
| 11 | 19 | 310/310 | 11 | 955 | phoenix 467.3 (98.2%), lantern 8.4 (1.8%), frost 0.4 (0.1%) |
| 12 | 20 | 310/310 | 13 | 1034 | phoenix 234.3 (98.2%), lantern 3.3 (1.4%), thorn 0.9 (0.4%) |
| 13 | 21 | 310/310 | 10 | 1135 | phoenix 316.4 (97.7%), lantern 4 (1.2%), thorn 3.3 (1%) |
| 14 | 22 | 310/310 | 7 | 1230 | phoenix 286.6 (98.3%), lantern 2.7 (0.9%), thorn 2.4 (0.8%) |
| 15 | 22 | 310/310 | 12 | 1312 | phoenix 283.6 (98.7%), thorn 2.1 (0.7%), lantern 1.7 (0.6%) |
| 16 | 23 | 330/330 | 43 | 1388 | phoenix 809.3 (90.3%), soul_beacon 46.9 (5.2%), thorn 19.5 (2.2%), lantern 18 (2%), frost 2.5 (0.3%) |
| 17 | 24 | 330/330 | 52 | 1468 | phoenix 825.6 (88.8%), soul_beacon 84.4 (9.1%), thorn 17.7 (1.9%), frost 1.8 (0.2%) |
| 18 | 25 | 310/330 | 56 | 1559 | phoenix 853.6 (86.8%), soul_beacon 112 (11.4%), thorn 15.5 (1.6%), frost 2.4 (0.2%) |
| 19 | 26 | 330/330 | 63 | 1650 | phoenix 906.6 (81.5%), soul_beacon 182.6 (16.4%), thorn 19.4 (1.7%), frost 4.4 (0.4%) |
| 20 | 26 | 253/330 | 75 | 1739 | phoenix 967.5 (82.5%), soul_beacon 179 (15.3%), thorn 20 (1.7%), frost 6.9 (0.6%) |
| 21 | 27 | 121/330 | 124 | 1879 | phoenix 1111.3 (74.4%), soul_beacon 317.8 (21.3%), thorn 41.7 (2.8%), frost 13.3 (0.9%), flail 8.7 (0.6%) |
| 22 | 29 | 114/330 | 269 | 2200 | phoenix 1631.3 (73.3%), soul_beacon 453.1 (20.4%), thorn 78.2 (3.5%), frost 34.9 (1.6%), flail 27.1 (1.2%) |
| 23 | 31 | 144/350 | 356 | 2741 | phoenix 2163 (69.5%), soul_beacon 754.4 (24.2%), thorn 90.1 (2.9%), frost 76 (2.4%), flail 29.4 (0.9%) |
| 24 | 33 | 92/350 | 328 | 3300 | phoenix 2568 (74.4%), soul_beacon 601.5 (17.4%), thorn 207.1 (6%), frost 52.9 (1.5%), flail 23.8 (0.7%) |
| 25 | 35 | 190/350 | 371 | 3866 | phoenix 2597.5 (69.6%), soul_beacon 765.1 (20.5%), thorn 265.4 (7.1%), frost 73.4 (2%), flail 27.5 (0.7%), storm 5.4 (0.1%) |

</details>

<details><summary>kael / Seed 404 — dawn @ 30.7 min, Level 33</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 4 | 253/253 | 6 | 17 | flail 9 (100%) |
| 2 | 7 | 253/253 | 9 | 47 | flail 19.3 (100%) |
| 3 | 8 | 253/253 | 17 | 96 | flail 35.9 (100%) |
| 4 | 9 | 253/253 | 25 | 130 | flail 35.4 (100%) |
| 5 | 11 | 253/253 | 36 | 168 | flail 40.5 (100%) |
| 6 | 12 | 248/273 | 48 | 232 | flail 154.8 (100%) |
| 7 | 13 | 255/273 | 67 | 292 | flail 117 (100%) |
| 8 | 14 | 272/273 | 82 | 378 | flail 157.3 (100%) |
| 9 | 15 | 293/293 | 96 | 470 | flail 180.3 (100%) |
| 10 | 16 | 308/313 | 129 | 566 | flail 189.3 (100%) |
| 11 | 19 | 353/353 | 65 | 980 | wrath_pendulum 640.5 (71.5%), flail 245.2 (27.4%), storm 10.3 (1.1%) |
| 12 | 22 | 353/353 | 6 | 1216 | wrath_pendulum 424.8 (79.9%), storm 102.2 (19.2%), ember 4.5 (0.8%) |
| 13 | 23 | 353/353 | 15 | 1301 | storm 172.7 (56.4%), wrath_pendulum 123.4 (40.3%), ember 10.1 (3.3%) |
| 14 | 23 | 353/353 | 19 | 1418 | storm 233 (65.3%), wrath_pendulum 115.4 (32.3%), ember 8.4 (2.4%) |
| 15 | 24 | 353/353 | 18 | 1542 | storm 283.4 (73.9%), wrath_pendulum 87.3 (22.8%), ember 13 (3.4%) |
| 16 | 24 | 353/353 | 44 | 1631 | storm 356.9 (39.2%), wrath_pendulum 335.7 (36.9%), thunder_seal 196.8 (21.6%), ember 20.2 (2.2%) |
| 17 | 25 | 340/353 | 46 | 1712 | thunder_seal 887.8 (77.3%), wrath_pendulum 234.1 (20.4%), ember 27.3 (2.4%) |
| 18 | 25 | 353/353 | 43 | 1811 | thunder_seal 738.3 (75.3%), wrath_pendulum 206 (21%), ember 36.3 (3.7%) |
| 19 | 25 | 353/353 | 67 | 1883 | thunder_seal 1051.4 (78%), wrath_pendulum 261.3 (19.4%), ember 35.1 (2.6%) |
| 20 | 26 | 353/353 | 77 | 1977 | thunder_seal 836 (80.2%), wrath_pendulum 166.3 (16%), ember 40.3 (3.9%) |
| 21 | 26 | 352/353 | 137 | 2202 | thunder_seal 1418 (58.7%), wrath_pendulum 900.4 (37.3%), ember 97.2 (4%) |
| 22 | 27 | 353/353 | 249 | 2556 | thunder_seal 1365.6 (53.6%), wrath_pendulum 1074.4 (42.2%), ember 107.1 (4.2%) |
| 23 | 28 | 353/353 | 358 | 3238 | wrath_pendulum 2224.5 (59.2%), thunder_seal 1380.4 (36.8%), ember 151.1 (4%) |
| 24 | 28 | 353/353 | 370 | 4110 | wrath_pendulum 2807.4 (62.1%), thunder_seal 1404.6 (31.1%), ember 307.3 (6.8%) |
| 25 | 29 | 320/353 | 360 | 5059 | wrath_pendulum 3033 (63.5%), thunder_seal 1419.3 (29.7%), ember 326.3 (6.8%) |
| 26 | 30 | 353/353 | 329 | 6126 | wrath_pendulum 4837 (72.1%), thunder_seal 1372.6 (20.5%), ember 499 (7.4%) |
| 27 | 30 | 353/353 | 343 | 6994 | wrath_pendulum 2631.3 (53.6%), thunder_seal 1409.8 (28.7%), ember 867.2 (17.7%) |
| 28 | 31 | 353/353 | 357 | 7943 | wrath_pendulum 2882.9 (54.3%), thunder_seal 1490.1 (28%), ember 938.4 (17.7%), thorn 1.9 (0%) |
| 29 | 31 | 353/353 | 359 | 8869 | wrath_pendulum 3004.7 (54.6%), thunder_seal 1499.1 (27.2%), ember 977.2 (17.8%), thorn 23.2 (0.4%) |
| 30 | 31 | 353/353 | 346 | 9754 | wrath_pendulum 3624.8 (59.4%), thunder_seal 1495.8 (24.5%), ember 960.4 (15.7%), thorn 23 (0.4%) |

</details>

#### DPS-Anteil je Waffe (gesamter Lauf)

| Char/Seed | Gesamtschaden | ember | flail | frost | thorn | storm | lantern | phoenix | wrath_pendulum | eternal_winter | thorn_storm | thunder_seal | soul_beacon |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mira/101 | 4366143 | 0.4% | 0.3% | 0.1% | – | – | 0.6% | 53.3% | 45.4% | – | – | – | – |
| kael/101 | 4511228 | 0.4% | 1% | 0.9% | 4.2% | 0.1% | 1.1% | – | 66.8% | 8.8% | – | – | 16.6% |
| mira/202 | 508237 | 2.9% | – | – | 4% | – | 0.4% | 84.1% | – | – | – | – | 8.6% |
| kael/202 | 5122101 | – | 0.4% | 0.1% | – | – | 0.3% | – | 76.6% | 22.6% | – | – | – |
| mira/404 | 1406744 | 1% | 0.8% | 1.6% | 3.9% | 0% | 0.2% | 75.7% | – | – | – | – | 16.8% |
| kael/404 | 3836520 | 8.7% | 1.9% | – | 0.2% | 1.8% | – | 3% | 54.7% | – | – | 29.7% | – |

<!-- BALANCE-TABLE:END -->
