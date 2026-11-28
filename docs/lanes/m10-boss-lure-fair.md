# Lane m10-boss-lure-fair — Boss-Verfolgungs-Fairness (2026-11-28)

Ziel: vorhersagbares, faires Verfolgungs-/Aggro-Verhalten der 6 Bosse (Leash zur
Spawn-Zone, kein Offscreen-Drift bei AutoPlay und 500+ Gegnern, keine
Schadensereignisse ohne vorherige Sichtbarkeit) — **ohne Balance-Eingriff**.

Nicht-Ziele: Boss-Dauern 20–60 s bleiben unverändert. Es wurden keine Boss-HP,
kein Grundtempo, kein Kontaktschaden und keine Angriffswerte angefasst
(`git diff 217316d..HEAD -- src/data` leer; Korridor-Beleg `shots/balance-main.json`
M6-final: Boss-Dauern 23–54 s über 6 Läufe). FxSystem.ts/CombatSystem.ts (Evo-FX-Kette)
und Run.ts wurden nicht berührt.

## Karten

| Karte | Commit | Inhalt |
|---|---|---|
| K1 Vorher-Beleg | `423586e` | `scripts/m10-boss-fair.mjs` + `shots/m10-bossfair-before.json` |
| K2 Fairness-Regeln | `f587736` | Regeln in `src/logic/bosses.ts`, Verdrahtung `src/systems/BossSystem.ts` |
| K3 Guard-Tests | `ce5df8e` | `tests/boss-lure-fair.test.ts`, 8 Tests |
| K4 Nachher + Doku | (dieser) | `shots/m10-bossfair-after.json` + dieses Dokument |

## Messmatrix (K1/K4 identisch)

6 Bosse × Seeds 101/202/404, AutoPlay + god + 500er-Schwarm (Schaden 0),
TimeScale 3, 30 Sim-Sekunden je Boss, Sample alle 120 ms (≈ 0,36 Sim-s),
Start elapsed 180 s (keine natürlichen Boss-Spawns, Flags hart gesetzt).
Kein flock (keine FPS-Messung; feste Substeps).

**Schwellen vor der Messung festgelegt:**
- Schadensereignis ohne vorherige Sichtbarkeit: Hazard-Trigger (damage > 0),
  dessen Warnfläche in keinem Sample während der Warnphase im Kamera-View lag.
- Leash-Verletzung: Boss > 320 px von der Spawn-Zone, während der Spieler die
  Zone (+40 px Toleranz) noch bewohnt.
- Offscreen: Boss-Mittelpunkt außerhalb `camera.worldView` + 8 px.

## Ist vor dem Fix (`shots/m10-bossfair-before.json`)

- **35 Schadensereignisse ohne vorherige Sichtbarkeit** (von 199 Triggern):
  `stone_rain`/`thorn_ring`-Markierungen landeten an der **geklammerten Weltkante**
  hinter dem sichtbaren Bereich (Bot läuft in die Ecke, Kamera kann nicht folgen).
- **12 Leash-Verletzungs-Samples** (Seed 101, Knochenfürst): Boss > 320 px aus der
  Spawn-Zone, Spieler noch in der Zone.
- **Boss 0 (Moorkönigin) driftet massiv ab:** Offscreen-Anteil 12–46 %, bis
  4,6 s am Stück unsichtbar, bis 1385 px von der Spawn-Zone (Bot rennt weg,
  Boss-Geschwindigkeit < Spielertempo → dauerhafte Verfolgungslücke).
- 0 JS-Fehler. Messskript-Notiz: der Beam-Sichtbarkeitstest hatte in der ersten
  Fassung einen Feldfehler (`h.x1` statt `h.x`); in Iteration 2 gefixt und die
  Baseline komplett neu gemessen (vorliegende before-JSON).

## Fairness-Regeln (K2, reine Logik in `src/logic/bosses.ts`)

