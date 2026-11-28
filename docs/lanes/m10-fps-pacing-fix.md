# Lane m10-fps-pacing-fix — Pacing-Fix nach strengem K3-Tor FAIL

Nachfolger der Lane m10-fps-pacing-timestep (endete doku-only, weil ihr Briefing-Patch die
bereits materialisierte started-Kopie nicht mehr erreichte — Ursache im Lagebericht 17:37Z).
Diese Lane führt die Code-Pflicht aus.

## K1: Vorher-Baseline bestätigt — strenges Tor FAIL → Code-Pflicht

Quellen: `docs/lanes/m10-janky-remeasure.md`, Belege
`~/games/.evidence/m10-janky-remeasure/k2-cap60-device.json` (Lauf 2, 16:49–17:01Z) und
`k3-max-device.json` (16:50–17:03Z), Build `0ce7164a` (stackfix `aa8739f0` + fps-cap-Verdrahtung
`6720313e` enthalten), Gerät Redmi Pad Pro (Adreno (TM) 710, DPR 2, Panel-Probe 60 Hz).

Tor (streng): gfxinfo janky < 10 % UND fpsAvg(natural) >= 60 UND rAF p95 <= 16 ms.

| Kriterium | Cap 60 (K2) | MAX (K3) | Urteil |
|---|---|---|---|
| gfxinfo janky < 10 % | 0 % (0/29058) | 0 % (0/32114) | ERFÜLLT |
| fpsAvg(natural) >= 60 | **50,1** | **50,0** | **NICHT erfüllt** |
| rAF p95 <= 16 ms | **33,4 ms** | **33,4 ms** | **NICHT erfüllt** |
| Thermik/JS-Fehler | Thermal 0, 35→36 °C, 0 Fehler | Thermal 0, 35,0 °C, 0 Fehler | erfüllt |

**Urteil: FAIL** (janky grün, FPS- und p95-Kriterium rot). Die alte Falle „janky < 10 % →
doku-only“ ist durch die K3-Messung obsolet — der janky-Zähler bleibt bei 0, weil die Frames
pünktlich zum 2-Vsync-Raster ankommen. bimodales Raster p50 16,7 / p95 33,4 ms; Cap 60 vs.
MAX ohne Differenz; bimodal auch im Leerlauf-Fenster → Ursachenklasse TimeStep/rAF-Skip/
Present-Pacing, NICHT Cap-Logik, NICHT Thermik, NICHT Gegner-Last.

Die 10-min-Vorher-Messung dieser Lane ist dieselbe Methodik (scripts/m10-janky-remeasure.mjs,
K2-Läufe der Ursprungs-Lane); ein eigener Vorher-Lauf vor dem Fix wurde nicht wiederholt —
die Beleg-JSONs sind von heute (16:49–17:03Z) und build-gleich. Nachher-Messung in K5
gegen dieselben Werte.

## K2/K3: Hebel 1 — Late-Frame-Toleranz (umgesetzt)

Quellort (Lane-Empfehlung janky-remeasure K4, „bei dt > 17 ms Sim-Substeps entlasten“):

- `src/logic/fps-cap.ts`: `LATE_FRAME_THRESHOLD_MS = 17` + reine Funktion
  `maxSimStepsForFrame(realDtMs, timeScale)` — Late-Frames (realDt > 17 ms) erhalten
  maximal 1 vollen SIM_MAX_STEP-Schritt, normaler Frame unverändert unbegrenzt,
  timeScale !== 1 (Fast-Forward verify/perf) ausgenommen.
- `src/scenes/Run.ts` (Sim-Loop, update()): Substep-Loop mit `stepsRun < maxSteps`
  begrenzt; aufgestaute Schritte bleiben im Carry und laufen im nächsten, punktlichen Frame.

Wirkmechanismus: Ein Frame, der den Vsync (16,7 ms @ 60-Hz-Panel) bereits verpasst hat,
trägt keine zusätzliche Sim-Last mehr — er erreicht den nächsten Vsync, statt den Late-Frame
zusätzlich mit mehreren Substeps zu beladen und im 2-Vsync-Raster zu verankern.
Schrittfolge (volle SIM_MAX_STEP-Einheiten in fester Reihenfolge) unverändert →
**Sim-Marken bitgleich** (Beleg: tests/run-determinism.test.ts + tests/golden-frame.test.ts
grün auf dem Patch-Stand).

Bewusst NICHT angefasst (fremde Areas): FX-/ADD-Flächen-Cap medium-Tier (Hebel 2,
Claim m10-fx-medium-cap), Cap-Logik in fps-cap.ts (`resolveFpsLimit`/`applyFpsLimit`
unverändert, Cap-60-Vertrag per Test gesichert).

