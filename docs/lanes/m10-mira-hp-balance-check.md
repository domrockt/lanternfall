# Lane m10-mira-hp-balance-check

Ziel: Prüfen, ob der Dom-Balance-Korridor (A5: mira Boss-Dauern 20–60 s, Levelband 25–40 bei
Minute 30, kael ±10 %) auf dem neuen Mira-HP-Stand (250 → 90, m10-charstats-ssot `af72458d`)
hält; bei Verletzung kleinster Hebel. Messen und beheben in einer Lane.

## Ausgangslage (Recherche vor der Messung)

- `src/data/characters.ts`: mira `hp: 90` (seit af72458d), kael unverändert (`hp: 130`,
  maxHpPct 25 + maxHpFlat 90 → effektiv ~252,5 HP, armor 2, regen 1,5).
- Die committeten Korridor-Marken (`shots/m10-balance-corridor-{short,full}.json`,
  Regenerierung 13:43/13:52Z in Lane m10-mira-dps-corridor) liegen zeitlich NACH dem
  charstats-Merge (10:22Z) — ob der messende Worktree damals wirklich HP 90 enthielt,
  ist aus dem Commit-Graph allein nicht belegbar. Genau deshalb macht diese Lane eine
  eigene Ist-Messung.

## K1 (#12905): Ist-Messung auf HP 90 — URTEIL: Korridor hält NICHT

- Fremder Guard `tests/balance-corridor.test.ts` nur AUSGEFÜHRT (nicht angefasst): 4/4 grün.
- Eigene Messung `scripts/m10-mira-hp-check.mjs` (Matrix 3× mira + 1× kael Seed 101,
  volle Läufe bis Run-Ende, `setTimeScale(30)`, autoPlay, kein god mode,
  Renderer `Mesa Intel(R) Graphics (RPL-S)` — nicht SwiftShader).
- Beleg: `~/games/.evidence/m10-mira-hp-balance-check/m10-mira-hp-2026-11-28T15-39-42-847Z.json`

| Lauf | Ergebnis | Minute | Level |
|---|---|---|---|
| mira/101 | **death** | 20,43 | 33 |
| mira/202 | **death** | 25,44 | 34 |
| mira/404 | **death** | 22,22 | 31 |
| kael/101 | dawn | 30,65 | 36 |

Befunde gegen den Korridor:

1. **mira erreicht Minute 30 nicht mehr** (3/3 Tod bei Minute 20,4–25,4; Referenz-Baseline:
   mira/101 dawn 30,45 min L35, mira/202 dawn 30,63 min L38). Das Levelband 25–40 ist formal
   erfüllt (31–34 am Todeszeitpunkt), aber das Kriterium „bei Minute 30" ist verletzt —
   Mira stirbt ~5–10 min vor dem Zielzeitpunkt.
2. **mira/101 Glockenturm-Golem 16,1 s < 20 s** — durch Miras Tod abgeschnittener Kampf
   (nicht besiegt), d. h. zusätzlich 1 harte Boss-Dauer-Verletzung.
3. **kael ±10 %**: 4/6 Boss-Dauern außerhalb (Knochenfürst +11,5 %, Fahler Hirte +17,7 %,
   Golem +10,7 %, Hohler König +10,3 %) — **trotz bitidentischem kael-Code** (af72458d ändert
   nur miras `hp`). Kael/Moorkönigin deckungsgleich (28,3 s = 28,3 s), Divergenz wächst mit
   der Laufzeit → Lauf-Varianz/Chaos-Amplifikation, kein kael-Bruch. Zusätzlich haben seit der
   Referenz ~9 Perf-Merges (Spawner/Fx/Chunk) `src/` berührt (alle „bitgleich" deklariert),
   was Einzellauf-Vergleiche über Commit-Grenzen hinweg zusätzlich unscharf macht.

**Gesamturteil K1: FAIL** — der Korridor hält auf dem HP-90-Stand in der Tendenz nicht
(mira-Survivability bricht). → K2/K3 gezogen.

## K2 (#12906): Ursache + kleinster Hebel

Ursache: Mira-Schadensausgabe ist unverändert (DPS-Korridor-Lane hatte mira-DPS schon auf
HP-250-Stand getunt), aber die Einsteckfähigkeit fiel von 250 auf 90 HP (−64 %). Kael hat als
Tank ~252 effektive HP und überlebt; Mira (HP 90, armor 1, regen 1,0) stirbt im
Minute-20–25-Druckfenster. Das bestätigt genau die Briefing-Hypothese („Boss-TTK sinkt mit
HP 90 … Levelband bricht?"): TTK der Bosse ist ok (12/13 gemessener mira-Boss-Kämpfe im
20–60-s-Fenster), es bricht das Levelband/Überleben.

### Hebel-Wahl (belegt gegen die gepinnten Tests)

Verboten ist, miras HP/DPS zurückzudrehen (Spec-Richtung HP 90 bindend; `characters.ts`
fremd). Die übrigen Hebel sind von der Endgame-Lane gepinnt (`tests/balance-endgame.test.ts`):
`HP_RELIEF_MAX 0,25`, `HP_RELIEF_START_S 1080`, `HP_RELIEF_RAMP_S 240`,
`LATE_GAME_ACTIVE_CAP 200`, `enemyDamageScale(1800)` — jede Änderung dort bricht fremde Pins.

**Gewählter kleinster Hebel (nur `src/data/waves.ts`, eigene Datei):** TIER_MIXES[4] enthält
mit `abom` (Splitter: teilt sich beim Tod) und `voidcaller` (Beschwörer: erzeugt weitere
Gegner) zwei Mengen-Vervielfacher — genau in Minute 20–24, dem gemessenen mira-Todesfenster
(20,4 / 22,2 / 25,4 min). Die Endgame-Lane hat denselben Mechanismus für Minute 25+ bereits
dokumentiert (LATE_GAME_MIX, „genau in der Phase, in der die AutoPlay-Läufe vor Minute 25
starben bzw. kurz davor kippten"); HP 90 verschiebt miras Todeszeitpunkt in das
entsprechende Fenster 20–24. Fix: neuer Mix `MID_GAME_MIX` = TIER_MIXES[4] MINUS abom/voidcaller
(reine Subtraktion, Gewichte unverändert, nur Tier-4-Typen) für Minute 20–24. Minute 0–19 und
25+ bleiben bitgleich; Spawnrate unberührt (Monotonie-Pins bleiben grün).

Pin-Prüfung: `tests/balance-endgame.test.ts` pinnt die Mischung nur für Minute 0–17
(TIER_MIXES) und 25–29 (LATE_GAME_MIX) — Minute 18–24 ist NUR bei der Spawnrate gepinnt;
`tests/data.test.ts` pinnt WAVES[0/5/29] + Monotonie. Kein fremder Test bricht.

Zielkorridor für K3: mira 3/3 dawn bzw. Level@30 in 25–40, alle mira-Boss-Dauern 20–60 s,
kael-Nebenwirkung (gegen meine K1-Ist-Messung, gleicher Code-Stand) ≤ ±10 %.

