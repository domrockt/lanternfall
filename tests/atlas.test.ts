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
    expect(FULL_SIZES.length).toBeGreaterThanOrEqual(227); // nie unter dem m10-atlas-gaps-Stand
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
    expect(packed.frames.length).toBe(FULL_SIZES.length);
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

  it("Bleed-Invariante zwischen benachbarten Frames: Padding-Ring bleibt fremdfrei", () => {
    const packed = packAtlas(FULL_SIZES);
    // Jeder Frame, um ATLAS_PAD erweitert, darf keinen fremden Frame-Inhalt
    // berühren — GPU-Sampling an der Kante kann den Padding-Ring treffen.
    const gapOfExpanded = (a: AtlasFrameRect, b: AtlasFrameRect): number => {
      const ax = a.x - ATLAS_PAD, ay = a.y - ATLAS_PAD;
      const bx = b.x - ATLAS_PAD, by = b.y - ATLAS_PAD;
      const aw = a.w + 2 * ATLAS_PAD, ah = a.h + 2 * ATLAS_PAD;
      const bw = b.w + 2 * ATLAS_PAD, bh = b.h + 2 * ATLAS_PAD;
      return Math.max(
        Math.max(bx - (ax + aw), ax - (bx + bw)),
        Math.max(by - (ay + ah), ay - (by + bh)),
      );
    };
    let adjacentPairs = 0;
    for (const f of packed.frames) {
      for (const other of packed.frames) {
        if (other === f) continue;
        // Nachbar = erweiterte Rechtecke berühren sich bis auf den Gutter.
        if (gapOfExpanded(f, other) <= ATLAS_GUTTER) adjacentPairs++;
        // Inhalt des anderen Frames darf nie im (um PAD erweiterten) Eigenbereich liegen.
        const insidePad =
          other.x + other.w > f.x - ATLAS_PAD && other.x < f.x + f.w + ATLAS_PAD &&
          other.y + other.h > f.y - ATLAS_PAD && other.y < f.y + f.h + ATLAS_PAD;
        expect(insidePad, `Inhalt von ${other.key} liegt im Padding-Ring von ${f.key}`).toBe(false);
      }
    }
    // Der Datensatz enthält echte Nachbarn (sonst prüft der Test nichts).
    expect(adjacentPairs).toBeGreaterThan(0);
  });

  it("Bleed-Invariante im Worst Case: lauter gleich grosse Frames", () => {
    const worst: { key: string; w: number; h: number }[] = [];
    for (let i = 0; i < 200; i++) worst.push({ key: `wx_${i}`, w: 64, h: 64 });
    const packed = packAtlas(worst);
    expect(packed.frames.length).toBe(worst.length);
    for (const f of packed.frames) {
      for (const other of packed.frames) {
        if (other === f) continue;
        expect(
          overlaps(f, other, ATLAS_PAD),
          `Worst-Case-Frame ${f.key} blutet in ${other.key}`,
        ).toBe(false);
      }
    }
    let minGap = Infinity;
    for (let i = 0; i < packed.frames.length; i++) {
      for (let j = i + 1; j < packed.frames.length; j++) {
        minGap = Math.min(minGap, gap(packed.frames[i], packed.frames[j]));
      }
    }
    expect(minGap).toBeGreaterThanOrEqual(ATLAS_GUTTER);
  });

  it("deterministische Atlas-Grösse unabhängig von der Eingabereihenfolge", () => {
    const a = packAtlas(FULL_SIZES);
    const shuffled = [...FULL_SIZES].sort((x, y) => (x.key < y.key ? 1 : x.key > y.key ? -1 : 0));
    const b = packAtlas(shuffled);
    expect(a.frames.length).toBe(FULL_SIZES.length);
    expect(a.height).toBe(b.height);
    expect(a.width).toBe(b.width);
    expect(a.frames).toEqual(b.frames);
    expect(a.height).toBeGreaterThan(0);
    expect(a.width).toBe(1024);
  });

  it("Audit-Beleg bestätigt 100 % Coverage, Gutter ≥ 2 px und 0 Bleed", () => {
    const report = auditReport as {
      frameCount: number;
      frames: { key: string; w: number; h: number }[];
      coverage: { complete: boolean; percent: number; present: number; total: number; missing: string[]; uncoveredHotKeys: string[] };
      prefixes: { prefix: string; existing: number; inAtlas: number; uncovered: string[] }[];
      expected: { total: number };
      gutter: { ok: boolean; minGapPx: number; violations: unknown[] };
      bleed: { ok: boolean; count: number; cases: unknown[]; contentMismatches: unknown[] };
      jsErrors: unknown[];
    };
    expect(report.coverage).toBeTruthy();
    // Frame-Zahl aus dem Audit-Beleg selbst ableiten (statt sie hart zu pinnen):
    // Abweichung JSON <-> Frames-Liste waere ein ungültiger Beleg.
    expect(report.frameCount).toBe(report.frames.length);
    expect(report.frameCount).toBe(report.coverage.total);
    expect(report.frameCount).toBeGreaterThanOrEqual(227); // m10-atlas-gaps-Fuss
    expect(report.coverage.present).toBe(report.coverage.total);
    expect(report.expected.total).toBe(report.coverage.total);
    expect(report.coverage.complete, "Coverage nicht complete").toBe(true);
    expect(report.coverage.percent).toBe(100);
    expect(report.coverage.missing).toEqual([]);
    expect(report.coverage.uncoveredHotKeys).toEqual([]);
    // Jede heisse Prefix-Klasse vollständig erfasst (K1-Kriterium).
    expect(report.prefixes.length).toBe(ATLAS_PREFIXES.length);
    // Befund K1/K2 (m10-atlas-gutter): diese Prefixe matchen aktuell 0
    // Texturen. "arrow_chest": Textur im M6-robust-Refactor verloren (siehe
    // docs/lanes/m10-atlas-gutter.md + requests.md) — Prefix bleibt, damit die
    // wiedereingerichtete Textur automatisch atlasiert. "bone_": Boss wirft
    // enemy_shot_bone, kein eigenes bone_boomerang-Sprite mehr.
    const DEAD_PREFIXES = ["arrow_chest", "bone_"];
    for (const p of report.prefixes) {
      expect(p.uncovered, `Prefix ${p.prefix} hat nicht atlasierte Keys`).toEqual([]);
      if (p.inAtlas === 0) {
        expect(DEAD_PREFIXES, `Prefix ${p.prefix} deckt keine Textur (neuer toter Prefix?)`).toContain(p.prefix);
      }
    }
    expect(report.gutter.ok, "Gutter-Verstoss").toBe(true);
    expect(report.gutter.minGapPx).toBeGreaterThanOrEqual(2);
    expect(report.gutter.violations).toEqual([]);
    expect(report.bleed.ok, "Bleed-Fall").toBe(true);
    expect(report.bleed.count).toBe(0);
    expect(report.bleed.cases).toEqual([]);
    expect(report.bleed.contentMismatches, "Frame-Inhalt weicht von der Quelle ab").toEqual([]);
    expect(report.jsErrors).toEqual([]);
  });
});
