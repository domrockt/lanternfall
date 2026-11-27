import { describe, expect, it, vi } from "vitest";
import { GEMS } from "../src/logic/xp";

// PickupSystem importiert Phaser + Atlas; fuer den Unit-Test genuegen Stubs.
vi.mock("phaser", () => ({
  default: { BlendModes: { NORMAL: 0, ADD: 1 } },
}));
vi.mock("../src/gfx/atlas", () => ({
  makeImage: () => {
    const img: Record<string, unknown> = {};
    for (const m of [
      "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint",
      "setRotation", "setVisible", "setActive", "setPosition", "setTexture",
      "setFrame", "destroy",
    ]) img[m] = () => img;
    return img;
  },
  applyTexture: () => {},
}));

import { MAGNET_RADIUS_FACTOR, PickupSystem, mergeGemValues } from "../src/systems/PickupSystem";

const rng = { next: () => 0.5 };
const noop = () => {};
const scene = {} as never;

describe("M10 Kristall-Verschmelzung", () => {
  it("erhaelt die XP-Summe und liefert kanonische Groessen", () => {
    const cases: [number, number][] = [
      [2, 2], [2, 6], [6, 6], [6, 18], [18, 18], [2, 18], [18, 2],
    ];
    for (const [a, b] of cases) {
      const m = mergeGemValues(a, b);
      // Eindeutig: value + credited === a + b (kein XP-Verlust).
      expect(m.value + m.credited).toBe(a + b);
      // Kanonisch: Werte kommen exakt aus GEMS.
      expect([GEMS.small.value, GEMS.medium.value, GEMS.large.value]).toContain(m.value);
      // Monoton: kleinere Summe -> nie groessere Groesse.
      expect(m.size).toBe(a + b >= 18 ? "large" : a + b >= 6 ? "medium" : "small");
    }
  });

  it("verschmilzt bei vollem Cap den aeltesten Kristall statt zu verwerfen", () => {
    const ps = new PickupSystem(scene);
    ps.setCap(24);
    for (let i = 0; i < 24; i++) ps.drop(i, i, "small", rng);
    const before = ps.totalXp;
    expect(ps.count).toBe(24);
    expect(before).toBe(24 * GEMS.small.value);

    for (let i = 0; i < 100; i++) ps.drop(500 + i, 500, "small", rng);

    // Kap hart eingehalten, und keine XP verschwunden.
    expect(ps.count).toBeLessThanOrEqual(24);
    expect(ps.totalXp).toBe(before + 100 * GEMS.small.value);
    expect(ps.stats.rejected).toBe(0);
    expect(ps.stats.mergedGems).toBeGreaterThan(0);
  });

  it("haelt den Cap auch bei einem Burst (Boss-/Elite-Truhe) ein", () => {
    const ps = new PickupSystem(scene);
    ps.setCap(24);
    for (let i = 0; i < 500; i++) ps.drop(100 + (i % 40), 100 + (i % 30), i % 3 === 0 ? "large" : "medium", rng);
    expect(ps.count).toBeLessThanOrEqual(24);
    expect(ps.stats.rejected).toBe(0);
  });

  it("senkt setCap ohne XP-Verlust durch paarweises Verschmelzen", () => {
    const ps = new PickupSystem(scene);
    ps.setCap(180);
    for (let i = 0; i < 180; i++) ps.drop(i, 0, "small", rng);
    const before = ps.totalXp;
    ps.setCap(24);
    expect(ps.count).toBe(24);
    expect(ps.totalXp).toBe(before);
  });
});

describe("M10 Magnet-Semantik", () => {
  it("zieht ab exakt dem Radius, aber nicht ausserhalb", () => {
    const ps = new PickupSystem(scene);
    const radius = 40;
    const magnet = PickupSystem.magnetRadiusFor(radius);
    expect(magnet).toBeCloseTo(40 * MAGNET_RADIUS_FACTOR);
    ps.drop(500 + magnet, 500, "small", rng); // genau auf dem Radius
    ps.drop(500 + magnet + 0.5, 500, "small", rng); // knapp ausserhalb
    ps.update(1 / 60, 500, 500, radius, noop);
    const [on, off] = ps.gems;
    expect(Math.hypot(on.x - 500, on.y - 500)).toBeLessThan(magnet);
    // ausserhalb: rng 0.5 => keine Drift, Position bleibt.
    expect(Math.hypot(off.x - 500, off.y - 500)).toBeCloseTo(magnet + 0.5, 5);
  });

  it("kommt vom aeussersten Radius in <= 0,4 s an", () => {
    const ps = new PickupSystem(scene);
    const radius = 40;
    const magnet = PickupSystem.magnetRadiusFor(radius);
    ps.drop(500 + magnet, 500, "small", rng);
    let collected = 0;
    let frames = 0;
    while (collected === 0 && frames < 120) {
      ps.update(1 / 60, 500, 500, radius, (v) => { collected += v; });
      frames += 1;
    }
    expect(collected).toBe(GEMS.small.value);
    expect(frames).toBeLessThanOrEqual(24); // 24 Frames = 0,4 s
  });

  it("Radius 0 zieht nicht", () => {
    const ps = new PickupSystem(scene);
    expect(PickupSystem.magnetRadiusFor(0)).toBe(0);
    ps.drop(550, 500, "small", rng);
    const x0 = ps.gems[0].x;
    ps.update(0.1, 500, 500, 0, noop);
    expect(ps.gems[0].x).toBe(x0);
    expect(ps.count).toBe(1);
  });

  it("zieht mehrere Kristalle gleichzeitig an", () => {
    const ps = new PickupSystem(scene);
    const radius = 40;
    const magnet = PickupSystem.magnetRadiusFor(radius);
    const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, Math.PI / 4];
    for (const a of angles) ps.drop(500 + Math.cos(a) * magnet, 500 + Math.sin(a) * magnet, "small", rng);
    const start = ps.gems.map((g) => Math.hypot(g.x - 500, g.y - 500));
    ps.update(1 / 60, 500, 500, radius, noop);
    ps.gems.forEach((g, i) => {
      const d = Math.hypot(g.x - 500, g.y - 500);
      expect(d).toBeLessThan(start[i]);
    });
  });
});
