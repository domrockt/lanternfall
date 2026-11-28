# Lane m10-font-ui-frame-polish — Bitmap-Font + UI-Rahmen auf 5/5-Niveau

Rest der Karten #320/#321 (m9-art-fx-ui): Font und UI-Rahmen polieren. Ziel: A10
„Menü-/HUD-Qualität": Font/Rahmen >= 4/5 im strengen art-director-Urteil (4x-Crop).
Scope: nur `src/gfx/font.ts`, `src/gfx/glyphs.ts`, `src/gfx/gen-ui.ts` (regeneriert),
`scripts/art/gen_ui.py`, Tests/Messskript/Belege. `gen-icons.ts`/`icons.ts` und
`src/scenes/*.ts` sind fremd (anderer Job / tabu).

## Karte 1 — Befund sichern (Vorher)

Messskript: `scripts/m10-uiframe-polish.mjs` (läuft ohne flock; statische Analyse
aus `src/gfx/glyphs.ts` + `src/gfx/gen-ui.ts` via Vite-SSR, Live-Scan + Crops im
echten Spiel, Profil 640x360@2, 0 JS-Fehler).

Vorher-Belege (alle im Karten-Commit):
- `shots/m10-uiframe-before.json` — Rohdaten (Glyphen, Rahmen, Screens)
- `shots/m10-uiframe-before-title.png` / `-options.png` / `-results.png` — Full-Shots
- `shots/m10-uiframe-before-glyph-specimen-4x.png` — Glyph-Probe (A–Z, 0–9,
  Umlaute, ß, Satzzeichen), 4x nearest
- `shots/m10-uiframe-before-title-button-4x.png` — Menüknopf (9-Slice) 4x
- `shots/m10-uiframe-before-options-panel-3x.png`, `-results-panel-2x.png`
  (Rahmen-Panel in situ; Aufnahmecrops siehe F7-Hinweis unten)

## Befundliste (nur belegte Mängel)

