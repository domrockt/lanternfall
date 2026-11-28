# Lane m10-spawn-budget-dt — Spawn-Zuteilung deterministisch (dt-Basis)

Bedarfsmeldung m10-pause-freeze (#7505 in `~/games/.dispatch/requests.md`, 2026-11-28):
zwei Kontrollläufe mit gleichem Seed divergieren bereits ohne Pause. Teil 1 des
Determinismus-Schnitts; Folgelanen: m10-ai-rng-seed (EnemyPool AI-RNG),
m10-run-determinism-fix (Run.ts Substep-Phase), m10-shot-budget-dt (gleiche
Befundklasse im EnemyProjectilePool).

## Root Cause (belegt)

`src/systems/Spawner.ts` verteilte den Spawn-Budget-Abtrag **je echtem Frame**:
`lastSpawnFrame`/`spawnAllowance` setzten `SPAWN_FRAME_BUDGET = 8` Spawns pro
`scene.game.loop.frame` zurück. Der Abtrag eines Budget-Rückstaus hing damit an
der **Echtzeit-FPS** (timeScale 30: 60 fps → 16 Spawns/Sim-s, 30 fps → 8/Sim-s).
Der Budget-Akkumulator selbst (`advanceSpawnBudget`, budget += rate*dt mit
Rest-Carry) war bereits dt-basiert — der Frame-Bezug saß allein in der
Allowance; sobald ein Rückstau existierte (Frame-Hitch, Pause, Kap-Druck),
divergierten die Spawn-Marken zweier Läufe mit gleichem Seed.

Grenzen eingehalten: `src/logic/waves.ts` (Zusammensetzung, Tier, Boss-Timing,
Gesamt-Spawn-Zahl) und `src/systems/EnemyPool.ts` unangetastet.

## Fix (#7759, Commit 7222f5c)

`accrueSpawnAllowance(acc, dt)` (reine Funktion in Spawner.ts):
- Allowance wächst mit Sim-Zeit: `SPAWN_ALLOWANCE_PER_SECOND = 8 * 60 = 480`
  Spawns/Sim-s (entspricht exakt dem alten 60-Hz-Verhalten),
- ganzzahliger Abgriff via `floor`, Bruchteil bleibt stehen,
- Deckel `SPAWN_ALLOWANCE_MAX = 2 * SPAWN_FRAME_BUDGET` (kein unbegrenzter
  Burst nach Kap-Druck/Hitch), ungenutzte Allowance kehrt zurück,
- verzögerte Spawns kehren weiter über `splitSpawnBurst().deferred` ins
  Restbudget (Summe exakt erhalten), `lastSpawnFrame` entfernt.

## Messung (scripts/m10-spawn-budget-dt.mjs)

Headless-Probe: echtes `Spawner.ts` per rolldown gebündelt, `phaser` und
`EnemyPool` per Plugin-Stub, Stub-Pool (count 0 → kein Kap-Druck, Regler
ungenutzt). Substep-Rationen-Modell a 1/20 s (sim = steps*STEP, kein
Akkumulations-Drift); variiert wird nur die Ration je echtem Frame
(60 fps = 10, 30 fps = 20, Jitter = 5..25) plus zwei sim-alignierte
60-Sim-s-Hitches (Sim 30-90, 90-150), die einen Rückstau erzeugen.
`--src=…/before-src/src` für faire A/B-Läufe (alter Stand via
`git archive 7453c1d src`), `--expect-identical` setzt rc=1 bei Divergenz.

**Vorher** (shots/m10-spawnbudget-before.json, alter Spawner): 4 Szenarien,
je 75 Spawns, Gesamt-Spawn-Zahl konserviert (Δ < 1e-6 gg. integral(rate)),
aber 3 verschiedene Marken-Hashes; Minute 1 landen je nach Frame-Folge nur
**8 statt 27** Spawns in der Welle (Verteilung, nicht Summe); erste
Marken-Differenz 60fps vs 30fps bei Marke 35 (t=150.55 vs 151.05).

**Nachher** (shots/m10-spawnbudget-after.json, `--expect-identical` → rc 0):
ein Hash `f1750b6c` über alle 4 Szenarien (bitgleiche Marken t/id/elite),
Konservierung weiter exakt.

## Tests

- `tests/spawn-budget-dt.test.ts` (neu, 9 Tests): Akkumulator/Deckel/NaN,
  ganzzahliger Abgriff ohne Verlust, Determinismus über 3 Frame-Folgen mit
  Hitches (Marken, spawnCounts, Budget bitgleich), Konservierung,
  Verteilung je Welle == ungeglättete Referenz, Burst-Deckel bleibt.
- `tests/spawn-burst.test.ts` (fremd, laut claims.json unclaimed; Anfrage in
  requests.md): der Integrationstest mit der alten Frame-Reset-Semantik wurde
  auf die dt-Akkumulator-Semantik umgeschrieben (Intention Burst-Deckel +
  Summenerhalt unverändert), der zweite Integrationstest passt unverändert.
- `npx tsc --noEmit`, `npm test` (118 Dateien / 1288 Tests), `npm run build`: grün.

## Balance-Sanity (#7760)

`node scripts/m10-spawn-budget-dt.mjs --sanity` (Playwright, Kael/Seed 101,
autoPlay, kein God, timeScale 30, 10 min Sim, OHNE flock):
Level 20, 825 Kills, Boss 1 in 27 s (Korridor 20-60 s), 0 JS-Fehler →
**PASS** gegen shots/m10-balance-kael-final.json (shots/m10-spawnbudget-kael-sanity.json).

Einordnung: timeScale-30-Messläufe verschieben sich leicht nach oben
(Referenz-Altkurve ts30-deferred: Level 17 / 620 Kills bei min 10 → jetzt
20 / 825), weil Spawns nicht mehr an Echtzeit-Frames deferred werden —
das ist die beabsichtigte Korrektur. **timeScale-1-Spielverhalten ist
bitgleich** (dort band die Allowance nie: max. Spawnrate 2,3/Sim-s « 480/Sim-s).
Projektion levelAt30 ≈ 29-31, weiter im Korridor [25, 40].

## Offene Punkte / Restrisiken

1. **Frame-Budget-Regler** (`stepFrameBudget` in scaling.ts, geführt mit
   echtem `loop.delta`) bleibt echtzeit-abhängig — greift aber nur bei
   Kap-Druck (>320 aktive Gegner, >1 s Überlast) und damit nicht im
   Spawn-Marken-Fenster dieser Probe. scaling.ts läuft bei m10-balance-endgame;
   falls Cross-Run-Bitgleichheit auch unter Last gefordert wird, muss der
   Regler-Fuß in einem Folgeschnitt sim-basiert werden.
2. **Run.ts variable Substep-Phase** (Befund m10-run-determinism): zwei
   Sanity-Browser-Läufe mit Fix ergeben 836 vs 825 Kills — die Spawn-Phase
   ist deterministisch, der Gesamt-Run wird erst mit m10-run-determinism-fix
   (Quantifizierung) + m10-ai-rng-seed bitgleich.
3. m10-shot-budget-dt: gleiche Befundklasse (launchBudgetPerFrame) im
   EnemyProjectilePool — Hebel dort analog (dt-Akkumulator).
