# M10-Passive-Math — Kumulation, Caps und 6/6-Kombination

Stand: 2026-11-27, Lane `m10-passive-math` (Worktree `/home/ai/games/lf-lanes/m10-passive-math`).
Auftrag: Luecke „Passive stapeln kumulativ, aber niemand prueft die Obergrenze“ belegen und schliessen.
Spiellogik, kein FPS-Lauf, daher ohne `flock`.

## Ausgangslage / Vorher (Commit `3a5dc99`, Karte #2918)

Die Daten waren bereits korrekt kumulativ: `src/data/passives.ts` erzeugt je Stufe
`basis * stufe` (Stufe n = n-facher Basisbonus), und `Run.ts`/`LevelUpSystem.ts` verwenden
genau **einen** Mods-Eintrag pro Passiv (`levels[level-1].mods`) statt die Stufen zu summieren.
Die Ist-Matrix (`shots/m10-passive-math-matrix.json`) war im Normalpfad daher sauber:

- 64 Zeilen (6 Passives x Stufen 1..8, Stufen 6..8 werden wie im Spiel auf maxLevel 5 geklemmt)
- **0 Abweichungen** vom n-fachen Basisbonus
- **0 Cap-Verletzungen** im Normalpfad
- **0 NaN/negative** Werte im Normalpfad

Die eigentliche Luecke lag ausserhalb des Normalpfads: `aggregateMods` summierte ungefiltert und
hatte keine Obergrenze. Belegt im Baseline-Testlauf (rot):

| Adversarialer Fall | Vorher |
|---|---|
| `boots` Stufe 5 zweimal angewendet (Doppelzaehlung) | `moveSpeedPct = 80`, Tempo 180 statt Cap 140 |
| `damagePct = NaN` | `effectiveDamage(...) = NaN` |
| `pickupRadiusPct = Infinity` | `pickupRadiusPct = Infinity` |
| `cooldownPct = -500` | `cooldownPct = -500` (negative Abklingzeit) |

## Fix / Nachher (Commit `dee98ba`, Karte #2919)

`src/logic/stats.ts` erzwingt jetzt die dokumentierte Semantik:

1. **0/NaN-Schutz in `aggregateMods`**: nur endliche Zahlen werden addiert; fehlende,
   nicht-finite oder falsch typisierte Mods werden ignoriert.
2. **Harte Caps** (`STAT_CAPS`) und **Untergrenzen** (`STAT_FLOORS`) auf dem Aggregat.
3. **Defensive `effective*`-Funktionen**: nicht-finite/negative Basis faellt auf einen neutralen
   Wert; Prozentwerte werden erneut geklemmt; Cooldown bleibt zusaetzlich nie unter 20 % der Basis.

| Stat | Cap | Bedeutung | Wert bei Passiv-Stufe 5 |
|---|---|---|---|
| `moveSpeedPct` | +40 % | Bewegungstempo | boots: +40 % (Tempo 140 bei Basis 100) |
| `cooldownPct` | +40 % | Feuerrate (Abklingzeit -40 %) | tome: Faktor 0,6; Floor 0,2 bleibt |
| `damagePct` | +50 % | Waffenschaden | whetstone: Schaden 150 bei Basis 100 |
| `pickupRadiusPct` | +125 % | Aufsammelradius | charm: Radius 45 bei Basis 20 |
| `maxHpFlat` | 500 (Sanity) | Max-HP flach | heart: +100 |
| `maxHpPct` | +200 % (Sanity) | Max-HP prozentual | keine Passiv-Quelle |
| `regen` | 50/s (Sanity) | Regeneration | heart: +1,5/s |
| `areaPct` / `durationPct` | +200 % (Sanity) | Flaeche/Dauer | hourglass: +50 % (Radius 150, Dauer 15) |
| `xpPct` | +200 % / Floor -100 % | XP-Gewinn | keine Passiv-Quelle |
| `armorFlat` | 50 (Sanity) | Ruestung | keine Passiv-Quelle |