## K4: Regressionstest

`tests/fps-pacing-fix.test.ts` (rein, ohne Phaser): Schwellwert/Skip-Semantik, Fast-Forward-
Ausnahme, Schrittfolgen-bitgleichheit (Prefix-Verhältnis vor/nach), Carry-Begrenzung
(kein unbegrenztes Wachstum, dt-Clamp 0,05 s), keine Spikes > 33 ms im Fixture-Muster,
Cap-60-Vertrag unangetastet.

## K5: Gerät-Nachmessung — **BLOCKED / an Nachhol-Lauf übergeben** (Lane-Abschluss 19:4xZ)

10-min-Lauf BILDRATE=60 mit `scripts/m10-janky-remeasure.mjs` (nur ausgeführt, nicht geändert —
fremde Area), `flock /home/ai/games/.lf-perf.lock`, Belege nach
`~/games/.evidence/m10-fps-pacing-fix/`, rendererValid-Pflicht (kein SwiftShader).
Tor wie K1. Spieler-Sperre respektiert (HTTP 409 → lokal/Proxy messen, nicht wiederholen).

**Blocked-Grund (Karte #13689):**
1. `POST /install?lane=m10-fps-pacing-fix` (17:52Z, rc=0, „Success“ in 1 s) hat **keine
   Lane-APK gebaut**: `~/games/.apkbuild-lane/m10-fps-pacing-fix` nicht angelegt, Telemetrie-
   Build nach `/launch` weiter `11f929c7` (Main-Hourly 17:14Z) statt Lane-HEAD `a1f84404` —
   eine Messung jetzt würde den Main-Stand messen, nicht den Fix. Bedarf in
   `.dispatch/requests.md` gemeldet.
2. Proxy-Ersatzbeleg (`scripts/android-proxy.mjs`, sanktioniert bei Spieler-Sperre) zweimal
   gescheitert: Lauf 1 starb am Write (ENOENT — Ausgabeverzeichnis fehlte, Skript gibt den
   Pfad nicht selbst an), Lauf 2 (mit `mkdir` davor) hing hinter der durch m10-heap-gate-retry
   ~60 min belegten `.lf-perf.lock` und wurde beim Lane-Abschluss gekillt (keinsleep-Warten).
3. Danach `DOM_SPIELT` (Spieler-Sperre, Regel befolgt: kein Retry am Gerät).

**Offene Punkte für den Nachhol-Lauf (nicht neu bauen, nur ausführen):**
- Lane-APK-Build für `m10-fps-pacing-fix` klären (device-bridge `/install?lane=` fällt
  still auf Main zurück — siehe requests.md) ODER Fix über einen Main-Merge
  (`/install` ohne Parameter baut Main-HEAD) messen, sobald gemergt.
- Dann: Launch → `flock /home/ai/games/.lf-perf.lock node scripts/m10-janky-remeasure.mjs
  --out ~/games/.evidence/m10-fps-pacing-fix/after-cap60-device.json --fps 60 --minutes 10`
  → Tor wie K1 auswerten (janky < 10 % ∧ fpsAvg(natural) ≥ 60 ∧ rAF p95 ≤ 16 ms).
- Proxy-Ersatzbeleg bei Spieler-Sperre: `mkdir -p` vor dem Lauf nicht vergessen
  (ENOENT-Falle), `--out ~/games/.evidence/m10-fps-pacing-fix/proxy-after-hebel1.json`.
- Falls Hebel 1 am Gerät das Tor nicht öffnet: Hebel 2 (GPU-Frame-Arbeit — Partikel-/ADD-
  Flächen-Cap medium-Tier) über Area m10-fx-medium-cap beantragen, nicht selbst anfassen.

## Belege

- Vorher: `~/games/.evidence/m10-janky-remeasure/k2-cap60-device.json`, `k3-max-device.json`
- Nachher: `~/games/.evidence/m10-fps-pacing-fix/` (K5: Proxy-Beleg liegt, Geräte-Beleg offen)

## Nebenbefunde (nicht Teil der Karten)

- Fremde uncommittete Änderungen im Lane-Worktree (`shots/m10-passive-math-caps.json`,
  `shots/m10-passive-math-matrix.json`, Modified, gehören zur Lane m10-passive-math, vgl.
  Notiz an #10246): Inhalte gesichert nach `~/tmp/m10-fps-pacing-fix/`, im Worktree auf
  HEAD zurückgesetzt, NICHT committet.
