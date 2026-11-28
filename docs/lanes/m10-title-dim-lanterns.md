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
