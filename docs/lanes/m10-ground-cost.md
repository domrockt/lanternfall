# m10-ground-cost — Terrain-Rendering bei 640×360, Minute 25

Lane `m10-ground-cost` (Branch), zweiter disjunkter Angriff auf den roten
ACCEPTANCE-Punkt „Endgame-FPS" (46,3/46,6/49,3 FPS gegen Ziel 55).

## Karte 1 — Messung (Commit `c8b1f45`)

Befehl:

```
flock /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs
```

Bedingungen bei `?debug=1&seed=7`, 640×360, dpr 1, Minute 25
(`timeScale 30`, `skipTo(1490)`, dann `timeScale 1`), ~300 Gegner,
3 Läufe × 4 rotierte Messfenster à 3 s:

| Modus | FPS min | FPS Median | meanFrameMs |
|---|---|---|---|
| on (GroundRenderer normal) | 44,7 | 48,8 | 21,86 |
| hidden (alle Ground-Bilder `visible=false`) | 58,6 | 60,2 | 16,95 |
| frozen (zusätzlich `update()` aus) | 59,4 | 60,2 | 16,67 |

Attribution (Median der gepaarten Zyklus-Deltas):

- **Render-/Draw-Pfad (on − hidden): 5,11 ms/Frame**
- Update-Pfad (hidden − frozen): 0,00 ms/Frame
- direkt gemessenes `ground.update()`: 0,22 ms/Frame
- Ground gesamt: **5,11 ms/Frame** → `hot=true` (≥ 2 ms/Frame)

Beleg: `shots/m10-ground-cost-baseline.json`, `shots/m10-ground-cost-before.png`.

## Karte 2 — Instrumentierung (Commit `de41a33`)

Befehl:

```
flock /home/ai/games/.lf-perf.lock node scripts/m10-ground-cost.mjs --instrument
```

Zähler über 5 s (~80 Frames):

- sichtbare Chunks: **20,03/Frame**
- sichtbare Props: **789,83/Frame**, davon nur **1** distinkte Prop-Textur
- sichtbare Ripples: **33,4/Frame**
- sichtbare Ambient-Bilder (Glühwürmchen + Nebel): **27/Frame**
- Draw-Call-Kandidaten gesamt: **870/Frame**
- Chunk-Rebuilds/Frame: **0**, Worker-Nachrichten/Frame: **0,08**
  (Terrain wird also praktisch nie pro Frame neu gebaut)

Klassen-Attribution (Bilder einer Klasse ausblenden):

- Props: −2,11 ms/Frame
- Chunks: −6,89 ms/Frame
- Ambient: −8,74 ms/Frame
- Ripples: −0,32 ms/Frame (Rauschen)

Beleg: `shots/m10-ground-cost-drawcalls.json`.

## Karte 3 — Fix-Versuch: gecachte Chunk-Textur (verworfen, Commit `8562ea9`)

Hypothese: 20 Chunk-Bilder mit je eigener Textur erzeugen 20 Texture-Binds/
Draw-Calls; ein einziges, in eine Canvas-Textur komponiertes Terrain-Bild
spart diese Kosten, ohne das Bild zu verändern. Umsetzung: alle sichtbaren
Chunks einmal in `m10_ground_composite` zeichnen, Redraw nur bei
Nahtwechsel/Dirty-Chunk (`needsChunkRedraw`), Einzelbilder unsichtbar.
Pixel-Vergleich Composite vs. Einzelchunks: **AE = 0**, beide PNGs
byte-identisch (`shots/m10-ground-cost-pixel-culling.png` /
`-pixel-noculling.png`).

Nachmessung mit identischem Setup (3 Läufe, `flock`):

| | Baseline | Composite (nach) |
|---|---|---|
| FPS min | 44,7 | **35,4** |
| FPS Median | 48,8 | **46,7** |
| Render ms/Frame | 5,11 | **6,03** |

**Verdikt: nicht wirksam.** Der Terrain-Pfad ist fill-rate-/fragmentgebunden,
nicht draw-call-gebunden: Ein einzelnes 1280×1024-Composite-Quad kostet auf
dem Headless-Renderer genauso viel wie 20 geclippte 256-px-Quads. Der
Draw-Call-Aufwand war nicht der Hebel; die +4-FPS-Abnahme wird verfehlt.
Code wurde zurückgerollt (Branch-Stand = Instrumentierungs-Stand), Belege
bleiben als negatives Ergebnis erhalten: `shots/m10-ground-cost-after.json`,
`shots/m10-ground-cost-after.png`.

## Karte 4 — Befund / Empfehlung (dieser Commit)

- Ground kostet **5,11 ms/Frame** (Render), Update nur 0,22 ms → Chunk-Cache
  hilft nicht; die 870 Draw-Call-Kandidaten sind überwiegend Props (790) mit
  **einer** Textur, also bereits batchbar.
- Größter Einzelposten laut Klassen-Attribution: **Ambient 8,74 ms/Frame**
  (27 additive Glühwürmchen-/Nebel-Quads), danach Chunks 6,89 ms.
- Empfehlung für den Merge-/Endgame-FPS-Job: Ambient-Overdraw reduzieren
  (Nebel-Banks zusammenfassen oder Alpha/Fläche senken) und Prop-Dichte im
  Sichtfeld prüfen — **nicht** Chunk-Draw-Calls. Ob das ohne sichtbare
  Bildänderung geht, muss separat mit Screenshot-Diff abgenommen werden.

## Offene Punkte

- Fill-Rate-Kosten sind auf dem Headless-Renderer (SwiftShader) deutlich
  höher als auf echter GPU; die Attribution ist relativ belastbar, die
  absoluten FPS-Zahlen sind Host-/Renderer-abhängig.
- Kein Fix in dieser Lane → kein `needsChunkRedraw`-Test im Bestand
  (der Versuch und seine Verwerfung sind hier dokumentiert).
