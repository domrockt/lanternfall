// M10-tiles-float-snap: Guard für den Float-Snap der Terrain-Klassifikation.
//
// terrainSampleAt()/terrainKindAt() snappen Float-Koordinaten auf das Tile,
// das den Punkt enthält (Math.floor = Tile-Mitte-Snap). Folge:
//  - Eine Subpixel-Query (x+0.5, y+0.5, …) liefert dieselbe Klassifikation wie
//    der gemalte ganzzahlige Pixel — der Kanten-Scan findet keine fraktionalen
//    Mischzellen mehr (vorher 0,539 %, siehe ~/games/.evidence/m10-tiles-float-snap/).
//  - Ganzzahlige Aufrufe bleiben bitgleich (Math.floor ist dort die Identität).
import { describe, expect, it } from "vitest";
import { terrainKindAt, terrainSampleAt, type TileKind } from "../src/gfx/tiles";

const WORLD_SIZE = 1920;
const SEEDS = [7, 13, 42];
// Stichproben: Region um (960, 960) wie im Kanten-Scan, enges Raster, damit
// garantiert Biom-Grenzen (Gras/Pfad/Schlamm/Wasser) geschnitten werden.
const OX = 960;
const OY = 960;
const OFFS: Array<[number, number]> = [
  [0.5, 0.5],
  [0.9, 0.1],
  [0.1, 0.9],
  [0.999, 0.001],
];

describe("tiles float snap", () => {
  it("Float-Query entspricht exakt der gesnappten Tile-Mitte (über Biom-Grenzen)", () => {
    let samples = 0;
    let kindKinds = new Set<TileKind>();
    for (const seed of SEEDS) {
      for (let y = OY; y < OY + 160; y++) {
        for (let x = OX; x < OX + 160; x++) {
          const base = terrainSampleAt(x, y, seed, WORLD_SIZE);
          kindKinds.add(base.kind);
          for (const [fx, fy] of OFFS) {
            samples++;
            const snapped = terrainSampleAt(Math.floor(x + fx), Math.floor(y + fy), seed, WORLD_SIZE);
            const floated = terrainSampleAt(x + fx, y + fy, seed, WORLD_SIZE);
            // Identität des Snap: gleiche Klassifikation, bitgleiche Felder.
            expect(floated.kind).toBe(snapped.kind);
            expect(floated.shade).toBe(snapped.shade);
            expect(floated.light).toBe(snapped.light);
            expect(floated.depth).toBe(snapped.depth);
            expect(floated.alt).toBe(snapped.alt);
          }
        }
      }
    }
    // Stichprobe muss mehrfach Biom-Grenzen berühren: alle 4 Arten gesehen.
    expect(kindKinds.size).toBe(4);
    expect(samples).toBeGreaterThanOrEqual(3 * 160 * 160 * OFFS.length);
  });

  it("terrainKindAt erbt den Snap (Float-Query == ganzzahlige Tile)", () => {
    for (const seed of SEEDS) {
      for (let y = OY; y < OY + 80; y++) {
        for (let x = OX; x < OX + 80; x++) {
          const base = terrainKindAt(x, y, seed, WORLD_SIZE);
          expect(terrainKindAt(x + 0.5, y + 0.5, seed, WORLD_SIZE)).toBe(base);
          expect(terrainKindAt(x + 0.9, y + 0.1, seed, WORLD_SIZE)).toBe(base);
          expect(terrainKindAt(x - 0.25, y - 0.75, seed, WORLD_SIZE)).toBe(
            terrainKindAt(Math.floor(x - 0.25), Math.floor(y - 0.75), seed, WORLD_SIZE),
          );
        }
      }
    }
  });

  it("Ganzzahlige Aufrufe sind bitgleich zum Verhalten ohne Snap (Referenzstichprobe)", () => {
    // Referenzstichprobe (gemessen am Integer-Pfad, 2026-11-28, Snappy-Ausgabe
    // aus scripts/m10-tiles-snap-ref.mjs): ein Rückfall (z. B. Snap auf
    // Math.round oder Entfernen des Snaps mit Rundungs-Änderung) bricht diese.
    const points: Array<[number, number]> = [
      [960, 960], [0, 0], [-1, -1], [-5, 3], [1919, 1919], [100, 200], [500, 1500],
    ];
    const kinds: TileKind[][] = points.map(([x, y]) => SEEDS.map((s) => terrainKindAt(x, y, s, WORLD_SIZE)));
    const expected: TileKind[][] = [
      ["grass", "grass", "path"],
      ["grass", "grass", "mud"],
      ["grass", "grass", "grass"],
      ["grass", "grass", "grass"],
      ["grass", "grass", "grass"],
      ["grass", "grass", "grass"],
      ["grass", "grass", "grass"],
    ];
    expect(kinds).toEqual(expected);
    // Full-Sample an denselben Punkten bleibt stabil (Felder bitgleich).
    const s0 = terrainSampleAt(960, 960, 42, WORLD_SIZE);
    expect(s0).toEqual({ kind: "path", shade: 1, light: false, depth: 0.305974436004986 });
    expect(terrainSampleAt(960, 960, 42, WORLD_SIZE)).toEqual(s0);
  });
});
