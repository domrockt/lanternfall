# M10 Prop-Dichte-LOD (Lane m10-prop-density-lod)

## Auftrag

FPS 640x360 Minute 25 (Median 48,5 nach m10-ground-props-batch) Richtung >= 55:
weniger gerenderte Prop-Quads bei hoher Gegnerdichte über gestuftes Dichte-LOD.
Renderpfad ist submit-limitiert (~900 sichtbare Prop-Quads), nicht draw-call-limitiert
(75/85 Kandidaten, < 300 PASS) — siehe docs/lanes/m10-ground-props.md.

## Ansatz

Gestufte Prop-Tiers (propLayers.ts) + Schwellwerte (lod.ts), umgesetzt in
GroundRenderer.updateAmbient (dort lief bereits DENSE_HIDE_PROPS ab 250):

- Tier 0 = Landmarken (`prop_post`, Laternen mit Glow) — bleiben immer sichtbar.
- Tier 1 = grosse Strukturen (Baeume, Ruinen, Saeulen, Graeber) — sichtbar bis N2.
- Tier 2 = kleine Deko (Stump, Boulder, Cross, Bones, Reeds, Lilypad, Mushroom) —
  ausgeblendet ab N1 (identisch zum alten DENSE_HIDE_PROPS-Verhalten).
- N1 = 250, N2 = 300 (Hebel 1). Schatten/Glows folgen ihrem Prop (kein schwebender Schatten).

## Messbasis (Vorher, belegt)

`flock .lf-perf.lock node scripts/m10-ground-props.mjs --tag before --out m10-prop-density --runs 3 --png`,
seed 7, skipTo(1490), 10-s-Fenster, Gegner-Top-up auf 300, Skript um p90-Frametime
und propComposition erweitert (Skript-Aenderung aendert kein Spielverhalten):

(Tabelle folgt nach Vorher-Lauf)

## Hebel-Protokoll (max. 3)

(folgt)

## Abnahme-Bilanz

(folgt)
