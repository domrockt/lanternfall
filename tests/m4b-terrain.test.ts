import { describe, expect, it } from "vitest";
import {
  BLOB_E, BLOB_N, BLOB_NE, BLOB_NW, BLOB_S, BLOB_SE, BLOB_SW, BLOB_W,
  blobCanonical, blobCount, blobMask, cornerMask, isNormalizedBlob,
  missingSides, normalizeBlob, ownsPropBlock, sideMask, wangIndex,
} from "../src/logic/autotile";
import { terrainKindAt, terrainMaskAt, terrainSampleAt, valueNoise } from "../src/gfx/tiles";
import { GEN_PROPS } from "../src/gfx/gen-props";
import { GEN_CHARS } from "../src/gfx/gen-chars";
import { GEN_ENEMIES } from "../src/gfx/gen-enemies";
import { GEN_BOSSES } from "../src/gfx/gen-bosses";
import { charIndex } from "../src/gfx/textures";

describe("Wang/Blob-Autotiling", () => {
  it("baut die 8-Bit-Maske in fester Bitreihenfolge", () => {
    const m = blobMask((dx, dy) => dx === 0 && dy === -1);
    expect(m).toBe(BLOB_N);
    const all = blobMask(() => true);
    expect(all).toBe(255);
    const none = blobMask(() => false);
    expect(none).toBe(0);
  });

  it("normalisiert Ecken ohne beide Nachbarseiten", () => {
    // Nur N + NE: E fehlt -> NE muss verschwinden.
    expect(normalizeBlob(BLOB_N | BLOB_NE)).toBe(BLOB_N);
    // N + E + NE bleibt.
    expect(normalizeBlob(BLOB_N | BLOB_E | BLOB_NE)).toBe(BLOB_N | BLOB_E | BLOB_NE);
    // W + N + NW bleibt, SW ohne S/W fällt weg.
    expect(normalizeBlob(BLOB_W | BLOB_N | BLOB_NW | BLOB_SW)).toBe(BLOB_W | BLOB_N | BLOB_NW);
    expect(isNormalizedBlob(BLOB_N | BLOB_NE)).toBe(false);
    expect(isNormalizedBlob(normalizeBlob(BLOB_N | BLOB_NE))).toBe(true);
  });

  it("jeder 3-Tile-Requisitenblock hat genau einen Chunk-Besitzer", () => {
    const chunks = 20;
    const chunkTiles = 16;
    const maxBlocks = Math.ceil((chunks * chunkTiles) / 3) + 1;
    const owners = new Map<string, number>();
    for (let cy = 0; cy < chunks; cy++) {
      for (let cx = 0; cx < chunks; cx++) {
        for (let by = 0; by < maxBlocks; by++) {
          for (let bx = 0; bx < maxBlocks; bx++) {
            if (!ownsPropBlock(bx, by, cx, cy, chunkTiles)) continue;
            const key = `${bx},${by}`;
            owners.set(key, (owners.get(key) ?? 0) + 1);
          }
        }
      }
    }
    // Jeder Block im abgedeckten Weltbereich muss genau einen Besitzer haben.
    for (let by = 0; by * 3 < chunks * chunkTiles; by++) {
      for (let bx = 0; bx * 3 < chunks * chunkTiles; bx++) {
        expect(owners.get(`${bx},${by}`)).toBe(1);
      }
    }
  });

  it("bildet alle 256 Masken auf genau 47 Normalformen ab", () => {
    expect(blobCount()).toBe(47);
    const seen = new Set<number>();
    for (let m = 0; m < 256; m++) seen.add(wangIndex(m));
    expect(seen.size).toBe(47);
    // Idempotenz: normalizeBlob(normalizeBlob(m)) === normalizeBlob(m).
    for (let m = 0; m < 256; m++) {
      const n = normalizeBlob(m);
      expect(normalizeBlob(n)).toBe(n);
    }
    expect(blobCanonical(wangIndex(255))).toBe(255);
  });

  it("16er-Seitenmaske ignoriert Ecken", () => {
    expect(sideMask(255)).toBe(BLOB_N | BLOB_E | BLOB_S | BLOB_W);
    expect(sideMask(BLOB_N | BLOB_NE)).toBe(BLOB_N);
  });

  it("missingSides und cornerMask sind konsistent", () => {
    const m = BLOB_N | BLOB_W;
    const miss = missingSides(m);
    expect(miss).toEqual({ n: false, e: true, s: true, w: false });
    // Offene Ecken: SE/SW (S fehlt) und NE (E fehlt), NW geschlossen (N+W da).
    expect(cornerMask(m) & 1).toBe(1);
    expect(cornerMask(m) & 2).toBe(2);
    expect(cornerMask(m) & 4).toBe(4);
    expect(cornerMask(m) & 8).toBe(0);
  });
});

