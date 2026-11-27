# m10-ai-budget — Gestaffelte Gegner-KI (AI Budget)

**Job:** Abnahme-Blocker `fullrun-fpsMin 34,8/35,7 < 55` senken — diesmal am
CPU-Posten Gegner-KI. `src/logic/enemy-ai.ts` (`stepEnemyAi` pro Gegner pro Frame,
30 Archetypen) war der letzte große ungedeckte Logic-Posten. Separation/SpatialHash
läuft als eigene Lane (`m10-separation-budget`), FxSystem-Cap als `m10-fx-add-cap`.

## Ansatz: Staffelung statt Weglassen

`stepEnemyAi` wird weiter pro Gegner und Frame aufgerufen (Signatur und Aufruf in
`Run.ts` unverändert — Run.ts ist fremd-geclaimed und wurde nicht angefasst).
Neu entscheidet die Distanz zum Spieler, wie oft ein **voller** KI-Step
(Profil + Entscheidung + Aktionen) passiert:

| Ring | Distanz | Voller Step |
|---|---|---|
| Nah (Combat) | < 220 px | jeder Frame |
| Mittel (View) | 220–420 px | alle 4 Frames |
| Fern (Spawn-Wolke/LOD) | > 420 px | alle 6 Frames |

Die Schwellen folgen den Archetyp-Geometrien: alle spielkritischen Bänder liegen
unter ~210 px (Ranged-Band ≤ 166, Summoner-Band ≤ 204, Orbit-Radius ≤ 92,
Blink-Ring ≤ 77) — im Nahbereich ändert sich nichts. Die halbe Bildschirmdiagonale
des 640×360-Views beträgt ~367 px, der Mittelring deckt also alles Sichtbare ab.

**Zwischen vollen Steps** liefert `stepEnemyAi` das letzte Entscheidungsergebnis
erneut (`AiState.aiMoveX/aiMoveY/aiSpeedMul`, wiederverwendetes Objekt
`aiSkip`, gefrorenes leeres `actions`-Array): Bewegung läuft ununterbrochen in
der letzten Richtung weiter, es gibt **keine wiederholten Aktionen und keine
RNG-Züge** in Skip-Frames.

**Timer laufen realzeitlich weiter** (`timer`, `cooldown`, `phase` werden auch in
Skip-Frames dekrementiert) — Entscheidungs-Kadenz hängt nicht vom Intervall:
Cooldowns, Windup-Dauern und Summon-Rufe behalten ihre Sekunden-Werte, sie
feuern halt auf dem nächsten vollen Step (≤ Intervall−1 Frames Verzug).

**Phase über UID verteilt:** der erste ferne Step setzt `aiStepIn = uid % interval`,
damit nicht alle fernen Gegner im selben Frame einen vollen Step machen
(keine Frame-Spikes).

## Konfiguration

`AI_STAGGER` in `src/logic/enemy-ai.ts`:

```ts
export const AI_STAGGER: AiStaggerConfig = {
  enabled: true,      // false = altes Jeden-Frame-Verhalten (Notbremse/A-B-Test)
  nearDistance: 220,  // px, jeder Frame
  midDistance: 420,   // px, darüber Fernring
  midInterval: 4,     // voller Step alle 4 Frames im Mittelring
  farInterval: 6,     // voller Step alle 6 Frames im Fernring
};
```

## Messung (deterministisch, ohne flock)

`node --experimental-strip-types scripts/m10-ai-budget.mjs --tag=<baseline|after>`
— 500 Gegner, 300 Frames/Pass, Minimum über 11 Passes, Seed 20261127.
Distanzringe wie Endgame-Crowd: 50 % nah (40–220 px), 30 % mittel (220–420),
20 % fern (420–700). Belege: `shots/m10-ai-budget-baseline.json`,
`shots/m10-ai-budget-after.json`.

| stepEnemyAi @ 500 Gegner | ms/Frame |
|---|---|
| Baseline (vorher) | 0.033 |
| Nachher (Staffelung 1/4/6) | **0.024** |
| **Ersparnis** | **−27,3 %** (Ziel −25 %) |

Je Archetyp (reine 500er-Blöcke, ms/Frame): alle Typen von ~0.030–0.036 (vorher)
auf ~0.021–0.025 (nachher) — kein Archetyp wurde teurer.

## Verhaltenssicherung

`tests/enemy-ai-budget.test.ts` (8 Tests):

- **Nahbereich bitidentisch:** alle 30 Gegnertypen gepinnt auf 150 px liefern mit
  Staggering exakt dieselben Metriken wie mit `enabled: false` — jedes-Frame-
  Verhalten für Spieler-nahe Gegner ist gesichert.
- **Kein Cluster bricht:** Cluster-Signaturen aus `tests/enemy-ai.test.ts`
  (vorwärts/rückwärts/Schüsse/Rufe/Blinks/Splits) halten mit Staggering; Events
  je Archetyp ≥ 75 % der Referenz, Distanz-/Kurs-Metriken in Toleranz.
- **Skip-Mechanik:** Skip-Frames ziehen keinen RNG, liefern gefroren-leere
  Aktionen und dieselbe Richtung; fern Gegner steppen ≤ ⌈frames/farInterval⌉+2 mal.
- **Realzeit-Timer:** Phaser blinkt im Fernring mit ≥ 75 % der Referenz-Kadenz.
- **UID-Phase:** `aiStepIn` unterscheidet sich per UID (kein synchroner Step).

Gesamte Suite: 52 Dateien / **529 Tests grün**, `npm run build` grün,
`npx tsc --noEmit` grün. Bestehende `tests/enemy-ai.test.ts` unverändert grün
(10/10) — die Verhaltensmatrix ist mit Nahbereich < 220 px vom Staggering
praktisch nicht betroffen.

## Restrisiken / offene Punkte

- Der Benchmark ist rein logisch (keine Szeneneffekte); der echte FPS-Gewinn
  hängt davon ab, wie viel Endgame-Crowd wirklich > 220 px entfernt ist. Die
  Ring-Verteilung 50/30/20 wurde vom Endgame-Spawn (Minute 25, Deckel 500)
  abgeleitet; die Abnahme (fullrun-fpsMin) muss das final zeigen.
- Fern-Gegner halten ihre Richtung bis zum nächsten vollen Step (max. 5 Frames
  = ~83 ms) — bei Kurswechseln im Sichtbereich-Rand bis zu 1 sichtbares Zittern
  weniger; als unbedenklich eingestuft, da Fern-Gegner meist außerhalb sind.
- `AI_STAGGER.enabled = false` stellt das alte Verhalten jederzeit her.
