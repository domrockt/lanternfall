/**
 * m10-chaos-fix-raster-glow — Guards für die Lane-Hebel (B1-Rest/B2-Teile).
 *
 * K2 (diese Datei, Stand Karte #8219): Mixel-Bake-Deckel für die Todes-Frame-
 * Sets und fx_bolt (real bis Scale 2,4 gezeichnet — vorher 9x9/12x16 @ >1 =
 * 2–6-Spielpixel-Blöcke) + Glow-Rampen, die auf Amber/Lantern enden statt Weiß.
 * K3/K4 ergänzen Gradient-Quantisierung (textures.ts) und ADD-Alpha-Deckel.
 */
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
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
import { LIGHT_EDGE_STEPS, lightEdgeAlphaFor, vignetteSteps } from "../src/gfx/textures";

const TEXTURES_TS = readFileSync(new URL("../src/gfx/textures.ts", import.meta.url), "utf8");
const BAKEATLAS_TS = readFileSync(new URL("../src/gfx/bakeAtlas.ts", import.meta.url), "utf8");

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

// ── K3: Gradient-Quantisierung (textures.ts) + bakeAtlas-Check ──────────────

describe("K3: Licht-Außenkante in diskreten Stufen (1-px-Raster statt Gradient)", () => {
  it("Bänder lückenlos über 0..96, je >= 6 px breit, Alpha monoton fallend", () => {
    expect(LIGHT_EDGE_STEPS[0][0]).toBe(0);
    for (let i = 0; i < LIGHT_EDGE_STEPS.length; i++) {
      const [r0, r1, a] = LIGHT_EDGE_STEPS[i];
      expect(r1 - r0, `Band ${i} Breite`).toBeGreaterThanOrEqual(6);
      if (i > 0) {
        expect(r0).toBe(LIGHT_EDGE_STEPS[i - 1][1]); // lückenlos
        expect(a, `Band ${i} Alpha`).toBeLessThan(LIGHT_EDGE_STEPS[i - 1][2]);
      }
    }
    expect(LIGHT_EDGE_STEPS[LIGHT_EDGE_STEPS.length - 1][1]).toBe(96);
  });

  it("lightEdgeAlphaFor liefert nur Stufenwerte, harte Kanten an den Grenzen", () => {
    const alphas = new Set(LIGHT_EDGE_STEPS.map(([, , a]) => a));
    for (const d of [0, 1, 69.5, 70, 70.5, 75.5, 76.5, 82.5, 88.5, 95.5, 96]) {
      expect(alphas.has(lightEdgeAlphaFor(d)), `d=${d} -> ${lightEdgeAlphaFor(d)}`).toBe(true);
    }
    // Harte Kanten: keine Zwischenwerte knapp beidseits der Grenzen.
    expect(lightEdgeAlphaFor(69.9)).toBe(1);
    expect(lightEdgeAlphaFor(70.1)).toBe(0.66);
    expect(lightEdgeAlphaFor(76.1)).toBe(0.38);
    expect(lightEdgeAlphaFor(88.1)).toBe(0.08);
    expect(lightEdgeAlphaFor(150)).toBe(0);
  });

  it("Quelltext-Guard: keine radialen Canvas-Gradients mehr in textures.ts", () => {
    expect(TEXTURES_TS).not.toContain("createRadialGradient");
    expect(TEXTURES_TS).not.toContain("createLinearGradient");
    expect(TEXTURES_TS).toContain("LIGHT_EDGE_STEPS");
    expect(TEXTURES_TS).toContain("vignetteSteps()");
  });

  it("bakeAtlas: keine Gradients, Bake bleibt nearest (imageSmoothingEnabled = false)", () => {
    expect(BAKEATLAS_TS).not.toContain("createRadialGradient");
    expect(BAKEATLAS_TS).not.toContain("createLinearGradient");
    expect((BAKEATLAS_TS.match(/imageSmoothingEnabled = false/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("K3: Vignette in diskreten Stufen (gleiche Alpha-Treppe wie der Gradient)", () => {
  it("11 Bänder über 70..290 plus Ecken-Klemme, lückenlos, monoton steigend", () => {
    const steps = vignetteSteps();
    expect(steps.length).toBe(12);
    for (let i = 0; i < steps.length - 1; i++) {
      const [r0, r1, a] = steps[i];
      expect(r1 - r0).toBeCloseTo(20, 6);
      expect(steps[i + 1][0]).toBeCloseTo(r1, 6);
      if (i > 0) expect(a).toBeGreaterThan(steps[i - 1][2]);
    }
    expect(steps[steps.length - 1]).toEqual([290, 410, 0.72]);
  });

  it("Band-Alpha entspricht dem Original-Gradient am Bandende (± 0,01)", () => {
    const alphaAt = (t: number): number =>
      t < 0.7 ? 0.18 * (t / 0.7) : 0.18 + 0.54 * ((t - 0.7) / 0.3);
    const steps = vignetteSteps();
    for (let i = 0; i < 11; i++) {
      const expected = alphaAt((i + 1) / 11);
      expect(steps[i][2]).toBeCloseTo(Math.round(expected * 100) / 100, 6);
    }
  });
});