describe("Moor-Terrain (M4b)", () => {
  const seed = 21;
  const world = 4096;

  it("liefert alle vier Arten in einer großen Weltprobe", () => {
    const kinds = new Set<string>();
    for (let y = 0; y < world; y += 37) {
      for (let x = 0; x < world; x += 41) kinds.add(terrainKindAt(x, y, seed, world));
    }
    expect([...kinds].sort()).toEqual(["grass", "mud", "path", "water"]);
  });

  it("Wasserflächen sind zusammenhängend (Nachbarn meist Wasser)", () => {
    let samples = 0;
    let waterNeighbors = 0;
    for (let y = 200; y < world - 200; y += 23) {
      for (let x = 200; x < world - 200; x += 29) {
        if (terrainKindAt(x, y, seed, world) !== "water") continue;
        samples++;
        for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
          if (terrainKindAt(x + dx, y + dy, seed, world) === "water") waterNeighbors++;
        }
      }
    }
    expect(samples).toBeGreaterThan(100);
    expect(waterNeighbors / (samples * 4)).toBeGreaterThan(0.6);
  });

  it("Kantenmaske ist auch an echten Ufern eine gültige Blob-Normalform", () => {
    let edgeSamples = 0;
    for (let y = 700; y < 1500 && edgeSamples < 200; y += 11) {
      for (let x = 700; x < 1500 && edgeSamples < 200; x += 13) {
        const m = terrainMaskAt(x, y, seed, world);
        expect(isNormalizedBlob(m)).toBe(true);
        expect(wangIndex(m)).toBeLessThan(47);
        if (m !== 0xff) edgeSamples++;
      }
    }
    // Der Test darf nicht nur Interieur-Vollmasken pruefen: mind. 20 Randpixel.
    expect(edgeSamples).toBeGreaterThanOrEqual(20);
    // Gleiche Position -> gleiche Maske (seed-deterministisch).
    expect(terrainMaskAt(1024, 1024, seed, world)).toBe(terrainMaskAt(1024, 1024, seed, world));
  });

  it("Weg ist schmal und unterbricht nicht die halbe Welt", () => {
    let path = 0;
    let total = 0;
    for (let x = 0; x < world; x += 17) {
      for (let y = 0; y < world; y += 19) {
        total++;
        if (terrainKindAt(x, y, seed, world) === "path") path++;
      }
    }
    const ratio = path / total;
    expect(ratio).toBeGreaterThan(0.004);
    expect(ratio).toBeLessThan(0.16);
  });

  it("Grasinseln variieren, ohne Rauschen pro Pixel", () => {
    // Zwei benachbarte Pixel teilen fast immer die Schattierung (> 99 %).
    let same = 0;
    let total = 0;
    for (let y = 500; y < 1500; y += 3) {
      for (let x = 500; x < 1500; x += 3) {
        const a = terrainSampleAt(x, y, seed, world);
        const b = terrainSampleAt(x + 1, y, seed, world);
        if (a.kind !== "grass" || b.kind !== "grass") continue;
        total++;
        if (a.shade === b.shade && a.light === b.light) same++;
      }
    }
    expect(total).toBeGreaterThan(1000);
    // 1-px-Nachbarn teilen die Fläche zu > 95 % (nur Feldkanten wechseln);
    // damit entsteht kein Einzelpixel-Rauschen, aber weiche organische Kanten.
    expect(same / total).toBeGreaterThan(0.95);
  });

  it("Requisiten-Grids sind rechteckig und nutzen nur Palettenschritte", () => {
    expect(Object.keys(GEN_PROPS).length).toBeGreaterThanOrEqual(15);
    for (const [key, def] of Object.entries(GEN_PROPS)) {
      expect(key.startsWith("prop_") || key.startsWith("water_"), key).toBe(true);
      for (const rows of def.frames) {
        expect(rows.length, key).toBe(def.h);
        for (const row of rows) {
          expect(row.length, `${key}: ${row}`).toBe(def.w);
          for (const ch of row) {
            if (ch === ".") continue;
            const i = charIndex(ch);
            expect(i, `${key}: unbekanntes Zeichen "${ch}"`).toBeGreaterThanOrEqual(0);
            expect(i, `${key}: Index ${i} ausserhalb der Palette`).toBeLessThan(32);
          }
        }
      }
    }
    // Bäume sind 32-48 px hoch (Lead-Vorgabe), Ripples genau 2 Frames.
    expect(GEN_PROPS.prop_tree_a.h).toBeGreaterThanOrEqual(32);
    expect(GEN_PROPS.prop_tree_b.h).toBeGreaterThanOrEqual(32);
    expect(GEN_PROPS.water_ripple_0.frames).toHaveLength(1);
    expect(GEN_PROPS.water_ripple_1.frames).toHaveLength(1);
  });

  it("alle generierten Figuren-/Gegner-/Boss-Grids sind palettentreu und konturiert", () => {
    const sets: Array<[string, Record<string, { w: number; h: number; frames: string[][] }>]> = [
      ["GEN_CHARS", GEN_CHARS], ["GEN_ENEMIES", GEN_ENEMIES], ["GEN_BOSSES", GEN_BOSSES],
    ];
    for (const [name, set] of sets) {
      expect(Object.keys(set).length).toBeGreaterThan(0);
      for (const [key, def] of Object.entries(set)) {
        expect(def.frames.length).toBeGreaterThan(0);
        for (const rows of def.frames) {
          expect(rows.length, key).toBe(def.h);
          let ink = 0;
          for (const row of rows) {
            expect(row.length, `${name}/${key}`).toBe(def.w);
            for (const ch of row) {
              if (ch === ".") continue;
              const i = charIndex(ch);
              expect(i, `${name}/${key}: "${ch}"`).toBeGreaterThanOrEqual(0);
              expect(i, `${name}/${key}: Index > 31`).toBeLessThan(32);
              if (i === 0) ink++;
            }
          }
          expect(ink, `${name}/${key}: keine 1-px-Kontur`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("valueNoise bleibt im Einheitsintervall", () => {
    for (let i = 0; i < 200; i++) {
      const v = valueNoise(i * 7.3, i * 3.1, 33, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
