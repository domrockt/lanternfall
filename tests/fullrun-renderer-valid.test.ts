/**
 * Fullrun-Renderer-Guard (Lane m10-fullrun-renderer-valid, Karten #13787/#13788):
 * Doms Regel "Abnahme ungueltig bei SwiftShader" gilt auch fuer den
 * 30-min-Abnahme-Lauf scripts/fullrun.mjs (Muster: renderer-guard.test.ts,
 * perf.mjs/m10-v10-device-10min.mjs aus 9bcc1e41).
 * 1) Verhalten (gemockt, kein Browser): iGPU-String valid, SwiftShader/leer
 *    invalid — genau die Pfade, die fullrun.mjs ueber rendererValid() nimmt.
 * 2) Quell-Guard: fullrun.mjs importiert lf-renderer.mjs, mappt fehlenden GL
 *    ("none") auf "" und schreibt rendererString + rendererValid + invalid
 *    ins Output-JSON; das Tor (passed) und damit der Exit-Code ziehen
 *    rendererValidFlag — SwiftShader => passed=false => Exit 1.
 */
import { expect, describe, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
// @ts-expect-error – reine JS-Helper aus dem .mjs-Skript, keine d.ts vorhanden
import { isSwiftShader, rendererValid } from "../scripts/lf-renderer.mjs";

const FULLRUN = readFileSync(new URL("../scripts/fullrun.mjs", import.meta.url), "utf8");

/** Der echte iGPU-String aus den Mesa-RPL-S-Belegen (Test-Chrome auf Intel-iGPU). */
const IGPU = "ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL 4.6)";
/** SwiftShader-Variante aus DevTools-Headless (ungueltig). */
const SWIFT = "ANGLE (Google, SwiftShader, OpenGL 4.1)";

describe("fullrun Renderer-Guard: Verhalten (gemockt, kein Browser)", () => {
  it("valider iGPU-Pfad: rendererValid=true (gruen, Beleg waere regelkonform)", () => {
    expect(isSwiftShader(IGPU)).toBe(false);
    expect(rendererValid(IGPU)).toBe(true);
  });

  it("SwiftShader-Pfad: rendererValid=false => invalid (Abnahme ungueltig)", () => {
    expect(isSwiftShader(SWIFT)).toBe(true);
    expect(rendererValid(SWIFT)).toBe(false);
    // variants, wie sie Headless/Emulation liefern koennen:
    expect(rendererValid("SwiftShader")).toBe(false);
    expect(rendererValid("ANGLE (SwiftShader Vulkan Device)")).toBe(false);
  });

  it("fehlender Renderer ist nie valide (fullrun mappt GL 'none' => '')", () => {
    // Genau das Mapping aus fullrun.mjs: fehlender GL liefert "none" im Objekt.
    const rendererObjNone = { renderer: "none", vendor: "none" };
    const mapped = rendererObjNone.renderer === "none" ? "" : String(rendererObjNone.renderer ?? "");
    expect(mapped).toBe("");
    expect(rendererValid(mapped)).toBe(false);
  });
});

describe("fullrun Renderer-Guard: Quell-Guard scripts/fullrun.mjs", () => {
  it("importiert den Helper lf-renderer.mjs (rendererValid)", () => {
    expect(FULLRUN).toMatch(/import\s*\{\s*rendererValid\s*\}\s*from\s+"\.\/lf-renderer\.mjs"/);
    expect(FULLRUN).toMatch(/rendererValid\(rendererString\)/);
  });

  it("mappt fehlenden GL ('none') auf '' und behandelt ihn als ungueltig", () => {
    expect(FULLRUN).toMatch(/renderer\.renderer === "none" \? "" : String\(renderer\.renderer \?\? ""\)/);
  });

  it("schreibt rendererString + rendererValid + invalid ins Output-JSON", () => {
    expect(FULLRUN).toMatch(/rendererString,\s*\/\/ flacher String/);
    expect(FULLRUN).toMatch(/rendererValid:\s*rendererValidFlag/);
    expect(FULLRUN).toMatch(/invalid:\s*!rendererValidFlag/);
  });

  it("zieht rendererValidFlag in die Tore (heap/fps) und Top-Level passed", () => {
    expect(FULLRUN).toMatch(/passed:\s*heapOk && rendererValidFlag/);
    expect(FULLRUN).toMatch(/passed:\s*fpsOk && rendererValidFlag/);
    expect(FULLRUN).toMatch(/passed:\s*rendererValidFlag && ok && heapOk && fpsOk/);
  });

  it("Exit-Code haengt am Tor: SwiftShader => passed=false => process.exit(1)", () => {
    // summaryPassed = summary.passed (zieht rendererValidFlag); 0 nur bei PASS.
    expect(FULLRUN).toMatch(/summaryPassed = summary\.passed/);
    expect(FULLRUN).toMatch(/process\.exit\(summaryPassed \? 0 : 1\)/);
  });

  it("Messablauf unangetastet: die inhaltlichen Tore stehen weiterhin im Summary", () => {
    for (const marker of ["timingOk", "allBosses", "chestsDropped", "dawn", "victory", "finalBossDefeated", "retainedDeltaPct", "fpsMin"]) {
      expect(FULLRUN).toContain(marker);
    }
  });
});
