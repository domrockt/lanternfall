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
- **blocked (Supervisor-Abbruchkriterium, 2026-11-28):** Der Merge-Job hatte `m10-balance-spawn-damp`
  nach ~75 min Wartezeit (mehrere synchron begrenzte Wartefenster, danach einmalige Prüfung auf
  Supervisor-Anweisung) noch nicht in main übernommen — main lief währenddessen weiter
  (zuletzt `merge m10-pad-start-pause-r2`, 7310e1c). Der Job selbst ist aktiv, die Queue-Reihenfolge
  aber nicht sichtbar.
- Stand bei Abbruch:
  - K1 committet (92d2bf4): Testfenster 0–17, Ende = importiertes `SPAWN_DAMP_18_24_START_MINUTE`.
  - K2 committet (249f7de): Dämpfungs-Expectation aus importierten Konstanten berechnet
    (`SPAWN_DAMP_18_24=0.6`, `SPAWN_DAMP_18_24_RAMP_S=240`, `SPAWN_DAMP_BASE_RATE=1.484`,
    read-only via `git show m10-balance-spawn-damp:src/data/waves.ts` verifiziert — kein checkout/merge).
    Grenzfall Minute 17->18 sprungfrei (Dämpfungsgrad 0 exakt bei Minute 18), volle Dämpfung ab 22.
  - `npx tsc --noEmit` rot AUSSCHLIESSLICH wegen der 4 fehlenden Exports aus `src/data/waves.ts`
    (TS2305 ×4) — der Test-Edit selbst ist vollständig.
- Karte #8956 im Board `blocked` mit Grund; #8957/#8958 folgen demselben Dependency-Block.

## Versuch 3 (2026-11-28): Lane redundant — Bedarf von der Dependency-Lane selbst bedient

**Befund:** Die Dependency-Lane `m10-balance-spawn-damp` hat den Test-Fix bereits SELBST
auf ihrem Branch (Commit `808e3f3`, „K1 WIP“): `tests/balance-endgame.test.ts` dort enthält

- Import von `SPAWN_DAMP_18_24` aus `src/data/waves.ts`,
- Test umbenannt: „Minute 0–17 bleibt unveraendert, 18–24 spawn-gedaempft (SPAWN_DAMP_18_24)“,
- Fenster 0–17 bitgleich (alte Rate), Dämpfungs-Expectation für Minute 18–LATE_GAME_MINUTE:
  `base - damp*(base - base18)` mit `damp = SPAWN_DAMP_18_24 * min(1, (minute-18)*60/240)`
  — Minute 18 → Grad 0 (sprungfrei), volle Dämpfung ab Minute 22.

Das ist inhaltlich deckungsgleich mit unseren K1/K2-Edits (`92d2bf4`, `249f7de`), zielt auf
dieselben Hunks derselben Datei und war im Briefing noch nicht sichtbar (der requests.md-Bedarf
wurde von der Lane selbst übernommen, nicht offen gelassen).

**Konsequenz:** Unsere Test-Edits wären bei Merge von `m10-balance-spawn-damp` in main ein
sicherer Konflikt, und dieser Branch kann standalone nie grün werden (die 4 Exports fehlen,
bis jene Lane gemergt ist). Versuch 1+2 warteten vergeblich auf den Merge (Supervisor-
Abbruchkriterium), Versuch 3 bricht den Loop ab (Regel „gleicher Fehlversuch 3x = Stopp“).

**Maßnahme (Versuch 3):**
- Eigene Edits an `tests/balance-endgame.test.ts` zurückgenommen — Datei ist wieder
  bitgleich mit main (`git diff main -- tests/balance-endgame.test.ts` = leer).
  Keine Code-Änderung dieser Lane bleibt im Diff; `src/data/waves.ts` wurde zu keiner Zeit
  angefasst (Disponent-Claim eingehalten).
- Verifikation auf dem zurückgenommenen Stand: `npx tsc --noEmit` rc=0,
  `npx vitest run tests/balance-endgame.test.ts` 9/9 grün.
  Beleg: `~/games/.evidence/m10-balance-damp-test/m10-balance-damp-test-versuch3.json`.
- Ergebnis der Lane-Ziele (Fenster 0–17 + Dämpfungs-Expectation Minute 18–24 aus importierten
  Konstanten, Grenzfall 17→18 sprungfrei) ist durch `808e3f3` in `m10-balance-spawn-damp`
  erreicht und kommt mit deren Merge in main. Karten #8956–#8958 damit geschlossen.
