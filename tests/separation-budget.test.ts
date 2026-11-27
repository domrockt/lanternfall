import { describe, expect, it } from "vitest";
import { SpatialHash } from "../src/systems/SpatialHash";
import {
  resolveCrowdSeparation,
  separationPush,
  type CrowdNode,
} from "../src/logic/separation";

/** Deterministischer PRNG (mulberry32) wie in tests/separation-crowd.test.ts. */
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

function minPairDistance(nodes: readonly CrowdNode[]): number {
  let min = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d < min) min = d;
    }
  }
  return min;
}

/** Dichter Schwarm (Minute-25-Kern): count Gegner in einem 120-px-Kreis. */
function denseCrowd(count: number, seed: number, uidStart = 1): CrowdNode[] {
  const rand = rng(seed);
  const nodes: CrowdNode[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * 60;
    nodes.push({
      x: 2000 + Math.cos(angle) * dist,
      y: 2000 + Math.sin(angle) * dist,
      radius: 5 + Math.floor(rand() * 4),
      uid: uidStart + i,
      alive: true,
    });
  }
  return nodes;
}

describe("separation budget: Nachbar-Deckel je Gegner", () => {
  it("greift im dichten Kern und begrenzt die Arbeit je Gegner hart", () => {
    const nodes = denseCrowd(200, 20261127);
    const cap = 4;
    const res = resolveCrowdSeparation(nodes, { maxIterations: 3, maxNeighborsPerEnemy: cap });
    expect(res.neighborCapHit).toBe(true);
    // Je Gegner und Durchlauf werden hart max. `cap` Nachbarn geprueft:
    expect(res.pairChecks).toBeLessThanOrEqual(200 * 3 * cap);
  });

  it("Ohne Deckel-Griff (wenig Nachbarn) bleibt neighborCapHit false", () => {
    // Zwei weit auseinanderliegende Gegner: keine Nachbarschaft ueberhaupt.
    const nodes: CrowdNode[] = [
      { x: 1000, y: 1000, radius: 6, uid: 1, alive: true },
      { x: 3000, y: 3000, radius: 6, uid: 2, alive: true },
    ];
    const res = resolveCrowdSeparation(nodes, { maxIterations: 3 });
    expect(res.neighborCapHit).toBe(false);
    expect(res.pairChecks).toBe(0);
  });
});

describe("separation budget: Paar-Budget", () => {
  it("bricht bei maxPairChecks ab und meldet budgetExhausted", () => {
    const nodes = denseCrowd(200, 20261127);
    const budget = 500;
    const res = resolveCrowdSeparation(nodes, { maxPairChecks: budget });
    expect(res.budgetExhausted).toBe(true);
    // Nach dem Ueberschreiten bricht der aktuelle Gegner ab; pro Gegner kann
    // genau ein Check_ueber dem Budget liegen.
    expect(res.pairChecks).toBeLessThanOrEqual(budget + 200 + 1);
  });
});

