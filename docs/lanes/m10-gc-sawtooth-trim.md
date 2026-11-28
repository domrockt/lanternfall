# Lane m10-gc-sawtooth-trim (Frame-Zeit-Spitzen via GC-Druck senken)

**Ziel:** Allokationsrate pro Frame im Minute-25-Burst senken, um GC-Pausen aus
dem p99-Schwanz der v10-Gerätetore zu ziehen (K3 p99 31 ms vs p95 21 ms;
ACCEPTANCE Heap-SOFT: GC-Sägezahn, max Fenster-Peak +65,3 % über Basis, 41–55 MB).
Das HARD-Heap-Tor (retained) ist grün — es geht NUR um Allokationsrate, nicht Leaks.

**Abnahme:** bytes/frame im Probe −30 % oder besser; JS-Frame-CPU-ms p99 nicht
schlechter; `npm test` grün (inkl. run-determinism-Guard), tsc rc=0, 0 JS-Fehler;
Renderer-String in jedem Beleg.

**Area (Disponent):** `src/systems/ProjectilePool.ts`, `tests/gc-sawtooth-trim.test.ts`,
`scripts/m10-gc-probe.mjs`, diese Doku, `shots/m10-gc-sawtooth-*`, `.lane-done`.
Run.ts ist fremd geclaimed und wird nicht angefasst.

## K1 — Vorher-Profil (Minute-25-Burst)

- Skript: `scripts/m10-gc-probe.mjs` (CDP HeapProfiler-Sampling 16 KB + RAF-Frame-Zähler
  + GC-Trace-Events; Sim bis Minute 25 mit timeScale 30, Messfenster bei timeScale 1).
- Beleg: `~/games/.evidence/m10-gc-sawtooth-trim/shots/m10-gc-sawtooth-before.json`
  (Regel 27./28.11.: Mess-JSONs nach `.evidence/`, nicht in git).
- Ergebnis: (offen)

## K2 — Poolen Top-1..3 in ProjectilePool.ts

- (offen)

## K3 — Guard-Test

- `tests/gc-sawtooth-trim.test.ts`: (offen)

## K4 — Nachher-Profil + Rest-Hebelliste

- (offen)

## Rest-Hebelliste (Stellen außerhalb des Areas)

- (wird nach K1/K4 gefüllt; -> Job-Zeilen für spätere Lanes)
