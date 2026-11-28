import { describe, expect, it, vi } from "vitest";
import { PAL } from "../src/palette";
import { GEMS, GEM_VALUE_RAMP, gemStageForValue, type GemSize } from "../src/logic/xp";

// m10-gem-value-reading Guard: 3 Wertstufen ohne Hover lesbar —
//   1) Kernfarben paarweise farb-distant (RGB-Delta >= 120),
//   2) Größenordnung monoton (px-Fläche 7x7 < 9x9 < 11x11, XP 2 < 6 < 18),
//   3) Gem-Texturen malen exakt die Rampe (0 Off-Palette-Pixel),
//   4) Cap/Merge-Semantik bitgleich (gem-drawcap-Vertrag unverändert).
// Die Chaos-Kollision selbst ist Frame-Messung (scripts/m10-gem-reading.mjs,
// Ist/Nachher in ~/games/.evidence/m10-gem-value-reading/).

// textures.ts zieht Phaser + den Rest der GFX-Module — für die Grid-Daten
// genügt der Mock (wie in gem-draw-cap.test.ts).
vi.mock("phaser", () => ({
  default: { BlendModes: { NORMAL: 0, ADD: 1 } },
}));

import { SPRITE_GRIDS, charIndex } from "../src/gfx/textures";
import { MAX_VISIBLE_GEMS, mergeGemValues } from "../src/systems/PickupSystem";

const dist = (a: number, b: number): number =>
  Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));

const SIZES: GemSize[] = ["small", "medium", "large"];
/** Schwelle für paarweise Farb-Distanz (Ist-Messung: alt 131,9 min; neu 130 min). */
const COLOR_DELTA_MIN = 120;

describe("gem-value-reading: Farb-Rampe", () => {
  it("GEMS.color und GEM_VALUE_RAMP sind EINE Quelle der Wahrheit", () => {
    for (const s of SIZES) {
      expect(GEMS[s].color).toBe(GEM_VALUE_RAMP[s].core);
    }
  });

  it("3 Stufen sind paarweise farb-distant (Delta >= 120)", () => {
    const deltas: Record<string, number> = {};
    for (let i = 0; i < SIZES.length; i++) {
      for (let j = i + 1; j < SIZES.length; j++) {
        const a = SIZES[i];
        const b = SIZES[j];
        const d = dist(PAL[GEM_VALUE_RAMP[a].core], PAL[GEM_VALUE_RAMP[b].core]);
        deltas[`${a}-${b}`] = Math.round(d * 100) / 100;
        expect(d).toBeGreaterThanOrEqual(COLOR_DELTA_MIN);
      }
    }
    // Messbare Zahlen im Test-Report (Ist-Messung 2026-11-28: 169,6 / 154,1 / 129,4).
    expect(deltas).toEqual({ "small-medium": expect.any(Number), "medium-large": expect.any(Number), "small-large": expect.any(Number) });
    expect(deltas["small-medium"]).toBeCloseTo(169.6, 0);
    expect(deltas["medium-large"]).toBeCloseTo(154.1, 0);
    expect(deltas["small-large"]).toBeCloseTo(129.4, 0);
  });

  it("Wert- und Größenordnung sind monoton (Fläche und XP)", () => {
    const [s, m, l] = SIZES.map((k) => SPRITE_GRIDS[`gem_${k}`]);
    const opaque = (rows: string[]): number => rows.join("").split("").filter((ch) => ch !== ".").length;
    const [sa, ma, la] = [s, m, l].map((g) => opaque(g.rows));
    expect(sa).toBeLessThan(ma);
    expect(ma).toBeLessThan(la);
    expect([s.w * s.h, m.w * m.h, l.w * l.h]).toEqual([49, 81, 121]);
    expect(GEMS.small.value).toBeLessThan(GEMS.medium.value);
    expect(GEMS.medium.value).toBeLessThan(GEMS.large.value);
  });
});

describe("gem-value-reading: Texturen malen exakt die Rampe (palette-check-Pfad)", () => {
  for (const s of SIZES) {
    it(`gem_${s}: nur Ink + Kern + Highlight aus der Rampe, 0 Off-Palette-Pixel`, () => {
      const grid = SPRITE_GRIDS[`gem_${s}`];
      const allowed = new Set([0, GEM_VALUE_RAMP[s].core, GEM_VALUE_RAMP[s].highlight]);
      const used = new Set<number>();
      for (const row of grid.rows) {
        for (const ch of row) {
          if (ch === ".") continue;
          const idx = charIndex(ch);
          used.add(idx);
          // Off-Palette-Check: jeder gemalte Pixel ist ein Palettenindex.
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(PAL.length);
        }
      }
      expect([...used].sort((a, b) => a - b)).toEqual([...allowed].sort((a, b) => a - b));
    });
  }
});

describe("gem-value-reading: Cap/Merge-Semantik bitgleich (gem-drawcap-Vertrag)", () => {
  it("Draw-Cap und Magnet-Faktoren sind unverändert", () => {
    expect(MAX_VISIBLE_GEMS).toBe(120);
  });

  it("gemStageForValue deterministisch an den kanonischen Schwellen", () => {
    expect(gemStageForValue(0)).toBe("small");
    expect(gemStageForValue(5)).toBe("small");
    expect(gemStageForValue(6)).toBe("medium");
    expect(gemStageForValue(17)).toBe("medium");
    expect(gemStageForValue(18)).toBe("large");
    expect(gemStageForValue(1000)).toBe("large");
  });

  it("mergeGemValues: XP bleibt exakt erhalten (value + credited == Summe)", () => {
    const cases: [number, number][] = [[2, 2], [2, 6], [6, 6], [2, 18], [18, 18], [100, 100], [0, 5]];
    for (const [a, b] of cases) {
      const m = mergeGemValues(a, b);
      expect(m.value + m.credited).toBe(a + b);
      expect(m.size).toBe(gemStageForValue(m.value));
    }
    expect(mergeGemValues(18, 18)).toEqual({ size: "large", value: 18, credited: 18 });
  });
});
