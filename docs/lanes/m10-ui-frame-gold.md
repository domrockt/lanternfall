# Lane m10-ui-frame-gold (M6/M10)

Auftrag: Offener Optik-Punkt aus `docs/lanes/m10-palette-audit.md` Z.197 —
„ui_frame — erst visuell pruefen, ob Gold-Rahmen bewusst ohne Tinte ist"
(vgl. `docs/lanes/m10-results-attribution.md` Z.52: Results-Panel, goldener Rahmen).
Board-Karten: #10371–#10374.

## K1 — Vorher-Messung (#10371)

Belege: `~/games/.evidence/m10-ui-frame-gold/` (außerhalb des Repos).

- 5 Shots 640x360, je Szene einmal, 0 JS-Fehler:
  `ui-frame-menu-before.png` (Titel/ Menü-Buttons), `ui-frame-options-before.png`,
  `ui-frame-levelup-before.png`, `ui-frame-chest-before.png`, `ui-frame-results-before.png`
  (+ `ui-frame-shots-before.json` mit Szene/Fehlerliste).
- Textur-Analyse `ui-frame-palette-before.json` (Parser: `DIGITS`-Mapping wie
  `scripts/art/lib.py`, Luminanz wie in tests/boss-fx-contrast.test.ts):
  - Grid 24x24, 0 Off-Palette-Pixel.
  - nineslice-Rand (8px-Band, 512 px): 358/512 Pixel Luminanz <= 0,03 (Tinte/Tiefblau),
    aber: **aeusserer 1px-Ring nur 50/92 Tinte** — oben (Zeile 0) und links (Spalte 0)
    ist die aeusserte Kante mist (8, Luminanz ~0,20) bzw. fog (7), nur Ecken + unten/rechts
    sind Tinte (0).
- Sichtprüfung (2x nearest): Options-/Levelup-/Truhen-Panel zeigen oben/links eine
  helle Blaugrau-Kante ohne dunkle Kontur; die Gold-Nieten sitzen in den Ecken.
  Vorlage fuer das Urteil: bisherige Lane `m10-font-ui-frame-polish` (#8080/#8081)
  hat die Stufung 8/7 als WCAG-3:1-Lichtkante bewusst gebaut (F7: dunkle Kanten
  1,12:1 „nicht heilbar", Träger der Lesbarkeit ist die helle Kante).

## K2 — art-director-Urteil + Fix (#10372)

(offen)