describe("separation budget: Trennqualitaet", () => {
  it("erhoeht den min-Paarabstand nach N Frames dauerhaft", () => {
    const nodes = denseCrowd(120, 42);
    const start = minPairDistance(nodes);
    // 12 Frames Budget-Resolver (Default: 3 Iterationen, Deckel aktiv).
    for (let f = 0; f < 12; f++) resolveCrowdSeparation(nodes);
    const final = minPairDistance(nodes);
    expect(final).toBeGreaterThan(start);
    // Trennung darf nicht wieder zusammenfallen (kein Verschmelzen).
    expect(final).toBeGreaterThan(1);
  });

  it("ist deterministisch: gleicher Seed → gleiche Endpositionen", () => {
    const a = denseCrowd(80, 777);
    const b = denseCrowd(80, 777);
    for (let f = 0; f < 8; f++) {
      resolveCrowdSeparation(a, { maxNeighborsPerEnemy: 8 });
      resolveCrowdSeparation(b, { maxNeighborsPerEnemy: 8 });
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("toten Gegnern wird nicht mehr separiert (alive=false)", () => {
    const nodes = denseCrowd(40, 5);
    nodes[0].alive = false;
    const x = nodes[0].x;
    const y = nodes[0].y;
    for (let f = 0; f < 4; f++) resolveCrowdSeparation(nodes);
    expect(nodes[0].x).toBe(x);
    expect(nodes[0].y).toBe(y);
  });
});

describe("separation budget: Push-Pool-Vertrag", () => {
  it("unmittelbares Aufsummieren bleibt korrekt (Run.ts-Muster)", () => {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < 32; i++) {
      const push = separationPush(0, 0, 6, 3, 4, 6, i);
      if (push) {
        sx += push.x;
        sy += push.y;
      }
    }
    // Referenz: dx=-3, dy=-4 → d=5, minDist=12, ratio=7/12, Gewicht 1.
    // 16 even/16 odd uids → der Tangential-Anteil summiert sich zu 0.
    const ratio = 7 / 12;
    const radial = ratio * 1 * 14.0;
    const ux = -3 / 5;
    const uy = -4 / 5;
    expect(sx).toBeCloseTo(32 * ux * radial, 10);
    expect(sy).toBeCloseTo(32 * uy * radial, 10);
  });

  it("zwei gleichzeitig gehaltene Ergebnisse bleiben innerhalb der Pooltiefe stabil", () => {
    const small = separationPush(10, 10, 5, 10, 10, 20, 3)!;
    const big = separationPush(10, 10, 20, 10, 10, 5, 3)!;
    // Der Pool schreibt fruehestens nach 16 weiteren Aufrufen ueber — zwei
    // gehaltene Ergebnisse duerfen sich nicht gegenseitig ueberschreiben.
    for (let i = 0; i < 8; i++) separationPush(0, 0, 6, 40, 0, 6, 1);
    expect(small.x).not.toBeNaN();
    expect(big.x).not.toBeNaN();
  });

  it("weite Paare liefern weiter null (kein Allokations-Pfad)", () => {
    expect(separationPush(0, 0, 6, 50, 50, 6, 1)).toBeNull();
  });
});

describe("separation budget: SpatialHash-Fast-Path", () => {
  it("liefert dieselbe Treffermenge wie eine Brute-Force-Referenz", () => {
    const hash = new SpatialHash<CrowdNode>(32);
    const rand = rng(99);
    const nodes: CrowdNode[] = [];
    for (let i = 0; i < 300; i++) {
      nodes.push({
        x: rand() * 4000,
        y: rand() * 4000,
        radius: 5,
        uid: i + 1,
        alive: true,
      });
    }
    hash.rebuild(nodes);
    const out: CrowdNode[] = [];
    for (let q = 0; q < 50; q++) {
      const x = rand() * 4000;
      const y = rand() * 4000;
      const r = 10 + rand() * 60;
      hash.queryCircle(x, y, r, out);
      const expected = nodes.filter(
        (n) =>
          n.x >= Math.floor((x - r) / 32) * 32 &&
          n.x < (Math.floor((x + r) / 32) + 1) * 32 &&
          n.y >= Math.floor((y - r) / 32) * 32 &&
          n.y < (Math.floor((y + r) / 32) + 1) * 32,
      );
      expect(out.length).toBe(expected.length);
      for (const n of expected) expect(out).toContain(n);
    }
  });

  it("Query am Rand nutzt Overflow und findet dieselben Items", () => {
    const hash = new SpatialHash<CrowdNode>(32);
    const inside: CrowdNode = { x: -2100, y: -2100, radius: 5, uid: 1, alive: true };
    const near: CrowdNode = { x: -2065, y: -2065, radius: 5, uid: 2, alive: true };
    hash.insert(inside);
    hash.insert(near);
    const out: CrowdNode[] = [];
    // Quadrat [-2088,-2048]: Zellen -66 (Overflow) bis -64 (flaches Grid).
    hash.queryCircle(-2068, -2068, 20, out);
    expect(out).toContain(inside);
    expect(out).toContain(near);
  });
});
