# Lane m10-ui-pause-quality — Pause-Screen-Qualität (UI.ts-Teil von m10-menu-quality-55)

**Stand:** 2026-11-28, Worktree `lf-lanes/m10-ui-pause-quality` (Branch `m10-ui-pause-quality`)
**Scope (Briefing):** nur die belegten Mängel des Pause-Screens aus dem Scan der Lane
m10-menu-quality-55 (`~/games/.evidence/m10-menu-quality-55/m10-menu-quality-before-scan.json`):
(a) Pause-Build-Texte Farbe Index 8 → 12/13, (b) Icon-Spacing +4 px, (c) art-director-Hebel (7):
Zeile 6 (SEELENLEUCHTFEUER) bekommt denselben Spalten-Puffer wie die Zeilen 1–5.
LevelUp-Panel-Layout, HUD-Anker und XP-Leiste wurden nicht angefasst.

## Karten

| Karte | Inhalt | Commit |
|---|---|---|
| #11078 K1 | Vorher-Scan Pause (640x360@2 + 780x360@3) | 849abf37 |
| #11079 K2 | Build-Texte Powerup-Spalte idx 8 → 12 | 02a582b8 |
| #11080 K3 | Icon-Pitch 15 → 19 + Zeile-6-Spaltenpuffer | 950e3bb0 |
| #11081 K4 | Regressionstest + Nachher-Scan + Abnahme + Doku | (dieser Commit) |

## Belege

Alle Scan-JSONs/PNGs liegen nach `~/games/.evidence/m10-ui-pause-quality/`:

- `m10-ui-pause-quality-before-scan.json` / `…-after-scan.json` (+ PNGs je Profil)
- `scan-diff-summary.json` (maschinenlesbarer Vorher/Nachher-Diff)
- `before-lv-column-4x.png`, `before-row6-4x.png`, `before-rows1-5-3x.png` (Mangel-Belege)
- `after-build-3x.png`, `after-row6-3x.png` (Fix-Sichtprüfung)

Abnahme-Bilder (git): `shots/abnahme/m10-ui-pause-quality-after-640x3602-pause.png`,
`shots/abnahme/m10-ui-pause-quality-after-780x3603-pause.png`.

