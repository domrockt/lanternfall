# Lane m10-realtime-stability (M10, 2026-11-27)

Ziel: vollständiger, stabiler 30-min-Echtzeitlauf (A4-Belege: 6/6 Bosse, Truhen,
Sieg, FPS-Min, Heap) — der offene Abnahme-Blocker aus `docs/qa/reacceptance-2026-11-27.md`
(fa2-04: Renderer-Abbruch nach Minute 20, "Target closed").

## K1 Diagnose — Abbruchart
- Crash belegt in `shots/m10-realtime-crash.json`: Zielpfad Seite/CDP, Zeitpunkt
  (15:35:03Z nach Start 15:14:14Z, ~Minute 20+), Chrome-Fehler
  ("Target page, context or browser has been closed" = Renderer-Tod), Speicherdruck
  (/dev/shm 64 MB, cgroup 24 GB, loadavg >10 während fa2-04).
- Probe-Läufe unter flock mit denselben Flags: **5 min** lief stabil bis Truncation,
  kein Crash, 0 JS-Fehler (`shots/m10-realtime-probe-5min.json`); 10/15-min-Probes
  entwertet (starben vor Start an einem parallelen Harness-Edit, im JSON dokumentiert).
- **K1-Urteil: Ursache unklar, Primaerverdacht Host-Last-/Shm-Druck** (loadavg >10
  während fa2-04, /dev/shm 64 MB), Sekundaerverdacht Screenshot-/CDP-Burst.
  Der fa2-04-Crash trat nach Minute 20 auf — außerhalb der Probe-Reichweite.
- Befund Nebenschauplatz: Teil-Lauf bricht exakt bei Minute 5 ab und verpasst den
  Boss-Spawn bei Sekunde 300 (Grenz-Race im Harness) → K2-Gnadenfenster.
- Original-Log `/tmp/lf-fa2/fa2-04-final.log` ist vom Host inzwischen entfernt;
  die Fakten stammen aus `docs/qa/reacceptance-2026-11-27.md`.

## K2 Harness-Robustheit — scripts/realtime-run.mjs
- Eigener, lauf-spezifischer `--user-data-dir` unter `~/tmp/m10-realtime-stability/`
  (kein Chromium-Default-Profil, keine Singleton-Locks).
- `page.on("crash")`-Handler + Screenshot-Aufrufe try/catch-sicher (`safeShot`);
  Screenshot-Fehler und Crashes werden protokolliert, töten den Lauf nicht.
- Volllauf-Screenshots im 10-Minuten-Rhythmus statt 5 (weniger Burst-Druck,
  plausible Crash-Ursache); Teil-Läufe bleiben bei 5.
- Bei fatalem Fehler wird ein **partielles JSON** geschrieben (`crashed: true`,
  letzter Run-State, Crash-Liste, Host-Last) — fa2-04 starb beleglos, das darf
  nicht wieder passieren.
- Neuer `--prefix`-Parameter (M10-Lane-Belege als `shots/m10-realtime-*`).
- Keine Änderung an `src/**`.

## K3 Mini-Probe — scripts/m10-realtime-probe.mjs
- Fährt die kritische Phase Minute 18–25 mit Zeitraffer 4x (~105 s Echtzeit),
  God+AutoPlay, und feuert während der Phase alle 4 s einen Screenshot-Burst
  (derselbe Druck, der fa2-04 plausibel getötet hat).
- Meldet Ziel-Lebendigkeit (evaluate antwortet, Szene `run`), Gegner-Maximum,
  FPS min/median, Burst-Erfolgsquote, JS-Fehler → `shots/m10-realtime-probe.json`.
- Wird in K4 als Gate vor dem Langlauf benutzt; Exit 0 = Gate offen.

## K4 Vollständiger Lauf
- (wird nach dem Lauf ausgefüllt)

## Messwerte
- (K4)
