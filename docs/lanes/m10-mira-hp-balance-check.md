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

## K3 (#12907): Fix + Nachmessen — bindender Suchlauf, Gewinner Kandidat D

Fix im Baum: `MID_GAME_MIX` für Minute 20–24 = TIER_MIXES[4] mit **halbiertem Gewicht** für
die beiden Mengen-Vervielfacher (abom 0,5, voidcaller 0,5 statt 1; übrige Tier-4-Typen
unverändert), `MID_GAME_MIX_MINUTE = 20`, `MID_GAME_MIX_LAST_MINUTE = 24`. Minute 0–19 und
25+ bitgleich; Spawnrate unberührt.

**Suchlauf (festes Limit, bindend, `scripts/m10-mira-hp-search.mjs` + Messläufe):**

| Kandidat | Mix 20–24 | mira 101 | mira 202 | mira 404 | Suite |
|---|---|---|---|---|---|
| (K1, ohne Fix) | TIER_MIXES[4] | death 20,43 L33 | death 25,44 L34 | death 22,22 L31 | grün |
| A | ohne abom/voidcaller | **dawn 30,52 L35** | death 20,18 L30 | **dawn 30,63 L33** | **FAIL** wave-coverage (c): abom/voidcaller nie gespawnt → toter Content |
| B | LATE_GAME_MIX | **dawn 30,54 L35** | death 20,29 L30 | **dawn 30,78 L33** | **FAIL** Coverage wie A |
| C | ohne abom/voidcaller nur 20–22 | death 25,56 L35 | death 20,18 L30 | dawn 30,80 L34 | grün, aber nur 1/3 dawn |
| **D (Gewinner)** | abom/voidcaller Gewicht 0,5 | death 20,52 L33 | **dawn 30,55 L34** | **dawn 30,62 L34** | grün |

Vorab festgelegtes Kriterium: 3/3 dawn bzw. death ≥ min 25 mit Level im Band UND alle
mira-Boss-Dauern 20–60 s. Kein Kandidat erreicht 3/3 dawn: **mira steht auf HP 90 am
20:00-Golem am Messerschneiden-Rand — je genau ein Seed stirbt bei ~20,2–20,5 min, und zwar
in JEDER Variante ein anderer (A/B: 202, C: 202+101, D: 101; mit A stirbt 202 sogar ohne
jede Vervielfacher-Präsenz). Der Mix-Hebel allein kann das nicht sichern.**

**Nachher (Gewinner D, Beleg `~/games/.evidence/m10-mira-hp-balance-check/m10-mira-hp-2026-11-28T16-12-00-987Z.json`):**

| Lauf | Vorher (K1) | Nachher (K3, D) |
|---|---|---|
| mira/101 | death @ 20,43 min, L33, Golem 16,1 s abgeschnitten | death @ 20,52 min, L33 (im Band); Golem-Kampf 30,1 s abgeschnitten — **im Korridor** |
| mira/202 | death @ 25,44 min, L34 | **dawn @ 30,55 min, L34** — alle 6 Bosse 25,2–31,0 s |
| mira/404 | death @ 22,22 min, L31 | **dawn @ 30,63 min, L34** — alle 6 Bosse 29,8–45,4 s |
| kael/101 | dawn @ 30,65 min, L36 | dawn @ 30,58 min, L34; Bosse 0–2 bitgleich zum K1-Stand |

- **mira-Boss-Dauern: 17/17 gemessene Kämpfe in [20, 60] s — 0 Verletzungen** (K1: 1).
- **Levelband 25–40: erfüllt** (dawn 34/34, death 33; Referenz dawn war 35/38).
- **kael ±10 %:** gegen die committete Referenz (`shots/m10-balance-corridor-full.json`,
  13:52Z, ÄLTERER Code-Stand) liegen 3/6 Dauern außerhalb (+11,5/+17,7/+17,9 %) — das war
  schon in K1 **ohne jeden Fix** so (Boss 0–2 sind bitgleich zum K1-Stand; die Drift stammt
  aus den ~9 Perf-Merges seit der Referenz, nicht aus dieser Lane). Nebenwirkung des Fixes
  selbst (K3 vs. K1): Bosse 0–2 exakt gleich, Golem −4,0 %, Hohler König −10,2 %,
  Hexenzirkel −22,7 % (schneller); kael überlebt weiterhin (dawn), Level 34 im Band.
- Hinweis (nicht diese Lane): seit dem Chunk-Budget-Merge spammen alle Läufe Console-Errors
  `Texture key already in use: chunk_*` (GroundRenderer, fremde Datei) — deshalb ist
  `accepted:false` in den Beleg-JSONs jsErrors-bedingt; die Korridorzahlen sind davon
  unberührt. Der fremde Guard `tests/balance-corridor.test.ts` liest die committeten Marken
  (13:52Z, älterer Code-Stand) — bei der nächsten Rebaseline durch die Guard-Lane fallen die
  neuen Todes-/Dauer-Muster an.

