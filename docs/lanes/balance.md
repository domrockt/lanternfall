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
### Hauptläufe (N = 1, autoPlay, kein god, 30x)

| # | Char | Seed | Ergebnis | Minuten | Level | Kills | Evos | Boss-Dauern (s) | Korridor |
|---|---|---|---|---|---|---|---|---|---|
| 1 | kael | 202 | Tod | 20.2 | 28 | 1676 | 1 | Moorkönigin 21, Knochenfürst 25, Der 26 | JA |

#### Minuten-Protokoll

<details><summary>kael / Seed 202 — death @ 20.2 min, Level 28</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 6 | 161/163 | 3 | 29 | ember 6 (55%), flail 4.9 (45%) |
| 2 | 9 | 183/183 | 4 | 75 | ember 11.3 (50.9%), flail 10.9 (49.1%) |
| 3 | 10 | 183/183 | 6 | 126 | ember 17.1 (70.4%), flail 7.2 (29.6%) |
| 4 | 13 | 183/183 | 10 | 186 | ember 21.2 (64.6%), flail 11.6 (35.4%) |
| 5 | 16 | 183/183 | 8 | 276 | ember 33.3 (50.7%), flail 32.4 (49.3%) |
| 6 | 17 | 152/183 | 11 | 355 | ember 86 (60.1%), flail 57.2 (39.9%) |
| 7 | 18 | 181/203 | 10 | 446 | ember 115.8 (82%), flail 25.5 (18%) |
| 8 | 19 | 203/203 | 11 | 528 | ember 137.9 (95%), flail 7.3 (5%) |
| 9 | 20 | 218/223 | 9 | 639 | ember 170.1 (92.6%), flail 13.5 (7.4%) |
| 10 | 21 | 243/243 | 16 | 757 | ember 183.7 (87.6%), flail 26 (12.4%) |
| 11 | 23 | 243/243 | 1 | 884 | ember 156.8 (39.5%), phoenix 151.4 (38.1%), flail 89.2 (22.4%) |
| 12 | 23 | 243/243 | 3 | 967 | phoenix 256.9 (97.1%), flail 7.6 (2.9%) |
| 13 | 23 | 243/243 | 4 | 1042 | phoenix 259.8 (96.4%), flail 9.6 (3.6%) |
| 14 | 24 | 263/263 | 6 | 1122 | phoenix 318.7 (94.8%), flail 17.6 (5.2%) |
| 15 | 24 | 263/263 | 15 | 1207 | phoenix 318.4 (95.2%), flail 16.2 (4.8%) |
| 16 | 25 | 235/263 | 30 | 1289 | phoenix 826.1 (80.2%), flail 204.4 (19.8%) |
| 17 | 26 | 194/263 | 29 | 1380 | phoenix 820.6 (82.2%), flail 177.7 (17.8%) |
| 18 | 27 | 174/263 | 41 | 1463 | phoenix 903.1 (80.4%), flail 219.9 (19.6%) |
| 19 | 27 | 222/263 | 61 | 1543 | phoenix 869.2 (86.2%), flail 138.7 (13.8%) |
| 20 | 28 | 108/263 | 61 | 1643 | phoenix 1386.4 (85.5%), flail 234.9 (14.5%) |

</details>

#### DPS-Anteil je Waffe (gesamter Lauf)

| Char/Seed | Gesamtschaden | ember | flail | frost | thorn | storm | lantern | phoenix | wrath_pendulum | eternal_winter | thorn_storm | thunder_seal | soul_beacon |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kael/202 | 544448 | 10.4% | 18% | – | – | – | – | 71.6% | – | – | – | – | – |

<!-- BALANCE-TABLE:END -->
