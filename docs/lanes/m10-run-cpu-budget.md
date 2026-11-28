# Lane m10-run-cpu-budget (M10, 2026-11-28)

Ziel: Android-/Tablet-Blocker auf dem **CPU-Anteil** angehen. Hartes, hostunabhaengiges Tor:
**JS-Frame-Zeit (update+render CPU-ms p95)**, Beleg auf iGPU `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
(Renderer-String im Beleg-JSON). Kein FPS-Tor im Container.

- Mess-Skript: `scripts/m10-run-cpu.mjs` (Playwright + CDP, Chaos-Lauf: Seed 1, skipTo(1500) = Minute 25,
  6 Evolutionen + 6 Passives St. 5, 500 Gegner gehalten, god/autoplay, 20 s Messfenster, Viewport 640x360).
  Gemessen wird pro Frame die CPU-Zeit des rAF-Callbacks (JS update+render ohne GPU-Wartezeit) plus
  Allokations-Telemetrie (in-page `performance.memory`-Delta + CDP Sampling-Heap-Profiler) und
  Top-CPU/Top-Alloc-Sites (Attribution K2). Läuft OHNE flock (kein FPS/Echtzeit-Lauf).

## K1 — Vorher-Messung (Karte #11752)

Belege (außerhalb des Repos): `~/games/.evidence/m10-run-cpu-budget/m10-run-cpu-before.json`
(Skript schreibt nach `shots/m10-run-cpu-before.json`, `shots/*` ist gitignored).

| Metrik | Wert |
|---|---|
| Renderer | `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` |
| jsFrameCpuMs p50 / **p95** / p99 | 0.10 / **5.50** / 7.40 ms (mean 1.07, max 34.1) |
| Frames gemessen | 2398 (20 s @ ~120 fps headless; CPU-ms ist der Vergleichswert, nicht FPS) |
| Gegner im Fenster | 500 gehalten (avg), 41 249 Kills im Chaos-Lauf |
| Allokationen | 891 B/Frame (sampling), Heap-Wachstum im Fenster 0 B (GC-sauber) |
| JS-Fehler | 0 |

Hinweis zur Skala: Headless-Host läuft mit ~120 fps und sehr schnellem Desktop-CPU-Kern — die absoluten
CPU-ms sind niedrig; gemeint ist das relative Vorher/Nachher-Delta auf identischem Setup (Android-Proxy /
Gerätetelemetrie liegt außerhalb dieser Lane, siehe `Wissen/Android-Optimierung-Praxis.md`).

## K2 — Attribution (Karte #11753)

Top-Quellen aus demselben Lauf (`topCpu` + `topAllocSites` im Beleg-JSON); lesbarere Attribuierung
über einen temporären unminifizierten Build (`npx vite build --minify false`, dist wird danach neu gebaut) —
vite.config.ts ist nicht Teil dieses Claims.

## K3/K4 — offen
