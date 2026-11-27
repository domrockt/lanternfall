# Lane m10-verify-input-fix — F2-Restpunkt aus m10-input-qa schließen

Worktree `/home/ai/games/lf-lanes/m10-verify-input-fix`, Branch `m10-verify-input-fix`.
Auftrag: der offene Restpunkt aus `m10-input-qa` (Bedarfsmeldung in
`/home/ai/games/.dispatch/requests.md`) — `scripts/verify-input.mjs` mit Selektor-FAIL in
Prüfpunkt F2. Nur Harness (`scripts/verify-input.mjs`) + Doku/Belege, keine `src/**`-Dateien.

## K1 — Befund F2 (Commit c8df1ef)

**Der gemeldete FAIL ist an der Lane-Basis bereits behoben** — der Abnahme-Zustand
„verify-input 28/28 PASS“ ist nicht (mehr) gefährdet:

- Original-FAIL aus `m10-input-qa` (`shots/m10-input-verify.json`, unverändert übernommen):
  `Error: tapText: "BRUDER KAEL" nicht sichtbar`, Abbruch nach 2/3 Checks, keine Touch-/Pad-Messung.
- Repro am aktuellen Build (`shots/m10-verify-input-f2-before.json` + `.log`,
  `~/tmp/m10-verify-input-fix/f2-probe.mjs`, URI `http://127.0.0.1:<port>/?debug=1&seed=11`,
  2026-11-27): alter Selektor `"BRUDER KAEL"` in **keiner** Szene sichtbar (`false`), neuer
  PixelText-Wert `"Bruder Kael"` sichtbar (`true`), 0 JS-Fehler.
- **Ursache:** veralteter Selektor. Das CharSelect-Redesign rendert den Namen als
  `PixelText`-Wert `"Bruder Kael"` (Mixed Case, `src/data/characters.ts`), nicht als
  Knopf-Label `"BRUDER KAEL"`. Der im Briefing vermutete 480x270-Klickmapping-Verschieber
  (Muster `verify-menus`, Commit `de22ecb`) war Teil desselben Fix-Pfades: Commit
  `9f298f3` (Lane `m10-input-fix`) korrigierte das Label UND stellte `tapText` auf die
  interaktive Fläche des Eltern-Containers um (PixelText liegt nicht mittig im 9-Slice-Knopf).
  Beides war beim Lane-Start bereits im Branch-HEAD enthalten.
- Kein Spielbug, kein Fix-Nachweis gefälscht: der reproduzierbare Harness-Teil ist mit
  `9f298f3` geliefert; diese Lane belegt ihn nach und härtet das Skript.

## K2 — Harness-Härtung (Commit a2ff910, nur `scripts/verify-input.mjs`)

1. **`--tag <name>`:** Belege laufen nach `shots/m10-verify-input-<tag>.json` +
   `-<tag>-*.png`. Ohne Tag bleibt das alte Verhalten (`shots/m8-input.json`,
   `shots/m8-input-*.png`) — damit schreiben Wiederholungs-/Lastläufe keine geschützten
   `m8-*`-Pfade mehr voll (Befund in dieser Lane: der erste ungetagte Lauf überschrieb
   13 `shots/m8-input-*`-Dateien; zurückgesetzt mit `git restore`).
2. **Zustands-Waits statt fester Wartezeit** (`waitState(page, key, value)`):
   nach Pause/FORTSETZEN/Truhen-Tipps (Touch und Gamepad) wird auf den Zielzustand
   gewartet statt eine feste ms-Zahl zu schlafen — Muster wie die `verify-menus`-Korrektur.
3. Validierung: `--tag k2` → 28/28 PASS, 0 JS-Fehler (`shots/m10-verify-input-k2.json`).

## K3 — Stabilität: 3x PASS + Lastlauf (dieser Commit)

Ergebnis (finaler Harness-Stand, 2026-11-27 18:38–18:47 UTC, `~/tmp/m10-verify-input-fix/k3-final.log`):

| Lauf | Checks | JS-Fehler | rc |
|---|---|---|---|
| `pass-1` | 28/28 PASS | 0 | 0 |
| `pass-2` | 28/28 PASS | 0 | 0 |
| `pass-3` | 28/28 PASS | 0 | 0 |
| `load` (zwei Build-Loops im Hintergrund) | 28/28 PASS | 0 | 0 |

Belege: `shots/m10-verify-input-pass-{1,2,3}.json`, `shots/m10-verify-input-load.json`
(samt `-<tag>-*.png`-Serien). `npm run build` rc=0, `npx vitest run` 446/446 grün (42 Dateien).

### Ehrliche Befunde aus den Fehlversuchen (2 Korrekturzyklen, beide im Log behoben)

- **Zyklus 1 (Lastlauf 27/28 FAIL `Touch: FORTSETZEN per Tippen`, `k3-runs.log`):** unter
  paralleler Last ging der erste FORTSETZEN-Tipp verloren (Overlay noch nicht input-bereit);
  Fix: EIN begrenzter zweiter Versuch am selben Prüfpunkt, danach ehrlich FAIL
  (`k3-load-retry1.log`). Kein Spielbug — der Sicherheitsnetz-Pfad in der Touch-Minute
  (gleicher Tipp) funktionierte im selben Lauf, `sim=66.6s`.
- **Zyklus 2 (Retry-Lauf FAIL `page.waitForFunction: Timeout 30000ms` in
  `runGamepadSuite`, `k3-load-retry1.log`):** echter Harness-Bug —
  `page.waitForFunction(fn, { timeout: 8000 })` übergibt `{timeout}` als **arg**, nicht als
  **options** (Playwright-Signatur `waitForFunction(fn, arg, options)`); die Optionen wurden
  nie angewendet, es galt der 30-s-Default, und der Seiten-Kaltstart unter Last dauerte
  länger. Fix: Konflation an allen 7 Stellen korrigiert (`undefined` als arg) und
  Boot-Waits explizit auf 45 s gesetzt, ESC-Waits 6 s, Level-up-Waits 5 s.
- Lastgenerator: zwei Hintergrund-Loops (`npm run build` bzw. `npx vite build`, 40
  Iterationen) während des gesamten Lastlaufs — deutlich härter als „zwei Builds“.

## Abnahme

- [x] `node scripts/verify-input.mjs` 28/28 PASS × 3 + Lastlauf 28/28 PASS, 0 JS-Fehler.
- [x] `npx vitest run` 446/446 grün; `npm run build` rc=0.
- [x] Änderungen nur `scripts/verify-input.mjs` + `docs/lanes/m10-verify-input-fix.md` +
      `shots/m10-verify-input-*`; `src/**`, `GAME.md`, `ACCEPTANCE.md`, `shots/m8-*` unangetastet.
- [x] F2-Ursache benannt und belegt; kein gefälschter Fix-Nachweis — Grundfix war 9f298f3
      (m10-input-fix), diese Lane dokumentiert und härtet.
