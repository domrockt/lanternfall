# Lane m10-apk-splash-window-beleg — Beleg nachholen: natives Starting-Window beim echten Kaltstart (erste ~3 s)

Karte: #13215 (Board `m10-apk-splash-window-beleg`) · Datum: 2026-11-28 · Typ: NUR-MESS (keine Spiel-/APK-Änderung)

## Auftrag

Der/native Starting-Window (Theme `#0a0d14` + zentrierte Laterne, Fix von Vera in lf-apk ea37f3e)
sollte dynamisch beim echten Kaltstart belegt werden: EIN Kaltstart mit Warm-up-Skript
`scripts/m10-apk-splash.mjs`, Screencaps ab t=0 (erste 3 s lückenlos, ~400-ms-Takt), Pillow-Farbmessung
je Shot, Doku mit Urteil.

## Ergebnis: URTEIL „OFFEN — GEBLOCKT“ (keine Messung möglich, Ursache Spieler-Sperre)

**Beim einzigen Versuch dieser Karte war das Gerät nicht frei: `dom_playing=true`.**
Gemäß Auftrag („dom_playing=true → Start überspringen und als geblockt notieren; ein Versuch pro Karte,
kein sleep-Polling“) wurde der Launch **nicht** versucht und der Lauf sauber beendet.

Prüfzeitpunkte `/status` (Bridge http://172.17.0.1:5181, Redmi Pad Pro, Android 16):

| Zeitpunkt (Reihenfolge) | dom_playing | user_idle_s | Aktion |
|---|---|---|---|
| Kartenannahme #13215 | `true` | 146 | keine Startvorbereitung gegen Sperre |
| direkt vor dem (einzigen) Versuch | `true` | 246 | Start übersprungen |
| nach Skript-Lauf (Beleg) | `true` | 276 | — |

**Belegpfade (nach `~/games/.evidence/`, Lane-Regel 28.11: Belege nicht in git):**

- `~/games/.evidence/m10-apk-splash-window-beleg/window-shots/manifest.json`
  → `starts[0].blocked = "DOM_SPIELT (dom_playing true vor Start) — kein Launch versucht"`,
  `domPlayingBefore: true`, `launch: null`, `shots: []` — **manifest weist aus, dass kein Launch
  gegen die Spieler-Sperre erfolgte.**
- `~/games/.evidence/m10-apk-splash-window-beleg/status-after-attempt.json` → `/status`-Rohdaten nach dem Versuch (`dom_playing: true`).

Da kein Shot existiert, war auch keine Farbmessung (Pillow) möglich — Messwerkzeug liegt bereit:
`~/tmp/m10-apk-splash-window-beleg/measure.py` (Kriterien: Rand-Median = `#0a0d14` ±4/255,
Laterne = ≥30 helle Pixel (Luma ≥160) im mittleren Viertel, kein Vollbild `#000000`
(schwarz-Anteil <98 %), kein helles System-Fenster (Luma ≥200 <30 % der Fläche)).

## Ursache + kleinstmöglicher Hebel

- **Ursache:** Dom spielt zum Prüfzeitpunkt aktiv auf dem Gerät (3/3 `/status`-Checks über ~4 min
  `dom_playing=true`). `POST /launch` wäre ein force-stop seiner Session — Auftrag verbietet das.
- **Hebel (kleinstmöglich):** EINEN erneuten Versuch starten, sobald `/status` `dom_playing=false`
  meldet (z. B. zum Karten-Restart durch den Scheduler); Skript und Messung sind fertig und validierbar:
  `node scripts/m10-apk-splash.mjs <evidence-out>` (Default jetzt 1 Start via `M10_STARTS`,
  Warm-up-Shot vor dem Launch, ~420-ms-Takt danach, `manifest.json` mit Shot-Zeitstempeln `atMs`).
  Danach `python3 ~/tmp/m10-apk-splash-window-beleg/measure.py <outdir> <out.json>`.

## Was diese Lane geändert hat

- `scripts/m10-apk-splash.mjs`: Warm-up-Fix (aus m10-apk-splash-sight, unvalidiert) übernommen und
  auf EINEN Kaltstart parametrisiert (`M10_STARTS`, Default 1; `M10_WINDOW_MS`, Default 6000);
  `manifest.lane` auf diese Lane gesetzt. **Unvalidiert in der Wirkung des Warm-ups** (kein Lauf
  gegen das Gerät möglich) — siehe Hebel oben.

## Offene Punkte

- Dynamischer Beleg des nativen Starting-Window (0–3,6 s) steht weiterhin aus; statischer Beleg K1
  (Theme/Asset) liegt in `~/games/.evidence/m10-apk-splash-sight/k1-apk-theme.json` (Lane m10-apk-splash-sight).
