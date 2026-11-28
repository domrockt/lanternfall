/**
 * m10-texture-glow-swap-r2 — K4 Regressionstest.
 *
 * Sichert den Endstand nach dem Swap (Boot.ts konsumiert die exportierten
 * Creator aus src/gfx/textures.ts) gegen Rueckfaelle:
 *
 * 1. destination-in-Masken-Bug (eaf2ab6, gestapelte destination-in-Fills
 *    schneiden ihre Masken -> vollstaendig transparente light_radius-Textur):
 *    im aktiven textures.ts-Code ist destination-in verboten; die Stufen-
 *    Alpha-Multiplikation pro Pixel (getImageData/putImageData) ist Pflicht.
 * 2. Export-Kontrakt: createLightTexture/createVignetteTexture (Boot-Swap)
 *    sowie LIGHT_EDGE_STEPS/lightEdgeAlphaFor/vignetteSteps sind exportiert.
 * 3. B2-Ring-Farb-Kern: Rampen-Ende Amber/Lantern (20/21 ab r<=40), kein
 *    lanternWhite/candle (Near-White-Fall A7, Guard tests/chaos-glow-runpath.test.ts).
 *
 * src/gfx/textures.ts selbst ist importierbar (document wird erst zur
 * Laufzeit der Creator beruehrt); der Zeichnpfad wird zusaetzlich als
 * Quelltext-Check geprueft (Muster tests/chaos-glow-runpath.test.ts).
 */
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LIGHT_EDGE_STEPS,
  createLightTexture,
  createVignetteTexture,
  lightEdgeAlphaFor,
  vignetteSteps,
} from "../src/gfx/textures";

const TEXTURES_TS = readFileSync(new URL("../src/gfx/textures.ts", import.meta.url), "utf8");
/** Quelltext ohne Kommentarzeilen (Guards zielen auf aktiven Code). */
const TEXTURES_CODE = TEXTURES_TS.split("\n")
  .filter((l: string) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

describe("Export-Kontrakt (Boot-Swap, m10-texture-glow-swap-r2)", () => {
  it("die beiden Creator sind exportiert (typcheckt via Import)", () => {
    expect(typeof createLightTexture).toBe("function");
    expect(typeof createVignetteTexture).toBe("function");
  });

  it("Stufen-Helfer sind exportiert (eaf2ab6-Vertrag: Tabelle + lightEdgeAlphaFor)", () => {
    expect(typeof lightEdgeAlphaFor).toBe("function");
    expect(typeof vignetteSteps).toBe("function");
    expect(Array.isArray(LIGHT_EDGE_STEPS)).toBe(true);
  });
});

describe("destination-in-Masken-Bug gefixt (K2)", () => {
  it("kein destination-in und kein createRadialGradient im aktiven textures.ts-Code", () => {
    expect(TEXTURES_CODE).not.toContain("destination-in");
    expect(TEXTURES_CODE).not.toContain("createRadialGradient");
    expect(TEXTURES_CODE).not.toContain("addColorStop");
  });

  it("Stufen-Alpha wird pro Pixel multipliziert (getImageData/putImageData-Pfad)", () => {
    expect(TEXTURES_TS).toContain("ctx.getImageData(0, 0, size, size)");
    expect(TEXTURES_TS).toContain("ctx.putImageData(img, 0, 0)");
    expect(TEXTURES_TS).toMatch(/const band = lightEdgeAlphaFor\(d\);/);
    expect(TEXTURES_TS).toMatch(/pxs\[\(y \* size \+ x\) \* 4 \+ 3\] = pxs\[\(y \* size \+ x\) \* 4 \+ 3\] \* band/);
  });

  it("lightEdgeAlphaFor: exakt die eaf2ab6-Stufen (0 ausgeschlossen, Kern 1)", () => {
    expect(LIGHT_EDGE_STEPS).toEqual([
      [0, 70, 1],
      [70, 76, 0.66],
      [76, 82, 0.38],
      [82, 88, 0.18],
      [88, 96, 0.08],
    ]);
    for (const [r0, r1] of LIGHT_EDGE_STEPS) {
      expect(r1 - r0).toBeGreaterThanOrEqual(6); // Baender >= 6 px (Raster-Lesbarkeit)
    }
    expect(lightEdgeAlphaFor(10)).toBe(1); // Kern
    expect(lightEdgeAlphaFor(70.5)).toBe(0.66);
    expect(lightEdgeAlphaFor(76.5)).toBe(0.38);
    expect(lightEdgeAlphaFor(96.5)).toBe(0); // ausserhalb -> Band-Tabelle 0
  });

  it("vignetteSteps: 11 Baender a 20 px (r=70..290) + Ecken-Klemme 0.72", () => {
    const steps = vignetteSteps();
    expect(steps.length).toBe(12);
    expect(steps[0]).toEqual([70, 90, 0.02]);
    expect(steps[7]).toEqual([210, 230, 0.23]);
    expect(steps[10]).toEqual([270, 290, 0.72]);
    expect(steps[11]).toEqual([290, 410, 0.72]);
  });
});

describe("B2-Ring-Farb-Kern in textures.ts (K3-Abgleich, A7-Schutz)", () => {
  it("Kern (r<=40) ist Amber/Lantern (20/21), kein lanternWhite/candle (13/22)", () => {
    const start = TEXTURES_TS.indexOf("const rings");
    const block = TEXTURES_TS.slice(start, TEXTURES_TS.indexOf("const c = size / 2", start));
    expect(block).not.toMatch(/\{ r: (8|16|24|32|40), color: (13|22)/);
    expect(block).toMatch(/\{ r: 8, color: 20/);
    expect(block).toMatch(/\{ r: 40, color: 21/);
  });

  it("Kern-Alpha-Summe bleibt gedaeckt (Ring-Alpha <= 0.10, Kern <= ~0.25 vor Blend)", () => {
    const start = TEXTURES_TS.indexOf("const rings");
    const block = TEXTURES_TS.slice(start, TEXTURES_TS.indexOf("const c = size / 2", start));
    for (const m of block.matchAll(/alpha: ([\d.]+)/g)) {
      expect(Number(m[1])).toBeLessThanOrEqual(0.1);
    }
  });
});