Renderer (beide Scans): `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
(kein SwiftShader), 0 JS-Fehler in allen Läufen.

## Messwerte

Vorher (= Scan von m10-menu-quality-55, beide Profile identisch):

- 14 Kontrast-Fails im Pause-UI: 12× Pause-Build-Texte idx 8 (mist) @ 4.15 < 4.5
  (Powerup-Namen + „LV n“), dazu 2 Hinweiszeilen (ESC idx 8 @ 4.15, PFEILE idx 7 @ 2.72).
- 10 Icon-Frame-Overlaps (je 16 px² = 16 px Breite × 1 px Höhe bei Zeilen-Pitch 15).
- Zeilen-1-5-Puffer Name→LV: min 22 px (GEWITTERSIEGEL/PHÖNIXSCHWARM …); Zeile 6
  (SEELENLEUCHTFEUER, 17 Zeichen): 4 px; „LV 8“ → Sanduhr-Icon: 2 px.

Nachher:

- Kontrast: Powerup-Build-Texte idx 12 (candleWhite) @ 15.28 ≥ 4.5 (beide Profile).
  Verbleibende 2 Fails sind die Hinweiszeilen „ESC = WEITER …“ (idx 8) und
  „PFEILE + ENTER …“ (idx 7) — laut Briefing **nicht** gemeldet und deshalb bewusst
  unverändert („Nur diese belegten Mängel fixen“). Hebel dafür läge in denselben
  zwei PixelText-Zeilen in `createPauseUI()`.
- Overlaps: 10 → 0 (beide Profile), keine neuen Überlappungen mit angrenzenden
  HUD-Elementen (Run- und UI-Szene je 0).
- Icon-Abstand: Pitch 19 px → 3 px Luft zwischen den 16-px-Frames (vorher −1 px).
- Zeile 6: „SEELENLEU / CHTFEUER“ zweizeilig (slotNameLines), Puffer zur LV-Spalte
  52 px ≥ 22 px (Zeilen-1-5-Minimum); Zeilen 1–5 bleiben einzeilig.
- Scan-Diff (`scan-diff-summary.json`): alle bewegten Texte nur Pitch-Versatz (+4 px je
  Zeilenindex) bei identischen X-Rects; Zeile 6 zweizeilig; Farbwchsel 8→12 nur in der
  Powerup-Spalte; Icons: nur die 10 Build-Icons ab Zeile 2 bewegt, 14 weitere
  (Zeile 1 + HUD) unverändert; Rest des Screens pixelgleich.

## Umsetzung

- `src/scenes/UI.ts`, `refreshPause()`:
  - K2: Powerup-Zeilen `C.mist` → `C.candleWhite` (Waffen-Spalte `C.bone` bleibt, idx 10
    besteht den Kontrast).
  - K3: `PAUSE_ROW_PITCH = 19`; Namensspalte bricht über `slotNameLines(name, maxChars)`
    um, bevor der Spalten-Puffer von 22 px (Minimum der Zeilen 1–5 im Vorher-Scan)
    unterschritten wird (`colMaxChars`, Waffen: 14 Zeichen, Powerups: 18).
- `tests/ui-pause-quality.test.ts`: 17 reine Tests (Kontrast ≥ 4.5, Icon-Geometrie 0
  Overlaps + Vorher-Dokumentation, Spaltenpuffer-Formel über alle Waffen-/Powerup-Namen
  aus `src/data`, Quell-Checks inkl. Scope-Guard für die unveränderten Hinweiszeilen).
- `scripts/m10-ui-pause-quality.mjs`: Pause-Scan (Basis `m10-menu-quality.mjs`), Profile
  640x360@2 und 780x360@3, Ausgabe nach `~/games/.evidence/` (Belege bleiben außerhalb
  des Repos).

## Kontrolleure (2026-11-28)

- **Reviewer: PASS** (17→18 Tests nachgerechnet, Geometrie verifiziert, kein Scope-Bruch;
  Nits 1/2/4 geschlossen in Commit „Review-Nits 1/2/4 geschlossen“ — Formel-Pinning
  lvTextW=23 und Glyph-Vorschub /6 im Test, lvTextW-Kommentar in UI.ts).
- **Art-director: PASS** — alle 4 Kriterien belegt (idx 12 @ 15.28 in beiden Profilen,
  Pixel-Verifikation 0xF2EDD8; 0 Overlaps, Pitch 19; Zeile 6 zweizeilig mit 52 px Puffer,
  8 px Luft zum FORTSETZEN-Frame; Pixel-Diff before/after: 3,27 % der Fläche, davon 77 %
  im Build-Panel, außerhalb nur die 10 gemeldeten Icon-Verschiebungen; Renderer
  Mesa Intel RPL-S, Belege gültig).
- **Empfehlung art-director (Folgebedarf, nicht in dieser Lane):** Footer-Hints
  „ESC = WEITER …“ (idx 8 @ 4.15) und „PFEILE + ENTER …“ (idx 7 @ 2.72) als eigene
  Nachfolge-Karte melden (Hebel: `createPauseUI()`, 2 Farbkonstanten).

## Offene Punkte / Anmerkungen für GAME.md-Merge

1. Hinweiszeilen (ESC idx 8 @ 4.15, PFEILE idx 7 @ 2.72) sind ein restlicher, vom
   Briefing nicht gemeldeter Kontrast-Mangel desselben Screens (auch Title/Options
   betroffen, idx 7 @ 2.07–3.0). Fix wäre je 1 Farbkonstante in `createPauseUI()`.
2. `tests/menu-quality-55.test.ts` hält den Vorher-Stand (pause: 14 Fails / 10 Overlaps)
   als feste BASELINE-Konstante fest — Fremd-Datei, wurde nicht angefasst; die Werte
   dort sind als „before“ dokumentiert und durch diese Lane real gesenkt.
3. `npm test` aktualisiert `shots/m10-passive-math-*.json` nur per Timestamp neu
   (neutrale Nebenwirkung des Testlaufs, wurde vor jedem Commit zurückgesetzt).
