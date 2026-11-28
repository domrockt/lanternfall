# Device-Telemetry (M10, Lane m10-device-telemetry)

Lanternfall sendet — wenn aktiviert — alle 5 s einen Performance-Sample an einen
Empfänger auf dem Rig. Ziel: echte Geräte-Zahlen von Doms Android-Tablet, ohne adb.

**Keine personenbezogenen Daten.** Gesendet werden nur technische Kennzahlen
(Frame-Zeiten, Gegnerzahl, Qualitätsebene, Bildschirmgröße, User-Agent). Keine
IDs, keine Positionen, keine Eingaben, keine Spielfortschritts-Konten.

## Aktivierung (src/telemetry.ts, `telemetryEnabled`)

| Bedingung | Telemetry |
|---|---|
| URL enthält `?telemetry=1` | **an** (auch auf dem Desktop, für Probe-Läufe) |
| URL enthält `?telemetry=0` | **aus** (gewinnt über alles, auch im APK) |
| kein Param, Host `127.0.0.1` **und** Android-User-Agent (APK-Build) | **an** |
| sonst (Desktop-Spieler, alle anderen Hosts) | **aus** — es wird nichts gesendet |

Das APK lädt das Spiel über `http://127.0.0.1:<port>/index.html` (Cleartext im
AndroidManifest erlaubt), deshalb ist der Rig-Empfänger vom Tablet erreichbar.
Ein zusätzliches `?telemetryEndpoint=<url>` überschreibt den Empfänger (für lokale
Probe-Läufe).

## Datenfluss

- Collector (`TelemetryCollector`) hängt an den Phaser-Step und sammelt
  Frame-Dauern in einem Ringpuffer (10 s bei 60 FPS). Gültig sind Dauern von
  0–2000 ms; damit bleiben echte Frame-Hitches (z. B. Thermik-Drosselung auf dem
  Tablet) in `frameMsMax` sichtbar statt als „Unsinn" verworfen zu werden.
- Alle 5 s: ein Sample, gepuffert und als **JSON-Liste** per
  `fetch(..., { method: "POST", keepalive: true })` gesendet.
  **Max. 1 Request / 5 s**; beim Verstecken der App wird noch einmal geflusht.
- Sendefehler werden **still geschluckt**; Samples bleiben im Puffer (Deckel:
  60 Samples = 5 min, ältere fallen heraus) und werden beim nächsten Intervall
  erneut versucht. Telemetry blockiert oder stört das Spiel nie.
- Statische Angaben (WebGL-Renderer/-Vendor via `WEBGL_debug_renderer_info`,
  Build-ID `__LF_BUILD__` = Commit-Hash + Build-Zeit aus `vite.config.ts`) werden
  **einmal pro Lauf** gelesen und in jedem Sample mitgeschickt.

## Empfänger (Rig)

- `POST http://10.10.50.185:5180/t` — JSON-Objekt oder Liste, CORS `*`, Antwort 204.
- `GET http://10.10.50.185:5180/latest` — letzter empfangener Datensatz.
- Ablage: `~/games/.evidence/device/telemetry-YYYY-MM-DD.jsonl` (eine Zeile je Sample).

## Felder eines Samples

| Feld | Bedeutung |
|---|---|
| `ts` | Wall-Clock (ms) zum Sendezeitspunkt |
| `t` | Spielzeit in s (Run-Empfehlung: `elapsed`), außerhalb des Runs Zeit seit Installation |
| `fps` | `game.loop.actualFps` |
| `frameMsP50` / `frameMsP95` / `frameMsMax` | Frame-Dauern (ms) des letzten Intervalls (nearest-rank) |
| `quality` | LOD-Stufe des Runs (`full`/`reduced`/`minimal`), sonst `null` |
| `renderScale` | `RENDER_SCALE` (interne Render-Auflösungs-Stufe) |
| `gameScale` | `GAME_SCALE` (Geraetepixel je Spielpixel) |
| `enemies` | aktive Gegner |
| `fxActive` | aktive FX-Laufzeitobjekte |
| `drawCalls` | Renderer-`drawCount` des letzten Frames (falls verfügbar, sonst `null`) |
| `heapMB` | `performance.memory.usedJSHeapSize` (nur Chromium, sonst `null`) |
| `scene` / `character` | aktive Szene bzw. gewählte Charakter-ID |
| `renderer` / `vendor` | WebGL-Debug-Info (einmal pro Lauf gelesen) |
| `build` | Commit-Hash + Build-Zeit (`__LF_BUILD__`) |
| `ua` / `dpr` / `screenW` / `screenH` | User-Agent, devicePixelRatio, Bildschirmgröße |

## Abschalten

- Einzellauf: URL mit `?telemetry=0` (überschreibt APK-Erkennung und `?telemetry=1`).
- Build/Code: `installTelemetry()` in `src/debug.ts` entfernen bzw. den Hook auskommentieren —
  ohne Hook existiert kein Sender, das Spiel verhält sich sonst identisch.

## Beispiel-Auswertung (fps p5 / Median je Spielminute)

```bash
node -e '
const fs = require("fs");
const rows = fs.readFileSync(process.argv[1], "utf8").split("\n")
  .filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => r.scene === "run" && r.frameMsP95 !== null);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const byMin = new Map();
for (const r of rows) byMin.set(Math.floor(r.t / 60), byMin.get(Math.floor(r.t / 60)) ?? []).push(r);
console.log("minute  n   fpsP5  fpsMedian  frameMsP95max  enemiesMax  quality");
for (const [m, rs] of [...byMin].sort((a, b) => a[0] - b[0])) {
  const fps = rs.map((r) => r.fps);
  console.log(String(m).padStart(6), String(rs.length).padStart(3),
    String(pct(fps, 0.05)).padStart(6), String(pct(fps, 0.5)).padStart(9),
    String(Math.max(...rs.map((r) => r.frameMsP95))).padStart(13),
    String(Math.max(...rs.map((r) => r.enemies))).padStart(10),
    "  " + [...new Set(rs.map((r) => r.quality))].join(","));
}' ~/games/.evidence/device/telemetry-2026-11-28.jsonl
```

`fpsP5` ist das kritische Feld: ein Median kann von Rucklern verdecken, was
Spieler als Hänger spüren. Die `quality`-Spalte zeigt, in welcher LOD-Stufe die
Minute gefahren ist — das ist der direkte Abgleich mit den LOD-Schwellen.
