# Lane m10-balance-damp-test (2026-11-28, Versuch 2)

## Ziel
Unbehandelte Bedarfsmeldung aus `requests.md` (Lane m10-balance-spawn-damp): deren K1
(`SPAWN_DAMP_18_24` in `src/data/waves.ts`) ändert die Spawnraten der Minuten 18–24,
aber der Test „Minute 0–24 bleibt unveraendert" in `tests/balance-endgame.test.ts`
friert genau die alten Raten ein. Fix NUR in der Testdatei.

## Umfang (Disponent-Claim)
- `tests/balance-endgame.test.ts` — EINZIGE Code-Änderung
- `docs/lanes/m10-balance-damp-test.md`, `.lane-done`
- Keine Spiel-/Balancedatei angefasst (`src/data/waves.ts` bleibt unberührt).

## Karten
- #8956 K1: Testfenster 0–24 -> 0–17 (Ende = `SPAWN_DAMP_18_24_START_MINUTE`, importiert statt hart). Commit 92d2bf4.
- #8957 K2: Neue Expectation Minute 18–24: Rate = Basis − damp·(Basis − `SPAWN_DAMP_BASE_RATE`),
  Rampe aus importierten Konstanten (`SPAWN_DAMP_18_24`, `SPAWN_DAMP_18_24_RAMP_S`) berechnet —
  bewusst NICHT via `spawnDamp1824()` (Tautologie, Stil wie „Echte Referenz: TIER_MIXES").
  Grenzfall Minute 17 -> 18: Dämpfung startet exakt bei 18 mit Grad 0 (sprungfrei), volle
  Dämpfung ab Minute 22 liegt unter der Basis. Commit 249f7de.
- #8958 K3: npm test + tsc grün auf Stand nach merge-m10-balance-spawn-damp, Belege, .lane-done.

## Dependency-Verlauf
- Branch `m10-balance-spawn-damp` ist fertig (a787d48, alle 5 Karten done, Reviewer PASS,
  `.lane-done`), war bei Job-Start aber noch NICHT in main (Merge-Job lief mit
  m10-evo-fx-dornensturm). K1/K2 deshalb als WIP committet (tsc bis dahin rot, nur wegen
  der fehlenden Exports).
- Nach Merge in main: Lane-Branch mit main aktualisiert (`git merge main`, Richtung
  main -> Lane-Branch, kein Lane-zu-Lane-Merge), dann K3-Verifikation.

## Ergebnis (K3)
- (wird nach Verifikation ergänzt)