| # | Severity | Befund | Beleg | Hebel / Karte |
|---|---|---|---|---|
| F1 | **Hoch** | Lichtkante oben/links (Farbe 7) gegen Panel-Innenfläche (2): WCAG **2.72 : 1** < 3:1 — die Kante ist der träger der Lesbarkeit und liegt unter der Grenze | `m10-uiframe-before.json` → `frame.contrast.topLight_vs_interior/leftLight_vs_interior` | gen_ui.py: äußere Lichtband-Stufung 7/6 → 8/7 (#3) |
| F2 | **Mittel** | Innenfase lichtlogisch asymmetrisch: obere Innenfase hat Lichtzeile (6, row2), linke hat keine (col2 = 4); rechte Innenfase 2 vs untere 4 trotz gleicher Schattenrolle | gen-ui.ts Grid row2 (`764466…`) vs col2; python rects in `gen_ui.py` Z. 92–97 | gen_ui.py: linke Innenfase Lichtzeile, rechte/untere Fase angleichen (#3) |
| F3 | **Mittel** | Störpixel Farbe 2 bei (22,23) mitten in der unteren Ink-Kante — die rechte Kante ist durchgehend 0, die untere nicht: Kante nicht sauber | `m10-uiframe-before.json` → `frame.edges.bottom` (runs 0×22, 2×1, 0×1) | gen_ui.py: Malreihenfolge — `put(22,23,0)` nach dem rechten Band (#3) |
| F4 | **Hoch** | Glyph `ß` unterscheidet sich von `B` in genau **1 px** (row0 `01110` vs `11110`) — in 5x7 praktisch verwechselbar, belegt im Raster | Glyph-Probe 4x + Zählung aus `glyphs.ts` | glyphs.ts: eigene ß-Silhouette (Doppel-s-Bogen), 5x7, 8-conn zusammenhängend (#2) |
| F5 | **Info (OK)** | `!`/`?` haben isolierte Punkte (Satzzeichen-Standard, kein Mangel); geschlossene 1-px-Löcher nur in a/ä (regulärer Buchstaben-Keller); Lochanteil 29.9 % der Glyphen, alle Löcher regulär | `m10-uiframe-before.json` → `glyphs.*` | kein Fix |
| F6 | **Positiv** | Fraktionale Skalierung/Position an Font-/Rahmen-Objekten: **0** in Titel, Options, Results (glyph_* / ui_frame) | `m10-uiframe-before.json` → `screens.*.fractionalFontFrame` | kein Fix |
| F7 | **Hinweis** | Dunkle Kanten unten/rechts (ink 0) gegen Innenfläche (2): **1.12 : 1** — mit der 32er-Palette nicht auf 3:1 hebbar (kein Index dunkler als ink; ein hellerer Panelton ändert das Verhältnis nicht > 3). Träger der Lesbarkeit ist die helle Kante (F1) + Innenfase. Dokumentiert als ohne neuen Palettenindex nicht heilbar | `frame.contrast.*Dark_vs_interior` | dokumentiert, kein Fix |
| F8 | **Außer Scope** | Bekannt aus m10-menu-art-crisp: `title_background` 1.333x/1.625x fraktional (`src/scenes/Title.ts`) und `chest_closed` 2.4x (`src/scenes/UI.ts`) — keine Font-/Rahmen-Objekte, Dateien fremd | docs/lanes/m10-menu-art-crisp.md | Bedarfsmeldung, kein Fix in dieser Lane |

## Abnahme-Kriterien (Lane)
- `npx tsc --noEmit`, `npm run build`, `npm test` grün; menu-art-crisp-, xp-hud-crisp-,
  icon-contrast-Tests unangetastet grün.
- Nachher: Lichtkanten-Kontrast >= 3:1 (messbar im JSON), Kanten durchgehend,
  (22,23) sauber, ß deutlich von B verschieden; art-director 4x-Crop >= 4/5.
- Eine Karte = ein Commit (`M6-m10-font-ui-frame-polish:`), Belege im Karten-Commit.

## Karte 2 — Font-Fix (#8079, Commit 14d622a)
- `src/gfx/glyphs.ts`: ß-Glyphe neu — alt: 1 px Differenz zu B (row0 `01110` vs
  `11110`); neu: Doppel-s-Bogen mit offener linker Spalte und Schluss-Strich
  (`01100/10010/10010/01100/10010/10010/01101`).
- Validierung: 1 zusammenhängende 8-Fach-Komponente (15 px, ortho), 2 reguläre
  2x2-Löcher, **15/35 px Differenz zu B**. `ß` ist im Spiel sichtbar (z. B.
  Waffenbeschreibung „Rückstoß“ im Level-up-Dialog).
- Tests: data/font-glyph-pack/menu-art-crisp 34/34 grün.

## Karte 3 — Rahmen-Fixes (#8080, Commit 2e12322)
- `scripts/art/gen_ui.py` + regeneriertes `src/gfx/gen-ui.ts` (AUTO, title_logo
  unverändert):
  - F1: äußere Lichtband-Stufung 7/6 → **8/7** (mist/fog).
  - F2: Innenfase lichtlogisch symmetrisch — 6er-Lichtlinie oben **und** links,
    rechte Fase 2 → 4 (= untere Fase).
  - F3: Ink-Linien werden nach den 2er-Bändern gemalt → untere Kante lückenlos,
    Störpixel (22,23) behoben.

## Karte 4 — Tests + Nachher (#8081)
- `tests/ui-frame-polish.test.ts` (10 Tests) mit **derselben** Analyse-Logik wie
  das Messskript (`analyzeGlyphs`/`analyzeFrame` aus
  `scripts/m10-uiframe-polish.mjs`, seiteneffektfrei importierbar, Typen in
  `scripts/m10-uiframe-polish.d.mts`): Kanten-Durchgängigkeit, Eckpixel,
  Lichtkanten-Kontrast >= 3:1, Innenfase-Symmetrie, 0 Off-Palette, keine
  Fehlstufen (Ausnahme `!`/`?`-Satzpunkte), ß >= 8 px von B verschieden.
- Nachher-Messung `shots/m10-uiframe-after.json` (+ Crops `-after-*.png`),
  Profil 640x360@2, Renderer iGPU, **0 JS-Fehler**:
  - Lichtkante oben/links gegen Innenfläche: **4.15 : 1** (vorher 2.72) → >= 3:1 PASS
  - Untere/rechte Ink-Kante: je **ein** zusammenhängendes Band über 24 px
    (vorher 22+1+1 mit Störpixel) → PASS
  - Fraktionale Skalierung/Position an Font-/Rahmen-Objekten: **0** (Titel,
    Options, Results) → unverändert sauber
  - Dunkle Kanten unten/rechts 1.12:1: dokumentiert als ohne neuen Palettenindex
    nicht hebbar (F7) — Lesbarkeitsträger ist die helle Kante + Innenfase.
- `npx tsc --noEmit` rc=0, `npm run build` grün, **1332/1332 Tests** grün
  (inkl. menu-art-crisp 19, xp-hud-crisp, icon-contrast unangetastet).

## art-director-Abnahme
- Urteil: folgt nach der strengen Prüfung (4x-Crops: Glyph-Probe, Titel-Knopf,
  Options-Panel, Results-Panel).