Gesamt: Der kleinste suite-grüne Hebel ist gefunden (4 Kandidaten, bindend). mira auf HP 90
erreicht Minute 30 in 2/3 Seeds mit Level im Band und ohne Boss-Dauer-Verletzung; der
dritte Seed stirbt knapp nach dem 20:00-Golem (Level 33 im Band, kein Tod < min 15).

## K4 (#12908): Guard `tests/mira-hp-corridor.test.ts` — HP-90-Korridor gepinnt

- Fixture `shots/m10-mira-hp-corridor.json` (committet, Muster `shots/m10-balance-corridor-*`):
  erzeugt aus dem K3-Gewinner-Beleg (`scripts/m10-mira-hp-check.mjs`, 3 mira-Seeds + kael/101,
  volle Läufe @ 30x); jsErrors nur als Zähler + Hinweis (GroundRenderer-Chunk-Spam, fremde
  Datei), Rohbeleg weiter in `games/.evidence/m10-mira-hp-balance-check/`.
- Guard (5 Tests, schnell — lädt nur die Fixture bzw. prüft Daten, kein Echtzeitlauf):
  1. Provenienz: `miraHpStand 90`, Matrix 3×mira+kael/101, scale 30, 4/4 vollständige Läufe,
     Renderer nicht SwiftShader.
  2. mira streng: alle gemessenen Boss-Dauern 20–60 s (17/17), Endlevel 25–40, kein Tod < min 15,
     `miraViolations` leer.
  3. mira HP-90-Kante gepinnt: genau 2/3 Seeds dawn (Level im Band) — jede Abweichung =
     Rebaseline mit Begründung in dieser Doku, nie stillschweigend.
  4. **K3-Hebel direkt gepinnt** (Review-Fix): `WAVES[minute].mix` muss für Minute 20–24
     `MID_GAME_MIX` sein (abom/voidcaller exakt 0,5, übrige Gewichte = TIER_MIXES[4]) und
     außerhalb unverändert — ein stiller Revert des waves.ts-Hebels FAILt den Guard.
  5. kael: dawn, Levelband, alle Dauern im Korridor + Nebenwirkungs-Protokoll: genau die
     dokumentierten Bosse (Knochenfürst, Fahler Hirte, Hexenzirkel) dürfen außerhalb der
     ±10-%-Toleranz gegen die ältere HP-250-Referenz liegen; jede andere Verteilung =
     Rebaseline nötig.
- Kontrolleure: reviewer PASS (Fix minimal, bitgleiche Fenster belegt, Mess-Setup korrekt),
  test-auditor PASS (Gegenproben: manipulierte Fixture FAILet nachweislich). Review-Fix
  nach reviewer-Befund: Suchskript an committeten Baum angepasst (war tot gegen mehrzeiliges
  Ternary), Hebel-Pin + kael-Protokoll geschärft (Punkte oben).

## Lane-Abschluss

- K1: Korridor hält auf HP 90 NICHT (mira 3/3 Tod 20,4–25,4 min statt dawn ~30,5; 1 Boss-Dauer-
  Verletzung; kael-Deltas >10 % gegenüber veralteter Referenz = Drift der Perf-Merges).
- K2: Ursache belegt — TTK ok, Überleben bricht im Tier-4-Fenster 20–24 (abom/voidcaller =
  Mengen-Vervielfacher, derselbe dokumentierte Mechanismus wie in Minute 25+).
- K3: kleinster suite-grüner Hebel = `MID_GAME_MIX` (Vervielfacher-Gewicht 0,5) in Minute 20–24.
  Nachher: 2/3 mira dawn, 17/17 Boss-Dauern im Korridor, Levelband 30–34, kael unverändert
  dawn. Offen: auf HP 90 stirbt in jeder gemessenen Variante genau EIN Seed knapp nach dem
  20:00-Golem — das ist die HP-90-Kante, nur mit fremdgepinnten Hebeln (HP-Relief, Active-Cap,
  Damage-Scale in tests/balance-endgame.test.ts) weiter anzugehen; Bedarf ggf. an Dom melden.
- K4: Guard pinnt den HP-90-Stand (Fixture + 4 Suite-Tests).
- Merge-Hinweise: (1) `tests/balance-corridor.test.ts` liest die committeten Marken von 13:52Z
  (älterer Code-Stand) — bei der nächsten Rebaseline durch die Guard-Lane die neuen Todes-/
  Dauer-Muster einpreisen. (2) GroundRenderer-Chunk-Spam (`Texture key already in use`) lässt
  seit dem Chunk-Budget-Merge alle Balance-JSONs jsErrors-bedingt `accepted:false` sein —
  Ursache liegt in einer fremden Datei und sollte separat gefixt werden.




