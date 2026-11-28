# Lane m10-v10-flake-sweep — Flake-Sweep vor v1.0 (2026-11-28)

Ziel: EIN systematischer Sweep statt einzelner Build-Blocker-Entdeckungen. Befund-Sammlung,
KEINE src-/Test-Änderungen. Karten: #13870 (Sweep-Skript + 3 Läufe), #13871 (Befundliste),
#13872 (Bedarfsmeldungen + .lane-done).

## Ergebnis: 0 Flakes in 3 Läufen (K3-Fall)

3 vollständige Suite-Läufe (`npm test` = vitest run, je 2575 Tests) auf Branch
`m10-v10-flake-sweep`, HEAD 023d195e+Skript-Finalisierung:

| Lauf | Tests | PASS | FAIL | Dauer (incl. npm-Boot) | Start (UTC) | exit |
|---|---|---|---|---|---|---|
| 1 | 2575 | 2575 | 0 | 6,5 s | 18:57:04 | 0 |
| 2 | 2575 | 2575 | 0 | 5,8 s | 18:57:10 | 0 |
| 3 | 2575 | 2575 | 0 | 5,7 s | 18:57:16 | 0 |

**Kein einziger Test-FAIL über 3 Läufe → kein flaky Test im Sweep-Zeitraum.** Belege:
`shots/m10-v10-flake-sweep-run{1,2,3}.json` (git-ignoriert, Arbeitsstand) und dauerhaft in
`~/games/.evidence/m10-v10-flake-sweep/run{1,2,3}.json`.

## Methode (scripts/m10-flake-sweep.mjs, neu)

- 3x `npm test`, synchron, kein sleep-Warten, harter Timeout 900 s je Lauf.
- Je Lauf Summary-JSON: Pass/Fail-Zahl, Dauer, Liste FAILender Tests (Datei, Testname,
  Fehlerklasse Timeout/Error/Reihenfolge/Assertion, Fehlermeldung gekürzt). Suite-/Import-Fehler
  ohne einzelnen failed Test werden als Datei-Fehler erfasst.
- **Abweichung vom Karten-Text „unter flock“, begründet:** erster Versuch mit
  `flock -w 900 .lf-perf.lock` verbrannte 3×900 s Wartezeit auf der fremdbelegten Sperre
  (Perf-Lane) — rc=1 nach je 900 s, null getestete Tests (18:11–18:26Z, Summary-JSONs
  run{1,2,3} im Arbeitsstand zeigen es). common.md sagt ausdrücklich: Tests laufen OHNE flock
  („sonst blockiert eine Lane die andere 10+ min“). Das Skript ist deshalb ohne flock, Opt-in
  für Kontrollzwecke per `FLAKE_SWEEP_FLOCK=1`. Mess-Sperre ist nur für FPS/Echtzeit-Messungen.

## Historische Flakes vs. Sweep-Befund

| Historischer Befund (Briefing) | Repro-Rate im Sweep | Fehlerklasse |
|---|---|---|
| fx-mixel Timeout (09:30Z, APK 09:26 blockiert) | 0/3 | Timeout |
| weapons-Flake | 0/3 | Flakiness |
| chest-roll-names 1x FAIL bei Last | 0/3 | Last-abhängig |
| heap-budget unmessbarer Zufall (m10-heap-gate-retry) | 0/3 | Zufall/Messung |

**Einordnung / Grenze der Aussagekraft:** Die Suite läuft im Sweep ~6 s pro Lauf ohne künstliche
Last — Flakes, die nur unter paralleler Lane-Last oder in Langläufen auftreten (chest-roll-names
„bei Last“, fx-mixel im Langlauf), können hier systematisch unsichtbar sein. Der Sweep ist damit
ein **Grün-Beleg für den Standard-Lauf**, kein Beleg für Last-/Langlauf-Stabilität.

## Hebel-Vorschläge / Bedarf

Auf Basis dieses Sweeps: **keine Fix-Jobs nötig** (0 Befunde → keine Zeile je Befund; eine
Informationszeile in `/home/ai/games/.dispatch/requests.md` vermerkt das Ergebnis).

Bekannter, hier erneut beobachteter Seiteneffekt (kein neuer Bedarf, gehört zu E-4 /
Lane m10-verify-outputs-hygiene): jeder Suite-Lauf schreibt `shots/m10-passive-math-{caps,matrix}.json`
neu (nur `generatedAt`, von `tests/passive-stack.test.ts`) — macht den Worktree dirty und hat mehrfach
Lanes' board_move blockiert (auch 17:55Z in requests.md dokumentiert). Beide Dateien hier auf
Commit-Stand zurückgesetzt.

Für die v1.0-Freigabe-Unterlage empfohlen (kein Karten-Bedarf, nur Prozedur):
1. Bei erneutem Build-Blocker zuerst `node scripts/m10-flake-sweep.mjs` laufen lassen
   (Diagnose statt Einzel-Repro; bei Verdacht auf Last-Abhängigkeit zusätzlich parallel
   zu einer Perf-Lane laufen lassen) und FAILs als Zeilen in requests.md melden.
2. Falls chest-roll-names/Last-Flakes wiederkommen: Repro in einem Last-Szenario suchen
   (parallel laufende Lanes), nicht im Einzel-Lauf.

## Abnahme (Karten-Check)

- K1 #13870: 3 Suite-Läufe belegt (JSONs oben) ✓
- K2 #13871: Befundliste = belegtes „0 Flakes in 3 Läufen“ inkl. Grenzen der Aussagekraft ✓
- K4 #13872: keine Fix-Bedarfe → Info-Zeile in requests.md + `.lane-done` ✓
- npm test im Arbeitsstand grün (3×2575 PASS) ✓, `npm run build` grün ✓
- Eigene Änderungen betreffen nur neue Dateien (scripts/m10-flake-sweep.mjs, diese Doku) ✓
