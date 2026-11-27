# Lane m10-verify-menus-view — verify-menus auf M8-View entkoppeln

Lane: `m10-verify-menus-view` (Worktree `lf-lanes/m10-verify-menus-view`, Branch gleichnamig).
Umfang: **nur** `scripts/verify-menus.mjs`, `docs/lanes/m10-verify-menus-view.md`, `shots/m10-verify-menus-*`.
Keine Änderungen an `src/**` oder Spielszenen.

## Ausgangslage

`scripts/verify-menus.mjs` klickt feste logische Pixelkoordinaten, die historisch für den
480x270-View berechnet wurden. Seit M8 ist die logische Höhe **360** (`oy = (H-270)/2 = 45`),
die Breite folgt dem Geräte-Seitenverhältnis (`computeView`, `src/logic/view.ts`). Die
Koordinaten werden zwar über `__game.scale` auf den Canvas gemappt, sind aber als **feste
Layout-Annahmen** im Harness eingefroren: sie treffen nur, wenn der logische View zufällig
480x360 ist (Fit-Rückfall bei kleinen Viewports).

## K1 — Ist-Messung (2026-11-27)

Belege: `shots/m10-verify-menus-before.log`, `~/tmp/m10-verify-menus-view/k1-probe-1280x720.log`.

| Lauf | Viewport | Logischer View | Ergebnis |
|---|---|---|---|
| verify-menus Standard (1. Versuch) | 960x540 | 480x360 (Fit, n<2) | Abbruch: Playwright „Target page, context or browser has been closed“ bei `clickGame` Zeile 72 (Host-Last-Flake, kein Inhaltsfehler) |
| verify-menus Standard (2. Versuch) | 960x540 | 480x360 (Fit) | **PASS 15/15** — aber nur, weil Fit-View 480x360 und die Legacy-y-Werte (259/246/334/342) zufällig zum M8-Layout (`oy=45`) passen |
| Probe (`probe-viewport.mjs`) | 1280x720 | **640x360** (n=2) | **FAIL-Repro**: Klick (240,259) → landet auf START (x 168..264), Szene wechselt zu `charselect` statt Options-Overlay. Kontrolle auf der echten Position (320,259) trifft. |

**FAIL-Liste (Klickkoordinate → erwartetes Element, bei 640x360):**
- `(240,259)` OPTIONEN (Titel) → liegt bei cx=320; Klick trifft START → falsche Szene.
- `(346,259)` CREDITS (Titel) → liegt bei 426; Klick trifft OPTIONEN.
- `(136,259)` Mira-Panel (CharSelect) → Panels bei cx±112 = 208/432; Klick trifft nichts.
- `(240,246)`/`(108,246)` Pause OPTIONEN/FORTSETZEN → bei cx=320 bzw. 188+ox → daneben.
- `(146,334)`/`(316,334)` Results NEUE RUNDE/TITEL → cx-abhängig → daneben.
- Options-Werte-Zonen `(414,132)`, `(345,172)`, `(345,192)`, `(414,232)` → rowW/rowLeft ist cx-abhängig → daneben.

Damit ist die Menü-Abnahme an einen einzigen Viewport gebunden — genau der Befund des Briefings
(„Harness klickt daneben“), reproduzierbar, sobald der Abnahme-View breiter als Fit-480 ist.

## K2 — Klick-/Hit-Mapping entkoppelt (2026-11-27)

Umsetzung in `scripts/verify-menus.mjs` (Commit `69bd046` WIP + Final-Commit):

- `readTargets()` liest zur Laufzeit alle sichtbaren `PixelText`-Objekte (`valueText`)
  der aktiven Szenen. Bewusst **`getWorldTransformMatrix().transformPoint(0,0)`** statt
  `getBounds()`: Container-Bounds sind bei PixelText unsauber (Glyph-Texturen verfälschen
  Höhe/y — erster Lauf klickte 13 px unter den START-Knopf und FAILete mit Timeout),
  der Text-Ursprung liegt bei allen Menü-Texten (zentriert oder Zeilen-Label) sicher
  im klickbaren Element.
- `clickLabel(needle)` wählt das Ziel nach Text-Match (exakt > Präfix > enthält,
  kürzester Text gewinnt) und klickt seine Weltposition, gemappt über
  `__game.scale` + `canvas.boundingBox()` — kein festes 480x270-Layout mehr.
- `clickOptionArrow(rowLabel)` findet die Optionszeile über ihr Label und klickt den
  ">"-Pfeil mit dem kleinsten y-Abstand (Zeilen-/Pfeilposition kommen aus der Szene).
- Tastatur-Pfade bleiben als Kontrolle: ESC, Aufgeben (Pfeile+Enter), „o“ nach Reload.
- `MENUS_VIEWPORT=1280x720` als Env-Override für Robustheits-Läufe; der Check
  „Skalierung 2X“ rechnet die erwartete Canvas-Größe jetzt aus dem Viewport her
  (gleiche Regel wie `computeView`, dpr=1) statt sie fest auf 720x540 zu codieren.
- Snap-Präfix auf `shots/m10-verify-menus-*.png`, Ergebnis-JSON auf
  `shots/m10-verify-menus.json` umgestellt; die Legacy-`m6-menus-*`-Belege werden
  nicht mehr angetastet.

**Messwerte:** Standard-Viewport 960x540 (Fit 480x360): **PASS 15/15**, 0 JS-Fehler.
Robustheits-Lauf `MENUS_VIEWPORT=1280x720` (View 640x360, vorher FAIL-Repro):
**PASS 15/15**, 0 JS-Fehler, Skalierungs-Check „center 640/360, 1280x720“. Logs:
`~/tmp/m10-verify-menus-view/k2-after-try2.log` und `k2-after-640.log`.

## K3 — Nachweis (offen)

## K4 — Fazit (offen)
