# Lane m8-display — Display-Neuaufstellung (360p-Basis, variable Breite) + Touch-Anpassung

Stand: 2026-11-26. Worktree `/home/ai/games/lf-lanes/m8-display`, Branch `m8-display`.
Touch/Gamepad kam aus der bereits gemergten Lane `m8-input` (5d29b81); hier nur an die neue View angepasst.

## View & Skalierung

- Logische Höhe **360 px**, Breite seitenverhältnisabhängig:
  `n = floor(geraeteHoehe_px / 360)` (begrenzt durch `floor(geraeteBreite_px / 480)`),
  `Breite = clamp(round(geraeteBreite_px / n), 480, 860)`.
- Gerätepixel = `devicePixelRatio`; Canvas bleibt logisch klein, CSS-Größe = `Breite * n / dpr`.
  Jeder Spielpixel ist exakt `n × n` Gerätepixel (`image-rendering: pixelated`).
- `n < 2` (kleine Fenster) und Hochkant nutzen gebrochenen Fit-Rückfall (480×360).
- Neuberechnung bei `resize`, `orientationchange`, `visualViewport.resize` und
  `matchMedia(resolution)`-Wechsel (Windows-Skalierung).
- Option **SKALIERUNG**: AUTO / 2X–6X (Zyklus; feste Stufe wird auf die größte passende begrenzt).
- Hochkant: DOM-Overlay „GERÄT DREHEN“ + automatische Pause des Runs.
- `index.html`: `100dvh`, `viewport-fit=cover`, Safe-Area-Padding, `touch-action: none`,
  Web-App-Manifest (`display: fullscreen`, `orientation: landscape`), Vollbild-Knopf im Titel.

### Beispiel-Views

| Gerät / Fenster | Gerätepixel | n | logische View | CSS |
|---|---|---|---|---|
| 1920×1080 @1 | 1920×1080 | 3 | 640×360 | 1920×1080 |
| 2560×1440 @1.5 | 3840×2160 | 6 | 640×360 | 2560×1440 |
| 3840×2160 @1 | 3840×2160 | 6 | 640×360 | 3840×2160 |
| 1366×768 @1 | 1366×768 | 2 | 683×360 | 1366×720 |
| iPhone 14 quer @3 | 2532×1170 | 3 | 844×360 | 844×360 |
| iPad Pro 12.9 quer @2 (4:3) | 2732×2048 | 5 | 546×360 | 1365×900 |
| 800×450 @1 | 800×450 | <2 | 480×360 (Fit) | 600×450 |

## Spawn & Rebalancing

- Spawn-Ring/Stream: `max(ViewBreite, ViewHöhe)/2 + Rand` — immer knapp außerhalb,
  auch bei 780×360 nicht am seitlichen Bildrand sichtbar.
- Recycle-Abstand: `max(340, ViewDiagonale/2 * 1.6)`.
- Gegner-Deckel skaliert mit der Sichtfläche gegenüber 640×360 (Faktor 0,75–1,5,
  harte Obergrenze 500). Die Spawnrate nutzt die Wurzel des Flächenfaktors und
  wird ab 640 px Breite um 15 % gedrosselt (780×360: Faktor 0,94), damit der
  M6-Überlebenskorridor bei breiten Formaten hält.
- Waffen-/AoE-Radius und Aufsammelradius skalieren mit der View-Breite
  (Faktor 1,0 bei 640, 1,22 bei 780, max. 1,3 bei 860), damit Flächenwaffen auf
  breiten Bildschirmen nicht nutzlos klein wirken.
- Boss-Abstand: `max(130, min(ViewBreite,ViewHöhe) * 0,55)` (sichtbar, nicht auf dem Spieler).

## Messwerte

### Balance 640×360 (1920×1080 @1, 3 Seeds × 2 Charaktere, 30x, kein god)

| Char | Seed | Ergebnis | Minuten | Level | Kills | Evos | Boss-Dauern (s) | Korridor |
|---|---|---|---|---|---|---|---|---|
| Mira | 101 | Tod | 22,0 | 27 | 2252 | 1 | 27/28/29/28 | JA |
| Kael | 101 | Sieg | 30,6 | 31 | 13392 | 3 | 35/51/40/43/31/31 | JA |
| Mira | 202 | Tod | 21,2 | 26 | 2069 | 2 | 28/27/29/30 | JA |
| Kael | 202 | Sieg | 30,8 | 30 | 9864 | 2 | 31/48/43/45/37/42 | JA |
| Mira | 404 | Tod | 20,9 | 25 | 1827 | 1 | 36/30/27/33 | JA |
| Kael | 404 | Sieg | 30,7 | 29 | 10600 | 2 | 29/40/30/31/33/39 | JA |

Alle 6 Läufe im M6-Korridor (Überleben 20–28 min bzw. Sieg, Level 25–40, Bosse 20–60 s, ≥1 Evolution).

### Balance 780×360 (1920×1080-Ersatz: 780×360 @ dpr 3, 2 Seeds × 2 Charaktere, 30x, kein god)

| Char | Seed | Ergebnis | Minuten | Level | Kills | Evos | Boss-Dauern (s) | Korridor |
|---|---|---|---|---|---|---|---|---|
| Mira | 101 | Tod | 20,4 | 26 | 1779 | 1 | 29/29/26/25 | JA |
| Kael | 101 | Sieg | 30,5 | 27 | 6530 | 3 | 30/30/32/29/23/24 | JA |
| Mira | 404 | Sieg | 30,4 | 34 | 7351 | 3 | 27/26/29/27/25/23 | JA |
| Kael | 404 | Sieg | 30,5 | 30 | 11852 | 2 | 34/46/38/28/29/28 | JA |

Alle vier Läufe im Korridor (Überleben ab 20 min bzw. Sieg, Level 25–40, Bosse 20–60 s, ≥1 Evolution);
`shots/balance-main-m8-780-clean.json` meldet `allRunsPass: true` und 0 JS-Fehler. Gemessen ohne
konkurrierende Messlast: Balance-Läufe sind CPU-empfindlich, parallele Läufe verzerren den AutoPlay-Bot.

### Performance/FPS 780×360

folgt nach dem Lauf.

### verify-display

folgt nach dem Lauf.

## Offene Punkte

- `scripts/verify-menus.mjs` nutzt noch feste 480×270-Klickkoordinaten; die
  M8-Menüabnahme läuft über `scripts/verify-display.mjs`. Ein Koordinaten-Update
  des alten M6-Skripts ist nicht Teil dieser Lane.
- `scripts/verify-input.mjs` wurde auf dynamische Text-/Karten-Taps umgestellt
  (Joystick/Pause/Level-up/Truhe), damit die Touch-Abnahme bei 860×360 läuft.