1. **Sanfter Leash** (`bossLeashSteer`): Ist der Boss > 320 px von seiner
   Spawn-Zone, während der Spieler die Zone (+40 px) noch bewohnt, wird die
   Bewegung zu 55 % zur Zone zurückgemischt. Verlässt der Spieler die Arena
   selbst, wird der Leash gelöst (Kampf stockt sonst).
2. **Offscreen-Catch-up** (`bossCatchupSpeed`): > 360 px vom Spieler für ≥ 2 s →
   Tempo ×1,2, hart geklemmt auf 60 px/s (< Mira-Tempo 62), bis der Boss wieder
   ≤ 220 px steht. Deterministisch, kein RNG; Grundtempo unverändert.
3. **Keine Angriffe ohne Sichtbarkeit** (`BossSystem.update`): Außerhalb des
   Views (+48 px Marge) wird der Angriffs-Timer angehalten — Telegraph und
   Schadensfläche wären sonst unsichtbar. Bewegung/Catch-up laufen weiter.
4. **Sichtbarkeits-Klemme** (`clampPointToView`): spieler-relative
   Schadensflächen (jump_slam, poison_puddles, stone_rain, thorn_ring) werden in
   `camera.worldView` geklemmt — an der Weltkante bleibt jede Warnfläche
   vollständig sichtbar. Schaden/Radius/Warnzeit unverändert.
5. **Zielwechsel-Regel** (`canRetargetAttack`): Zielwechsel nur mit
   Schadensfenster ≥ 0,3 s; Guard-Test deckt alle Angriffe aller 6 Bosse/Phasen.

## Ist nach dem Fix (`shots/m10-bossfair-after.json`)

| Kennzahl | vor | nach |
|---|---|---|
| Schadensereignisse ohne Sichtbarkeit | **35** | **0** ✅ |
| Leash-Verletzungs-Samples | **12** | **0** ✅ |
| mittlerer Offscreen-Anteil | 5,0 % | 3,0 % |
| längste Offscreen-Phase | 4,6 s | 2,6 s |
| max. Distanz Boss→Spieler | 393 px | 378 px |
| JS-Fehler | 0 | 0 |

Boss 0: Offscreen 34/12/46 % → 19/0/27 %, längste Offscreen-Phase 3,4/1,2/4,6 s →
1,9/0/2,6 s. Rest-Offscreen ist die Restlagszeit des Catch-up (≤ ~2,6 s bis zur
Wiederannäherung) und bewusst mild gehalten, um kein Balance-Fenster zu öffnen.
`distSpawn` bleibt bei fliehendem Bot groß (bis ~1480 px): der Leash löst dann
bewusst, damit der Boss dem Spieler folgt — das ist das dokumentierte Design
("Arena folgt dem Spieler"), nicht ein Verstoß.

## Verifikation

- `npx tsc --noEmit` rc=0
- `npm test`: **1307/1307 grün** in 121 Dateien (davon 8 neue in `tests/boss-lure-fair.test.ts`)
- `npm run build`: grün (Mess-Skripte laufen gegen `dist/`)
- Determinismus: Regeln ohne RNG; bei gleichem Seed bitgleich (Guard-Test).

## Offene Punkte

- Der Catch-up deckt AutoPlay-Fluchtszenarien; menschliche Kite-Spieler können
  den Boss weiterhin auf Distanz halten (Grundtempo < Spielertempo ist Balance,
  gehört nicht in diese Lane).
- `distSpawn` ist bei Weitflucht des Spielers kein Fairness-Indikator mehr
  (Leash-Release); falls Dom eine harte Welt-Clusterung der Bosse will, wäre das
  eine eigene Balance-Entscheidung.
- Der Endboss feuert in Phase 3 auch im 500er-Chaos nun nie unsichtbar (Timer-Halt);
  seine Dauer liegt weiterhin im Korridor (siehe `shots/balance-main.json`).
