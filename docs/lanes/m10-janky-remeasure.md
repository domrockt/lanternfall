# Lane m10-janky-remeasure — K3-Tor Nachmessung (Redmi Pad Pro)

Ziel: verbindliche Nachmessung des K3-Tors aus der v10-Geräteabnahme
(**gfxinfo janky < 10 % @ FPS >= 60, p95 <= 16 ms**) nach dem Mergen aller Fix-Hebel:
Hebel A (Geräte-Deckel + quality.ts-Scheduling), Hebel B (Spawner-Frame-Tail,
GroundRenderer-Chunks), Mobile-FPS-Cap 60/max, **m10-fps-cap-stackfix** (Merge 1d52d406
— vor Messbeginn geprüft, im Lane-HEAD enthalten; ohne ihn wären die K3-Zahlen der
fps-cap-Lane mit 9 Game-Loop-Tötungen je Lauf wertlos gewesen).

## Karten

### K1: Messskript (Commit 8ced4c9c)
`scripts/m10-janky-remeasure.mjs` (Muster m10-v10-device-10min.mjs + gfxinfo-Differenz
je Fenster aus m10-device-janky-node.mjs):
- 10-s-Fenster, **natural/topup interleaved je Segment** (Segment = 10 Fenster,
  danach neuer Run via skipTo 1490 → Run-Ende Minute 30): Segment 0,2,4 = natural
  (ohne Spawn-Top-up, natürliche Director-Dichte — **fairer Vergleich, primär**),
  Segment 1,3,5 = topup auf 300 Gegner (Referenz). Thermik trifft beide Varianten
  gleich (Follow-up v10-Methodik).
- Pflichtfelder: WebGL-Renderer-String (**Härte: kein SwiftShader/llvmpipe — sonst
  INVALID_RENDERER-Abbruch**), DPR, Screen, Build-ID aus Telemetrie /latest
  (versionName via Bridge nicht abfragbar — kein shell-Endpoint),
  **Panel-Refresh-Probe** (rAF-Median bei BILDRATE=MAX → 120/90/60/null).
- BILDRATE über localStorage `lanternfall-options-v1` (`fps`: 60 = Cap, 0 = MAX,
  -1 = AUTO) — kein Codeeingriff.
- Frame-Pacing je Fenster: rAF p50/p90/p95/p99/worst (gfxinfo-Perzentile sind
  kumulativ seit Stat-Reset → je-Fenster-Diff).
- Thermal-Status + Batterietemperatur je Minute via /status.
- **DOM_SPIELT (HTTP 409 bzw. status.dom_playing) = sauberer Abbruch, kein Retry**
  (Ergänzung 15:15Z Punkt 2).
- APK zwingt Panel auf 60 Hz (MainActivity preferredDisplayModeId, Backup
  `.bak-20261128-60hz`) → K2 UND K3 laufen bei 60-Hz-Panel; `dumpsys display`-Äquivalent
  über die rAF-Probe im Beleg (Vergleich = Spiel-Cap/Frame-Pacing, nicht Panel-Hz).

Smoke-Lauf (2 Fenster, `--smoke --fps 60`):
- erster Start 16:2xZ → **abgebrochen: DOM_SPIELT** (`~/games/.evidence/m10-janky-remeasure/smoke.json`,
  aborted-Beleg mit statusStart), Start verschoben — kein Retry gegen die Sperre.
- zweiter Start: siehe unten (wird nachgeholt, sobald das Gerät frei ist).

### K2: 10-min-Lauf BILDRATE=60 — Status: fertig, ZWEI unabhängige Läufe (16:36–16:49Z und 16:49–17:01Z)
Beleg: `~/games/.evidence/m10-janky-remeasure/k2-cap60-device.json` (Lauf 2, 16:49–17:01Z,
0 Recoveries, 0 abgebrochene Fenster, 0 JS-Fehler; Lauf 1 16:36–16:49Z im Commit 1579f6be
dokumentiert, JSON Pfad geteilt → überschrieben; beide Läufe konsistent).

| Metrik | natural (primär, 30 Fenster) | topup 300 (Referenz, 30 Fenster) |
|---|---|---|
| gfxinfo janky | **0 %** (0/29 058 Frames, Lauf 1: 0/29 338) | **0 %** (0/28 736, Lauf 1: 0/28 896) |
| FPS avg / min | **50,1 / 42,3** | 47,8 / 42,6 (Lauf 1: 48,6) |
| rAF p95 max / p99 max | 33,4 / 50 ms | 33,4 / 50 ms |

- Gerät: Adreno (TM) 710, DPR 2, 1280x800, Panel-Probe **60 Hz** (rAF-Median 16,7 ms), Build `0ce7164a` 16:04:33Z
  (**enthält stackfix `aa8739f0` — merge-base geprüft**, auch fps-cap-Verdrahtung `6720313e`).
- Kein Spawn-Top-up im natural = natürliche Director-Dichte; interleaved Segmente (10 Fenster), 0 Recoveries,
  0 JS-Fehler, **keine Loop-Tötung** (stackfix wirkt — vorher 9 je Lauf).
- Thermik: Status 0 über den ganzen Lauf, Batterie 35,0 → 36,0 °C, DOM_SPIELT nicht aufgetreten.
- Befund: **Janky-Anteil sauber (0 %), aber das Frame-Pacing rutscht auf 2-Vsync (33,4 ms p95)** — fpsAvg 50,1
  verfehlt FPS >= 60, p95 33,4 ms verfehlt p95 <= 16 ms. Verschlechterung über die Laufzeit: Segment 0 natural noch
  ~55–59,5 FPS, ab Segment 2 nur noch ~44–48 FPS (Thermik Status 0 → kein Thermal-Throttle; Muster = Present/Pacing,
  nicht Renderlast — janky-zähler bleibt 0, weil Frames pünktlich zum 2-Vsync-Raster ankommen).
- Hebelkandidat für K4: TimeStep/rAF-Skip-Logik bei Cap 60 (Ergänzung 15:15Z Punkt 3).

### K3: 10-min-Lauf BILDRATE=MAX — Status: offen
Beleg-Ziel: `~/games/.evidence/m10-janky-remeasure/k3-max-device.json`.

### K4: Tor-Auswertung + Fix-Empfehlungen — Status: offen
Tor (Ergänzung 15:15Z Punkt 3): janky < 10 % bei 60-Hz-Panel = K3-Tor erfüllt.
Bei FAIL: Hebelliste direkt als `-> Job`-Zeile in `/home/ai/games/.dispatch/requests.md`
(Fix-Job m10-fps-pacing-timestep liegt in der Queue); Rest-Ursachen
(TimeStep/rAF-Skip-Logik) für m10-fps-cap-stackfix aufbereiten.

## Gerät
- Redmi Pad Pro, Android 16, SM7435-AC, Adreno-Renderer (String im Beleg-JSON).
- Thermik/Batterie bei Erstversuch 16:2xZ: Thermal Status 0, 33,0 °C — unauffällig.
- Geräte-Sperre: Dom spielt seit ~16:2xZ; beide Mess-Läufe verschoben, dokumentiert
  je Beleg-JSON (`aborted.reason`), **kein** Wiederholen gegen HTTP 409.
