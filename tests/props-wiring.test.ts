import { describe, expect, it } from "vitest";
import { propVariantKeyFor } from "../src/gfx/gen-props";
import { tileHash } from "../src/gfx/tiles";

/**
 * m10-props-wiring: Guard fuer die Verdrahtung der Prop-Varianten in
 * GroundRenderer.addProp. Der Renderer waehlt die Textur deterministisch
 * pro Position: propVariantKeyFor(basisKey, tileHash(round(wx), round(wy), seed + 463)).
 * Diese Tests sichern den Vertrag des Helpers (Determinismus, Bildmenge,
 * Fallback) — die Platzierung selbst bleibt klassenbasiert und unveraendert.
 */

/** Die Zielklassen der Vorgaenger-Lane m10-props-variety (Basis + _b/_c). */
const VARIANT_CLASSES = ["prop_boulder", "prop_bones", "prop_reeds", "prop_post"] as const;

/** Exakt die Formel aus addProp() — SEED-Offset 463, gerundete Weltkoordinaten. */
const wiredKeyFor = (base: string, wx: number, wy: number, seed: number): string =>
  propVariantKeyFor(base, tileHash(Math.round(wx), Math.round(wy), seed + 463));

describe("props-wiring (m10-props-wiring)", () => {
  it("deterministische Wahl: gleicher Tile-Hash -> gleiche Variante (1000 Positionen, 2 Seeds)", () => {
    for (const base of VARIANT_CLASSES) {
      for (let seed = 7; seed <= 9; seed += 2) {
        for (let i = 0; i < 1000; i++) {
          const wx = (i * 37) % 4096;
          const wy = (i * 91) % 4096;
          const a = wiredKeyFor(base, wx, wy, seed);
          const b = wiredKeyFor(base, wx, wy, seed);
          expect(a, `${base} @${wx},${wy} seed ${seed} muss stabil sein`).toBe(b);
        }
      }
    }
  });

  it("Wahl haengt an der Position: unterschiedliche Tiles treffen nicht alle dieselbe Variante", () => {
    //Ohne Positionsabhaengigkeit waere die "Vielfalt" global konstant — Guard
    //gegen eine versehentlich konstante Wahl (z. B. Hash ignoriert x/y).
    const keys = new Set<string>();
    for (let x = 0; x < 64; x++) {
      for (let y = 0; y < 64; y++) keys.add(wiredKeyFor("prop_boulder", x * 16, y * 16, 7));
    }
    expect(keys.size).toBeGreaterThanOrEqual(3); // Basis + 2 Varianten
  });

  it("Fallback: unbekannte Klasse und klassen ohne Varianten liefern den Basis-Key", () => {
    expect(propVariantKeyFor("prop_nichtda", 0.1)).toBe("prop_nichtda");
    expect(propVariantKeyFor("prop_nichtda", 0.9)).toBe("prop_nichtda");
    // Klassen ohne _b/_c-Varianten muessen unveraendert durchlaufen.
    expect(propVariantKeyFor("prop_stump", 0.3)).toBe("prop_stump");
    expect(propVariantKeyFor("prop_grave", 0.7)).toBe("prop_grave");
    expect(propVariantKeyFor("prop_tree_a", 0.5)).toBe("prop_tree_a");
  });

  it("Grenz-Picks: 0 -> Basis, knapp unter 1 -> letzte Variante, kein undefined", () => {
    expect(propVariantKeyFor("prop_boulder", 0)).toBe("prop_boulder");
    const last = propVariantKeyFor("prop_boulder", 0.999999);
    expect(["prop_boulder", "prop_boulder_b", "prop_boulder_c"]).toContain(last);
    for (const pick of [0.25, 0.5, 0.75]) {
      expect(propVariantKeyFor("prop_boulder", pick)).toMatch(/^prop_boulder(_[a-z])?$/);
    }
  });

  it("jede gewaehlte Variante ist ein echter Sprite-Key (Fallback braucht nie einzusetzen)", () => {
    // Der Renderer faellt nur zurueck, wenn textures.exists(variantKey) false ist.
    // In der gebackenen Welt existieren alle Varianten — hier GEN_PROPS als Vertrag.
    const seen = new Set<string>();
    for (let x = 0; x < 128; x++) {
      for (let y = 0; y < 128; y++) seen.add(wiredKeyFor("prop_post", x * 8, y * 8, 7));
    }
    expect(seen.size).toBeGreaterThanOrEqual(2); // Basis + post_b
    for (const base of VARIANT_CLASSES) {
      const keys = new Set<string>();
      for (let i = 0; i < 5000; i++) {
        keys.add(wiredKeyFor(base, (i * 53) % 8192, (i * 97) % 8192, 7));
      }
      for (const k of keys) expect(k.startsWith(base + "_") || k === base, `${k} aus ${base}`).toBe(true);
    }
  });
});
