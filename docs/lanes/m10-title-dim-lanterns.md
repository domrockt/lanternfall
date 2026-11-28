# Lane m10-title-dim-lanterns — Moor-Laternen als Lichtquellen vom Nacht-Dim ausnehmen

Anlass (Argus 08:10Z, Befund aus m10-title-flame-glow-r2 K4, art-director PASS 4/5
non-blocking): Die kleinen Moor-Laternen liegen hinter dem Nacht-Dim/Vignette und sind
praktisch unsichtbar. Auftrag: Laternen-FLAMMEN (Lichtquellen) vom Dim ausnehmen oder
lokal abmildern — Landschaft darf dunkel bleiben. NUR Title.ts-Rendering, keine
Layout-/Text-Änderungen, gen_title.py/gen-title.ts unangetastet.

Belege: `~/games/.evidence/m10-title-dim-lanterns/` (Mess-Skript:
`~/tmp/m10-title-dim-lanterns/probe.mjs`, ausserhalb des Repos — Messtool, kein
Deliverable; Baseline `before-dim.json` VOR dem Fix committet/gemessen).

## Karte K1 — Vorher-Shots + Dim-Pfad-Diagnose (2026-11-28)

Aufnahme: `probe.mjs before` (1920x1080 + 640x360, je Full-Shot + Zoom-4x-Crops
Laterne 2/4, Messung aller 4 Glas-Patches). Renderer in beiden JSON-Belegen:
`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` (kein SwiftShader),
0 JS-Fehler in beiden Views.

**Vorher-Messung (`before-dim.json`, Glas-Patch 8x6 Texel je TITLE_FLAME_SPOT):**
- Laterne 1 (spot 19,194): hellster Texel Palette 6, RGB (80,81,81) — neutralgrau
  (abgedunkeltes lanternWhite), Anteil Stufe 13 = 0, Anteil 13/22 = 0.
- Laterne 2 (211,198): hellster Texel Palette 8, RGB (105,122,131) — kein warmes
  Texel im Patch (voll behindert, siehe unten), a13 = 0.
- Laterne 3 (297,194): hellster Texel Palette 10, RGB (180,192,190), a13 = 0.
- Laterne 4 (389,197): hellster Texel Palette 8, RGB (95,110,119), a13 = 0.
- **Stufe 13 (lanternWhite) ist im On-Screen-Glas KEINER kleinen Laterne erreichbar** —
  Dim-Befund bestaetigt (weniger dunkel als die zitierten (9,13,17) aus der
  flame-glow-r2-Evidenz, aber farblos/unsichtbar als Lichtquelle).

**Dim-Pfad-Diagnose (Object-Bounds live aus der Szene, diagnose-Skript):**
Render-Reihenfolge logisch 640x360 (in beiden Views identisch, M8):
1. `title_flame_f0/f1/f2`-Overlays, depth 2, an (bgL.x+spot.x, bgL.y+spot.y),
   bgL = titleBgLayout(640,360) = scale 1, x 80, y 45.
2. **Nacht-Dim-Lasur**: Rectangle (0, 177, 640, 138), nightDeep (Palette 1),
   Alpha 0,62, depth 3 — liegt ueber ALLEN 4 Flammen (Glas y 244..254).
3. Menue-Buttons (depth 6, je 22 hoch, Mitte y 259): START x 168-264,
   OPTIONEN x 266-374, CREDITS x 380-472 (y 248-270).
4. **Vignette** (depth 50, Vollbild, Band-Alpha 0 -> 0,72; an den Laternen-Radien
   0,02..0,23): liegt ueber allem ausser Text/Hinweisen.

Komposit ueber Glas-Texel 13 (255,248,230): 0,38-Anteil nach Lasur = (103,103,101),
nach Vignette (Laterne 1, Band 0,23) = (80,81,81) -> gemessen bestaetigt. Stufe 13
nur erreichbar, wenn BEIDE Dim-Layer das Glas ganz freigeben (Alpha-Blends liefern
keine exakte Palettenstufe).

