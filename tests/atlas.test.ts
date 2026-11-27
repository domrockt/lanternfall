import { describe, expect, it } from "vitest";
import auditReport from "../shots/m10-atlas-audit.json";
import {
  ATLAS_GUTTER,
  ATLAS_KEY,
  ATLAS_PAD,
  ATLAS_PREFIXES,
  ATLAS_WIDTH,
  packAtlas,
  shouldAtlasKey,
  type AtlasFrameRect,
} from "../src/gfx/atlas";
import { ALL_BOSS_FRAMES, ALL_ENEMY_FRAMES } from "../src/gfx/enemySprites";

/** Repräsentative heisse Textur-Keys (Gegner, Gems, Projektile, Partikel, VFX). */
const HOT_KEYS = [
  // Gems
  "gem_small", "gem_medium", "gem_large",
  // Projektile / Waffen-VFX
  "projectile_ember", "projectile_thorn", "projectile_phoenix", "projectile_ice",
  "flail_ball", "chain_link",
  // Partikel / FX
  "fx_spark", "fx_fire", "fx_star", "fx_halo", "fx_halo_cold", "fx_ice",
  "fx_smear", "fx_bolt", "fx_seal", "fx_thorn", "fx_orb", "fx_pillar",
  "fx_shock", "fx_ash", "fx_dusk", "fx_boss_core",
  "fx_death_bone", "fx_death_blob", "fx_death_void", "fx_death_dust",
  "fx_coin",
  // Kreise / Auren / Gegner-Projektile
  "ring_burst", "ring_seal", "ring_soul", "ring_frost",
  "elite_aura", "orb_lantern", "orb_soul", "orb_soul_2", "orb_soul_3",
  "enemy_shot_spit", "enemy_shot_bone", "enemy_shot_fire",
  "enemy_shot_shadow", "enemy_shot_thorn",
  "telegraph_disc", "telegraph_beam",
  "puddle_poison", "bone_boomerang",
  // Truhe / Boden
  "chest_closed", "chest_open", "arrow_chest",
  "water_ripple_0", "water_ripple_1",
];

/** Alle realen Atlas-Frames inkl. echter Masse aus dem Audit-Beleg. */
const FULL_SIZES = (auditReport as { frames: { key: string; w: number; h: number }[] }).frames;

function gap(a: AtlasFrameRect, b: AtlasFrameRect): number {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.max(dx, dy);
}

function overlaps(a: AtlasFrameRect, b: AtlasFrameRect, pad: number): boolean {
  return !(
    a.x - pad + a.w + pad <= b.x - pad ||
    b.x - pad + b.w + pad <= a.x - pad ||
    a.y - pad + a.h + pad <= b.y - pad ||
    b.y - pad + b.h + pad <= a.y - pad
  );
}

