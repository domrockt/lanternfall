# Lane m10-spawn-burst-budget — Spawn-Burst-Glättung (M10)

Ziel: Abnahme-Blocker `fullrun-fpsMin < 55` — Tier-/Wellen-Spawns kommen in
Bursts (Frame-Hitch → Spawn-Rückstau → 40+ Spawns in einem Frame → Frame-Zeit-
Spitze). Die Lane glättet die Spawn-Last gleichmäßig über die Frames, ohne
Spawn-Zusammensetzung oder Timing (Bosse exakt alle 5 min) zu ändern.

## Mechanismus (K2)

- `src/logic/waves.ts`: `SPAWN_FRAME_BUDGET = 8` + reine Funktion
  `splitSpawnBurst(granted, allowance)` → `{ now, deferred, allowanceLeft }`.
  Nie mehr als `allowance` Spawns pro echtem Frame; `now + deferred === granted`
  (Summe bleibt erhalten); NaN/negativ/fractional → abgedeckt.
- `src/systems/Spawner.ts`: Allowance wird je echtem Frame
  (`game.loop.frame`) zurückgesetzt; im Substep wird `toSpawn` (nach dem
  unveränderten `room`-Clamp) geteilt, der überschüssige Anteil kehrt ins
  Restbudget zurück (`this.budget += deferred`) und wird in späteren Frames
  nachgeholt.
- **Unverändert:** Spezialwellen (Ring/Stream), Elite-Pakete und Boss-Spawns
  gehen nicht durch die Glättung (0 ms Zusatz, Timing unberührt); Cap-Drop-
  Semantik (`toSpawn = min(count, room)`) bleibt exakt erhalten.

## Messung (K1/K4)

`scripts/m10-spawn-burst.mjs` (headless, fullrun-Setup: god+autoplay,
Max-Out, timeScale 30, seed 99): je echtem Frame Spawn-Delta (aus
`lf-spawner.spawnCounts`) + reale Frame-Zeit (`game.loop.rawDelta`).

## Ergebnisse

(K1/K4 werden nach Messlauf ergänzt.)

## Tests

`tests/spawn-burst.test.ts` (8 Tests): Budget-Grenze, Summen-Erhalt,
30-min-Sim mit/ohne Glättung identische Spawn-Summe (Hitch-Dt-Modell),
Rückstau-Abbau nach 10-s-Hitch, Grenz-/Müllwerte.

## Offene Punkte

- Bei Minute-Grenzüberschreitung kann ein nachgeholter Spawn die Mischung des
  nächsten Minutes-Abschnitts um wenige Einheiten verschieben (Rate-Karre,
  nicht Komposition im gedrängten Moment); Spawn-Summe bleibt identisch.
- flock-Konkurrenz: Vorher-Messung muss warten, bis die Nachabnahme-Lane
  (30-min-realtime) die Messsperre freigibt.
