import { describe, expect, it } from "vitest";
import { PROP_DENSITY_N1, PROP_DENSITY_N2, propDensityMaxTier } from "../src/logic/lod";
import { PROP_KEYS, propTierFor, visibleBatchCount } from "../src/gfx/propLayers";

/** Sichtbare Prop-Texturen bei einer Gegnerzahl (maxTier-Regel, wie GroundRenderer). */
function visibleKeys(enemies: number): string[] {
  const maxTier = propDensityMaxTier(enemies);
  return [...PROP_KEYS].filter((k) => propTierFor(k) <= maxTier);
}

describe("prop-density-lod (m10-prop-density-lod)", () => {
  it("Stufen: voll < N1, grosse Strukturen ab N1, nur Landmarken ab N2", () => {
    expect(propDensityMaxTier(0)).toBe(2);
    expect(propDensityMaxTier(PROP_DENSITY_N1 - 1)).toBe(2);
    expect(propDensityMaxTier(PROP_DENSITY_N1)).toBe(1);
    expect(propDensityMaxTier(PROP_DENSITY_N2 - 1)).toBe(1);
    expect(propDensityMaxTier(PROP_DENSITY_N2)).toBe(0);
    expect(propDensityMaxTier(PROP_DENSITY_N2 + 100)).toBe(0);
  });

  it("jede bekannte Prop-Textur hat eine gueltige Stufe (0..2)", () => {
    for (const key of PROP_KEYS) expect([0, 1, 2]).toContain(propTierFor(key));
  });

  it("kleine Deko ist Tier 2 und verschwindet zunaechst (N1), grosse Strukturen + Laternen bleiben bis N2", () => {
    expect(propTierFor("prop_reeds")).toBe(2);
    expect(propTierFor("prop_lilypad")).toBe(2);
    expect(propTierFor("prop_bones")).toBe(2);
    expect(propTierFor("prop_stump")).toBe(2);
    expect(propTierFor("prop_tree_a")).toBe(1);
    expect(propTierFor("prop_tree_b")).toBe(1);
    expect(propTierFor("prop_post")).toBe(0);

    expect(visibleKeys(PROP_DENSITY_N1 - 1)).toContain("prop_reeds");
    expect(visibleKeys(PROP_DENSITY_N1 + 10)).not.toContain("prop_reeds");
    expect(visibleKeys(PROP_DENSITY_N1 + 10)).toContain("prop_grave");
    expect(visibleKeys(PROP_DENSITY_N2 + 10)).not.toContain("prop_grave");
    expect(visibleKeys(PROP_DENSITY_N2 + 10)).not.toContain("prop_tree_a");
    expect(visibleKeys(PROP_DENSITY_N2 + 10)).toContain("prop_post");
  });

  it("Abnahme-Ziel: ab N2 bleiben nur Landmarken (Laternen)", () => {
    const visible = visibleKeys(PROP_DENSITY_N2);
    expect(visible).toEqual(["prop_post"]);
    // leere Layer kosten nichts (Batch-Zaehlung unveraendert nutzbar)
    expect(visibleBatchCount([0, 0, 3, 0])).toBe(1);
  });
});