describe("Runtime-Atlas", () => {
  it("Coverage: jeder erwartete Gegner-/Boss-Frame ist atlas-fähig", () => {
    const enemyFrames = Object.values(ALL_ENEMY_FRAMES).flat();
    const bossFrames = Object.values(ALL_BOSS_FRAMES).flat();
    expect(enemyFrames.length).toBeGreaterThan(0);
    expect(bossFrames.length).toBeGreaterThan(0);
    for (const key of [...enemyFrames, ...bossFrames]) {
      expect(shouldAtlasKey(key), `Frame ${key} fehlt in shouldAtlasKey`).toBe(true);
    }
  });

  it("Coverage: alle heissen Sprite-Klassen sind im Atlas (Gems, Projektile, Partikel, VFX)", () => {
    for (const key of HOT_KEYS) {
      expect(shouldAtlasKey(key), `heisse Textur ${key} wird nicht atlased`).toBe(true);
    }
    // Präfixe, die die heissen Klassen abdecken, müssen vorhanden sein.
    for (const p of ["enemy_", "boss_", "gem_", "fx_", "projectile_", "orb_",
      "enemy_shot_", "telegraph_", "ring_", "chest_", "flail_", "chain_", "puddle_"]) {
      expect(ATLAS_PREFIXES, `Präfix ${p} fehlt`).toContain(p);
    }
  });

  it("Atlas-Ausnahmen bleiben Einzeltexturen", () => {
    for (const key of ["light_radius", "vignette", "shadow", ATLAS_KEY]) {
      expect(shouldAtlasKey(key)).toBe(false);
    }
  });

  it("Gutter ≥ 2 px zwischen allen Zellen (horizontal und vertikal)", () => {
    const packed = packAtlas(FULL_SIZES);
    expect(FULL_SIZES.length).toBe(227);
    expect(packed.frames.length).toBe(FULL_SIZES.length);
    expect(ATLAS_GUTTER).toBeGreaterThanOrEqual(2);
    let minGap = Infinity;
    for (let i = 0; i < packed.frames.length; i++) {
      for (let j = i + 1; j < packed.frames.length; j++) {
        minGap = Math.min(minGap, gap(packed.frames[i], packed.frames[j]));
      }
    }
    expect(minGap).toBeGreaterThanOrEqual(ATLAS_GUTTER);
    // Mit 1-px-Padding ist der effektive Puffer ≥ 4 px.
    expect(minGap).toBeGreaterThanOrEqual(4);
  });

  it("keine Bleed-Fälle: 1-px-Padding jeder Zelle gehört exklusiv zu ihrem Frame", () => {
    expect(ATLAS_PAD).toBeGreaterThanOrEqual(1);
    const packed = packAtlas(FULL_SIZES);
    expect(packed.frames.length).toBe(227);
    for (const f of packed.frames) {
      expect(f.x - ATLAS_PAD).toBeGreaterThanOrEqual(0);
      expect(f.y - ATLAS_PAD).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w + ATLAS_PAD).toBeLessThanOrEqual(ATLAS_WIDTH);
      for (const other of packed.frames) {
        if (other === f) continue;
        expect(
          overlaps(f, other, ATLAS_PAD),
          `Frame ${f.key} blutet in ${other.key}`,
        ).toBe(false);
      }
    }
  });

  it("deterministische Atlas-Grösse unabhängig von der Eingabereihenfolge", () => {
    const a = packAtlas(FULL_SIZES);
    const shuffled = [...FULL_SIZES].sort((x, y) => (x.key < y.key ? 1 : x.key > y.key ? -1 : 0));
    const b = packAtlas(shuffled);
    expect(FULL_SIZES.length).toBe(227);
    expect(a.frames.length).toBe(227);
    expect(a.height).toBe(b.height);
    expect(a.width).toBe(b.width);
    expect(a.frames).toEqual(b.frames);
    expect(a.height).toBeGreaterThan(0);
    expect(a.width).toBe(1024);
  });

  it("Audit-Beleg bestätigt 100 % Coverage, Gutter ≥ 2 px und 0 Bleed", () => {
    const report = auditReport as {
      frameCount: number;
      coverage: { complete: boolean; percent: number; present: number; total: number; missing: string[]; uncoveredHotKeys: string[] };
      expected: { total: number };
      gutter: { ok: boolean; minGapPx: number; violations: unknown[] };
      bleed: { ok: boolean; count: number; cases: unknown[] };
      jsErrors: unknown[];
    };
    expect(report.coverage).toBeTruthy();
    expect(report.frameCount).toBe(227);
    expect(report.coverage.present).toBe(227);
    expect(report.coverage.total).toBe(227);
    expect(report.expected.total).toBe(227);
    expect(report.coverage.complete, "Coverage nicht complete").toBe(true);
    expect(report.coverage.percent).toBe(100);
    expect(report.coverage.missing).toEqual([]);
    expect(report.coverage.uncoveredHotKeys).toEqual([]);
    expect(report.gutter.ok, "Gutter-Verstoss").toBe(true);
    expect(report.gutter.minGapPx).toBeGreaterThanOrEqual(2);
    expect(report.gutter.violations).toEqual([]);
    expect(report.bleed.ok, "Bleed-Fall").toBe(true);
    expect(report.bleed.count).toBe(0);
    expect(report.bleed.cases).toEqual([]);
    expect(report.jsErrors).toEqual([]);
  });
});
