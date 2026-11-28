/**
 * Renderer-Guard (Lane m10-renderer-guard, Karten #13404/#13405/#13406):
 * Doms Regel "in jedem Perf-Beleg den WebGL-Renderer mitschreiben (Abnahme
 * ungueltig bei SwiftShader)".
 * 1) Unit-Tests für isSwiftShader/rendererValid (SwiftShader-Varianten,
 *    echte iGPU-Strings, Adreno, fehlende Werte).
 * 2) Quell-Guard: perf.mjs und m10-v10-device-10min.mjs importieren den
 *    Helper lf-renderer.mjs und schreiben renderer + rendererValid ins
 *    Output-JSON (Muster: Quelle-Guard-Tests wie verify-outputs-hygiene).
 */
import { expect, describe, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
// @ts-expect-error – reine JS-Helper aus dem .mjs-Skript, keine d.ts vorhanden
import { getRendererString, isSwiftShader, rendererValid } from "../scripts/lf-renderer.mjs";

const GUARDED = ["perf.mjs", "m10-v10-device-10min.mjs"] as const;

describe("lf-renderer: isSwiftShader / rendererValid", () => {
  it("SwiftShader-Varianten werden erkannt (auch in ANGLE-String, Gross/klein)", () => {
    expect(isSwiftShader("SwiftShader")).toBe(true);
    expect(isSwiftShader("swiftshader")).toBe(true);
    expect(isSwiftShader("SWIFTSHADER")).toBe(true);
    expect(isSwiftShader("ANGLE (Google, SwiftShader, OpenGL 4.1)")).toBe(true);
    expect(isSwiftShader("ANGLE (SwiftShader Vulkan Device)")).toBe(true);
    expect(isSwiftShader("system SwiftShader driver")).toBe(true);
  });

  it("echte iGPU-Strings sind valide", () => {
    expect(rendererValid("ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL 4.6)")).toBe(true);
    expect(rendererValid("ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00003190), OpenGL 4.1)")).toBe(true);
    expect(isSwiftShader("ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL 4.6)")).toBe(false);
  });

  it("Adreno (Android-Tablet) ist valide", () => {
    expect(rendererValid("ANGLE (Qualcomm, Adreno (TM) 740s, OpenGL ES 3.2)")).toBe(true);
    expect(isSwiftShader("ANGLE (Qualcomm, Adreno (TM) 740s, OpenGL ES 3.2)")).toBe(false);
  });

  it("SwiftShader ist NIE valide", () => {
    expect(rendererValid("SwiftShader")).toBe(false);
    expect(rendererValid("ANGLE (Google, SwiftShader, OpenGL 4.1)")).toBe(false);
  });

  it("fehlender/unlesbarer Renderer ist nicht valide (nie schweigend durchlassen)", () => {
    expect(rendererValid("")).toBe(false);
    expect(rendererValid("   ")).toBe(false);
    expect(rendererValid(null)).toBe(false);
    expect(rendererValid(undefined)).toBe(false);
    expect(rendererValid(123)).toBe(false);
  });

  it("getRendererString fällt robust auf \"\" zurück (keine Page -> kein Beleg)", async () => {
    await expect(getRendererString(null)).resolves.toBe("");
  });
});

describe("Quell-Guard: Mess-Skripte erfassen den Renderer", () => {
  for (const name of GUARDED) {
    const src = readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8");

    it(`${name}: importiert lf-renderer (getRendererString + rendererValid)`, () => {
      expect(src).toMatch(/from\s+"\.\.?\/lf-renderer\.mjs"/);
      expect(src).toMatch(/getRendererString/);
      expect(src).toMatch(/rendererValid/);
    });

    it(`${name}: schreibt renderer + rendererValid ins Output-JSON`, () => {
      expect(src).toMatch(/\brenderer\b\s*,/);
      expect(src).toMatch(/rendererValid:/);
    });

    it(`${name}: SwiftShader -> Kennzahlen invalid:true und passed=false`, () => {
      expect(src).toMatch(/invalid:/);
      expect(src).toMatch(/passed:\s*rendererValidFlag/);
    });
  }
});
