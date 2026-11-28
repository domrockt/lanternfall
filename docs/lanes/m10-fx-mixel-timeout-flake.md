# Lane m10-fx-mixel-timeout-flake (B2: Test-Timeout-Flake fx-mixel)

## Auftrag
Befund B2 (Minor) aus `docs/lanes/m10-sightprep-smoke.md`: `tests/fx-mixel.test.ts >
nur Palettenfarben oder transparent …` brach unter Volllast (166 parallele
Worker-Dateien, `npm test`) mit TestTimeoutError nach 5000 ms ab (1762/1763);
isoliert 2/2 gruen. Kein Funktionsfehler, reiner Last-Timeout.

## Fix
Timeout des betroffenen Testfalls in `tests/fx-mixel.test.ts` (Test `nur
Palettenfarben oder transparent (binaeres Alpha) in jeder Stufe`) von Default
5000 ms auf 15000 ms erhoeht (drittes `it()`-Argument). Keine Serialisierung
noetig; keine Produktionscode-Aenderung (Abnahme: nur Testdatei + Doku).

## Belege (nach ~/games/.evidence/m10-fx-mixel-timeout-flake/)
- `vitest-isolated-1.log`, `vitest-isolated-2.log`: je 2x isoliert
  `npx vitest run tests/fx-mixel.test.ts` → 17/17 gruen.
- `npm-test-full.log`: 1x `npm test` Gesamtlauf gruen.
- Aenderung: nur `tests/fx-mixel.test.ts` (+ diese Doku). `git diff --stat` siehe Commit.

## Offene Punkte
- keine.