**Zusatzbefund (wichtig, begrenzt den Messwert):** Laterne 2 (Glas x 291-299,
y 248-254) liegt VOLL hinter dem OPTIONEN-Button (x 266-374, y 248-270); Laterne 3
(x 377-385) teilweise und Laterne 4 (x 469-477) am linken Rand hinter CREDITS
(x 380-472). Das ist eine BESTEHende Layout-Ueberlappung Menue/Moor-Laternen —
 laut Briefing ausdrücklich NICHT zu fixen (keine Layout-/Text-Änderungen).
Der Dim-Fix macht die sichtbaren Glasflaechen aller Laternen hell; Laterne 2 bleibt
vom Button verdeckt (wie heute), nur ihre Funken (f1/f2, Reihen 1-2, y 244-245)
ragen knapp ueber die Button-Kante.

**Fix-Entscheidung (vor K2 festgehalten):** Dim-Ausnahme ueber **Fenster (Löcher)
in beiden Dim-Layern**, NICHT ueber Depth > Vignette: Flammen auf depth 51 waeren
auch ueber den Menue-Buttons (depth 6) und wuerden Glas-Kaestchen auf OPTIONEN/
CREDITS zeichnen — visuell falsch. Loesch-Fenster exakt ueber den Glas-Reihen
(Patch +5, 8x6 Texel) zeigen nur komplett opake Flammen-Texel (keine Hintergrund-
kaestchen-Artefakte); Funken-Reihen (0-4) bleiben hinter dem Dim ( BG kaeme sonst
undunkel durch die transparenten Reihen = helles Kasten-Artefakt).

## Karte K2 — Dim-Ausnahmepfad (Commit 30770547, 2026-11-28)

NUR `src/scenes/Title.ts` (gen_title.py/gen-title.ts unangetastet, Asset-Glut 0,125
-> 0,375 aus title-flame-glow-r2 bereits asset-seitig):
1. **`lanternGlassHoles(bgL)`** (rein, exportiert): je TITLE_FLAME_SPOT ein
   8x6-Texel-Fenster ab Patch-Reihe 5 (`TITLE_GLASS_HOLE`), Position bgL-abhaengig.
2. **Lasur**: das Rectangle (nightDeep, alpha 0,62, depth 3) ist jetzt eine Canvas-
   Textur `title_dim_lasur_<W>x<H>` mit `clearRect`-Fenstern an den Glas-Positionen;
   ausserhalb der Fenster identisches Dim-Compositing wie main (globalAlpha 0,62).
3. **Vignette**: lokale Kopie `title_vignette_dim_<W>x<H>` (drawImage skaliert wie
   `setDisplaySize`, Boot.ts unangetastet) mit denselben Fenstern, sonst gleiche
   Zeichnung (cx, H/2, scrollFactor 0, depth 50).
4. `TITLE_FLAME_DEPTH = 2` exportiert und genutzt — bewusst unter Buttons/Vignette:
   die Ausnahme läuft ueber die Fenster, nicht ueber Depth (Flammen duerfen nicht
   ueber dem Menue landen). `TITLE_DIM_ALPHA = 0.62` fixiert die Dim-Staerke.

## Karte K3 — Regressionstest (Commit 3c5850a0, 2026-11-28)

`tests/title-dim-lanterns.test.ts`, 9 Tests (Phaser neutral gemockt, Muster
title-bg-crisp): Fenster-Ausrichtung je Viewport (640x360, 780x360, 480x270),
Fenster = Patch-Reihe 5 + Hoehe 6 (keine Reihen darueber/darunter), Fenster in der
Lasur, **Opak-Guard** (Reihen 5-10 in f0/f1/f2 lueckenlos opak — sonst kaeme
Hintergrund undunkel durchs Fenster), Dim-Konstanten (0,62; depth 2 < 6).

`npm test`: 165 Dateien / 1762 Tests gruen; `npx tsc --noEmit` gruen;
`npm run build` gruen; title-flame-glow (14) + palette-compliance (16) = 30/30.