Die vier vom Auftrag geforderten Caps (Bewegung, Pickup-Radius, Feuerrate, Schaden) sind echte
Obergrenzen. `areaPct`/`durationPct`/`maxHpFlat`/`maxHpPct`/`regen` haben bewusst grosszuegige
Sanity-Caps, damit Charakter-Boni (z. B. Mira +10 % Flaeche, Kael -5 % Tempo/-25 % XP) erhalten
bleiben und nur entartete Werte gestoppt werden.

Adversariale Faelle nach dem Fix (Beleg `shots/m10-passive-math-caps.json`):

| Fall | Nachher |
|---|---|
| `boots` Stufe 5 zweimal/dreimal | `moveSpeedPct = 40`, Tempo 140 (Cap, kein Doppelzaehlen) |
| `damagePct = NaN` | 0 -> `effectiveDamage = 100` (Basis) |
| `pickupRadiusPct = Infinity` | 0 -> Radius 20 (Basis) |
| `cooldownPct = -500` | 0 -> Cooldown 1 (Basis) |
| `moveSpeedPct = -999` | Floor -50 -> Tempo 50, finit und >= 10 |

## Kombination 6/6 (Karte #2920, Commit `e2324f2`)

Alle sechs Passives gleichzeitig auf Stufe 5, keine Exception:

| Stat | Kombiniert |
|---|---|
| `moveSpeedPct` | 40 |
| `cooldownPct` | 40 (Faktor 0,6) |
| `damagePct` | 50 |
| `pickupRadiusPct` | 125 |
| `areaPct` | 50 |
| `durationPct` | 50 |
| `maxHpFlat` | 100 |
| `regen` | 1,5/s |

`shots/m10-passive-math-caps.json`: `checks = 22`, `violations = 0`,
`combo.combined = true`, `combo.threw = false`, `combo.allSixAtMax = true`,
`combo.withinCaps = true`, `junk.invalidValues = 0`.

## Messwerte / Pruefungen

| Pruefung | Ergebnis |
|---|---|
| `npx tsc --noEmit` | rc=0 |
| `npx vitest run tests/passive-math.test.ts` (Karte #2918) | 5 Tests, Baseline 1 rot (Adversarial) |
| `npx vitest run tests/passive-stack.test.ts` (nach Fix, #2919/#2920) | **9/9 gruen** |
| `npm test` vor Fix | 340/340 gruen (Baseline-Rot nur im neuen Adversarial-Test) |
| `npm test` nach Fix + Grenz-Beleg | **344/344 gruen** (32 Dateien, 0 fail) |
| `npm run build` | rc=0 (`✓ built in 812 ms`) |
| Matrix-JSON | 64 Zeilen, 0 Abweichungen, 0 Cap-Verletzungen, 0 NaN/negativ |
| Caps-JSON | 22 Checks, 0 Verletzungen, 6/6 kombinierbar, 0 Muell-Werte |

## Offene Punkte

- `effectivePickupRadius` kappt nur den Passiv-Anteil. Der temporaere `combat.pickupBonus`
  (Magnet-Pickup) wird in `Run.ts` danach addiert und kann den Passiv-Cap bewusst ueberschreiten.
  Das ist ein separat eingesammelter, zeitlich begrenzter Effekt und kein Passiv-Stack.
- Die Caps sind Prozent-Obergrenzen; Waffen mit sehr niedriger Basis-Abklingzeit profitieren
  weiterhin vom 20-%-Floor in `effectiveCooldown`. Eine absolute Feuerraten-Obergrenze ueber alle
  Quellen ist nicht Teil dieses Auftrags.
- Passiv-Stufen ausserhalb 1..5 sind im Spiel nicht erreichbar (`LevelUpSystem` klemmt). Die
  Matrix prueft Stufen 6..8 dennoch als Level-Clamp-Stresstest.
- Keine Balance-Aenderung: `src/data/passives.ts` blieb unveraendert; die Basisboni und die
  kumulative Semantik sind identisch. Der Fix haertet nur Aggregation und effektive Werte.
