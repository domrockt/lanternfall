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

## K2 — art-director-Urteil: PASS 4/5, kein Fix (#10372)

Das Urteil ist das Ergebnis (Alternate-Outcome der Abnahme): „bewusst ohne Tinte"
ist korrektes Design, `src/gfx/gen-ui.ts` wurde NICHT geändert.

**art-director (PASS, 4/5):** Die fehlende durchgehende Tinte-Kontur ist kein Mangel,
sondern korrektes Bevel-Design: In allen fünf Screens (Menu-Buttons, Options,
Level-Up, Truhe, Results) trägt die helle Kante oben (mist, 8) und links (fog, 7)
die Silhouette gegen den fast schwarzen Hintergrund — im Options- und Chest-Panel
ist die Panelform auch bei 1x ohne Mühe ablesbar, die Gold-Nieten verankern die
Ecken. Eine Tinte-Kontur (Luminanz <= 0,03) an oben/links wäre gegen den
Hintergrund (~0,02–0,05) visuell nicht existent und würde null Lesbarkeit
hinzufügen; die Kontur-Regel mit Shot-Signatur <= 0,03 zielt auf Figuren/Gegner-
Sprites, nicht auf 9-Slice-UI-Panels. Licht-Hierarchie stimmt (oben heller als
links, Tinte unten/rechts als Bevel-Schattenseite) — auslieferungsfähige,
kommerziell übliche Panel-Anmutung. Liste: muss neu — / nachbessern — / ok:
ui_frame (24x24, Border 8/8/8/8) in allen fünf Szenen.

Konsistenz mit der Historie: die Lane `m10-font-ui-frame-polish` (#8080/#8081) hat
die 8/7-Lichtkante als WCAG-3:1-Maßnahme gebaut und F7 (Dunkelkante 1,12:1,
„nicht heilbar") dokumentiert — das Urteil bestätigt diesen Stand.

**Anmerkung des art-directors (doku-würdig, kein Fix):** das Results-Panel trägt
eine durchgehende Goldumrandung, Options/Level-Up (Stahl + Nieten) nicht —
beabsichtigtes Endscreen-Highlight. Technisch ein anderes Element: Results nutzt
kein ui_frame, sondern einen 2-px-Lantern-Stroke
(`src/scenes/Results.ts:75`, rectangle 440x254). Später nicht als Inkonsistenz
lesen; ui_frame selbst ist unverändert.

## K3 — Design-Guard-Test (#10373)

`tests/ui-frame-gold.test.ts` codifiziert das vom art-director geprüfte Ist-Design
(statt des verworfenen Fix-Zustands):
- Grid 24x24, 1 Frame, nineslice-Rand 8; 0 Off-Palette-Pixel.
- Aeusserte Kante oben/links = Licht (8/7, Luminanz > 0,1) — schützt vor einem
  spaeteren ungewollten „Kontur-Fix".
- Bevel-Schattenseite: Zeile 23/Spalte 23 lückenlos Tinte (Luminanz <= 0,03);
  vier Eckpixel hart Tinte.
- Gold-Nieten (Gold/Amber-Familie, Indizes 16–22) in allen vier Ecken;
  Innenfläche Nacht (2).

Beleg: `npx tsc --noEmit` rc=0; `npx vitest run tests/ui-frame-gold.test.ts
tests/ui-frame-polish.test.ts tests/palette-compliance.test.ts` → 33/33 grün.
Commit eee3b4b3.

## Ergebnis

- Audit-Punkt Z.197 geschlossen: ui_frame ist bewusst ohne durchgehende Tinte
  (Lichtkanten-Design #8080/#8081), art-director PASS 4/5.
- Keine Änderung an Spielcode/Texturen; Boot.ts, menu.ts, options-menu.ts, UI.ts
  unberührt. 5 Vorher-Shots + Textur-Analyse in `~/games/.evidence/m10-ui-frame-gold/`.

