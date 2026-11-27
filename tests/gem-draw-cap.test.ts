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

import {
  MAGNET_COUNT_SCALE,
  MAGNET_RADIUS_FACTOR,
  MAX_VISIBLE_GEMS,
  PickupSystem,
  mergeGemValues,
} from "../src/systems/PickupSystem";

const rng = { next: () => 0.5 };
const noop = () => {};

/** Szene ohne Tweens: drop() darf pro Gem keinen Tween anlegen. */
const sceneWithoutTweens = {
  tweens: {
    add: () => {
      throw new Error("drop() darf keinen Tween pro Gem anlegen");
    },
  },
} as never;

function fill(ps: PickupSystem, n: number): void {
  for (let i = 0; i < n; i++) ps.drop(i % 97, Math.floor(i / 97), i % 3 === 0 ? "large" : i % 3 === 1 ? "medium" : "small", rng);
}

describe("M10-Draw-Cap: harter Deckel", () => {
  it("deckelt sichtbare Gems bei MAX_VISIBLE_GEMS (120) statt 180", () => {
    expect(MAX_VISIBLE_GEMS).toBe(120);
    const ps = new PickupSystem(sceneWithoutTweens);
    ps.setCap(180);
    expect(ps.cap).toBe(MAX_VISIBLE_GEMS);
    fill(ps, 500);
    expect(ps.count).toBeLessThanOrEqual(MAX_VISIBLE_GEMS);
  });

  it("greift deterministisch: gleiche Drops -> gleiche Anzahl und XP", () => {
    const a = new PickupSystem(sceneWithoutTweens);
    const b = new PickupSystem(sceneWithoutTweens);
    a.setCap(120);
    b.setCap(120);
    fill(a, 500);
    fill(b, 500);
    expect(a.count).toBe(b.count);
    expect(a.totalXp).toBe(b.totalXp);
    expect(a.stats.mergedGems).toBe(b.stats.mergedGems);
  });

  it("verliert kein Gem: XP-Summe bleibt exakt erhalten", () => {
    const ps = new PickupSystem(sceneWithoutTweens);
    ps.setCap(120);
    fill(ps, 500);
    // spawnedXp = XP aller Drops; davon liegen field+Rest im Feld, Rest beim Spieler.
    expect(ps.stats.spawnedXp).toBeGreaterThan(500);
    expect(ps.stats.grantedXp + ps.totalXp).toBe(ps.stats.spawnedXp);
    expect(ps.stats.rejected).toBe(0);
  });

  it("erhaelt die XP auch beim Einsammeln und bei setCap-Verengung", () => {
    const ps = new PickupSystem(sceneWithoutTweens);
    ps.setCap(120);
    fill(ps, 300);
    const spawned = ps.stats.spawnedXp;
    ps.setCap(30);
    expect(ps.count).toBeLessThanOrEqual(30);
    // Ein paar Frames sammeln (Spieler im Feld), dann Bilanz pruefen.
    for (let f = 0; f < 30; f++) ps.update(1 / 60, 50, 50, 400, noop);
    expect(ps.stats.grantedXp + ps.totalXp).toBe(spawned);
  });

  it("Groesse <-> XP bleibt monoton und kanonisch (keine NaN)", () => {
    const pairs: [number, number][] = [[2, 2], [2, 6], [6, 18], [18, 18]];
    for (const [a, b] of pairs) {
      const m = mergeGemValues(a, b);
      expect(Number.isFinite(m.value)).toBe(true);
      expect(Number.isFinite(m.credited)).toBe(true);
      expect(m.value + m.credited).toBe(a + b);
      const expected = a + b >= GEMS.large.value ? "large" : a + b >= GEMS.medium.value ? "medium" : "small";
      expect(m.size).toBe(expected);
    }
    const ps = new PickupSystem(sceneWithoutTweens);
    fill(ps, 200);
    for (const g of ps.gems) {
      expect(Number.isFinite(g.value)).toBe(true);
      expect(Number.isFinite(g.x)).toBe(true);
      expect(Number.isFinite(g.y)).toBe(true);
    }
  });
});

describe("M10-Draw-Cap: Magnet skaliert mit Gem-Zahl", () => {
  it("waechst mit der Gem-Zahl, bleibt aber monoton und begrenzt", () => {
    const base = PickupSystem.magnetRadiusFor(40, 0);
    const half = PickupSystem.magnetRadiusFor(40, 60);
    const full = PickupSystem.magnetRadiusFor(40, MAX_VISIBLE_GEMS);
    const over = PickupSystem.magnetRadiusFor(40, 500);
    expect(base).toBeCloseTo(40 * MAGNET_RADIUS_FACTOR);
    expect(half).toBeGreaterThan(base);
    expect(full).toBeCloseTo(40 * MAGNET_RADIUS_FACTOR * (1 + MAGNET_COUNT_SCALE));
    expect(over).toBeCloseTo(full);
  });

  it("nutzt die Gem-Zahl im update() (voller Magnet bei vollem Feld)", () => {
    const ps = new PickupSystem(sceneWithoutTweens);
    ps.setCap(MAX_VISIBLE_GEMS);
    fill(ps, MAX_VISIBLE_GEMS + 20);
    const expected = PickupSystem.magnetRadiusFor(40, ps.gems.length);
    expect(expected).toBeGreaterThan(PickupSystem.magnetRadiusFor(40, 0));
    // Kristall genau auf dem erweiterten Radius wird angezogen.
    ps.drop(500 + expected, 500, "small", rng);
    ps.update(1 / 60, 500, 500, 40, noop);
    const dropped = ps.gems[ps.gems.length - 1];
    expect(dropped.x).toBeLessThan(500 + expected);
  });
});

describe("M10-Draw-Cap: kein Tween pro Gem", () => {
  it("drop() und update() legen keine Tweens an", () => {
    const ps = new PickupSystem(sceneWithoutTweens);
    ps.setCap(MAX_VISIBLE_GEMS);
    fill(ps, 150);
    expect(() => ps.update(1 / 60, 0, 0, 40, noop)).not.toThrow();
    expect(ps.count).toBeLessThanOrEqual(MAX_VISIBLE_GEMS);
  });
});
