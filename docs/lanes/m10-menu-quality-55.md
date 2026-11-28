# Lane m10-menu-quality-55 — Menü-/HUD-Qualität 4/5 → 5/5 (A10-Restpunkt)

Ziel: systematischer Mixel-/Kontrast-/Ausrichtungs-Scan aller 5 Menü-Screens
(Title, Options, CharSelect, Pause, Credits) auf dem Stand nach
menu-art-crisp / menubg-crisp-rest / title-flame-glow-r2 / title-dim-lanterns —
dann nur die belegten Mängel fixen. Maßstab Dom: „kommerziell auslieferbar“.

Scan-Skript: `scripts/m10-menu-quality.mjs` (Karte #10291, Commit 67146c3b).
Je Screen: fraktionale Skalen (`scaleCalls`), Subpixel-Ausrichtung, Text-Kontrast
>= 4.5:1 WCAG-artig (Textfarbe aus Glyph-Textur-Key vs. Backdrop per
`snapshotArea` mit verstecktem Text; Median UND Worst-Case-Pixel), Überlappungs-Rects
(Text/Text, Text/Icon, Icon/Icon), Screenshot, JS-Fehlerzähler, WebGL-Renderer-String.
Profile: `640x360@2` (Viewport 1280x720) und `960x540@1`. Renderer in beiden Läufen:
`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — kein SwiftShader.

## Before-Messung (Karte #10291)

Rohdaten + Shots: `~/games/.evidence/m10-menu-quality-55/m10-menu-quality-before-scan.json`
und `m10-menu-quality-before-<profil>-<screen>.png` (je 10 Screenshots).
0 JS-Fehler in allen Probe-Läufen.

| Screen | scaleCalls | subpixel | Kontrast-Fails (<4.5) | Overlaps |
|---|---|---|---|---|
| title | 0 | 0 | 4 | 0 |
| options | 0 | 0 | 5 | 1 |
| credits | 0 | 0 | 12 | 0 |
| charselect | 0 | 0 | 5 | 0 |
| pause (run+ui) | 46 (run) | 61 (run) | 14 (ui) | 10 (ui) |

Beide Profile identisch — die Befunde sind view-unabhängig, keine Skalierungs-Mixel.

## Befund-Katalog mit Hebel-Datei und Entscheidung (Karte #10292)

**Wichtig:** Die Lane-Claims dieses Jobs sind `src/gfx/gen-title.ts` und `src/ui/menu.ts`
(plus Tests/Skript/Doku). `src/scenes/Title.ts` ist ausdrücklich tabu (Briefing).
Der Scan zeigt: **alle belegten Mängel liegen außerhalb dieser beiden Dateien** —
gen-title.ts-Texturen und menu.ts-Buttons sind sauber gemessen (0 scaleCalls,
0 subpixel, alle Button-Texte >= 4.5:1). Kein Mangel ist mit dem erlaubten Hebel
fixbar → SKIP je Befund, dokumentiert + beim Disponenten angefragt (unten).

### M1 — Title-Hintzeilen weit unter Kontrast-Ziel (Title.ts, fremd → SKIP)
- „WASD/PFEILE BEWEGEN — WAFFEN FEUERN AUTOMATISCH“, „MAUS ODER PFEILE + ENTER WÄHLEN“,
  „ESC = PAUSE — O = OPTIONEN“: Textfarbe Palettenindex 7 (`#4e5f6e`), Median-Kontrast
  **2.07** (640er) bzw. 3.0 (960er), Worst-Case 1.3. Im Before-Shot (2x nearest) deutlich
  abgedunkelt am unteren Bildrand sichtbar — das ist der stärkste „kommerziell“-Mangel.
- Hebel: Farbindex der drei Hint-Zeilen in `src/scenes/Title.ts` (z. B. 12 `boneLight`
  oder 13 `bone`) — **Title.ts tabu**. Nicht über gen-title.ts fixbar (Mangel ist die
  Textfarbe, nicht die Textur).
- Zusätzlich „30 MINUTEN BIS ZUR MORGENDAMMERUNG“ (Index 8): 4.34/4.15 — knapp unter 4.5.

### M2 — Options-Overlay: Footer-Hint 2.72 + 1 Überlappung (options-menu.ts + Title.ts, fremd → SKIP)
- „PFEILE ODER MAUS - ENTER/ESC“ (Index 7): Median 2.72.
- „ESC = PAUSE - O = OPTIONEN“ (Title.ts, y 342–349) überlappt mit
  „OPTIONEN GELTEN SOFORT UND BLEIBEN GESPEICHERT“ (OptionsMenu-Footer) um **465 px²** —
  beide Texte gleichzeitig sichtbar, Overlap klein aber belegt (JSON `options.overlaps`).
- Hebel: Footer-Position in `src/ui/options-menu.ts` bzw. Hint-Zeile in Title.ts — beide fremd.

### M3 — Credits: alle Zeilen-Labels Index 7, Median 2.73 (Credits.ts, fremd → SKIP)
- 10 Rollen-Zeilen („SPIELIDEE & TECH-LEAD“ … „QA & REVIEW“) plus Footer
  „ESC / ENTER = ZURÜCK“ (2.95) und Kopf/Fuß-Zeilen Index 8 (4.16, knapp unter Grenze).
- Hebel: `src/scenes/Credits.ts` Farbindices.

### M4 — CharSelect: Seed-/Start-Zeilen unter Grenze (CharSelect.ts, fremd → SKIP)
- „SEED 7 · PFEILE/MAUS = WAHL“ (Index 7): 2.77. „START: GLUTFUNKE“/„START: KETTENFLEGEL“
  (Index 7): 2.48. Bonus-Zeilen (Index 8): 3.78.
- Hebel: `src/scenes/CharSelect.ts`.

### M5 — Pause-Panel (UI.ts, fremd → SKIP)
- Build-Zeilen + Footer (Index 8) auf Panel: Median **4.15** — knapp unter 4.5
  (14 Texte: 12 Build-Zeilen, „PFEILE + ENTER ODER MAUS“ 2.72, „ESC = WEITER …“ 4.15).
- **10 Icon-Frame-Überlappungen** à 16 px² (4x4): benachbarte Evo-/Passive-Icons im
  Build-Panel überlappen mit ihren Frames (`icon_evo_wrath_pendulum` x `icon_evo_phoenix`
  usw.). Sichtbar im 2x-Shot nur als leichtes Aneinander-Rücken (Icon-Raster hat
  transparente Ränder); Hebel: Icon-Spacing in `src/scenes/UI.ts` bzw. Panel-Layout.

### M6 — Run-Welt hinter dem Pause-Panel (Run.ts, fremd → SKIP, kein Menü-Mangel)
- 46 scaleCalls: `m9_ambient_fog` 2.2x/2.75x, `shadow`-Sprites 0.85x–2.125x (Gegner-
  Schatten skalieren mit Gegnergröße — bewusst fraktional, in-game-Effekttextur), dazu
  61 Subpixel-Positionen `water_ripple_*` (bei `roundPixels` auf Ganzzahl gerendert).
- Das sind In-Game-Weltdarstellungen, keine Menü-/HUD-Qualität; Scope dieser Lane ist
  Menü-Qualität. Hebel `src/scenes/Run.ts` — fremd und themenfremd, nur dokumentiert.

### Was die Lane-Dateien selbst betrifft (positiv gemessen)
- `src/ui/menu.ts`: alle Menü-Knöpfe (START/OPTIONEN/CREDITS/FORTSETZEN/AUFGABE/VOLLBILD)
  >= 4.5:1, ganzzahlige Positionen, 0 Überlappungen.
- `src/gfx/gen-title.ts`: `title_background` 0 scaleCalls (title-dim-lanterns/menu-art-crisp
  Restpunkte abgearbeitet), 0 Subpixel, alle darauf liegenden Index-12/13-Texte >= 4.5:1.

## Disponenten-Anfragen (Karte #10292)

Eingetragen in `/home/ai/games/.dispatch/requests.md` (Datum, Job, Datei, Grund):
1. `src/scenes/Title.ts` + `src/ui/options-menu.ts` — Hint-/Footer-Textfarben auf
   Palette-Index >= 10 heben (M1/M2) + Options-Footer 4–6 px hoch (Overlap M2).
2. `src/scenes/Credits.ts` — Zeilen-Labels Index 7 → >= 10 (M3).
3. `src/scenes/CharSelect.ts` — Seed-/Start-Zeilen Index 7 → >= 10 (M4).
4. `src/scenes/UI.ts` — Pause-Build-Texte Index 8 → 12/13, Icon-Spacing +4 px (M5).

Alle vier sind 1–3-Zeilen-Farb-/Layout-Hebel, gut als Mini-Lanes (Präzedenz
m10-powerup-sfx-wire) oder als Freigabe nach Lane-Ende.

## Abnahme-Stand dieser Lane

- 0 fraktionale Skalierungen **in den Menü-/HUD-Scopes** der 5 Screens ✓
  (pause/run 46 sind In-Game-Weltobjekte, dokumentiert M6).
- 0 Überlappungen in title/credits/charselect ✓; options 1 + pause 10 belegt, Hebel
  fremd (M2/M5), SKIP dokumentiert.
- Text-Kontrast: alle Texte **in Lane-Dateien** >= 4.5:1 ✓; die 40 dokumentierten Fails
  liegen mit Hebel in fremden Szenen-Dateien (M1–M5), vor dem Fix im JSON belegt
  (vorher/nachher für die Lane-Scopes in K4).
- npm test grün, tsc rc=0, 0 JS-Fehler ✓.
