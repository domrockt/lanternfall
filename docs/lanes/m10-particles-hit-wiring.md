# Lane m10-particles-hit-wiring (M10, 2026-11-28)

Bedarfsmeldung m10-fx-medium-cap (18:15Z): `particlesPerHitFor()` (src/logic/quality.ts)
ist reine Daten ohne Aufrufort in src/. Diese Lane verdrahtet die Funktion in den
Hit-Partikelpfad — Rest-Hebel 1 aus docs/lanes/m10-fx-medium-cap.md. Der
fxActive-Median <= 80 wird erst mit BEIDEM (K2-Senkung 14 -> 10 in m10-fx-medium-cap
**und** diesem Wiring) messbar; der Merge-Konflikt ist ausgeschlossen (disjunkte
Dateien: nur src/systems/CombatSystem.ts + eigene Test/Probe/Doku hier).

## K1 — Aufrufort Hit-Partikel (Befund, #13914)

Der universelle Trefferpfad ist **`hitEnemy()` in src/systems/CombatSystem.ts**
(alle 9 Damage-Eingänge laufen darüber: melee-Swings, Projektile, Orbs, Seals/
Thunder-Chain, Winter-Tick, Burns — grep `hitEnemy(`, Zeilen 543/588/780/816/963/
1072/1150/1191/1389). Dort wird pro Treffer ein Partikel-Burst gespannt:

```ts
this.particles.burst("fx_star", e.x, e.y, crit ? 5 : 2, {
  life: 0.16, tint: crit ? PAL[C.lanternWhite] : PAL[C.emberOrange],
  scaleTo: 0.12, alphaFrom: 0.9, additive: true,
});
```

Das ist der konstante Wert, der an `particlesPerHitFor(qualityTier)` gebunden wird.

**Bewusst NICHT verdrahtet** (Begründung, lanes/common.md minimaler Griff):
die waffenspezifischen Zusatz-Bursts (`strike()` 9 Funken beim Blitz-Einschlag,
`wrath_pendulum` 3, Thunder-Chain 4) sind Waffen-Inszenierung, nicht der
generische Trefferpfad; `hitEnemy()` deckt jedes Trefferereignis ab. `quality.ts`
blieb unangetastet (Claim m10-fx-medium-cap), FxSystem/config/Run/main tabu.
K1 braucht keinen Code-Griff: Hypothese aus der Bedarfsmeldung bestätigt.

## K2 — Wiring (#13915)

Neue reine Helferfunktion (exportiert aus CombatSystem.ts, unit-getestet in K4):

```ts
export function hitParticlesFor(crit: boolean, tier: ThermalTier): number
```

Skala = `particlesPerHitFor(tier) / particlesPerHitFor("high")` — **high bleibt
bitgleich** (Skala 1: crit 5 / normal 2 wie bisher), medium/low/thermal skalieren
die Treffer-Funken proportional zum Budget:

| Tier | Budget | crit | normal |
|---|---|---|---|
| high | 24 | 5 | 2 |
| medium | 14 | 3 | 1 |
| low | 8 | 2 | 1 |
| thermal | 4 | 1 | 1 |

Keine Balance-/Schadensänderung, Burst-Optik (life/tint/alpha/scale) unverändert,
Spawn-Reihenfolge in `hitEnemy()` unverändert.

## K3 — Probe (#13916)

`scripts/m10-particles-hit-wiring.mjs`: Tabelle Spawn-Anzahl pro Hit vorher
(konstant) / nachher (wired) je Tier. Die Budgets liest das Skript LIVE aus
`src/logic/quality.ts` (kein Duplikat — Wert 14 oder 10 nach Merge beides ok).
JSON-Beleg: `~/games/.evidence/m10-particles-hit-wiring/probe.json` (2026-11-28T18:32Z).

Ergebnis (Budget-Stand 24/14/8/4):

| Tier | vorher crit/normal | nachher crit/normal |
|---|---|---|
| high | 5 / 2 | 5 / 2 (bitgleich) |
| medium | 5 / 2 | 3 / 1 |
| low | 5 / 2 | 2 / 1 |
| thermal | 5 / 2 | 1 / 1 |

Verdict im JSON: highUnchanged, mediumReduced, monotonic — alle true.

## K4 — Regressionstest (#13917)

`tests/particles-hit-wiring.test.ts`: Tier-Tabelle (high bitgleich, medium/low/
thermal gesenkt, monoton), Quell-Guard für unveränderte Spawn-Reihenfolge/Position
in `hitEnemy()`.

## Abnahme

- K4-Test grün, `npx tsc --noEmit` rc=0, `npm test` grün, `npm run build` rc=0.
- Probe: Partikel pro Hit medium sinkt messbar (Wert aus quality.ts, hier 14 —
  m10-fx-medium-cap senkt auf 10, beide akzeptiert; das Wiring ist wertunabhängig
  korrekt), high unverändert.
- Merge-Hinweis: fxActive-Median <= 80 erst mit K2-Senkung **und** diesem Wiring
  messbar (siehe oben).

## Kontrolleur-Urteile (2026-11-28)

- **test-auditor: PASS** — 6/6 grün; Formel-Test rechnet die Erwartung unabhängig
  aus `qualityBudgetFor` nach (keine Tautologie); Quell-Guards erzwingen Wiring +
  Spawn-Reihenfolge; Suite 2601/2601, tsc rc=0.
- **reviewer: PASS** — Rundung verifiziert (high bitgleich 5/2, medium 3/1, low
  2/1, thermal 1/1); `QUALITY` wird in `hitEnemy()` beim Aufruf gelesen, Tier-
  Wechsel greifen sofort; Claims sauber (genau die 4 Lane-Dateien im Diff);
  kein Import-Zyklus; Probe/Test sinnvoll. Nits (kein Blocker): Magic Numbers
  5/2 in `hitParticlesFor` (vom Test gepinnt); Probe-Regex hängt an der Quell-
  Reihenfolge der `particlesPerHit:`-Felder in quality.ts (echte Änderungen
  fallen über den K4-Formel-Test auf).

Commits: 58df7f36 (K1) · 4b6edb6a (K2) · aac67583 (K3) · 8a2bafd3 (K4).
