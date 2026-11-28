# Lane m10-tiles-float-snap (2026-11-28)

Bedarfsmeldung der Lane m10-terrain-edge-crisp (lane-done 07:25, Merge wartet):
`terrainKindAt()`/`terrainSampleAt()` sollen Float-Queries auf die Tile-Mitte
snappen; ihr Kanten-Scan fand 0,539 % fraktionale Mischzellen. Diese Lane
schließt die Lücke (die terrain-edge-crisp-Lane darf `src/gfx/tiles.ts` nicht
berühren).

## Fix
`src/gfx/tiles.ts` — `terrainSampleAt()` snapt am Eingang:
`wx = Math.floor(wx); wy = Math.floor(wy)` (Tile, das den Punkt enthält).
`terrainKindAt()` delegiert und erbt den Snap. `paintTerrain`,
`terrainMaskAt`, `areaHasWater`, Wasser-Pfad und Autotiling sind unangetastet;
ganzzahlige Aufrufe sind bitgleich (Math.floor = Identität).

## Messung (Kanten-Scan, Muster m10-terrain-edge-after.json)
Skript: `scripts/m10-tiles-snap.mjs` (esbuild-Bundle, 3 Seeds, Region 960/960
320×320, mischSamples 230400). Belege:
- Vorher: `~/games/.evidence/m10-tiles-float-snap/m10-tiles-snap-before.json`
  — misch 1241, **mischRate 0.00539** (exakt der Meldungswert 0,539 %)
- Nachher: `~/games/.evidence/m10-tiles-float-snap/m10-tiles-snap-after.json`
  — misch 0, **mischRate 0.00000** (0,0 %)
- loch/doppel/edgeErrorRate unverändert (loch 1, doppel 0) — der Snap ändert
  nur Float-Queries, nicht das Feld.

## Guard-Test
`tests/tiles-float-snap.test.ts` (3 Tests, grün):
1. Float-Query == gesnappte Tile-Mitte: 3 Seeds × 80×80 Stichproben über
   Biom-Grenzen × 4 Subpixel-Offsets, alle TerrainSample-Felder bitgleich,
   alle 4 Arten gesehen.
2. `terrainKindAt()` erbt den Snap (inkl. negativer Koordinaten).
3. Integer-Pfad bitgleich: fixierte Referenzstichprobe (7 Punkte × 3 Seeds)
   + volles Sample an (960,960); gemessen mit `scripts/m10-tiles-snap-ref.mjs`
   (temporär, nach dem Ausdruck gelöscht).

## Checks
- `npx tsc --noEmit` grün
- `npm run build` grün
- `npm test`: 157 Dateien / 1693 Tests grün
- Nachher-Scan: mischRate 0.00539 → 0.00000 (Abnahme erfüllt)

## Fremde Dateien
Keine angefasst: `src/gfx/GroundRenderer.ts`, `src/logic/autotile.ts`,
`src/logic/terrain.ts` blieben unverändert (fremde Claims, laufen unverändert).

## Offene Punkte
Keine. Hinweis für den Merge: GroundRenderer.ts:549 liest `terrainKindAt` mit
Welt-Floats (Kamera-Pfad) — er profitiert vom Snap automatisch, war aber kein
Änderungsziel dieser Lane.
