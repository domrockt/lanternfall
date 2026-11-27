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

`flock .lf-perf.lock node scripts/m10-ground-props.mjs --tag before --out m10-prop-density --runs 3 --png`
(seed 7, skipTo(1490), 10-s-Fenster, Gegner-Top-up auf 300; Skript um p90-Frametime
und propComposition erweitert — Skript-Aenderung aendert kein Spielverhalten):

| Kondition | FPS Median | Median Frame | p90 | Props sichtbar/Frame | Kandidaten/Frame |
|---|---|---|---|---|---|
| 640x360 @dpr1 | 60 / 60 / 60 | 16,7 ms | 16,7 ms | 747/713/730 | 72/69/70 |
| 780x360 @dpr3 | 60 / 60 / 60,1 | 16,7 ms | 16,7 ms | 1103/991/1044 | 84/66/82 |

**Abweichung zur Referenz-Lane:** docs/lanes/m10-ground-props.md meldet 48,5 FPS
(640) fuer denselben Messaufbau; dieser Lauf misst 60 FPS (vsync-Cap) mit
p90 = 16,7 ms in ALLEN Bedingungen. Der Host lief beim Vorher-Lauf offenbar
ohne parallele Lane-Last — der FPS-Kontrast ist Host-Last, nicht Code-Stand.
Folgerung: Auf diesem Host ist der FPS-Median bei vsync-Cap fuer Vorher/Nachher-
Vergleiche unbrauchbar; Frametime-Verteilungen (p90) und Quad-Zahlen sind die
belastbaren Belege. Quads bei 300 Gegnern (propComposition-Snapshot, 640):
906 gesamt = 448 Schatten + 458 Props (davon nur 10 prop_post als Landmarken),
Deko-Props waren im Messfenster bereits via DENSE_HIDE_PROPS versteckt (26/30
Prop-Batches).

## Hebel-Protokoll (max. 3)

### Hebel 1: Tier-System mit N1=250 / N2=300 (beibehaltene alte Schwelle + Verschärfung)

Implementierung (propLayers.ts `propTierFor`/`PROP_TIERS`, lod.ts
`propDensityMaxTier`, GroundRenderer `applyPropTier` + Tier-Erbau in `addProp`,
Schatten folgen ihrem Prop, Glows immer sichtbar). Messung
`--tag after --runs 3`:

| Kondition | FPS Median | p90 | Props sichtbar/Frame | Batches (Prop) |
|---|---|---|---|---|
| 640 | 60/60/60 | 16,7 ms | 663/581/701 | 26/26/26 |
| 780 | 60/60,1/60 | 16,7 ms | 945/988/856 | 26/12/12 |

**Nicht ausreichend:** N2=300 wird im Messfenster nie erreicht — die
Messbedingung „300 Gegner" (Top-up auf 300) hält real nur avg 175-236 lebende
Gegner (Waffen töten schneller als der Top-up nachlegt; auch die Referenz-Lane
maß nur avg 175-236). Das alte DENSE_HIDE_PROPS ab 250 griff aus demselben Grund
im Fenster kaum. Quad-Reduktion nur ~5-20 % → Kriterium 1 verfehlt.

### Hebel 2: Schwellwerte an reale Endgame-Dichte (N1=150 / N2=200)

Gleiche Mechanik, Schwellwerte gesenkt. Messung `--tag after2 --runs 3`:
(Ergebnis folgt)

## Abnahme-Bilanz

(folgt)
