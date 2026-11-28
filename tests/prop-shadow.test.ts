import { describe, expect, it } from "vitest";
import {
  GEN_PROPS, PROP_SHADOW_ALPHA_CORE, PROP_SHADOW_ALPHA_RIM, PROP_SHADOW_COLOR,
  propShadowClassFor, propShadowFor,
} from "../src/gfx/gen-props";
import { PROP_KEYS } from "../src/gfx/propLayers";
import { PAL } from "../src/palette";

/** Alle bekannten Prop-Klassen (Basis-Keys aus PROP_KEYS). */
const CLASSES = [...PROP_KEYS];

describe("m10-prop-contact-shadow: Kontakt-Schatten je Prop-Klasse", () => {
  it("Palette 0 (ink) ist die Schattenfarbe; Kern-/Rand-Alpha sind halbtransparent", () => {
    expect(PROP_SHADOW_COLOR).toBe(0);
    expect(PAL[PROP_SHADOW_COLOR]).toBe(0x06070c);
    expect(PROP_SHADOW_ALPHA_CORE).toBeGreaterThan(0);
    expect(PROP_SHADOW_ALPHA_CORE).toBeLessThan(1);
    expect(PROP_SHADOW_ALPHA_RIM).toBeGreaterThan(0);
    expect(PROP_SHADOW_ALPHA_RIM).toBeLessThan(PROP_SHADOW_ALPHA_CORE);
  });

  it.each(CLASSES)("jeder Prop-Key rendert Schatten-Pixel unter der Basis (%s)", (key) => {
    const s = propShadowFor(key);
    expect(s.w).toBeGreaterThanOrEqual(8);
    expect(s.h).toBeGreaterThanOrEqual(3);
    expect(s.h).toBeLessThanOrEqual(4);
    expect(s.alpha.length).toBe(s.w * s.h);
    // Kontakt: mittlerer Pixel ist belegt; mindestens so viele Kern- wie Rand-Pixel.
    const center = s.alpha[Math.floor(s.h / 2) * s.w + Math.floor(s.w / 2)];
    expect(center).toBeGreaterThan(0);
    const lit = s.alpha.filter((a) => a > 0);
    expect(lit.length).toBeGreaterThan(s.w / 2);
    for (const a of lit) {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThanOrEqual(PROP_SHADOW_ALPHA_CORE); // nie opak
    }
  });

  it.each(CLASSES)("Schattenform ist elliptisch und spiegelsymmetrisch (%s)", (key) => {
    const s = propShadowFor(key);
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        expect(s.alpha[y * s.w + x]).toBe(s.alpha[y * s.w + (s.w - 1 - x)]);
      }
    }
    // Ellipse: belegte Zeilen in der Mitte mindestens so breit wie am Rand.
    const litWidth = (y: number) => s.alpha.slice(y * s.w, y * s.w + s.w).filter((a) => a > 0).length;
    expect(litWidth(Math.floor(s.h / 2))).toBeGreaterThanOrEqual(litWidth(0));
    expect(litWidth(Math.floor(s.h / 2))).toBeGreaterThanOrEqual(litWidth(s.h - 1));
    // Kein weicher Blob: nur zwei Alpha-Stufen.
    expect(new Set(s.alpha.filter((a) => a > 0)).size).toBeLessThanOrEqual(2);
  });

  it("Schattenbreite bleibt an der Sprite-Basis (max. Spritebreite + 2)", () => {
    for (const key of CLASSES) {
      const def = GEN_PROPS[key];
      const s = propShadowFor(key);
      expect(s.w).toBeLessThanOrEqual(def.w + 2);
    }
  });

  it("Varianten teilen den Klassen-Schatten (prop_boulder_b -> prop_boulder)", () => {
    expect(propShadowClassFor("prop_boulder_b")).toBe("prop_boulder");
    expect(propShadowClassFor("prop_boulder_c")).toBe("prop_boulder");
    expect(propShadowClassFor("prop_bones_b")).toBe("prop_bones");
    expect(propShadowClassFor("prop_tree_a")).toBe("prop_tree_a"); // Basis bleibt Basis
    expect(propShadowClassFor("prop_unknown")).toBe("prop_unknown");
    for (const key of CLASSES) {
      expect(propShadowFor(key)).toBe(propShadowFor(key)); // identisches Objekt = deterministisch
    }
    for (const variant of Object.keys(GEN_PROPS)) {
      const base = propShadowClassFor(variant);
      expect(propShadowFor(variant)).toBe(propShadowFor(base));
    }
  });

  it("Atlas-Packung bleibt klein (Schatten teilen sich eine Textur = 1 Batch)", () => {
    const gap = 2;
    const width = CLASSES.map((k) => propShadowFor(k).w + gap).reduce((a, b) => a + b, gap);
    expect(width).toBeLessThan(1024);
  });
});
