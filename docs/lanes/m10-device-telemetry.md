# Lane m10-device-telemetry (M10) — echte Geräte-Zahlen vom Android-Tablet

Ziel: Performance-Telemetry von Doms Android-Tablet ohne adb. Sample alle 5 s,
gepuffert per `fetch POST keepalive` an den Rig-Empfänger
(`http://10.10.50.185:5180/t`, Ablage `~/games/.evidence/device/telemetry-YYYY-MM-DD.jsonl`).

## Karten

### K1 (#10517) — Telemetry-Collector, `src/telemetry.ts`
- `TelemetryCollector`: hängt an den Phaser-Step (`step`-Event, nur lesend),
  sammelt Frame-Dauern im 600er-Ringpuffer (10 s bei 60 FPS).
- Sample alle 5 s: `t, fps, frameMsP50/P95/max (nearest-rank), quality (LOD-Stufe),
  renderScale (RENDER_SCALE), gameScale (GAME_SCALE), enemies, fxActive, drawCalls,
  heapMB, scene, character, renderer/vendor (WebGL debug info, 1× pro Lauf),
  ua, dpr, screen w/h, build` + `ts` (Wall-Clock).
- `build` = Commit-Hash + Build-Zeit: neues Define `__LF_BUILD__` in
  `vite.config.ts` (liest `git rev-parse --short HEAD`).
- **Abweichung vom Bereich:** `vite.config.ts` ist nicht in meinen Claims, war aber
  von niemandem geclaimed; der Eingriff ist rein additiv (`define`-Block, 10 Zeilen,
  keine Auswirkung auf Chunks/Assets). Grund: Commit-Hash ist im Browser nicht auf
  andere Weise verfügbar. Kein Eintrag in `requests.md` nötig gewesen — hiermit
  dokumentiert.
- `drawCalls` ist in Phaser 3.90 nur am **Canvas**-Renderer vorhanden
  (`CanvasRenderer.drawCount`, belegt in `node_modules/phaser/src/renderer/canvas/`);
  der WebGL-Renderer (der reale Pfad) kennt es nicht → `null`, wie im Briefing
  „falls verfügbar" vorgesehen.
- Hook: `src/debug.ts` ruft `installTelemetry(game, …)` **nach READY** auf
  (`lf-render-info` liegt dann im Registry → renderer/vendor 1× gelesen).
- Commit: `18c61118`.

### K2 (#10518) — Aktivierung + Drosselung
- `telemetryEnabled`: `?telemetry=1` → an (auch Desktop, für Probe-Läufe);
  `?telemetry=0` → aus (gewinnt über alles); sonst APK-Erkennung
  (Host `127.0.0.1` + Android-UA) → an; **Desktop-Spieler senden nichts**.
- Drosselung: max. 1 Request / 5 s (`canSend`); `visibilitychange` (App versteckt)
  → letzter Flush mit `keepalive: true`.
- Sendefehler werden still geschluckt; Puffer (Deckel 60 Samples = 5 min) wird
  beim nächsten Intervall erneut versucht. Collector/Readings sind komplett
  try/catch-geschützt — Telemetry darf das Spiel nie werfen oder blockieren.
- `installTelemetry` ohne Browser-Umfeld → `null` (Node/Testumgebung sendet nie).
- Commit: `82683aa1` (Tests: Aktivierungs-Matrix, Drosselung, Fehler-Puffer).

### K3 (#10519) — Tests + Doku + Abnahmelauf
- `tests/telemetry.test.ts`: 17 Tests (frameStats, buildSample, collectReadings,
  Ringpuffer, Start-Tick, Puffer-Deckel, Aktivierung, Drosselung).
- `docs/DEVICE-TELEMETRY.md`: Feldtabelle, Aktivierung/Abschalten, Datenablage,
  Beispiel-Auswertung (fps p5 / Median je Spielminute aus der JSONL).
- Commits: `86af9723` + Lane-Doku-Commit.

## Abnahme-Belege

Alle Belege liegen unter `~/games/.evidence/device-telemetry/` (außerhalb des Repos).

