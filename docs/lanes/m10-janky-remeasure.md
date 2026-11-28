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

### K2: 10-min-Lauf BILDRATE=60 — Status: offen
Beleg-Ziel: `~/games/.evidence/m10-janky-remeasure/k2-cap60-device.json`.

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
