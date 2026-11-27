# Lane m10-heap-margin — Heap-Marge 780-Pfad (Endgame)

Ziel (Briefing): Heap-Wachstum auf dem 780-Pfad (780x360@3, Minute-20-29-Endgame-Szenario,
500 Gegner + Projektile + Damage-Text) von knapp FAIL (+14,1 %, Ziel <= 15 %) auf <= 12 % senken,
ohne `fullrun-fpsMin` zu verschlechtern. Keine Gameplay-/Damage-/Balance-Werte geändert —
nur Allokationsverhalten.

## Messmethode

`scripts/m10-heap-margin.mjs`: reproduziert das Endgame-Allokationsprofil (seed 99, sim Minute 20→29,
timeScale 60), misst JS-Heap nach erzwungenem Voll-GC am Fensteranfang/-ende plus Sampling-Heap-Profil
(Top-Alloc-Sites) und eine Churn-Probe (`add`-Zähler je Sprite-Key). Läuft absichtlich **ohne** flock
(lastunabhängig; festes Substep-Fenster). Beweisbilder/JSON in `shots/m10-heap-margin-*.json`.

## Vorher/Nachher

| Kennzahl | Vorher (Vor-Fix-Build) | Nachher (Fix-Build) | Ziel |
|---|---|---|---|
| Heap from→to | 31,2 → 35,6 MB | 35,2 → 36,2 MB | — |
| **Heap-Wachstum** | **+14,1 %** (+4,4 MB) | **+2,8 %** (+1,0 MB) | <= 12 % ✅ |
| fpsMin (eigener Lauf) | 19,4 | 20,3 | nicht schlechter ✅ |
| JS-Fehler | 0 | 0 | 0 ✅ |
| Kills / Gegner Ende | — | 4782 / 40 | Plausibilität ✅ |

Belege: `shots/m10-heap-margin-before.json` (+14,1 %), `shots/m10-heap-margin-after.json` (+2,8 %),
`shots/m10-heap-margin-churn-probe.json`.

## Benannter Hebel (in der Area gefixt)

**`ProjectilePool.trailFrames`** (`src/systems/ProjectilePool.ts`): pro Spawn wurde ein **neues Array**
für `trailFrames` allokiert (Objekt-Churn über 1000+ Spawn/Free-Zyklen im Endgame-Fenster).
Fix (#4599): `trailFrames` wird **in place** befüllt (Array-Identität bleibt über die Pool-Lebensdauer
erhalten, `length`-Reset + elementweises Überschreiben), Factory erzeugt das Feld einmal.
Pooling/Reuse in `Pool.ts` war bereits korrekt (durch Tests belegt, kein Doppel-Release,
`createdTotal` konstant über 1000 Recycle-Zyklen).

Tests: `tests/heap-margin.test.ts` (8/8 grün) — Pool-Reuse leak-frei über 1000 Recycle-Zyklen,
deterministisches Freigeben über 1000 Spawn/Free-Zyklen (Sprite-Factory-Zähler konstant),
trailFrames-Identität, hit-Set-Reset, prewarm/releaseAll.

## Churn-Probe: Top-Allokatoren außerhalb der Area (Fix-Empfehlungen)

Die verbleibenden Top-Allokatoren liegen **außerhalb** der Lane-Area (Pool.ts/ProjectilePool.ts) und
wurden NICHT angefasst. Churn-Probe (Endgame-Fenster, 9 sim-Minuten):

| Allokator | Quelle | Churn je Fenster | Empfehlung (Datei, Hebel, erwarteter Gewinn) |
|---|---|---|---|
| `chain_link` | CombatSystem (Flail-Kette) | **9 968** Sprites neu | Kette als Sprite-Pool mit fester Größe (analog trailFrames-Fix): `src/systems/CombatSystem.ts`, Kettenglieder reuseten statt `add.image` je Glied je Swing; erwarteter Gewinn: größter Einzelposten im Endgame |
| `fx_fire` / `fx_halo` / `flail_ball` / `fx_seal` | CombatSystem/FxSystem | 6 422 + 1 246 + 1 246 + 1 869 | FX-Sprites poolen oder Runtime-Atlas-Sprite-Reuse in `src/systems/CombatSystem.ts` + `src/systems/FxSystem.ts`; gleicher Hebel wie Kette |
| `enemy_shot_hd_fire` | EnemyProjectiles (Trail-Sprites) | **2 348** | Trail-Sprites poolen und/oder Trail-Spawnrate deckeln: `src/systems/EnemyProjectiles.ts`; erwarteter Gewinn ~1/4 des Kette-Postens |
| `image:shadow` (Prop-Shadows) | GroundRenderer | **2 339** Images | Prop-Shadows pro Chunk als ein wiederverwendetes Image-Set statt `add.image` je Prop: `src/gfx/GroundRenderer.ts` (`addProp`, Zeile ~526); Alternativ Shadows in den Chunk-RT-Canvas backen |
| `water_ripple_0` | GroundRenderer/Wasser | 833 | Ripple-Images poolen oder animieren statt neu hinzufügen |

Im Nachher-Lauf dominieren dieselben Sites das Sampling-Profil (`addProp`, `set`, `initialize`,
`add` — Phaser-Internals + die obigen Systeme). Kein zweites blindes Messen derselben Frage:
nächster Hebel ist der CombatSystem-Sprite-Pool (Kette + FX), danach EnemyProjectiles-Trails.

## Abnahme (Karte #4601)

- Heap-Wachstum 780-Pfad **+2,8 % <= 12 %** ✅ (belegt in `shots/m10-heap-margin-after.json`)
- fpsMin eigener Nachher-Lauf **20,3 >= 19,4** (Vorher) ✅
- `npx tsc --noEmit` grün ✅, `npx vitest run tests/heap-margin.test.ts` 8/8 grün ✅
- Keine Gameplay-/Damage-/Balance-Änderungen (nur `ProjectilePool.trailFrames`-Allokation) ✅
