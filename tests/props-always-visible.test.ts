/**
 * m10-props-always-visible (2026-11-28): Guard gegen das Wiedereinführen des
 * Prop-Dichte-LOD. Dom auf dem Tablet: "Bei sehr vielen Gegnern verschwinden
 * die Umgebungssprites wie Steine, Pilze usw. — wie ein Flackern." Ursache
 * war propDensityMaxTier (m10-prop-density-lod, >=150 Deko aus / >=200 nur
 * Laternen) ohne Glättung — Gegnerzahl pendelt um die Schwellen, Props
 * blinken (Beleg: ~/games/.evidence/m10-props-always-visible/before.json,
 * 8 Tier-Wechsel in 12 s).
 *
 * Lehre: Welt-Objekte nie per LOD verstecken — Flackern ist schlimmer als
 * ein paar FPS.
 */
import { describe, expect, it } from "vitest";
import { propDensityMaxTier } from "../src/logic/lod";
import { PROP_KEYS, propTierFor } from "../src/gfx/propLayers";

describe("props-always-visible", () => {
  it("propDensityMaxTier gibt IMMER 2 (alles sichtbar) zurück — bei jeder Gegnerzahl", () => {
    for (let n = -10; n <= 5000; n += 7) {
      expect(propDensityMaxTier(n)).toBe(2);
    }
    // Ränder + Sonderfälle explizit
    expect(propDensityMaxTier(0)).toBe(2);
    expect(propDensityMaxTier(150)).toBe(2);
    expect(propDensityMaxTier(200)).toBe(2);
    expect(propDensityMaxTier(301)).toBe(2);
    expect(propDensityMaxTier(Number.NaN)).toBe(2);
    expect(propDensityMaxTier(Number.POSITIVE_INFINITY)).toBe(2);
  });

  it("kein Prop-Tier liegt über 2 — kein Objekt kann je versteckt werden", () => {
    // Früher: Schwellen-Sprung tier<2 => hidden. Mit maxTier≡2 bleibt jedes
    // Tier in {0,1,2} immer sichtbar (tier <= 2). Dies schließt die
    // Property-Reihe ab, die vor dem Fix 0/1 bei >=150/200 lief.
    for (const key of PROP_KEYS) {
      expect(propTierFor(key)).toBeLessThanOrEqual(2);
    }
  });
});
