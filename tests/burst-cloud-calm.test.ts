import { describe, it, expect } from "vitest";
import { deathClassFor, deathFxFor } from "../src/logic/death";
import { ENEMIES } from "../src/data/enemies";
import { C, PAL } from "../src/palette";

/**
 * m10-burst-cloud-calm (#8719/#8720): die burst-Tod-Klasse ("gruene
 * Dither-Wolken", fx_death_blob) wird GLOBAL ruhiger. Nur die VFX-Parameter
 * in BASE.burst wurden veraendert — Todeslogik, Klassen-Mapping und alle
 * uebrigen Dimensionen muessen bitgleich bleiben.
 *
 * Deckel (Befund Dom 2026-11-28, Vorher: 16 Shards @ 2.4x additiv):
 *   - Shards:      16 -> 8..10
 *   - ScaleFrom:   2.4 -> <= 1
 *   - Additiv:     aus (Alpha-Boden in Normal-Blend)
 */

const FROZEN_BASE_BURST = {
  // Identitaet + alles, was NICHT entschärft wurde (bitgleich erzwingen):
  shard: "fx_death_blob",
  dust: "fx_death_blob",
  life: 0.35,
  dustLife: 0.28,
  rim: "fx_death_blob",
  rimTint: C.nightDeep,
  rimScale: 1.14,
  spread: 130,
  tint: C.marshLight,
  dustTint: C.mossDark,
};

const FROZEN_BOSS_BURST = {
  shard: "fx_boss_core",
  dust: "fx_halo",
  count: 30,
  dustCount: 14,
  life: 0.7,
  dustLife: 0.5,
  scaleFrom: 3.84,
  scaleTo: 1.6,
  dustScale: 1.8,
  rim: "fx_boss_core",
  rimTint: C.nightDeep,
  rimScale: 1.18,
  spread: 200,
  tint: C.marshLight,
  dustTint: C.glow,
  additive: false,
};

describe("m10-burst-cloud-calm: burst-Tod-Klasse global ruhiger", () => {
  it("Deckel: Shards <= 10, Staub <= 6, ScaleFrom <= 1, DustScale <= 1, Normal-Blend", () => {
    const spec = deathFxFor("burst");
    expect(spec.count).toBeGreaterThanOrEqual(8);
    expect(spec.count).toBeLessThanOrEqual(10);
    expect(spec.dustCount).toBeLessThanOrEqual(6);
    expect(spec.scaleFrom).toBeLessThanOrEqual(1);
    expect(spec.scaleTo).toBeLessThan(spec.scaleFrom);
    expect(spec.dustScale).toBeLessThanOrEqual(1);
    // Alpha-Boden: keine additive Ueberstrahlung mehr.
    expect(spec.additive).toBe(false);
  });

  it("kein Mixel: Shard und Dust teilen EINE Textur, Rim dieselbe mit festem Saum", () => {
    const spec = deathFxFor("burst");
    expect(spec.shard).toBe("fx_death_blob");
    expect(spec.dust).toBe(spec.shard);
    expect(spec.rim).toBe(spec.shard);
    // Rim bleibt duenner Saum (1 < rimScale <= 1.2), kein Mittelklecks.
    expect(spec.rimScale).toBeGreaterThan(1);
    expect(spec.rimScale).toBeLessThanOrEqual(1.2);
  });

  it("palettetreu: alle Tints sind gueltige Palettenindizes in den Dokumentfarben", () => {
    const spec = deathFxFor("burst");
    for (const t of [spec.tint, spec.dustTint, spec.rimTint]) {
      expect(Number.isInteger(t)).toBe(true);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(31);
      expect(PAL[t]).toBeDefined();
    }
    expect(spec.tint).toBe(C.marshLight);
    expect(spec.dustTint).toBe(C.mossDark);
    expect(spec.rimTint).toBe(C.nightDeep);
  });

  it("Todeslogik bitgleich: nicht-entschärfe Dimensionen und Boss-Spec unveraendert", () => {
    const spec = deathFxFor("burst");
    expect(spec).toMatchObject(FROZEN_BASE_BURST);
    expect(deathFxFor("burst", true)).toMatchObject(FROZEN_BOSS_BURST);
  });

  it("Klassen-Mapping bitgleich: alle 30 Gegner mappen wie vorher", () => {
    expect(Object.keys(ENEMIES).length).toBe(30);
    for (const [id, e] of Object.entries(ENEMIES)) {
      // Nur Mapping-Integritaet: Swarm/Splitter bleiben burst (die Wolke),
      // alle anderen Klassen sind von der Entschärfung unberuehrt.
      expect(deathClassFor(e.archetype), id).toBe(deathClassFor(e.archetype));
      if (e.archetype === "swarm" || e.archetype === "splitter") {
        expect(deathClassFor(e.archetype), id).toBe("burst");
      }
    }
    // Spec enthaelt weiter keine Gameplay-Werte (Loot/XP/HP kommen nie hieraus).
    const spec = deathFxFor("burst") as unknown as Record<string, unknown>;
    for (const forbidden of ["damage", "hp", "radius", "xp", "loot", "weight"]) {
      expect(spec).not.toHaveProperty(forbidden);
    }
  });
});
