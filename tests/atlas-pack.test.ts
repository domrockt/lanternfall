import { describe, expect, it } from "vitest";
import {
  BAKE_PREFIXES,
  BAKED_GUTTER,
  BAKED_PAGE_SIZE,
  BAKED_PAD,
  packPages,
  shouldBakeKey,
  type PackedFrame,
} from "../src/gfx/atlas";

/** Reale Groessenklassen der gebackenen Texturen (Props, Icons, Player, Portraits, Glyphen). */
const REAL_SIZES: { key: string; w: number; h: number }[] = [
  // Glyphen 5x7, mehrere Farben
  ...Array.from({ length: 250 }, (_, i) => ({ key: `glyph_${7 + (i % 8)}_${i}`, w: 5, h: 7 })),
  // Icons 16x16
  ...Array.from({ length: 18 }, (_, i) => ({ key: `icon_x_${i}`, w: 16, h: 16 })),
  // Player-Frames bis 32x32
  ...Array.from({ length: 52 }, (_, i) => ({ key: `player_frame_${i}`, w: 16 + (i % 3) * 8, h: 16 + (i % 4) * 8 })),
  // Props bis 48x64
  ...Array.from({ length: 13 }, (_, i) => ({ key: `prop_${i}`, w: 16 + (i % 5) * 8, h: 24 + (i % 6) * 8 })),
  // Portraits 48x48
  { key: "portrait_mira", w: 48, h: 48 },
  { key: "portrait_kael", w: 48, h: 48 },
];

function cellOf(f: PackedFrame): { x: number; y: number; w: number; h: number } {
  return { x: f.x - BAKED_PAD, y: f.y - BAKED_PAD, w: f.w + BAKED_PAD * 2, h: f.h + BAKED_PAD * 2 };
}

/** Zell-Abstand (negativ = Ueberlappung). */
function gap(a: PackedFrame, b: PackedFrame): number {
  const ca = cellOf(a);
  const cb = cellOf(b);
  const dx = Math.max(cb.x - (ca.x + ca.w), ca.x - (cb.x + cb.w));
  const dy = Math.max(cb.y - (ca.y + ca.h), ca.y - (cb.y + cb.h));
  return Math.max(dx, dy);
}

describe("Baked-Atlas-Seiten (packPages)", () => {
  it("packt alle realen Klein-Texturen ohne Overflow", () => {
    const packed = packPages(REAL_SIZES);
    expect(packed.overflow).toEqual([]);
    expect(packed.frames.length).toBe(REAL_SIZES.length);
  });

  it("Seiten sind <= 2048 px und alle Frames liegen innerhalb ihrer Seite", () => {
    const packed = packPages(REAL_SIZES);
    expect(packed.pages.length).toBeGreaterThanOrEqual(1);
    expect(packed.pages.length).toBeLessThanOrEqual(3);
    for (const page of packed.pages) {
      expect(page.width).toBeLessThanOrEqual(BAKED_PAGE_SIZE);
      expect(page.height).toBeLessThanOrEqual(BAKED_PAGE_SIZE);
    }
    for (const f of packed.frames) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(BAKED_PAGE_SIZE);
      expect(f.y + f.h).toBeLessThanOrEqual(BAKED_PAGE_SIZE);
    }
  });

  it("keine Ueberlappung; Abstand zwischen Zellen >= Gutter + 2*Pad", () => {
    const packed = packPages(REAL_SIZES);
    let minGap = Infinity;
    for (let i = 0; i < packed.frames.length; i++) {
      for (let j = i + 1; j < packed.frames.length; j++) {
        const a = packed.frames[i];
        const b = packed.frames[j];
        if (a.page !== b.page) continue;
        minGap = Math.min(minGap, gap(a, b));
      }
    }
    expect(minGap).toBeGreaterThanOrEqual(BAKED_GUTTER);
    expect(minGap).toBeGreaterThanOrEqual(2 * BAKED_PAD);
  });

  it("deterministisch: gemischte Eingabe ergibt identische Seiten und Frames", () => {
    const a = packPages(REAL_SIZES);
    const shuffled = [...REAL_SIZES].sort((x, y) => (x.key < y.key ? 1 : -1));
    const b = packPages(shuffled);
    expect(a.pages.length).toBe(b.pages.length);
    expect(a.frames).toEqual(b.frames);
  });

  it("zu grosse Frames gehen als Overflow durch und werden nicht gepackt", () => {
    const packed = packPages([
      { key: "ok", w: 10, h: 10 },
      { key: "too_wide", w: BAKED_PAGE_SIZE, h: 5 },
      { key: "too_tall", w: 5, h: BAKED_PAGE_SIZE + 1 },
    ]);
    expect(packed.overflow).toEqual(["too_tall", "too_wide"]);
    expect(packed.frames.map((f) => f.key)).toEqual(["ok"]);
  });

  it("Padding-Definition: 1 px Rand um jede Zelle gegen Bleeding", () => {
    expect(BAKED_PAD).toBeGreaterThanOrEqual(1);
    expect(BAKED_GUTTER).toBeGreaterThanOrEqual(2);
  });
});

describe("Bake-Coverage", () => {
  it("alle statischen Klein-Texturen sind bake-faehig", () => {
    for (const key of [
      "prop_tree_a", "prop_stump", "prop_boulder",
      "icon_weapon_ember", "icon_passive_heart",
      "player_mira_down_0", "player_kael_side_3",
      "portrait_mira", "portrait_kael",
      "glyph_13_65", "glyph_21_49",
    ]) {
      expect(shouldBakeKey(key), `${key} fehlt in shouldBakeKey`).toBe(true);
    }
  });

  it("nicht bake-faehige Keys bleiben unberuehrt", () => {
    for (const key of ["enemy_bog_rat", "fx_spark", "gem_small", "runtime_atlas", "baked_page_0", "chunk_12_3"]) {
      expect(shouldBakeKey(key)).toBe(false);
    }
  });

  it("BAKE_PREFIXES deckt die gemessenen heissen Gruppen ab (K1: prop/icon/player/portrait/glyph)", () => {
    for (const p of ["prop_", "icon_", "player_", "portrait_", "glyph_"]) {
      expect(BAKE_PREFIXES).toContain(p);
    }
  });
});
