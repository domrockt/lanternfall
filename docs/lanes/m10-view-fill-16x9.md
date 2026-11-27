# M10-view-fill-16x9 — Spielfeld füllt jedes 16:9-Fenster (Vorher/Nachher)

Datum: 2026-11-27. Lane: `m10-view-fill-16x9` (Worktree `/home/ai/games/lf-lanes/m10-view-fill-16x9`,
Branch `m10-view-fill-16x9`). Auftrag: Dom-Wunsch 21:45Z, Punkt 3 — bei 960x540 und 1280x720 zeigten sich
schwarze Balken/Streifen, nur 1920x1080 füllte. Basis: `after: m10-perf-cap-rollback` (Width-Cap-Thema
8834c19; siehe Randbedingungen unten — keine Konflikt-Dateien mit dieser Lane).

## Ursache (Ist-Messung, Commit f7f5319)

`computeView` (M8) nutzt im ganzzahligen Pfad (n = floor(H/360) ≥ 2) Breite 640 → jedes Fenster mit
360er-Vielfach-Höhe füllt exakt (720p/1080p/1440p). Im **Fit-Rückfall (n < 2)** blieb die fixe
4:3-Basisfläche **480x360** stehen und wurde zentriert skaliert → schwarze Balken links/rechts
(Seitenhintergrund `#06070c` aus index.html). Gemessen mit `scripts/m10-view-fill.mjs`
(Pixel-Scan der Screenshots gegen Hintergrundfarbe + DOM-Canvas-Rect, dpr 1, je Format 1 Lauf,
WebGL-Renderer-String in jeder Messung: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
— kein SwiftShader, Belege gültig; 0 JS-Fehler in allen Läufen).

Vorher (`shots/m10-view-fill-before.json`, `shots/m10-view-fill-before-<WxH>.png`):

| Format | intern | Canvas-Rect (CSS) | Balken links/rechts | Balken oben/unten |
|---|---|---|---|---|
| 640x360 | 480x360 (Fit) | 80,0,480,360 | **80 / 80 px** | 0 / 0 |
| 960x540 | 480x360 (Fit, 1.5x) | 120,0,720,540 | **120 / 120 px** | 0 / 0 |
| 1280x720 | 640x360 (2x) | 0,0,1280,720 | 0 / 0 | 0 / 0 |
| 2560x1440 | 640x360 (4x) | 0,0,2560,1440 | 0 / 0 | 0 / 0 |

Hinweis zu Doms Beobachtung „1280x720 zeigt Balken": im Browserfenster mit Chrome/Leisten liegt die
Innenhöhe unter 720 → n=1 → gleicher Fit-Fehler. Der Fix deckt das ab (siehe unten, jedes 16:9-Fenster).

## Fix (Commit 46a5922)

Nur `src/logic/view.ts` (neu `fillView`, aufgerufen im n<2-Zweig von `computeView`):

- `scale = deviceHeight / 360` **exakt** (Höhe skaliert immer mit), `width = floor(deviceWidth / scale)`.
- Jedes 16:9-Fenster ergibt damit exakt **640 px** interne Breite (`16/9 · 360`), ganzzahlige Skalierung,
  wenn die Höhe ein 360er-Vielfaches ist (640x360 → 1x, 1280x720 → 2x), sonst gebrochen **und dokumentiert**
  (960x540 → 1.5x). `roundPixels: true` bleibt aktiv, Kamera-Scroll ganzzahlig → keine Subpixel-Kamera,
  kein Blur (Sicht-Beleg unten).
- Guards: Fiele die Fuell-Breite unter `MIN_WIDTH` (sehr schmales Fenster), Rückfall auf die alte
  4:3-Fit-View (kein Canvas-Overflow). `MAX_WIDTH`/`CROWD_WIDTH` bleiben Obergrenze.
- **Keine Änderung** am ganzzahligen Pfad (n ≥ 2), an `main.ts` (nicht nötig — nur `computeView` liest
  das Fenster), an HUD-/Boss-Banner-Ankern oder Balance-Werten.

### Randbedingungen (dokumentiert)

