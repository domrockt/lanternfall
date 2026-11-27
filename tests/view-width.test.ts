import { describe, expect, it } from "vitest";
import {
  CROWD_ENEMY_THRESHOLD, CROWD_RELEASE_THRESHOLD, CROWD_WIDTH, MAX_WIDTH,
  computeView, isIntegerPixelPerfect, shouldCapForCrowd, viewKey,
} from "../src/logic/view";

const view = (width: number, height: number, dpr = 1, crowd = false) =>
  computeView({ width, height, dpr, crowd });

describe("M10-Crowd: Renderbreite bei hoher Gegnerlast deckeln", () => {
  it("780x360@3 bleibt ohne Last 780 breit, mit Last exakt 640 breit", () => {
    const normal = view(780, 360, 3);
    expect(normal.width).toBe(780);
    expect(normal.scale).toBe(3);

    const capped = view(780, 360, 3, true);
    expect(capped.width).toBe(CROWD_WIDTH);
    expect(capped.height).toBe(360);
    expect(capped.scale).toBe(3);
    expect(capped.cssWidth).toBe(640);
    expect(isIntegerPixelPerfect(capped)).toBe(true);
    expect(capped.fit).toBe(false);
    expect(viewKey(capped)).not.toBe(viewKey(normal));
  });

  it("1080x360@3 (intern 860) wird auf 640 geklemmt, pixelgenau", () => {
    const normal = view(1080, 360, 3);
    expect(normal.width).toBe(MAX_WIDTH);
    const capped = view(1080, 360, 3, true);
    expect(capped.width).toBe(CROWD_WIDTH); // 640
    expect(isIntegerPixelPerfect(capped)).toBe(true);
    expect(capped.cssWidth * capped.dpr).toBeCloseTo(capped.width * capped.scale, 5);
  });

  it("schmale Views (intern <= 640) bleiben unveraendert", () => {
    const small = view(640, 360, 1);
    expect(small.width).toBe(480);
    const capped = view(640, 360, 1, true);
    expect(capped.width).toBe(480);
    expect(capped.scale).toBe(small.scale);
    expect(capped.cssWidth).toBe(small.cssWidth);
  });

  it("Hysterese: klemmen ab 300, loesen erst unter 260", () => {
    expect(CROWD_ENEMY_THRESHOLD).toBe(300);
    expect(CROWD_RELEASE_THRESHOLD).toBe(260);
    expect(shouldCapForCrowd(299, false)).toBe(false);
    expect(shouldCapForCrowd(300, false)).toBe(true);
    expect(shouldCapForCrowd(280, true)).toBe(true);
    expect(shouldCapForCrowd(260, true)).toBe(true);
    expect(shouldCapForCrowd(259, true)).toBe(false);
    expect(shouldCapForCrowd(0, false)).toBe(false);
    expect(shouldCapForCrowd(Number.NaN, false)).toBe(false);
    expect(shouldCapForCrowd(Number.NaN, true)).toBe(false);
  });
});
