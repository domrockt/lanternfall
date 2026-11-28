# Lane m10-dmglabel-cleanup — Karte #7527: damageLabel ausdünnen

Quelle: reviewer-Folge-Karte #7062 aus Lane m10-chaos-fix-dmg-overlap (Commit 1c7f25c).
Befund: nach dem Merge nutzt `src/systems/DamageNumbers.ts` ausschließlich
`formatDamageLabel` (Zeilen 55/339/379); das alte `damageLabel`
(`src/logic/damage-numbers.ts:238`, Signatur mit `AggregateEntry`) war produktiv
ungenutzt, wurde aber exportiert und von 2 Test-Dateien importiert — zwei
Formatter lieferten sonst auseinander (k-Kürzung nur in `formatDamageLabel`).

## Umsetzung (K1: entfernen)

- `damageLabel(entry)` aus `src/logic/damage-numbers.ts` entfernt (keine
  Delegation: die Signatur braucht `AggregateEntry`, und ein Import von
  `formatDamageLabel` aus `systems/` in `logic/` wäre zirkulär).
- Beide Test-Stellen auf `formatDamageLabel(damage, crit)` umgestellt:
  - `tests/m5-jucie.test.ts` (Import Zeile 4, Assertion Zeile 76):
    `formatDamageLabel(list[0].damage, list[0].crit)` → `"20!"` (Wert 10+10, Krit —
    Kurzwert < 100000, Format identisch zum alten Label).
  - `tests/damage-number-batch.test.ts` (Import Zeile 5, Assertion Zeile 51):
    `formatDamageLabel(entries[0].damage, entries[0].crit)` → `"15!"` (Wert 7+8,
    Krit — ebenfalls Kurzwert, Format identisch).
- Für den Import aus `src/systems/DamageNumbers.ts` (importiert Phaser nur für
  PixelText/Scene) nutzen beide Test-Dateien denselben Container-Stub wie
  `tests/damage-grid.test.ts` (`vi.mock("phaser")`).

## Belege (K2)

Vorher (Lane-Stand 1c7f25c / main f16ae7a):
`grep -rn "damageLabel" src/ tests/` → 4 Treffer:
`src/logic/damage-numbers.ts:238` (Definition, ungenutzt produktiv),
`tests/m5-jucie.test.ts:4+76`, `tests/damage-number-batch.test.ts:5+51`.

Nachher: `grep -rn "damageLabel" src/ tests/ | grep -v formatDamageLabel`
→ **0 Treffer** (auch in `src/` allein 0 — kein Delegations-Rest).

- `npx tsc --noEmit` grün.
- `npx vitest run tests/m5-jucie.test.ts tests/damage-number-batch.test.ts
  tests/damage-grid.test.ts tests/damage-calm.test.ts` → 71 Tests grün.
- Volle Suite + Build: siehe Commit (einmal pro Karte).

## Kein Anzeige-Verhalten geändert

Der Anzeige-Pfad bleibt exakt `formatDamageLabel` in
`src/systems/DamageNumbers.ts` (Zeilen 55/339/379, unverändert in diesem Commit).
`damageLabel` war produktiv ungenutzt (nur Tests), daher kann die In-Game-Anzeige
nicht abweichen; Trefferverhalten/Aggregate-Logik unberührt.
