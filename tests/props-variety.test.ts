import { describe, expect, it } from "vitest";
import { GEN_PROPS, propVariantKeyFor } from "../src/gfx/gen-props";
import { charIndex } from "../src/gfx/textures";

/** Varianten je Prop-Klasse (gleiche Ableitung wie in gen-props.ts). */
function variantsOf(base: string): string[] {
  return Object.keys(GEN_PROPS).filter((k) => {
    const m = /^(prop_.+)_[a-z]$/.exec(k);
    return m !== null && m[1] === base;
  });
}

/** Zieldatei des Briefings: Steine, Knochen, Buesche (Schilf) und Laternen-Reste. */
const TARGET_CLASSES: Array<[string, number]> = [
  // [Basis-Key, geforderte Variantenzahl]
  ["prop_boulder", 2],
  ["prop_bones", 2],
  ["prop_reeds", 1],
  ["prop_post", 1],
];

describe("props-variety (m10-props-variety)", () => {
  it("Zielklassen haben mindestens die geforderte Variantenzahl", () => {
    for (const [base, min] of TARGET_CLASSES) {
      expect(GEN_PROPS[base], `${base} muss existieren`).toBeDefined();
      expect(variantsOf(base).length, `${base} Varianten`).toBeGreaterThanOrEqual(min);
    }
    // Lane-Ziel insgesamt: 4–6 neue Varianten.
    const total = TARGET_CLASSES.reduce((n, [b]) => n + variantsOf(b).length, 0);
    expect(total).toBeGreaterThanOrEqual(4);
    expect(total).toBeLessThanOrEqual(6);
  });

  it("Varianten teilen Groesse und Klasse der Basis (Klassen-/Groessenvertrag)", () => {
    for (const [base] of TARGET_CLASSES) {
      const b = GEN_PROPS[base];
      for (const v of variantsOf(base)) {
        expect(GEN_PROPS[v].w, `${v} Breite`).toBe(b.w);
        expect(GEN_PROPS[v].h, `${v} Hoehe`).toBe(b.h);
      }
    }
  });

  it("Varianten sind palettentreu (0 Off-Palette-Pixel, binaeres Alpha) und konturiert", () => {
    for (const [base] of TARGET_CLASSES) {
      for (const v of [base, ...variantsOf(base)]) {
        const def = GEN_PROPS[v];
        let ink = 0;
        for (const rows of def.frames) {
          expect(rows.length, v).toBe(def.h);
          for (const row of rows) {
            expect(row.length, `${v}: "${row}"`).toBe(def.w);
            for (const ch of row) {
              if (ch === ".") continue;
              const i = charIndex(ch);
              expect(i, `${v}: unbekanntes Zeichen "${ch}"`).toBeGreaterThanOrEqual(0);
              expect(i, `${v}: Index ${i} ausserhalb der Palette`).toBeLessThan(32);
            }
          }
          // Kontur (Ink-Rahmen) vorhanden — wie bei allen Ground-Props.
          ink += rows.filter((r) => r.includes("0")).length;
        }
        expect(ink, `${v}: keine Kontur`).toBeGreaterThan(0);
      }
    }
  });

  it("Varianten sind keine Kopien der Basis-Sprite", () => {
    for (const [base] of TARGET_CLASSES) {
      const b = JSON.stringify(GEN_PROPS[base].frames);
      for (const v of variantsOf(base)) {
        expect(JSON.stringify(GEN_PROPS[v].frames), `${v} dupliziert ${base}`).not.toBe(b);
      }
    }
  });

  it("propVariantKeyFor ist deterministisch und nur bei Varianten-Klassen aktiv", () => {
    // Ohne Varianten: unverändert (auch fuer unbekannte Keys).
    expect(propVariantKeyFor("prop_stump", 0.9)).toBe("prop_stump");
    expect(propVariantKeyFor("prop_nix", 0.4)).toBe("prop_nix");
    // Mit Varianten: nur gueltige Keys der Klasse, deterministisch je pick.
    for (const [base] of TARGET_CLASSES) {
      const allowed = new Set([base, ...variantsOf(base)]);
      for (let i = 0; i < 100; i++) {
        const pick = i / 100;
        const key = propVariantKeyFor(base, pick);
        expect(allowed.has(key), `${base} pick ${pick} -> ${key}`).toBe(true);
        expect(propVariantKeyFor(base, pick)).toBe(key);
      }
    }
  });

  it("Variantenwahl ist gleichverteilt genug (keine tote Variante)", () => {
    // 1000 aequidistante Picks je Klasse: jede Variante mehrfach getroffen.
    for (const [base] of TARGET_CLASSES) {
      const hits = new Map<string, number>();
      for (let i = 0; i < 1000; i++) {
        const key = propVariantKeyFor(base, i / 1000);
        hits.set(key, (hits.get(key) ?? 0) + 1);
      }
      for (const v of [base, ...variantsOf(base)]) {
        expect(hits.get(v) ?? 0, `${v} Anteil`).toBeGreaterThan(50);
      }
    }
  });
});
