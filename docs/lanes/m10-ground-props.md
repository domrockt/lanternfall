# M10 Ground-Props-Batching (Lane m10-ground-props-batch)

## Befund (Vorher, belegt)

`scripts/m10-ground-props.mjs` (Vorher-Lauf, Commit ef6c1f8, `flock .lf-perf.lock`,
seed 7, Minute 25 via `skipTo(1490)`, timeScale 1, 10-s-Fenster, Gegner-Top-up auf 300):

| Kondition | FPS Median | FPS Min | Median Frame | p95 | Draw-Call-Kandidaten/Frame | Blend-Wechsel |
|---|---|---|---|---|---|---|
| 640x360 @dpr1 | 49,3 | 40,0 | 16,7 ms | 33,4 ms | 925 | 5 |
| 780x360 @dpr3 | 39,0 | 36,8 | 33,3 ms | 33,4 ms | 1139 | 3 |

Konsistent mit `docs/lanes/m10-ground-cost.md` (48,8 FPS / 870 Kandidaten bei 640):
~800 sichtbare Props mit nur ~13 distinkten Texturen werden einzeln tiefensortiert
gezeichnet, 33 Ripples ebenso. Chunk-Composite wurde in m10-ground-cost gemessen und
verworfen (AE 0) — dieser Job setzt deshalb am Batch-/Layer-Struktur an.

## Ursache

1. Jedes Prop war ein eigenes Szenen-Image mit eigener Tiefe; gleiche Texturen
   lagen nicht benachbart im Depth-Sortierung -> pro Prop ein Draw-Call
   (~800 statt ~a dozen), dazu Blend-Wechsel zwischen Props.
2. `updatePropsDepth()` rief pro Frame `setDepth` auf ALLE Props + Schatten
   (~800 Aufrufe/Frame) -> Szenen-Display-List jede Frame neu sortiert.

## Fix (Commit 8bb0f93)

`src/gfx/GroundRenderer.ts` + neuer, phaserfreier Helfer `src/gfx/propLayers.ts`:

- **Feste Batch-Layer:** je Prop-Textur ein Container-Paar (hinter/vor dem
  Spieler, Tiefen 11,6/12,4 wie vorher), plus eigene Layer fuer Bodenschatten
  (11,15), Laternen-Glows (11,66/12,46, ADD) und Ripples (-92). Reine Tiefen/
  Batch-Helfer in `propLayers.ts` (PROP_LAYER_DEPTHS, propSideFor,
  visibleBatchCount, batchLayerCount, PROP_KEYS).
- **Seitenwechsel statt pro-Frame-Depth:** `updatePropsDepth()` aendert nur noch
  die Container-Mitgliedschaft, wenn ein Prop die Spieler-Hoehe kreuzt
  (`batchSide` im Data-Cache); kein `setDepth` mehr pro Frame -> keine
  Display-List-Sortierung durch Ground mehr.
- **Ausblendung kleiner Props ab >=250 Gegnern** (DENSE_HIDE_PROPS) unveraendert
  uenommen; leere Layer kosten nichts (`visibleBatchCount`).
- Keine Aenderungen an `src/scenes/Run.ts`, `src/gfx/textures.ts`, `src/logic/lod.ts`,
  `src/logic/scale.ts`, `src/config.ts` (fremde Claims).

Test: `tests/ground-props-batch.test.ts` fixiert Layer-Zahl (13 Texturen -> 30 Layer),
Seitenwahl-Grenzfall, Layer-Tiefen-Reihenfolge und Batch-Zaehlung. `npm test` 438/438
gruen, `npm run build` gruen, `npx tsc --noEmit` gruen.

## Ergebnis (Nachher, Median aus 3 Laeufen)

`shots/m10-ground-props-after-{640,780}-{1..3}.json` + `-summary.json` + PNGs
(Commit siehe unten; gleiche Bedingungen wie Vorher):

| Kondition | FPS Median | FPS Min | Median Frame | Draw-Call-Kandidaten/Frame | Blend-Wechsel | Props sichtbar | Prop-Layer/Batches |
|---|---|---|---|---|---|---|---|
| 640x360 @dpr1 | 48,5 (vorher 49,3) | 41,9 | 16,7 ms | **75** (vorher 925) | 5 | ~806 | 30 Layer / 26 Prop-Batches |
| 780x360 @dpr3 | 40,3 (vorher 39,0) | 37,4 | 16,8 ms | **85** (vorher 1139) | 5 | ~1102 | 30 Layer / 26 Prop-Batches |

Render-Pfad-Attribution (m10-ground-cost.mjs, 640, 3 Laeufe,
`shots/m10-ground-props-attribution-after.json`): on 46,3 FPS / hidden 56,1 /
frozen 59,6 -> **Render-Pfad 4,09 ms/Frame (vorher 5,11, −1,02 ms)**,
Update-Pfad 1,21 ms (direkt 0,30), Ground gesamt 5,10 ms.

## Abnahme-Bilanz (ehrlich)

| Kriterium | Ziel | Ist | |
|---|---|---|---|
| Draw-Call-Kandidaten/Frame | < 300 | 75 (640) / 85 (780), −92 % / −93 % | **PASS** |
| `npm test` | 0 fail | 438/438, 0 JS-Fehler in allen Messlaeufen | **PASS** |
| 640/M25 FPS-Median | >= 58 oder >= 2 ms Render-Gewinn | 48,5 (±0,8 gegen Vorher); Render-Gewinn 1,02 ms | **FAIL** |
| 780@dpr3 FPS-Median | >= 46,5 | 40,3 (+1,3) | **FAIL** |

**Interpretation:** Der Renderpfad ist auf diesem Host nicht draw-call-limitiert,
sondern submit-limitiert: ~900 sichtbare Props werden weiterhin als ~900 einzelne
Quads durch den Batcher gereicht (CPU-Kosten pro Quad unveraendert); die
Draw-Call-Zahl selbst ist mit Batching auf ~50 gesunken. FPS ist zusaetzlich
durch vsync-Quantisierung unscharf (Median 16,7 ms / p95 33,4 ms in ALLEN
Bedingungen inkl. ground-hidden) — ein 1-ms-Gewinn verschiebt keinen
vsync-Schwellwert und zeigt sich darum nicht im FPS-Median. Das deckt sich mit
m10-ground-cost (Chunk-Composite, AE 0): auch das Wegfallen ALLER Prop-Objekte
brachte dort keinen FPS-Gewinn.

**Entscheidung:** Behalten, nicht verworfen — das Draw-Call-Kriterium (< 300) ist
explizites Abnahmekriterium und wird mit 75/85 klar erfuellt, ohne FPS-/Render-
Regression; Layer-Struktur ist durch Tests fixiert. Die FPS-Ziele bleiben offen
und sind vermutlich nur mit weniger Quads zu erreichen (weniger/gebakene Props,
aggressiveres Dichte-LOD) — das ist eine eigene Karte fuer den Lead; die
Composite-Alternative ist mit AE 0 bereits belegt widerlegt.

## Verworfene Alternativen

- **Chunk-Composite** (Props in die Chunk-Canvas malen): in m10-ground-cost
  gemessen, kein FPS-Gewinn (AE 0) -> verworfen, nicht wiederholt.
- **Prop-Depth-Upgrade ohne Container** (nur sortierte Einfuege-Reihenfolge):
  haette die pro-Frame-Sortierung nicht beseitigt; Container loesen beide Kosten
  (Draw-Calls + Sortierung) und bleiben updatePropsDepth-aehnlich in der Semantik.
