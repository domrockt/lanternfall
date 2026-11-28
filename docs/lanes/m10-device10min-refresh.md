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

(nachtragen)

## K3 — Test (#13748)

(nachtragen)

## K4 — Doku/JSON-Vertrag (#13749)

(nachtragen)
