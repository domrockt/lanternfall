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

## K2 — Klick-/Hit-Mapping entkoppelt (geplant: Label-Rechtecke aus der laufenden Szene)

Ansatz (nur Harness): zur Laufzeit alle sichtbaren `PixelText`-Objekte der aktiven Szenen
lesen (`valueText` + `getBounds()`), das Ziel per Text-Match (exakt > includes, kürzester
Treffer gewinnt) finden und auf den Center seiner Bounds klicken. Mapping Bounds → Canvas
bleibt über `__game.scale` + `canvas.boundingBox()`. Tastatur-Pfade bleiben als Kontrolle.
`MENUS_VIEWPORT=WxH` als Env-Override für Robustheits-Läufe. Keine Änderung an `src/**`.

## K3 — Nachweis (offen)

## K4 — Fazit (offen)
