import { describe, expect, it } from "vitest";
import { charIndex, SPRITE_GRIDS } from "../src/gfx/textures";
import { shouldAtlasKey } from "../src/gfx/atlas";

/**
 * m10-gem-rows-texture: Die Gem-Grids lesen ihren Wert visuell über eine
 * Farb-Rampe Silber/Gold/Rubin (Bedarfsmeldung der Lane m10-gem-value-reading,
 * Versuch 2, 2026-11-28T09:05Z). Der r3-Patch dieser Lane übernimmt den
 * art-director-geprüften Stand (r2 4,5/5 auf dem Chaos-Frame):
 *   - gem_small  = Silber-Ende: bone (PAL 10) + candleWhite-Glanz (12)
 *     + 1 px lanternWhite-Sparkle (13). r1 mist war exakte Rat-Flankenfarbe
 *     (art-director FAIL), r2 fogBlue kollidierte zu 29,45 % mit Moor-Boden.
 *   - gem_medium = Gold: Bernstein/Laterne (PAL 20/21) + lanternWhite-Sparkle.
 *   - gem_large  = Rubin: Karmesin/heisse Kante (PAL 25/26) — unverändert.
 * Gesichert werden: Dimensionen unverändert (Pixel-Grid, Draw-Scale 1,
 * Mixel-Regel — keine Skalierungs-/Antialias-Farbe), binäres Alpha,
 * Rampenfarben pro Stufe, 1-px-Ink-Kontur und Atlas-Pfad.
 */

const small = SPRITE_GRIDS.gem_small;
const medium = SPRITE_GRIDS.gem_medium;
const large = SPRITE_GRIDS.gem_large;

/** Zeichen in einem Grid zählen (ohne transparent "."). */
const countChar = (rows: readonly string[], ch: string): number =>
  rows.join("").split("").filter((c) => c === ch).length;

describe("gem_small — Silber-Ende der Rampe (r3)", () => {
  it("bleibt 7x7 (Pixel-Grid, Mixel-Regel: Draw-Scale 1, keine Skalierung)", () => {
    expect(small.w).toBe(7);
    expect(small.h).toBe(7);
    expect(small.rows).toHaveLength(7);
    for (const row of small.rows) expect(row).toHaveLength(7);
  });

  it("nutzt nur transparente Pixel oder Palettenindizes 0-31 (binäres Alpha)", () => {
    for (const row of small.rows) {
      for (const ch of row) {
        if (ch === ".") continue;
        const i = charIndex(ch);
        expect(i, `Zeichen "${ch}"`).toBeGreaterThanOrEqual(0);
        expect(i, `Zeichen "${ch}"`).toBeLessThan(32);
      }
    }
  });

  it("Kern = bone (PAL 10), Glanz = candleWhite (12), Sparkle = 1 px lanternWhite (13)", () => {
    expect(countChar(small.rows, "a"), "bone-Kern PAL 10").toBe(14);
    expect(countChar(small.rows, "c"), "candleWhite-Glanz PAL 12").toBe(2);
    expect(countChar(small.rows, "d"), "lanternWhite-Sparkle PAL 13").toBe(1);
  });

  it("nutzt NICHT die gescheiterten Kandidaten mist (8) und fogBlue (6)", () => {
    // r1 mist = exakte Bog-Rat-Flankenfarbe (art-director FAIL);
    // r2 fogBlue = 29,45 % Moor-Boden-Kollision (gem-reading-after.json).
    expect(countChar(small.rows, "8")).toBe(0);
    expect(countChar(small.rows, "6")).toBe(0);
  });

  it("behält die 1-px-Ink-Kontur (0)", () => {
    expect(countChar(small.rows, "0")).toBeGreaterThan(0);
  });
});

describe("gem_medium — Gold-Stufe mit Sparkle", () => {
  it("bleibt 9x9 (Pixel-Grid, Mixel-Regel)", () => {
    expect(medium.w).toBe(9);
    expect(medium.h).toBe(9);
    expect(medium.rows).toHaveLength(9);
    for (const row of medium.rows) expect(row).toHaveLength(9);
  });

  it("nutzt nur transparente Pixel oder Palettenindizes 0-31 (binäres Alpha)", () => {
    for (const row of medium.rows) {
      for (const ch of row) {
        if (ch === ".") continue;
        const i = charIndex(ch);
        expect(i, `Zeichen "${ch}"`).toBeGreaterThanOrEqual(0);
        expect(i, `Zeichen "${ch}"`).toBeLessThan(32);
      }
    }
  });

  it("Kern = amber (20) + lantern (21), heller Kern = 3 px lanternWhite (13)", () => {
    expect(countChar(medium.rows, "k"), "amber PAL 20").toBe(19);
    expect(countChar(medium.rows, "l"), "lantern PAL 21").toBe(15);
    expect(countChar(medium.rows, "d"), "lanternWhite-Sparkle PAL 13").toBe(3);
  });
});

describe("gem_large — Rubin-Stufe (unverändert)", () => {
  it("bleibt Karmesin/heisse Kante (PAL 25/26) in 11x11", () => {
    expect(large.w).toBe(11);
    expect(large.h).toBe(11);
    expect(countChar(large.rows, "p"), "karmesin PAL 25").toBeGreaterThan(0);
    expect(countChar(large.rows, "q"), "heisse Kante PAL 26").toBeGreaterThan(0);
  });
});

describe("Atlas-Pfad", () => {
  it("gem-Keys laufen über den Runtime-Atlas (Mixel-Bake, nearest)", () => {
    expect(shouldAtlasKey("gem_small")).toBe(true);
    expect(shouldAtlasKey("gem_medium")).toBe(true);
    expect(shouldAtlasKey("gem_large")).toBe(true);
  });
});
