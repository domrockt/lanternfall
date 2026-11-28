import { describe, expect, it } from "vitest";
import { BASE_HEIGHT, computeView, isIntegerPixelPerfect, viewKey } from "../src/logic/view";

/**
 * Lane m10-verify-menu-scale-fix-r2 (#9966): Regression für den verify-menus-Check
 * „Skalierung 2X gestellt, Fit-View zentriert". Der Harness hatte dort noch die
 * pra-M10-view-fill 4:3-Letterbox-Regel erwartet (960x540 -> 720x540), während
 * computeView seit M10-view-fill im n<2-Rückfall das Fenster füllt
 * (960x540 -> 640x360@1.5, Canvas-CSS 960x540). Diese Tests pinnen die
 * 2X-Semantik der Option (setting = 2) auf View-Ebene:
 *  - passt 2x ganzzahlig, gilt exakt 2x (Höhe 720, Breite geclampt),
 *  - passt 2x NICHT (Fensterhöhe < 720), greift der Fill-Rückfall — das Fenster
 *    wird voll gefüllt (CSS-Canvas == Viewport, also zentriert trivial),
 *  - und 2X ist bei maxFitN <= 1 äquivalent zu AUTO.
 */
describe("m10-menu-scale: SKALIERUNG 2X -> erwartete View-Geometrie", () => {
  it("960x540 + setting 2: Fill-Rückfall 640x360@1.5, Canvas füllt das Fenster (960x540)", () => {
    const v = computeView({ width: 960, height: 540, dpr: 1, setting: 2 });
    expect(v.width).toBe(640);
    expect(v.height).toBe(BASE_HEIGHT);
    expect(v.scale).toBe(1.5);
    expect(v.fit).toBe(true);
    expect(v.portrait).toBe(false);
    // Canvas füllt das Fenster exakt -> vom Browser zentriert ohne Balken:
    expect(v.cssWidth).toBe(960);
    expect(v.cssHeight).toBe(540);
    expect(isIntegerPixelPerfect(v)).toBe(true);
  });

  it("960x540: setting 2 == AUTO (maxFitN 1, beides Fill) — Harness-Gegenprobe", () => {
    const forced = computeView({ width: 960, height: 540, dpr: 1, setting: 2 });
    const auto = computeView({ width: 960, height: 540, dpr: 1 });
    expect(viewKey(forced)).toBe(viewKey(auto));
  });

  it("1280x720 + setting 2: ganzzahlige 2x-Stufe 640x360, Canvas 1280x720", () => {
    const v = computeView({ width: 1280, height: 720, dpr: 1, setting: 2 });
    expect(v.width).toBe(640);
    expect(v.height).toBe(BASE_HEIGHT);
    expect(v.scale).toBe(2);
    expect(v.fit).toBe(false);
    expect(v.cssWidth).toBe(1280);
    expect(v.cssHeight).toBe(720);
    expect(isIntegerPixelPerfect(v)).toBe(true);
  });

  it("1920x1080 + setting 2: 2x an MAX_WIDTH geklemmt (860x360), exakte Abbildung", () => {
    const v = computeView({ width: 1920, height: 1080, dpr: 1, setting: 2 });
    expect(v.width).toBe(860);
    expect(v.scale).toBe(2);
    expect(v.cssWidth).toBe(1720);
    expect(v.cssHeight).toBe(720);
    expect(isIntegerPixelPerfect(v)).toBe(true);
  });

  it("setting 2 kann 1x nicht unterbieten: 800x450 (maxFitN 1) bleibt Fill 640x360@1.25", () => {
    const v = computeView({ width: 800, height: 450, dpr: 1, setting: 2 });
    expect(v.width).toBe(640);
    expect(v.scale).toBe(1.25);
    expect(v.cssWidth).toBe(800);
    expect(v.cssHeight).toBe(450);
    expect(isIntegerPixelPerfect(v)).toBe(true);
  });
});
