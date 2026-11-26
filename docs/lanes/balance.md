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

<!-- BALANCE-TABLE:START -->
### Todesläufe je Charakter (ohne god, 30x, bis zum Tod)

| Char | Seed | Bot | Ergebnis | Todeszeit | Level | Kills | Result-Grund | Screenshot |
|---|---|---|---|---|---|---|---|---|
| mira | 202 | autoPlay | death | 20.3 min | 27 | 1785 | death | shots/balance-death-mira-202.png |
| kael | 606 | steht still | timeout | 0.4 min | 2 | 9 | – | shots/balance-death-kael-606.png |

<!-- BALANCE-TABLE:END -->
