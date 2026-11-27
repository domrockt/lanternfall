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

<!-- AFTER-TABLE -->

## Verworfene Alternativen

- **Chunk-Composite** (Props in die Chunk-Canvas malen): in m10-ground-cost
  gemessen, kein FPS-Gewinn (AE 0) -> verworfen, nicht wiederholt.
- **Prop-Depth-Upgrade ohne Container** (nur sortierte Einfuege-Reihenfolge):
  haette die pro-Frame-Sortierung nicht beseitigt; Container loesen beide Kosten
  (Draw-Calls + Sortierung) und bleiben updatePropsDepth-aehnlich in der Semantik.