1. **Lokaler Lauf erzeugt Zeilen in der Tages-JSONL** (Kriterium erfüllt):
   Headless-Chromium auf `http://127.0.0.1:<port>/?debug=1&telemetry=1`
   (Runner: `~/tmp/m10-device-telemetry/run-telemetry.mjs`), 12,5 s Run.
   Vorher: 0 Zeilen in `~/games/.evidence/device/telemetry-2026-11-28.jsonl`,
   nachher 3 Zeilen. Ausschnitt (Zeile 2, formatiert):
   ```json
   {"t": 3.3, "fps": 54.4, "frameMsP50": 33.28, "frameMsP95": 33.33,
    "frameMsMax": 33.34, "quality": "full", "renderScale": 1, "gameScale": 1.5,
    "enemies": 1, "fxActive": 4, "drawCalls": null, "heapMB": 15.4,
    "scene": "run", "character": "mira",
    "renderer": "ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)",
    "vendor": "Google Inc. (Intel)", "build": "82683aa1 2026-11-28T09:33:43.346Z",
    "ua": "Mozilla/5.0 (X11; Linux x86_64) … HeadlessChrome/136.0.7103.25",
    "dpr": 1, "screenW": 960, "screenH": 540}
   ```
   (`build` zeigt den korrekten Commit; im APK wäre Host `127.0.0.1` + Android-UA
   — dadurch ist der APK-Pfad dieselbe Codezeile, nur ohne URL-Param.)

2. **0 JS-Fehler** (Kriterium erfüllt): beide Läufe (12-s-Abnahme + 2×10-s-Perf)
   mit `pageerror`/`console.error`-Abfangen → `jsErrors: []`.

3. **Kein FPS-Einfluss** (Kriterium erfüllt), jeweils 10-s-Fenster, iGPU
   (`Mesa Intel(R) Graphics (RPL-S)`, kein SwiftShader — Renderer-String in jedem
   Telemetry-Sample sichtbar), unter `flock /home/ai/games/.lf-perf.lock`:
   | Phase | burst (500 Gegner) | minute25 (300 Gegner) | JS-Fehler |
   |---|---|---|---|
   | Vorher, ohne Telemetry (`npm run perf`) | **60.1** FPS | **59.9** FPS | 0 |
   | Nachher, Telemetry aktiv (`?telemetry=1`) | **60.1** FPS | **60.0** FPS | 0 |
   Runner: `~/tmp/m10-device-telemetry/perf-after-telemetry.mjs`
   (1:1 die Burst-/Minute-25-Phasen aus `scripts/perf.mjs`, aber mit
   `&telemetry=1`). JSON-Belege: `~/tmp/m10-device-telemetry/perf-before.json`,
   `~/tmp/m10-device-telemetry/perf-after-telemetry.json`.
   Telemetry sendete dabei munter weiter: unter 500-Gegner-Last Samples mit
   `quality: minimal`, `fxActive` bis 77 (Zeilen 6–9 der Tages-JSONL).

## Tests / Build
- `npx tsc --noEmit` grün (nach jedem Commit).
- `tests/telemetry.test.ts`: 17/17 grün.
- Full-Suite einmal pro Karte vor dem Commit: `npm test` → 174 Dateien /
  1891 Tests grün; `npm run build` grün (Chunks unverändert).

## Review
- `reviewer` (Kontrolleur, 2026-11-28): **PASS** — mergebar; Belege: 174 Dateien /
  1891 Tests grün, Aktivierungs-Matrix, Datenschutz-Check (keine PII), vite-define
  additiv. Zwei „sollte"-Befunde noch in derselben Karte behoben (Commit
  `40d8673f`): `recordFrame`-Deckel 1000→2000 ms (echte Frame-Hitches der
  Thermik-Drosselung bleiben in `frameMsMax` sichtbar, in Doku notiert),
  `isFinite`-Guard für `qs.time`, Happy-Pfad- und `?telemetryEndpoint=`-Tests
  ergänzt (19 Telemetry-Tests).
- Rest-Nits nicht blockierend, dokumentiert: `stop()` entfernt den `step`-Listener
  nicht (Collector ist app-langlebig), Aktivierungs-Regex case-sensitiv.

## Offene Punkte / Hinweise für den Merge
- `heapMB` nur in Chromium (`performance.memory`) — auf Desktop-Chromium/Android
  Chrome vorhanden, sonst `null`.
- `drawCalls` bleibt auf WebGL `null` (Phaser 3.90 bietet es nur am Canvas-Renderer);
  falls ein echter WebGL-Draw-Call-Zähler gebraucht wird, wäre eine
  Pipeline-Instrumentierung nötig (eigene Karte, Eingriff in Renderpfad).
- `renderer`-String in jedem Sample macht Zeilen ~600 B — Bei reinen
  Tablet-Läufen unkritisch (5 s Takt ≈ 0,12 kB/s).
- APK-Verifikation (echtes Tablet) kann diese Lane nicht liefern — der
  Aktivierungspfad ist getestet, der Empfänger läuft; Dom startet die APK
  und die Zeilen landen in der Tages-JSONL.
