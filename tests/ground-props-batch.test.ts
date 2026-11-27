import { describe, expect, it } from "vitest";
import {
  PROP_KEYS, PROP_LAYER_DEPTHS, batchLayerCount, propSideFor, visibleBatchCount,
} from "../src/gfx/propLayers";

describe("M10 Ground-Prop-Batching (feste Container-Layer)", () => {
  it("Layer-Plan: je Prop-Textur 2 Layer (hinter/vor Spieler) + Schatten + Glow-Paar + Ripples", () => {
    // 13 bekannte Prop-Texturen -> 26 Prop-Layer + 4 Grund-Layer = 30.
    expect(PROP_KEYS.size).toBe(13);
    expect(batchLayerCount(PROP_KEYS.size)).toBe(30);
    expect(batchLayerCount(0)).toBe(4);
  });

  it("Seitenwahl entspricht dem alten Depth-Vergleich: footY < playerY = hinter dem Spieler", () => {
    expect(propSideFor(100, 120)).toBe("behind");
    expect(propSideFor(130, 120)).toBe("front");
    // Grenzfall wie vorher: footY == playerY -> vor dem Spieler (11.6+X nur bei footY < py).
    expect(propSideFor(120, 120)).toBe("front");
  });

  it("Layer-Tiefen: Ripples unter allem, Schatten unter Props, Spieler (12) zwischen behind/front", () => {
    expect(PROP_LAYER_DEPTHS.ripple).toBeLessThan(PROP_LAYER_DEPTHS.shadow);
    expect(PROP_LAYER_DEPTHS.shadow).toBeLessThan(PROP_LAYER_DEPTHS.propBehind);
    expect(PROP_LAYER_DEPTHS.propBehind).toBeLessThan(12);
    expect(12).toBeLessThan(PROP_LAYER_DEPTHS.propFront);
    // Glow-Kaempche knapp ueber den Props derselben Seite (vorher 11.6+0.06 / 12.4+0.06).
    expect(PROP_LAYER_DEPTHS.propBehind).toBeLessThan(PROP_LAYER_DEPTHS.glowBehind);
    expect(PROP_LAYER_DEPTHS.glowBehind).toBeLessThan(PROP_LAYER_DEPTHS.propFront);
    expect(PROP_LAYER_DEPTHS.propFront).toBeLessThan(PROP_LAYER_DEPTHS.glowFront);
  });

  it("Prop-Batches = Layer mit mindestens einem sichtbaren Kind (leere Layer kosten nichts)", () => {
    expect(visibleBatchCount([0, 3, 0, 12])).toBe(2);
    expect(visibleBatchCount([5, 0, 1])).toBe(2);
    expect(visibleBatchCount([0, 0])).toBe(0);
    expect(visibleBatchCount([])).toBe(0);
  });
});
