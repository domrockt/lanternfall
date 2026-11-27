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
  (kein Chromium-Default-Profil, keine Singleton-Locks). Umsetzung über
  `chromium.launchPersistentContext` — Playwright verwirft `--user-data-dir`
  als Launch-Arg (Befund aus den entwerteten K1-Probes).
- `page.on("crash")`-Handler + Screenshot-Aufrufe try/catch-sicher (`safeShot`);
  Screenshot-Fehler und Crashes werden protokolliert, töten den Lauf nicht.
- Volllauf-Screenshots im 10-Minuten-Rhythmus statt 5 (weniger Burst-Druck,
  plausible Crash-Ursache); Teil-Läufe bleiben bei 5.
- Bei fatalem Fehler wird ein **partielles JSON** geschrieben (`crashed: true`,
  letzter Run-State, Crash-Liste, Host-Last) — fa2-04 starb beleglos, das darf
  nicht wieder passieren.
- Neuer `--prefix`-Parameter (M10-Lane-Belege als `shots/m10-realtime-*`).
- 5-s-Gnadenfenster am Truncation-Rand (K1-Nebenbefund: Boss-Spawn bei
  Sekunde 300 wurde vom Break überholt).
- Akzeptanz: 3-min-Lauf rc=0, passed=true, 0 JS-Fehler, 0 Screenshot-Fehler,
  0 Crashes (`shots/m10-realtime-test-3min.json`, Log `~/tmp/m10-realtime-stability/k2-3min-test.log`).
- Keine Änderung an `src/**`. Das K3-Probe-Skript lag bereits im K2-WIP-Commit
  bei (Datei-Claim scripts/m10-realtime-probe.mjs istLane-eigen); K3-Commit
  bringt den Probe-Lauf-Beleg.

## K3 Mini-Probe — scripts/m10-realtime-probe.mjs
- Fährt die kritische Phase Minute 18–25 mit Zeitraffer 4x (~105 s Echtzeit),
  God+AutoPlay, und feuert während der Phase alle 4 s einen Screenshot-Burst
  (derselbe Druck, der fa2-04 plausibel getötet hat).
- Meldet Ziel-Lebendigkeit (evaluate antwortet, Szene `run`), Gegner-Maximum,
  FPS min/median, Burst-Erfolgsquote, JS-Fehler → `shots/m10-realtime-probe.json`.
- **Ergebnis (K3-Lauf, flock):** rc=0, passed=true — Phase bis Minute 25 gefahren,
  Ziel lebendig, Gegner-Max 352, fps min 57.0 / median 60.5, Burst 28/28 ok,
  0 JS-Fehler, 0 Crashes, 0 Screenshot-Fehler. Gate für K4 damit offen.
- Wird in K4 als Gate vor dem Langlauf benutzt; Exit 0 = Gate offen.

## K4 Vollständiger Lauf
- **Lauf 1 (2026-11-27 18:20–18:50Z, 1875 s Echtzeit):** **kein Renderer-Abbruch** —
  der K2-Fix hält: `shots/m10-realtime-30min.json` vollständig geschrieben, 0 Crashes,
  0 JS-Fehler, 0 Screenshot-Fehler, Minuten-Shots 10/20/30 + Results.
  Inhaltlich voll: **Sieg (dawn) bei 30.5 Sim-Minuten, 6/6 Bosse pünktlich
  (300/600/900/1200/1500/1800 ±0 s), 6 Truhen**, Heap-Delta Minute 1→29
  **8,9 % < 15 % (Gate PASS)**, Level 39, 6791 Kills, 3 Evolutionen.
- **Gate FAIL nur FPS:** min 12.6 / median 48 (Ziel ≥55). Ursache: Host-Last durch
  parallele Lanes — loadavg1 14.95 im Lauf-JSON, direkt danach 17–20. Vergleich:
  26.11-Lauf gleicher Seed: 57.2/60.3 bei ruhigem Host. Kein Spielfehler; Boss-Timings
  exakt, Sim unbeeinträchtigt.
- Zweiter Lauf geplant, sobald loadavg < ~8 und flock frei (Abbruchkriterium des
  Briefings: Ursache dokumentieren, zweiter Lauf).
- **Lauf 2 (2026-11-27 19:36Z gestartet):** gleiche Flags wie Lauf 1 (`--prefix
  m10-realtime`), Start bei loadavg 4.5 (Kriterium < 8 erfüllt), Lock frei.
  WIP: läuft (Log `~/tmp/m10-realtime-stability-k4-run2.log`, Ergebnis-JSON erst
  am Laufende). (Ergebnis wird hier ergänzt)

## Messwerte
- (K4)
