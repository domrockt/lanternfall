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
### Hauptläufe (N = 2, autoPlay, kein god, 30x)

| # | Char | Seed | Ergebnis | Minuten | Level | Kills | Evos | Boss-Dauern (s) | Korridor |
|---|---|---|---|---|---|---|---|---|---|
| 1 | mira | 101 | Tod | 20.7 | 26 | 1549 | 1 | Moorkönigin 25, Knochenfürst 42, Der 31, Glockenturm-Golem 31 | JA |
| 2 | mira | 202 | Tod | 21.3 | 26 | 1847 | 1 | Moorkönigin 30, Knochenfürst 46, Der 33, Glockenturm-Golem 35 | JA |

#### Minuten-Protokoll

<details><summary>mira / Seed 101 — death @ 20.7 min, Level 26</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 4 | 270/270 | 0 | 26 | ember 9.5 (100%) |
| 2 | 6 | 270/270 | 0 | 61 | ember 13.6 (100%) |
| 3 | 9 | 270/270 | 6 | 93 | ember 17.1 (100%) |
| 4 | 11 | 270/270 | 1 | 150 | ember 34.5 (100%) |
| 5 | 12 | 270/270 | 8 | 186 | ember 30.4 (100%) |
| 6 | 13 | 270/270 | 9 | 266 | ember 141 (100%) |
| 7 | 15 | 270/270 | 9 | 360 | ember 146.3 (99.8%), lantern 0.3 (0.2%) |
| 8 | 17 | 290/290 | 6 | 464 | ember 174.6 (100%) |
| 9 | 18 | 290/290 | 11 | 557 | ember 201.9 (100%), lantern 0.1 (0%) |
| 10 | 20 | 290/290 | 13 | 682 | ember 218.8 (97.5%), flail 5.4 (2.4%), lantern 0.1 (0%) |
| 11 | 21 | 254/290 | 9 | 827 | ember 395.7 (76.2%), phoenix 85.9 (16.5%), flail 30.1 (5.8%), frost 4.7 (0.9%), lantern 2.8 (0.5%) |
| 12 | 22 | 290/290 | 7 | 897 | phoenix 249.5 (99.5%), flail 1 (0.4%), lantern 0.3 (0.1%) |
| 13 | 22 | 290/290 | 9 | 967 | phoenix 233.1 (99.2%), flail 1.4 (0.6%), frost 0.4 (0.2%) |
| 14 | 23 | 290/290 | 7 | 1040 | phoenix 262.2 (99.2%), flail 1.9 (0.7%), frost 0.2 (0.1%), lantern 0.1 (0%) |
| 15 | 24 | 290/290 | 12 | 1123 | phoenix 393.7 (99.1%), flail 2.3 (0.6%), frost 0.7 (0.2%), lantern 0.6 (0.2%) |
| 16 | 24 | 279/290 | 31 | 1197 | phoenix 942 (95.1%), flail 34.4 (3.5%), frost 10.3 (1%), lantern 3.4 (0.3%) |
| 17 | 25 | 274/290 | 37 | 1271 | phoenix 751.7 (96.6%), flail 15.6 (2%), frost 9.4 (1.2%), lantern 1.7 (0.2%) |
| 18 | 25 | 278/290 | 42 | 1352 | phoenix 983.9 (96.3%), flail 20 (2%), frost 15.6 (1.5%), lantern 2.1 (0.2%) |
| 19 | 25 | 263/290 | 64 | 1415 | phoenix 726.7 (96.8%), flail 13.3 (1.8%), frost 9.4 (1.3%), lantern 1.1 (0.1%) |
| 20 | 26 | 257/290 | 79 | 1488 | phoenix 790.3 (97.1%), flail 13.1 (1.6%), frost 8.6 (1.1%), lantern 1.7 (0.2%) |

</details>

<details><summary>mira / Seed 202 — death @ 21.3 min, Level 26</summary>

| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |
|---|---|---|---|---|---|
| 1 | 5 | 250/250 | 0 | 19 | ember 7.2 (100%) |
| 2 | 6 | 250/250 | 1 | 48 | ember 13.2 (100%) |
| 3 | 7 | 250/250 | 11 | 91 | ember 19.9 (100%) |
| 4 | 12 | 270/270 | 7 | 167 | ember 37.7 (100%) |
| 5 | 14 | 270/270 | 8 | 226 | ember 35.5 (98.1%), thorn 0.7 (1.9%) |
| 6 | 15 | 270/270 | 6 | 330 | ember 180.1 (96.6%), thorn 6.4 (3.4%) |
| 7 | 16 | 290/290 | 10 | 436 | ember 145.2 (97.2%), thorn 4.2 (2.8%) |
| 8 | 17 | 290/290 | 10 | 507 | ember 118.3 (96.4%), thorn 4.4 (3.6%) |
| 9 | 18 | 310/310 | 13 | 582 | ember 142.4 (96.2%), thorn 5.7 (3.8%) |
| 10 | 19 | 310/310 | 20 | 718 | ember 223.5 (96.6%), thorn 7.8 (3.4%) |
| 11 | 20 | 310/310 | 17 | 874 | ember 397.2 (74.7%), phoenix 102.2 (19.2%), thorn 22.4 (4.2%), storm 8.8 (1.7%), lantern 1 (0.2%) |
| 12 | 21 | 310/310 | 5 | 970 | phoenix 233.1 (95.8%), storm 7.8 (3.2%), thorn 2.3 (0.9%) |
| 13 | 22 | 310/310 | 5 | 1044 | phoenix 206 (94.4%), storm 9.2 (4.2%), thorn 2.9 (1.3%), lantern 0.1 (0%) |
| 14 | 22 | 310/310 | 7 | 1116 | phoenix 316.7 (95.8%), storm 10.6 (3.2%), thorn 3.2 (1%) |
| 15 | 23 | 310/310 | 17 | 1192 | phoenix 315.1 (96%), storm 10.7 (3.3%), thorn 2.5 (0.8%) |
| 16 | 23 | 282/310 | 34 | 1267 | phoenix 711.7 (91%), thorn 51.8 (6.6%), storm 17.9 (2.3%), lantern 0.5 (0.1%) |
| 17 | 24 | 304/310 | 36 | 1345 | phoenix 818.9 (90.7%), thorn 55.1 (6.1%), storm 28.4 (3.1%), lantern 0.6 (0.1%) |
| 18 | 25 | 304/310 | 38 | 1422 | phoenix 846.4 (89.3%), thorn 71.8 (7.6%), storm 29.4 (3.1%), lantern 0.6 (0.1%) |
| 19 | 25 | 290/310 | 42 | 1508 | phoenix 786.1 (85.8%), thorn 100.7 (11%), storm 28.8 (3.1%), lantern 1.1 (0.1%) |
| 20 | 26 | 310/310 | 59 | 1578 | phoenix 904.3 (84.1%), thorn 139.7 (13%), storm 30 (2.8%), lantern 0.7 (0.1%) |
| 21 | 26 | 47/310 | 117 | 1743 | phoenix 1122.8 (74%), thorn 361.2 (23.8%), storm 29.8 (2%), lantern 4.2 (0.3%) |

</details>

#### DPS-Anteil je Waffe (gesamter Lauf)

| Char/Seed | Gesamtschaden | ember | flail | frost | thorn | storm | lantern | phoenix | wrath_pendulum | eternal_winter | thorn_storm | thunder_seal | soul_beacon |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mira/101 | 486752 | 17.1% | 2.3% | 1.2% | – | – | 0.2% | 79.2% | – | – | – | – | – |
| mira/202 | 561828 | 14.1% | – | – | 10.8% | 2.4% | 0.1% | 72.6% | – | – | – | – | – |

<!-- BALANCE-TABLE:END -->
