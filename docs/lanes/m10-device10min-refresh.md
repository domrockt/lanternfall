# Lane m10-device10min-refresh — Geräte-10-min-Beleg: aktive Panel-Refresh-Rate

Ziel: Das Geräte-10-min-Skript erfasst den Renderer (Guard 9bcc1e41), aber NICHT
die aktive Panel-Refresh-Rate. Dom-Freigaben 15:20Z/17:45Z machen die aktive
Hz-Zahl zur Pflicht im Beleg — künftige Geräteläufe (Endabnahme, APK-Nachmessungen)
tragen die Hz-Zahl automatisch im Output-JSON.

## K1 — Befund (#13746)

### Output-JSON ohne refresh-Feld

`scripts/m10-v10-device-10min.mjs` schreibt in sein Output-JSON (`out`, Zeile ~193):

| Feld | Quelle |
|---|---|
| `gate`, `durationMinutes`, `windowSecs`, `targetEnemies` | Konfiguration |
| `renderer`, `rendererValid`, `invalid` | Renderer-Guard #13405 (Guard 9bcc1e41) |
| `startStatus`, `endStatus` | Bridge `/status` (thermal, battery) |
| `fps` (avgFirstHalf/avgSecondHalf/dropPct/minFps/passed) | Messfenster |
| `runEnd`, `jsErrors`, `samples`, `passed` | Lauf |

**Befund: kein Feld trägt die aktive Panel-Refresh-Rate.** Ein Lauf bei
60-Hz-APK-Lock und ein Lauf bei hz=max sind im JSON nicht unterscheidbar —
genau diese beiden Zustände sind aber die Entscheidungsfelder des Tablet-Tors.

### Anforderungsquelle: Dom-Freigabe 17:45Z (A/B-Tabelle)

Claude-Gespräche 15:20Z und 17:45Z (2026-11-28): die aktive Hz-Zahl wird
**Pflicht im Beleg**. Entscheidungsfelder des Tablet-Tors:

| Feld | A: 60-Hz-APK-Lock | B: hz=max |
|---|---|---|
| aktive Panel-Refresh-Rate | 60 Hz (APK zwingt `preferredDisplayModeId`, siehe m10-janky-remeasure.md) | Panel-Maximum (Adreno-710-Gerät: 120 Hz) |
| Erwartung an den Beleg | Hz-Zahl = 60 im JSON nachweisbar | Hz-Zahl = Panel-Max im JSON nachweisbar |
| Tor-Interpretation | FPS-Ziel 60 ≈ Panel-Rate, 2-Vsync-Pacing sichtbar | Panel-Rate > Spiel-Cap: Cap/Pacing-Beurteilung nur mit Hz-Zahl lesbar |

Ohne Hz-Zahl im JSON ist A vs. B beim Abnehmen nicht beweisbar → ab 17:45Z
Pflichtfeld in jedem Geräte-Beleg.

### Quellenlage (Vorbefund für K2)