- **Crowd-Klemme (m10-view-width-cap, 8834c19):** Bei 16:9 greift die Klemme auf 640 **nicht als Balken**,
  weil die Fuell-Breite exakt 640 beträgt — beide Pfade (ganzzahlig und Fit) bleiben voll gefüllt
  (Test in tests/view-fill.test.ts). Bei **nicht-16:9**-Fenster (z. B. 1366x768) zeigt die Klemme weiter
  Balken — bewusst, das ist der FPS-Hebel aus m10-perf-rootcause. Falls `m10-perf-cap-rollback` das Cap
  entfernt, bleibt der Fill unverändert gültig (kein Code-Konflikt: Fix berührt nur den n<2-Zweig).
- **Ultrawide** (Breite/scale > 860) und **Höhe kein 360er-Vielfaches mit n ≥ 2** (z. B. 1366x768 im
  normalen Pfad): weiter letterbox — Absicht (M8 ganzzahlige Skalierung + MAX_WIDTH-Perf-Grenze).

## Nachher (`shots/m10-view-fill-after.json`, `shots/m10-view-fill-after-<WxH>.png`)

| Format | intern | Canvas-Rect (CSS) | Balken links/rechts | Balken oben/unten | Skalierung |
|---|---|---|---|---|---|
| 640x360 | 640x360 | 0,0,640,360 | **0 / 0** | 0 / 0 | 1x ganzzahlig |
| 960x540 | 640x360 | 0,0,960,540 | **0 / 0** | 0 / 0 | 1.5x gebrochen (dokumentiert) |
| 1280x720 | 640x360 | 0,0,1280,720 | **0 / 0** | 0 / 0 | 2x ganzzahlig |
| 2560x1440 | 640x360 | 0,0,2560,1440 | **0 / 0** | 0 / 0 | 4x ganzzahlig |

Sicht-Belege: `shots/m10-view-fill-after-960x540.png` (Kernformat, vorher 120 px Balken je Seite) —
HUD durchgehend über die volle Breite, Welt bis an beide Ränder, Pixel scharf. Derselbe Seed/Shot vor
dem Fix: `shots/m10-view-fill-before-960x540.png`.

## Tests

- Neu `tests/view-fill.test.ts` (13 Tests): für alle 4 Formate Spielfeld-Rect == Canvas-Rect
  (`width·scale == Fensterbreite`, `360·scale == Fensterhöhe`, css == Viewport), Skalierung ganzzahlig
  bzw. gebrochen-dokumentiert, Crowd-Cap-Randbedingung, Fit-Guard (kein Overflow), viewKey, kaputte Maße.
- Angepasst (minimal, unvermeidbar — Verhalten im Fit-Pfad hat sich geändert; zwei Assertions 480→640):
  `tests/view.test.ts` („kleine Fenster nutzen den Fuell-Fit") und `tests/view-width.test.ts`
  („schmale Views bleiben unter der Klemme unverändert"). Beide Dateien sind nicht lane-eigen —
  Änderung hier begründet und in `.dispatch/requests.md` gemeldet.
- `npx tsc --noEmit` rc=0, `npx vitest run` **763/763 grün** (74 Dateien), `npm run build` rc=0.

## Abnahme

- Kein schwarzer Rand/Streifen sichtbar bei 960x540, 1280x720, 2560x1440 (und 640x360):
  Belege `shots/m10-view-fill-after-*.png` + Pixel-Scan 0 px Balken + DOM-Rect bei 0,0.
- Jede JSON-Messung (`-before.json`, `-after.json`) trägt den WebGL-Renderer-String
  (Mesa Intel RPL-S, kein SwiftShader).
- 0 JS-Fehler in allen Probe-Läufen (vor und nach Fix, alle 4 Formate).
- HUD-Anker unberührt: `tests/hud-anchor.test.ts` + `tests/boss-banner-layout.test.ts` grün;
  interne Breite im Fit-Fall ist jetzt 640 = die Referenzbreite der HUD-Anker (m10-hud-wide-anchor),
  nicht schmaler.
