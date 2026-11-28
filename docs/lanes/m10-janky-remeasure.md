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

### K3: 10-min-Lauf BILDRATE=MAX — Status: fertig, 2026-11-28 ~16:50–17:03Z
Beleg: `~/games/.evidence/m10-janky-remeasure/k3-max-device.json` (rc=1, passed=false — strenges Tor).

| Metrik | natural (primär, 30 Fenster) | topup 300 (Referenz, 30 Fenster) |
|---|---|---|
| gfxinfo janky | **0 %** (0/32 114 Frames) | **0 %** (0/30 144 Frames) |
| FPS avg / min | **50,0 / 44,0** | 47,2 / 43,3 |
| rAF p95 max / p99 max | 33,4 / 50,0 ms | 33,4 / 33,4 ms |
| worst frame | 50,1 ms | 50,1 ms |

- Identische Rahmenbedingungen wie K2 (Adreno 710, DPR 2, Panel-Probe 60 Hz, Build `0ce7164a` mit stackfix),
  0 Recoveries, 0 JS-Fehler, Thermal Status 0, Batterie 35,0 °C konstant, kein DOM_SPIELT.
- **K2 vs. K3: keine Differenz** (janky 0 % vs 0 %, fpsAvg 50,1 vs 50,0, p95 33,4 vs 33,4). Der BILDRATE-Cap
  ist bei 60-Hz-Panel wirkungslos fürs Pacing — der Engpass ist die Frame-Arbeit/Present (~1/3 der Frames
  > 16,7 ms → 2-Vsync-Raster 33,4 ms, p50 bleibt 16,7 ms), nicht die Cap-Logik.

### K4: Tor-Auswertung + Fix-Empfehlungen — Status: fertig, 2026-11-28 ~17:0xZ
**Tor (v10, streng): gfxinfo janky < 10 % @ FPS >= 60, p95 <= 16 ms**

| Kriterium | Cap 60 (K2) | MAX (K3) | Urteil |
|---|---|---|---|
| gfxinfo janky < 10 % | 0 % | 0 % | **ERFÜLLT** (beide) |
| FPS >= 60 (natural avg) | 50,1 | 50,0 | **NICHT erfüllt** |
| rAF p95 <= 16 ms | 33,4 ms | 33,4 ms | **NICHT erfüllt** |
| Temperatur unauffällig | Thermal 0, 35→36 °C | Thermal 0, 35,0 °C | erfüllt |
| 0 JS-Fehler / 0 Loop-Tötungen | ja | ja | erfüllt (stackfix wirkt: vorher 9 Tötungen/Lauf) |

**Urteil: FAIL nach dem strengen Tor** (janky-Kriterium grün, FPS- und p95-Kriterium rot).
Nach der 15:15Z-Lesart („janky < 10 % bei 60 Hz = Tor erfüllt") wäre der janky-Anteil grün — aber die
Endabnahme misst dasselbe Pacing (50 FPS) und würde am FPS-Kriterium scheitern. **Empfehlung: Endabnahme-Lauf
NICHT freigeben, erst nach dem Pacing-Fix** (Job m10-fps-pacing-timestep). Der Fix-Job bekommt die Hebelliste
direkt als `-> Job`-Zeile in `~/.dispatch/requests.md`.

**Hebelliste (File, Hebel, erwarteter Gewinn):**
1. `src/main.ts` Game-Loop / `src/logic/fps-cap.ts` (TimeStep/rAF-Skip-Logik, Ergänzung 15:15Z Punkt 3):
   Bei Cap 60 rendert der Loop jeden rAF; Frame-Arbeit knapp > 16,7 ms → rAF fällt aufs 2-Vsync-Raster
   (bimodal 16,7/33,4 ms, p50 16,7, p95 33,4). Hebel: Late-Frame-Toleranz/Skip (z. B. wenn dt > 17 ms:
   Sim-Substeps entlasten) bzw. Present-Phasen-Drift korrigieren.
   Erwarteter Gewinn: fpsAvg 50 → 57–60, rAF-p95 33,4 → ~16,8 ms.
2. GPU-Frame-Arbeit senken (Overdraw/ADD — Android-Praxis: ADD-Flächen sind der Mobile-GPU-Engpass):
   Telemetrie zeigt fxActive ~100–120. Hebel in `src/data`/quality-Scheduling: Partikel-/ADD-Flächen-Cap
   für medium-Tier weiter senken. Erwarteter Gewinn: Anteil der > 16,7-ms-Frames sinkt (weniger 2-Vsync).
3. Beobachtung zur Einordnung (kein eigener Hebel): Das bimodale Muster (p50 16,7 / p95 33,3) zeigt sich auch
   im Leerlauf-Telemetrie-Fenster (22–36 Gegner, fps 56–59, p95 33,33) — der Tail ist also nicht
   Gegner-last-skaliert; Hebel 1 (Pacing/Loop) vor Hebel 2 (Last) priorisieren.

Methodik-Hinweis für die Endabnahme: gfxinfo-janky ist mit 0 % in K2 UND K3 nicht mehr unterscheidend
(Deadline-Raster vs. 2-Vsync-Pacing) — als Tor-Metrik neben janky deshalb zwingend FPS avg + rAF-p95 führen.

### Vorfall: parallele zweite Session an dieser Lane (2026-11-28T17:03–17:2xZ)
Versuch 2 (diese Session, Titel „m10-janky-remeasure #2") stellte 17:16Z fest, dass eine zweite aktive
Agent-Session (höchstwahrscheinlich Versuch 1, gleicher pty-Daemon, kein eigener `opencode run`-Prozess
mehr sichtbar) parallel an derselben Lane arbeitet:
- Commit `2bf7b4ae` (17:03:34Z) „K2-Doku praezisiert — zwei unabhängige K2-Läufe": dokumentiert einen
  zweiten K2-Lauf (16:49–17:01Z, fpsAvg natural 50,1, janky 0/29 058) — konsistent mit Lauf 1.
- Beleg-Überschreibungen: `k2-cap60-device.json` (17:01:02Z, = dessen Lauf 2) und `k3-max-device.json`
  (17:14:42Z, K3-Rerun) — Werte decken sich mit den Läufen dieser Session (janky 0 %, fpsAvg 50,0–50,1,
  p95 33,4 ms), **kein Datenkonflikt, aber Pfad-Kollision** (Beleg-JSON = immer der letzte Lauf).
- Beobachtet 17:17Z: weiterer K3-Rerun (`flock … timeout 900 … --fps 0`) im Prozessbaum; läuft ~17:31Z aus.
- Einordnung: Zahlen identisch, K4-Urteil unabhängig vom Rerun; die "ohne flock"-Aussage in `2bf7b4ae`
  ist falsch (Lauf 1 lief MIT `flock /home/ai/games/.lf-perf.lock`, Commit 1579f6be).
Diese Session schließt die Lane mit .lane-done ab; falls die zweite Session weitermisst, sind die Zahlen
als Bestätigungsläufe zu werten.

## Gerät
- Redmi Pad Pro, Android 16, SM7435-AC, Adreno (TM) 710, DPR 2, 1280x800, Panel per APK auf 60 Hz gezwungen
  (Panel-Probe rAF-Median 16,7 ms in beiden Belegen).
- Thermik/Batterie über beide Läufe unauffällig (Thermal Status 0, 35,0–36,0 °C).
- Geräte-Sperre: Dom spielte ~16:2x–16:3xZ; K1-Smoke-Start 1 abgebrochen (smoke.json, aborted-Grund), kein Retry.
  K2 startete 16:36Z nach Freigabe (status.dom_playing=false), K3 16:50Z — beide ohne 409.