- Die device-bridge (172.17.0.1:5181) hat **keinen shell-Endpoint** (nur
  `/status`, `/launch`, `/screenshot`, `/gfxinfo`; belegt in
  docs/lanes/m10-janky-remeasure.md: „kein shell-Endpoint").
- `dumpsys display`-Äquivalent dort etabliert: **rAF-Median-Probe bei
  BILDRATE=MAX** (`scripts/m10-janky-remeasure.mjs`, `probePanelHz()` →
  `panelHzEstimate` 120/90/60/null). Im Spiel rAF folgt dem Spiel-Cap
  (AUTO → 60 am Geräteknoten), NICHT dem Panel — Probe braucht MAX.
- K2 wird daher: dumpsys-Shell-Endpoint versuchen (falls die Bridge ihn
  bekommt), sonst rAF-MAX-Probe; renderer/rendererValid unangetastet;
  Parsing-Fehler = Feld fehlt + Warnung, passed-Logik bytegleich.

## K2 — Integration (#13747)

Umgesetzt (Commit nach diesem Abschnitt):

- **Neue Datei `scripts/m10-device-refresh.mjs`** (Begründung: Disponent-Claim
  nennt sie nicht, aber eine NEUE Datei kollidiert mit keiner Lane; Muster wie
  `lf-renderer.mjs` — reine Helfer, vom Mess-Skript importiert, per Fixture
  testbar, ohne Geräte-Zwang):
  - `parseDisplayDump(text)`: `dumpsys display`-Text → `{ refreshRate, panelMode }`
    (mActiveModeId + supportedModes → Mode-Eintrag; Fallbacks `refreshRate=`,
    `"<f> Hz"`); unlesbar → `null`.
  - `panelHzFromRaf(fps)`: rAF-FPS → 120/90/60/null (Schwellen wie
    `m10-janky-remeasure.mjs`).
- **`scripts/m10-v10-device-10min.mjs`**: nach Laufstart (vor Setup) Quelle 1
  = Bridge `/shell?cmd=dumpsys display` (falls die Bridge ihn anbietet, source
  `dumpsys-display`), sonst Quelle 2 = device-bridge-Äquivalent rAF-Median bei
  BILDRATE=MAX (Option auf 0 gesetzt, Probe, Option restauriert — das nächste
  Reload des Lauf-Starts wendet die Restauration an; Probe-Block fängt Fehler
  ab und verbindet CDP neu, falls die WebView-Seite stirbt).
- **JSON-Vertrag**: `out.refresh` = `{ refreshRate: number, panelMode: string|null,
  source: "dumpsys-display"|"raf-max", t: number, rafFps?: number }`. Bei
  Parsing-/Verbindungsfehlern **entfällt das Feld** + `WARN`-Zeile im Log —
  `passed` bytegleich, `renderer`/`rendererValid` unangetastet, kein
  FAIL-Effekt.
- Grenze: kein neuer Messlauf nötig — Parsing/JSON-Vertrag only.

## K3 — Test (#13748)

`tests/device10min-refresh.test.ts` — **14 Tests, rein per Fixture-String,
kein Gerät nötig**:

- `parseDisplayDump`: 120-Hz-Dump (aktiver Mode 2), 60-Hz-Dump (APK-Lock,
  aktiver Mode 1), aktiver Mode schlägt erste refreshRate-Angabe, Fallbacks
  (`refreshRate=`-Angabe, `"<f> Hz"`-Stil), implausible Werte (0, 99999) →
  `null`, fehlende/unlesbare Dumps → `null`.
- `panelHzFromRaf`: 120/90/60/null-Schwellen (inkl. 2-Vsync-Pacing 33,4 fps →
  `null`), fehlende Werte → `null`.
- Quell-Guard: 10-min-Skript importiert die Helfer, schreibt
  `...(refresh ? { refresh } : {})` in den Telemetrie-Teil (nach
  start/endStatus), `refreshWarn` vorhanden, **passed-Ausdruck bytegleich**
  (Regex auf beide passed-Zeilen geprüft), Renderer-Guard #13405 unangetastet,
  Helfer-Modul rein (kein fetch/CDP/Import).

Lauf: `npx vitest run tests/device10min-refresh.test.ts` → 14/14 grün;
`npm test` (Gesamtsuite) → 238 Dateien / 2582 Tests, 0 fail.

## K4 — Doku: JSON-Vertrag + Feldbedeutung (#13749)

### JSON-Vertrag `scripts/m10-v10-device-10min.mjs` (Schema-Änderung ab dieser Lane)

Neues **optional** Feld `refresh` im Output-JSON, im Telemetrie-Teil direkt
nach `startStatus`/`endStatus`:

```jsonc
{
  // ... renderer, rendererValid, startStatus, endStatus ...
  "refresh": {
    "refreshRate": 60,              // aktive Panel-Refresh-Rate in Hz (Zahl)
    "panelMode": "modeId=1",        // dumpsys-Mode-Id; null bei rAF-Probe
    "source": "dumpsys-display",    // "dumpsys-display" | "raf-max"
    "t": 1764328800000,             // Erhebungszeitpunkt (epoch ms)
    "rafFps": 59.9                  // nur bei source=raf-max: rAF-FPS der Probe
  },
  // ... fps, runEnd, samples, passed (unveraendert) ...
}
```

**Feldbedeutung / Tor-Lesung (Dom-Freigabe 17:45Z):**

| Wert | Bedeutung für den Tablet-Tor |
|---|---|
| `refreshRate: 60` + `panelMode` gesetzt | APK-Lock aktiv (A-Feld): Panel durch `preferredDisplayModeId` auf 60 Hz gezogen |
| `refreshRate: 120` (bzw. Panel-Max) | hz=max aktiv (B-Feld): Panel frei, Spiel-Cap regelt selbst |
| `panelMode: null` + `source: "raf-max"` | keine dumpsys-Quelle — Hz-Schätzung aus rAF-Median bei BILDRATE=MAX (device-bridge-Äquivalent) |
| Feld **entfällt** | Parsing-/Verbindungsfehler (WARN im Log) — Beleg ohne Hz-Zahl ist nach 17:45Z nicht torfähig, `passed` sagt dazu NICHTS (bewusst: Messtechnik-Fehler ≠ Messergebnis) |

- `renderer`/`rendererValid` (Guard 9bcc1e41) unangetastet; `passed` bytegleich
  (`rendererValidFlag && dropPct <= 20 && errors.length === 0`) — das
  refresh-Feld beeinflusst die passed-Logik nicht (Guard-Test
  `tests/device10min-refresh.test.ts` pinnt beide passed-Ausdrücke).
- Quelle 1 ist die Bridge-Shell-Weiterleitung (`/shell?cmd=dumpsys display`) —
  steht sie (noch) nicht, greift automatisch Quelle 2 (rAF-MAX-Probe wie in
  `m10-janky-remeasure.mjs`).

**Grenze dieser Lane:** Kein neuer Messlauf nötig — Parsing/JSON-Vertrag only.
`perf.mjs`/`fullrun.mjs` nicht angefasst (fullrun läuft als eigener Job).

## Abnahme (Lane-Gesamt)

| Kriterium | Beleg |
|---|---|
| `node --check` rc=0 | beide geänderten .mjs (`scripts/m10-v10-device-10min.mjs`, `scripts/m10-device-refresh.mjs`) — RC=0 im K2-Schritt |
| `npm test` 0 fail | 238 Dateien / 2582 Tests grün (K3-Schritt) |
| JSON-Schema-Änderung in Doku belegt | Abschnitt K4 (oben) |
| Tor-Verhalten (passed-Logik) bytegleich | Quell-Guard-Test pinnt beide passed-Ausdrücke; only addition: `...(refresh ? { refresh } : {})` |
| Kein Touch an perf.mjs/fullrun.mjs | `git log --oneline -- scripts/perf.mjs scripts/fullrun.mjs` leer in dieser Lane |

Commits: #13746 `ec4e6a0f`, #13747 `470e8fd7`, #13748 `f2108bc7`, #13749 (dieser).
