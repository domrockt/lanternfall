import { describe, expect, it } from "vitest";
import { SpatialHash } from "../src/systems/SpatialHash";

/** Deterministischer PRNG (mulberry32) für reproduzierbare Seeds. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Item {
  x: number;
  y: number;
  radius: number;
  id: number;
}

function makeItems(rand: () => number, count: number): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    // Cluster um das Weltzentrum plus Ausreißer, wie im echten Burst.
    const cluster = rand() < 0.8;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * (cluster ? 260 : 1800);
    const cx = 2048 + (cluster ? 0 : (rand() - 0.5) * 2400);
    const cy = 2048 + (cluster ? 0 : (rand() - 0.5) * 2400);
    items.push({
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      radius: 4 + rand() * 8,
      id: i,
    });
  }
  return items;
}

function bruteForce(items: Item[], x: number, y: number, radius: number): Set<Item> {
  const found = new Set<Item>();
  const r2 = radius * radius;
  for (const item of items) {
    const dx = item.x - x;
    const dy = item.y - y;
    if (dx * dx + dy * dy <= r2) found.add(item);
  }
  return found;
}

/** queryCircle liefert Kandidaten aus überdeckten Zellen; Distanzfilter wie die Aufrufer. */
function queryNeighbors(hash: SpatialHash<Item>, items: Item[], x: number, y: number, radius: number): Set<Item> {
  const out: Item[] = [];
  hash.queryCircle(x, y, radius, out);
  const r2 = radius * radius;
  const found = new Set<Item>();
  for (const item of out) {
    const dx = item.x - x;
    const dy = item.y - y;
    if (dx * dx + dy * dy <= r2) found.add(item);
  }
  return found;
}

describe("SpatialHash Äquivalenz zu Brute-Force", () => {
  for (const seed of [101, 202]) {
    it(`Query trifft exakt dieselben Nachbarn wie Brute-Force (Seed ${seed}, 100 Punkte)`, () => {
      const rand = rng(seed);
      const items = makeItems(rand, 300);
      const hash = new SpatialHash<Item>(32);
      hash.rebuild(items);

      const queries = 100;
      for (let q = 0; q < queries; q++) {
        const x = 2048 + (rand() - 0.5) * 900;
        const y = 2048 + (rand() - 0.5) * 900;
        const radius = 6 + rand() * 34;

        const got = queryNeighbors(hash, items, x, y, radius);
        const want = bruteForce(items, x, y, radius);

        // Exakt gleich: keine fehlenden Treffer, keine Extras nach Distanzfilter.
        expect(got.size, `seed ${seed} query ${q}: Trefferzahl`).toBe(want.size);
        for (const item of want) {
          expect(got.has(item), `seed ${seed} query ${q}: Item ${item.id} fehlt`).toBe(true);
        }
        for (const item of got) {
          expect(want.has(item), `seed ${seed} query ${q}: Item ${item.id} zu viel`).toBe(true);
        }
      }
    });
  }

  it("funktioniert mit mehreren Zellgrößen (16/32/48) identisch", () => {
    const rand = rng(303);
    const items = makeItems(rand, 250);
    for (const cellSize of [16, 32, 48]) {
      const hash = new SpatialHash<Item>(cellSize);
      hash.rebuild(items);
      for (let q = 0; q < 40; q++) {
        const x = 2048 + (rand() - 0.5) * 900;
        const y = 2048 + (rand() - 0.5) * 900;
        const radius = 8 + rand() * 30;
        const got = queryNeighbors(hash, items, x, y, radius);
        const want = bruteForce(items, x, y, radius);
        expect(got.size).toBe(want.size);
        for (const item of want) expect(got.has(item)).toBe(true);
        for (const item of got) expect(want.has(item)).toBe(true);
      }
    }
  });

  it("findet auch Punkte außerhalb des flachen Zellbereichs (Overflow)", () => {
    const items: Item[] = [
      { x: -5000, y: 2048, radius: 5, id: 0 },
      { x: 9000, y: 2048, radius: 5, id: 1 },
      { x: 2048, y: 2048, radius: 5, id: 2 },
    ];
    const hash = new SpatialHash<Item>(32);
    hash.rebuild(items);
    const out: Item[] = [];
    hash.queryCircle(-5000, 2048, 10, out);
    expect(out).toContain(items[0]);
    expect(out).not.toContain(items[1]);
    hash.queryCircle(9000, 2048, 10, out);
    expect(out).toContain(items[1]);
    expect(out).not.toContain(items[0]);
  });
});

describe("SpatialHash Allokation/Recycling", () => {
  it("allokiert bei wiederholten Rebuilds derselben Items keine neuen Zellen", () => {
    const rand = rng(404);
    const items = makeItems(rand, 300);
    const hash = new SpatialHash<Item>(32);
    hash.rebuild(items);
    const allocatedAfterFirst = hash.allocatedCellCount;
    const cellsAfterFirst = hash.cellCount;

    for (let f = 0; f < 120; f++) hash.rebuild(items);

    expect(hash.allocatedCellCount).toBe(allocatedAfterFirst);
    expect(hash.cellCount).toBe(cellsAfterFirst);
    expect(hash.cellCount).toBeGreaterThan(0);
  });

  it("clear leert die Zellen, ohne Buckets freizugeben", () => {
    const rand = rng(505);
    const items = makeItems(rand, 200);
    const hash = new SpatialHash<Item>(32);
    hash.rebuild(items);
    const allocated = hash.allocatedCellCount;
    hash.clear();
    expect(hash.cellCount).toBe(0);
    expect(hash.allocatedCellCount).toBe(allocated);
  });
});
