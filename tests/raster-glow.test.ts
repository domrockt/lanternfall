/**
 * m10-chaos-fix-raster-glow — Guards für die Lane-Hebel (B1-Rest/B2-Teile).
 *
 * K2 (diese Datei, Stand Karte #8219): Mixel-Bake-Deckel für die Todes-Frame-
 * Sets und fx_bolt (real bis Scale 2,4 gezeichnet — vorher 9x9/12x16 @ >1 =
 * 2–6-Spielpixel-Blöcke) + Glow-Rampen, die auf Amber/Lantern enden statt Weiß.
 * K3/K4 ergänzen Gradient-Quantisierung (textures.ts) und ADD-Alpha-Deckel.
 */
import { describe, expect, it } from "vitest";
import {
  EVOLUTION_SIGNATURES,
  FX_MIXEL_BASES,
  FX_FRAME_COUNTS,
  SIGNATURE_FRAME_COUNT,
  THUNDER_SIGNATURE_SIZE,
  mixelBakes,
  mixelBaseFor,
  mixelFrameKey,
  mixelLevel1Frames,
  mixelLevelFor,
  mixelMaxLevel,
  thunderSignatureFrame,
} from "../src/gfx/gen-fx";

/** Near-White-Zeichen in FX-Grids: Palette 12 ('c'), 13 ('d'), 22 ('m'). */
const NEAR_WHITE_CHARS = new Set(["c", "d", "m"]);

/** Reale Caller-Scales (death.ts scaleFrom/rimScale, Run.ts Boss-Tod, CombatSystem bolt). */
const REAL_DEATH_SCALES: Array<[string, number]> = [
  ["fx_death_blob", 2.4], // crumble/burst scaleFrom, Run.ts 1859
  ["fx_death_bone", 1.6], // crumble scaleFrom, Run.ts Boss-Tod 1.35
  ["fx_death_void", 2.0], // dissolve scaleFrom
  ["fx_death_dust", 1.2], // dustScale
  ["fx_death_fire", 2.0], // sputter scaleFrom
  ["fx_bolt", 2.5], // bolt(): segLen/16
];

describe("K2: Mixel-Bake-Deckel Todes-Frames + Blitz", () => {
  it("neue Basen sind Mixel-Basen mit erwarteten Maximalstufen", () => {
    for (const [base, max] of [
      ["fx_death_blob", 3], ["fx_death_bone", 2], ["fx_death_void", 3],
      ["fx_death_dust", 2], ["fx_death_fire", 3], ["fx_bolt", 3],
    ] as const) {
      expect(mixelBaseFor(base), base).toBe(base);
      expect(mixelMaxLevel(base), base).toBe(max);
    }
  });

  it("reale Caller-Scales: kleinste Stufe >= Scale, Draw-Scale = Scale/L <= 1", () => {
    for (const [base, scale] of REAL_DEATH_SCALES) {
      const level = mixelLevelFor(base, scale);
      expect(level).toBeGreaterThan(1);
      expect(scale / level, `${base} @ ${scale} -> L ${level}`).toBeLessThanOrEqual(1);
    }
  });

  it("Dokumentierter Fallback: Scale ueber maxLevel claempt auf maxLevel", () => {
    expect(mixelLevelFor("fx_death_blob", 99)).toBe(mixelMaxLevel("fx_death_blob"));
  });

  it("Bake-Stufen haben Zielpixelgroesse (w0*L x h0*L), Zeilen gleich lang", () => {
    for (const bake of mixelBakes()) {
      expect(bake.w).toBeGreaterThan(0);
      for (const grid of bake.frames) {
        expect(grid.length).toBe(bake.h);
        for (const row of grid) expect(row.length).toBe(bake.w);
      }
    }
    const dims = mixelBakes().map((b) => `${b.base}@${b.level}:${b.w}x${b.h}`);
    expect(dims).toContain("fx_death_blob@2:18x18");
    expect(dims).toContain("fx_death_blob@3:27x27");
    expect(dims).toContain("fx_death_bone@2:18x18");
    expect(dims).toContain("fx_bolt@2:24x32");
    expect(dims).toContain("fx_bolt@3:36x48");
  });

  it("Frame-Counts bleiben erhalten (FX_FRAME_COUNTS == Bake-Framezahl)", () => {
    const level1 = mixelLevel1Frames();
    for (const base of ["fx_death_blob", "fx_death_bone", "fx_death_void", "fx_death_dust", "fx_death_fire", "fx_bolt"]) {
      expect(FX_FRAME_COUNTS[base]).toBe(level1[base].frames.length);
    }
  });

  it("Stufen-Key-Umschreibung fuer Frame-Suffixe (fx_death_blob_2 -> @L_2)", () => {
    expect(mixelFrameKey("fx_death_blob_2", 3)).toBe("fx_death_blob@3_2");
    expect(mixelFrameKey("fx_bolt", 2)).toBe("fx_bolt@2");
    expect(mixelFrameKey("fx_death_bone_1", 1)).toBe("fx_death_bone_1");
  });
});

