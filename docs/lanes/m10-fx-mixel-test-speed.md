# Lane m10-fx-mixel-test-speed — Karte #10585: fx-mixel Palette-Test < 1 s

Ziel: `tests/fx-mixel.test.ts` › "nur Palettenfarben oder transparent (binaeres Alpha) in jeder
Stufe" läuft unter Last in den vitest-Timeout 5000 ms (2× reproduziert 09:26Z, Rig-Load 18) →
`lf-apk-hourly.sh` baut keine neue APK. K1: Test umbauen auf < 1 s bei gleicher Aussagekraft
(KEIN Timeout-Hochsetzen). K2: 5× grün unter Parallel-Last, Laufzeiten hier dokumentiert.
Keine Änderungen an `src/**`.

## Grundursache

Der Test ruft pro Zeichen `expect(ok(ch)).toBe(true)` — d. h. **hunderttausende vitest-
Assertionen** pro Lauf (alle Mixel-Bakes × Frames × Zeilen × Spalten, Stufen bis 48×5 px).
Jeder `expect`-Call kostet in vitest Chai-Overhead (~µs–10µs); die Summe dominiert die
Laufzeit und skaliert mit CPU-Last. Der Test lebt vom *Vorhandensein* der Prüfung, nicht vom
pro-Zeichen-Assertion-Stil.

## Baseline (vor dem Fix, 09:39Z, Worktree f3f4abc0)

- Einzellauf normal-Last (2 `npm run build` im Hintergrund):
  **1462 ms** Testzeit (`npx vitest run tests/fx-mixel.test.ts -t "nur Palettenfarben" --reporter=verbose`),
  Datei-Duration 2,01 s (86 % tests).
- Unter Rig-Load 18: > 5000 ms → vitest-Timeout (2× 09:26Z, laut Briefing).
- Fix-Ziel (Akzeptanz): Testzeit < 1000 ms in 5/5 Läufen unter Parallel-Last.

## Fix (K1)

Assertion-Stil geändert: pro Zeichen nur noch ein `Set.has()`-Check in einer plain Schleife,
Verletzungen werden gesammelt (Basis, Level, Frame, Koordinate, Zeichen) und **ein** `expect`
je Lauf prüft die Liste. Gleiche Aussagekraft: jedes Zeichen wird geprüft; im Fehlerfall werden
die ersten 20 Verletzungen mit exakter Position gemeldet. `{ timeout: 15000 }` entfernt —
der Default (5000 ms) muss reichen, sonst ist der Fix schlecht.

## K2 — 5× unter Parallel-Last

Akzeptanzgrenze vor der Messung festgelegt: Testzeit < 1000 ms in 5/5 Läufen mit je 2
`npm run build` im Hintergrund (Rig-Last-Simulation). Gemessen 09:40Z, Worktree nach Fix:

| Lauf | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Testzeit ms | 84 | 92 | 87 | 72 | 77 |

**5/5 grün, max. 92 ms** — Faktor ~18 gegenüber Baseline (1462 ms), Akzeptanz < 1000 ms
deutlich erfüllt. Damit reicht der vitest-Default-Timeout (5000 ms) wieder mit großem Puffer;
`lf-apk-hourly.sh` ist entblockt.

## Verifikation (vor dem Commit)

- `npx tsc --noEmit` → rc 0
- `npx vitest run tests/fx-mixel.test.ts` → **17/17 passed**, Datei-Duration 349 ms (vorher > 2 s)
- `npm run build` → rc 0
- Keine Änderungen an `src/**` (`git diff --stat` gegen f3f4abc0: nur tests/ + docs/ + .opencode/board.json)

## Offene Punkte

keine.
