/**
 * M10-lod-min-restore (#6119): Rücknahme der Minimal-LOD-Dämpfung Stufe 1
 * (Bedarf m10-vfx-restore in .dispatch/requests.md).
 *
 * Tors:
 *  - fxAlphaFor("minimal") == 0,65 (vorher 0,5, Run.ts-Override FX_RESTORE_ALPHA war 0,65),
 *  - Stufenwerte reduced 0,72 / full 1 unverändert (Run.ts-Kommentar 522),
 *  - Kette bleibt monoton: minimal < reduced < full.
 * Gate für die Sichtprobe (Near-White ≤ 4,16 %) liegt im Messlauf
 * scripts/m10-vfx-restore.mjs --prefix shots/m10-lod-min.
 */
import { describe, expect, it } from "vitest";
import { fxAlphaFor, lodFor } from "../src/logic/lod";

describe("fxAlphaFor (M10-vfx-restore Stufe 1: minimal 0,5 -> 0,65)", () => {
  it("Stufenwerte: minimal 0,65, reduced 0,72, full 1", () => {
    expect(fxAlphaFor("minimal")).toBe(0.65);
    expect(fxAlphaFor("reduced")).toBe(0.72);
    expect(fxAlphaFor("full")).toBe(1);
  });

  it("Tor: minimal ist exakt die alte Run.ts-Override-Stufe 0,65", () => {
    // Run.FX_RESTORE_ALPHA = 0.65 — der lod.ts-Wert muss identisch sein, damit
    // der Run.ts-Override (Run.ts:544/:1463) wertidentisch entfallen kann.
    expect(fxAlphaFor("minimal")).toBe(0.65);
    expect(fxAlphaFor("minimal")).not.toBe(0.5);
  });

  it("Stufen-Kette bleibt monoton: minimal < reduced < full", () => {
    expect(fxAlphaFor("minimal")).toBeLessThan(fxAlphaFor("reduced"));
    expect(fxAlphaFor("reduced")).toBeLessThan(fxAlphaFor("full"));
  });
});

describe("lodFor bleibt bei Stufe 1 unverändert", () => {
  it("minimal-LOD ab 400 Gegnern liefert das gedämpfte Level", () => {
    expect(lodFor(450).level).toBe("minimal");
    expect(lodFor(450, true).level).toBe("minimal");
  });
});