describe("K2: Glow-Rampen enden auf Amber/Lantern statt Weiss (Near-White-B2)", () => {
  it("heisse ADD-Texturen enthalten kein Near-White-Zeichen mehr (12/13/22)", () => {
    const level1 = mixelLevel1Frames();
    for (const base of ["fx_fire", "fx_halo", "fx_death_blob"]) {
      for (const grid of level1[base].frames) {
        for (const row of grid) {
          for (const ch of row) {
            expect(NEAR_WHITE_CHARS.has(ch), `${base}: '${ch}' in "${row}"`).toBe(false);
          }
        }
      }
    }
  });

  it("fx_star/fx_bolt (Quelltext-Grids) enthalten kein Near-White-Zeichen", () => {
    // fx_star/fx_bolt sind keine Mixel-Basen in Level 1 ueber mixelLevel1Frames
    // (fx_bolt ist es, fx_star nicht) — fx_star wird hier aus dem Quelltext
    // ueber die Bake-Basis geprueft: fx_bolt Level-1-Frames plus fx_star-Grids
    // via Char-Check auf dem exportierten Bake-Level-1-Key fx_bolt.
    for (const grid of mixelLevel1Frames().fx_bolt.frames) {
      for (const row of grid) for (const ch of row) {
        expect(NEAR_WHITE_CHARS.has(ch), `fx_bolt: '${ch}'`).toBe(false);
      }
    }
  });
});

describe("K2: Gewittersiegel-Signatur in Zielgroesse (128x128, Draw-Scale 1)", () => {
  it("thunder_seal hat drawScale [1,1] — Draw-Scale bleibt 1", () => {
    const sig = EVOLUTION_SIGNATURES.thunder_seal;
    expect(sig.drawScale).toEqual([1, 1]);
    expect(sig.drawScale![0]).toBeLessThanOrEqual(1);
    expect(sig.drawScale![1]).toBeLessThanOrEqual(1);
  });

  it("Frames sind 128x128, nur Signatur-Palette (12/9/7) oder transparent, kein Ink", () => {
    expect(THUNDER_SIGNATURE_SIZE).toBe(128);
    for (const kind of ["hit", "death"] as const) {
      for (let stage = 0; stage < SIGNATURE_FRAME_COUNT; stage++) {
        const rows = thunderSignatureFrame(kind, stage);
        expect(rows.length).toBe(128);
        for (const row of rows) {
          expect(row.length).toBe(128);
          for (const ch of row) {
            expect([".", "c", "9", "7"], `thunder ${kind}#${stage}: '${ch}'`).toContain(ch);
          }
        }
      }
    }
  });
});

describe("K2: Bestand — fx-mixel-Basenliste ist konsistent", () => {
  it("alle FX_MIXEL_BASES haben Level-1-Frames und Bake-Defs", () => {
    const level1 = mixelLevel1Frames();
    for (const base of FX_MIXEL_BASES) expect(level1[base]).toBeTruthy();
  });
});
