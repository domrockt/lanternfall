# Lane m10-level-target-balance — Level-Fortschritt aufs Zielband [25, 40]

**Auftrag (A5-Restpunkt):** Level-Fortschritt im 30-min-Run auf Doms Zielband bringen
(Alt-Befund: Kael/Seed 101 erreichte Level 47, Ziel 25–40 bei Minute 30).
Reine XP-/Level-Kurven-Arbeit, **keine** Gegner-Schwierigkeit (HP/Damage) geändert.

## Wichtiger Vorab-Befund

Der A5-Restpunkt war teilweise **bereits erledigt**: Lane `m10-balance-kael` (Fix `7629b2f`,
auf main) hatte den Level-47-Befund widerlegt (Ursache: Gem-Sammelquote 28,4 % des
Kite-Bots) und die Kurve ab Level 25 versteift — deren Messung (ohne god, balance.mjs):
6/6 im Korridor Level 27–30.

Diese Lane hat die Messung mit dem laut Briefing vorgesehenen Setup (**god mode** = obere
Sammelgrenze, da der Bot ungestört über 30 min sammelt) **unabhängig wiederholt** und dabei
eine echte Restlücke gefunden: 4/6 Läufe **über** dem Band (Level 42–44).

## Methode

- `scripts/m10-level-target.mjs`: Playwright-Run, timeScale 30, autoPlay, god, keine
  forced Weapons/Evolutions; pro Sim-Minute Level/XP/Kills; Seeds 101/202/404 × kael/mira.
- Kein flock (keine FPS-/Echtzeit-Messung). Script 1× gebaut, 1 Edit-Iteration.
- Kurven-Parameter per **Suchlauf** (K ∈ 0..60, festes Iterationslimit, keine Handdreherei):
  Kriterium: alle God-XP-Obergrenzen → Level ≤ 40, alle No-God-Referenzen → Level ≥ 25.
- Hebel liegt in `src/logic/xp.ts` (**nicht** `levelup.ts`/`scaling.ts` wie im Briefing
  angenommen — dort steht nur Angebots-Logik). `xp.ts` war in claims.json bei niemandem
  geclaimed; Request-Notiz in `.dispatch/requests.md` ergänzt. `waves.ts` **nicht** geändert:
  XP-Dichte der Wellen ist nicht der begrenzende Faktor, die Kurve allein reicht (Beleg:
  Suchlauf trifft das Band für beide Mess-Setups ohne Wellen-Änderung).

## Vorher/Nachher (Level bei Minute 30, god + autoPlay + 30x)

| Seed | Char | Vorher (`-before.json`) | Nachher (`-after.json`) | im Band [25,40] |
|---|---|---|---|---|
| 101 | kael | 37 | 37 | ✅ / ✅ |
| 101 | mira | **44** ❌ | 37 | ❌ → ✅ |
| 202 | kael | **42** ❌ | 36 | ❌ → ✅ |
| 202 | mira | **42** ❌ | 36 | ❌ → ✅ |
| 404 | kael | 38 | 38 | ✅ / ✅ |
| 404 | mira | **44** ❌ | 36 | ❌ → ✅ |
| **Quote** | | **2/6** | **6/6** | |

Level-30-Erreichung (god-Setup): vorher 18,3–22,5 min → nachher 20,4–21,8 min.

## Änderung (`src/logic/xp.ts`, Commit `635ad50`)

- Neu: `XP_ENDGAME_START_N = 26` (wirkt ab **Level 28**) + `XP_ENDGAME_MULT = 40`:
  zusätzlicher Term `40·(n−26)²` neben dem bisherigen `10·(n−24)²`.
- **Level 1–27 bitgleich** zur Kurve vor der Lane (früher Spielfluss, 5-Minuten-Boss-Kurve
  und der balance-kael-Korridor bleiben unberührt; No-God-Referenzen 6,3k–10,2k XP → Level 27–29).
- God-XP-Obergrenzen 24,6k–55,2k XP → Level 35–39 statt 37–44; selbst +15 % Sammelbudget
  bleibt ≤ 40 (Test-Assertion). Alter A5-Fall (34k XP) bleibt ≤ 40 gedeckelt.
- Kurve strikt monoton (Test), `levelForXp`/`totalXpForLevel` weiter invers.

## Abnahme (Kriterien aus dem Briefing)

- ✅ Level bei Minute 30 in [25, 40] für ≥ 3 Seeds (inkl. 101): **6/6** (`shots/m10-level-target-after.json`)
- ✅ Kurve monoton, Tests grün: `tests/level-target.test.ts` 10/10, Suite **1180/1180**, `npx tsc --noEmit` grün, `npm run build` grün
- ✅ Gegner-Balance-Werte byte-identisch: Lane-Diff ab Branch-Start berührt nur `src/logic/xp.ts`, `tests/level-target.test.ts`, `scripts/m10-level-target.mjs`, `shots/m10-level-target-*.json` (kein `waves.ts`, keine Gegnerdaten)

## Offene Punkte / Hinweise

1. **Sekundärkriterium „Level 30 zwischen Minute 28 und 31“ ist im god-Setup nicht
   gleichzeitig erfüllbar:** Level 27 wird bei ungeändertem Frühteil schon ab ~Minute 20
   erreicht; um Level 30 erst ab Minute 28 zuzulassen, müsste die Mittelgame-Kurve (Level
   10–27) stark versteift werden — das würde die Level-1-25-Stabilität (5-min-Boss) und den
   No-God-Korridor 27–30 (balance-kael, 6/6) brechen. Die Lane löst zugunsten des
   bindenden Kriteriums (Minute-30-Level im Band, 6/6) auf und dokumentiert den Konflikt.
   Im No-God-Setup wird Level 30 von den XP-reicheren Läufen bereits bei ~Minute 28–30 erreicht.
2. `src/logic/xp.ts` liegt außerhalb der Disponent-Dateiliste dieser Lane (Briefing nannte
   `levelup.ts`/`scaling.ts`, die Kurve liegt aber in `xp.ts`). Datei war unclaimed;
   siehe Request-Eintrag in `/home/ai/games/.dispatch/requests.md`. Beim Merge zur Kenntnis nehmen.
3. God-Modus-Spielweise (Bot weicht mit hp=1 dauerhaft aus und sammelt nahezu alles) ist
   die Obergrenze des Sammelbudgets; die Spieler-realistische Untergrenze bleibt der
   No-God-Korridor aus docs/lanes/m10-balance-kael.md (27–30). Beide Enden liegen jetzt im Band.