## Karte K4 — Nachher-Messung + Abnahme (2026-11-28)

Belege `~/games/.evidence/m10-title-dim-lanterns/`: `after-dim.json`,
`after-<view>-full.png`, `after-<view>-zoom4x-laterne2/4.png` (je Vorher-Pendant).
Renderer in ALLEN JSON-Belegen: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S),
OpenGL ES 3.2)` (gültig, kein SwiftShader), 0 JS-Fehler.

**Messwert (`after-dim.json`, Glas-Patch 8x6 je Spot):**

| Laterne | 1920x1080 hellster Texel | 640x360 hellster Texel | vorher |
|---|---|---|---|
| 1 | **13** (255,248,230) | **13** (255,248,230) | 6 (80,81,81) |
| 2 | 8 — Glas hinter OPTIONEN (Bestand) | 7 — dito | 8 (105,122,131) |
| 3 | **13** (255,248,230) | **13** (255,248,230) | 10 (180,192,190) |
| 4 | **13** (255,248,230) | **13** (255,248,230) | 8 (95,110,119) |

Stufe 13 (lanternWhite) ist nach dem Fix im On-Screen-Glas der Laternen 1, 3 und 4
in BEIDEN Views erreichbar — vorher 0/48 Texel, nachher 6-8/48 Texel je Laterne
(a13 0,125-0,167, Glut 13+22 gesamt 0,21-0,375). Fix ausschliesslich ueber den
Dim-Ausnahmepfad; Asset-Werte unveraendert (title-flame-glow-Tests 14/14,
palette-compliance 16/16).

**Laterne 2 (offener Punkt, dokumentiert nicht gefixt):** Das komplette Glas
(x 291-299, y 248-254) liegt hinter dem OPTIONEN-Button (x 266-374, y 248-270) —
bestehende Layout-Ueberlappung Menue/Moor, laut Briefing out of scope (keine
Layout-/Text-Änderungen). Der Dim-Fix greift auch dort (Fenster vorhanden, behindert
vom Button wie die gesamte Landschaftsgrafik); sichtbar sind nur ihre Funken.
art-director-Anregung als Bedarf fuer eine spaetere Layout-Karte: Laterne 2 ist
"verschwende­te Deko" hinter dem Menue-Button.

## Kontrolleure (2026-11-28)

- **art-director: PASS 5/5** (einmalig, kommerziell auslieferbar im Fix-Scope).
  Starkster Beleg: quantitativer Before/After-Diff 640x360 = genau 129 Pixel mit
  Delta > 4, bbox (99,244)-(477,253) — ausschliesslich Glas-Patch-Baender; Menue,
  Text, Mondlaterne, Mond 0 geaenderte Pixel. Fensterrand faellt exakt mit der
  dunklen Sprite-Kontur zusammen (kein Kasten-Artefakt). Muss-neu: keine.
- **reviewer: PASS** (nicht-blockierende Findings, alle umgesetzt in
  363b52c4/edf4fde4): skalenbewusste Fensterformel (bgL.scale; Scale>=2 aktuell
  unerreichbar, logische Hoehe fest 360), TITLE_DIM_TOP/HEIGHT statt Magic
  Numbers, imageSmoothingEnabled=false fuer pixelgenaue Bandkanten, Scale-2-
  Testfall ergaenzt (11 Tests). Hinweise bewusst nicht umgesetzt: Textur-Keys
  je Viewgroesse bleiben im Manager (wenige Keys, harmlos).
- **Board-Bereinigung:** #10115/#10116 nach review notiert; K2-Beschreibung
  (verworfener Depth-Ausnahmepfad) korrigiert. `shots/m10-passive-math-*.json`
  im Worktree sind Lane-fremd (nicht gemergt, nicht mitcommittet).

Finale Standes-Pruefung K4: `npm run build` gruen, `npm test` 165 Dateien /
1764 Tests gruen, `npx tsc --noEmit` gruen.

