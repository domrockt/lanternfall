import { describe, expect, it } from "vitest";
import { SpatialHash } from "../src/systems/SpatialHash";
import {
  fallbackDir,
  resolveCrowdSeparation,
  separationPush,
  separationWeight,
  separationCellSize,
  type CrowdNode,
} from "../src/logic/separation";

/** Deterministischer PRNG (mulberry32), damit "seed-stabil" pruefbar ist. */
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

/**
 * Simuliert den Run-Loop wie Run.ts: Hash pro Frame, Nachbarsuche im Kreis
 * Radius+10, Summe der separationPush-Vektoren als Positionsdelta
 * (speed 48 * 1.2 * dt), 60 Schritte/s.
 */
function simulateRunStep(nodes: CrowdNode[], frames: number): void {
  const hash = new SpatialHash<CrowdNode>(32);
  const scratch: CrowdNode[] = [];
  const dt = 1 / 60;
  for (let f = 0; f < frames; f++) {
    hash.rebuild(nodes.filter((n) => n.alive !== false));
    for (const self of nodes) {
      if (self.alive === false) continue;
      hash.queryCircle(self.x, self.y, self.radius + 10, scratch);
      let sx = 0;
      let sy = 0;
      for (const other of scratch) {
        if (other === self || other.alive === false) continue;
        const push = separationPush(self.x, self.y, self.radius, other.x, other.y, other.radius, self.uid);
        if (push) {
          sx += push.x;
          sy += push.y;
        }
      }
      self.x += sx * 48 * 1.2 * dt;
      self.y += sy * 48 * 1.2 * dt;
    }
  }
}

describe("Separation: Massengewichtung", () => {
  it("kleine Gegner weichen einem Tank staerker aus als umgekehrt", () => {
    expect(separationWeight(5, 20)).toBeGreaterThan(1);
    expect(separationWeight(20, 5)).toBeLessThan(1);
    expect(separationWeight(8, 8)).toBeCloseTo(1, 6);
  });

  it("Push-Betrag folgt dem Gewicht, Richtung bleibt weg vom anderen", () => {
    // Gleiche Position -> Fallback; Betrag = Gewicht.
    const small = separationPush(10, 10, 5, 10, 10, 20, 3)!;
    const big = separationPush(10, 10, 20, 10, 10, 5, 3)!;
    expect(Math.hypot(small.x, small.y)).toBeGreaterThan(Math.hypot(big.x, big.y));
    // Ueberlappend, aber nicht deckungsgleich: Richtung zeigt von other weg.
    const push = separationPush(10, 0, 6, 0, 0, 6, 1)!;
    expect(push.x).toBeGreaterThan(0);
    expect(Math.abs(push.y)).toBeLessThan(1e-6);
  });
});

describe("Separation: deterministischer Fallback", () => {
  it("gleiche uid -> gleiche Richtung, andere uid -> andere Richtung", () => {
    const a = fallbackDir(42);
    const b = fallbackDir(42);
    expect(a).toEqual(b);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(1, 6);
    const c = fallbackDir(43);
    expect(a.x !== c.x || a.y !== c.y).toBe(true);
  });

  it("exakt uebereinander: Push ist endlich und ungleich (0,0)", () => {
    const push = separationPush(100, 100, 6, 100, 100, 6, 7)!;
    expect(Number.isFinite(push.x)).toBe(true);
    expect(Number.isFinite(push.y)).toBe(true);
    expect(Math.hypot(push.x, push.y)).toBeGreaterThan(0.5);
  });

  it("Randfaelle (Radius 0, NaN-uid) liefern keine NaN/Infinity", () => {
    const push = separationPush(5, 5, 0, 5, 5, 0, NaN)!;
    expect(Number.isFinite(push.x) && Number.isFinite(push.y)).toBe(true);
    expect(Math.hypot(fallbackDir(Infinity).x, fallbackDir(Infinity).y)).toBeCloseTo(1, 6);
  });
});

describe("Separation: 20 exakt gestapelte Gegner nach 2 s", () => {
  it("sind danach mindestens 6 px voneinander getrennt (Run-Loop-Simulation)", () => {
    const nodes: CrowdNode[] = Array.from({ length: 20 }, (_, i) => ({
      x: 1000, y: 1000, radius: 6, uid: i + 1, alive: true,
    }));
    expect(minPairDistance(nodes)).toBe(0);
    simulateRunStep(nodes, 120);
    const min = minPairDistance(nodes);
    expect(min).toBeGreaterThanOrEqual(6);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("20er-Stack bleibt seed-stabil: zwei identische Laeufe ergeben gleiche Positionen", () => {
    const make = () => Array.from({ length: 20 }, (_, i) => ({
      x: 500, y: 500, radius: 6, uid: i + 1, alive: true,
    }));
    const a = make();
    const b = make();
    simulateRunStep(a, 60);
    simulateRunStep(b, 60);
    expect(b.map((n) => [n.x, n.y])).toEqual(a.map((n) => [n.x, n.y]));
  });
});

describe("Separation: Mengen-Resolver mit Deckel", () => {
  it("verteilt 500 dicht gestapelte Gegner ohne NaN und haelt das Iterationslimit", () => {
    const nodes: CrowdNode[] = Array.from({ length: 500 }, (_, i) => ({
      x: 2048 + (i % 20), y: 2048 + Math.floor(i / 20), radius: 5 + (i % 4), uid: i + 1, alive: true,
    }));
    const res = resolveCrowdSeparation(nodes, { maxIterations: 2, maxPairChecks: 500_000 });
    expect(res.iterations).toBe(2);
    expect(res.pairChecks).toBeGreaterThan(0);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
    expect(minPairDistance(nodes)).toBeGreaterThan(0);
  });

  it("Paar-Budget greift hart und ist deterministisch", () => {
    const make = () => Array.from({ length: 500 }, (_, i) => ({
      x: 2048 + (i % 20), y: 2048 + Math.floor(i / 20), radius: 6, uid: i + 1, alive: true,
    }));
    const a = make();
    const b = make();
    const ra = resolveCrowdSeparation(a, { maxIterations: 4, maxPairChecks: 5000 });
    const rb = resolveCrowdSeparation(b, { maxIterations: 4, maxPairChecks: 5000 });
    expect(ra.budgetExhausted).toBe(true);
    expect(ra.pairChecks).toBeLessThanOrEqual(5001);
    expect(rb.pairChecks).toBe(ra.pairChecks);
    expect(b.map((n) => [n.x, n.y])).toEqual(a.map((n) => [n.x, n.y]));
  });

  it("Zellgroesse waechst mit dem groessten Radius und bleibt gedeckelt", () => {
    expect(separationCellSize(5)).toBe(16);
    expect(separationCellSize(18)).toBe(36);
    expect(separationCellSize(1000)).toBe(64);
  });
});
