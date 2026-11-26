import { describe, expect, it } from "vitest";
import {
  BASE_HEIGHT, MAX_WIDTH, MIN_WIDTH, computeView, isIntegerPixelPerfect, viewKey,
} from "../src/logic/view";

const view = (width: number, height: number, dpr = 1, setting = 0) =>
  computeView({ width, height, dpr, setting });

describe("M8 View: ganzzahlige Gerätepixel-Skalierung", () => {
  it("1080p / 1440p / 4K ergeben 640x360 mit 3x/6x/6x", () => {
    const hd = view(1920, 1080);
    expect([hd.width, hd.height, hd.scale]).toEqual([640, 360, 3]);
    expect(hd.cssWidth).toBe(1920);
    expect(hd.cssHeight).toBe(1080);
    expect(isIntegerPixelPerfect(hd)).toBe(true);

    const qhd = view(2560, 1440, 1.5);
    expect([qhd.width, qhd.height, qhd.scale]).toEqual([640, 360, 6]);
    expect(qhd.cssWidth).toBe(2560);
    expect(qhd.cssHeight).toBe(1440);
    expect(isIntegerPixelPerfect(qhd)).toBe(true);

    const uhd = view(3840, 2160);
    expect([uhd.width, uhd.height, uhd.scale]).toEqual([640, 360, 6]);
    expect(uhd.cssWidth).toBe(3840);
    expect(isIntegerPixelPerfect(uhd)).toBe(true);
  });

  it("720p ergibt 640x360 mit 2x", () => {
    const v = view(1280, 720);
    expect([v.width, v.scale]).toEqual([640, 2]);
    expect(v.cssWidth).toBe(1280);
    expect(v.cssHeight).toBe(720);
  });

  it("Handy-Formate werden breiter (19.5:9, 20:9) und bleiben <= 860", () => {
    const iphone = view(844, 390, 3);
    expect([iphone.width, iphone.height, iphone.scale]).toEqual([844, 360, 3]);
    expect(isIntegerPixelPerfect(iphone)).toBe(true);

    const pixel = view(915, 412, 2.625);
    expect(pixel.width).toBeGreaterThanOrEqual(780);
    expect(pixel.width).toBeLessThanOrEqual(MAX_WIDTH);
    expect(pixel.scale).toBe(3);
    expect(isIntegerPixelPerfect(pixel)).toBe(true);
  });

  it("1366x768 ergibt 683x360 bei 2x (16:9 bleibt 640)", () => {
    const v = view(1366, 768);
    expect([v.width, v.height, v.scale]).toEqual([683, 360, 2]);
    expect(v.cssWidth).toBe(1366);
    expect(v.cssHeight).toBe(720);
  });

  it("iPad 4:3 bleibt im Breiten-Clamp und ist pixelgenau", () => {
    const v = view(1366, 1024, 2);
    expect(v.scale).toBe(5);
    expect(v.width).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(v.width).toBeLessThanOrEqual(MAX_WIDTH);
    expect(v.height).toBe(BASE_HEIGHT);
    expect(isIntegerPixelPerfect(v)).toBe(true);
  });

  it("kleine Fenster (n < 2) nutzen den gebrochenen Fit-Rückfall", () => {
    const v = view(800, 450);
    expect(v.fit).toBe(true);
    expect(v.width).toBe(MIN_WIDTH);
    expect(v.height).toBe(BASE_HEIGHT);
    expect(v.scale).toBeGreaterThan(1);
    expect(v.scale).toBeLessThan(2);
    expect(v.cssWidth).toBeLessThanOrEqual(800);
    expect(v.cssHeight).toBeLessThanOrEqual(450);
    expect(isIntegerPixelPerfect(v)).toBe(false);
  });

  it("Option 2X-6X begrenzt auf die größte passende Stufe", () => {
    expect(view(1920, 1080, 1, 6).scale).toBe(3);
    const fixed2 = view(1920, 1080, 1, 2);
    expect(fixed2.scale).toBe(2);
    expect(fixed2.width).toBe(MAX_WIDTH);
    expect(fixed2.cssWidth).toBeLessThanOrEqual(1920);
    expect(view(1920, 1080, 1, 99).scale).toBe(3);
  });

  it("Hochkant pausiert mit Dreh-Hinweis und Fit-View", () => {
    const v = view(390, 844, 3);
    expect(v.portrait).toBe(true);
    expect(v.fit).toBe(true);
    expect(v.cssWidth).toBeLessThanOrEqual(390);
    expect(v.cssHeight).toBeLessThanOrEqual(844);
    expect(viewKey(v)).toContain("480x360");
  });

  it("verkraftet kaputte Maße ohne Crash", () => {
    const v = view(Number.NaN, -10, 0);
    expect(Number.isFinite(v.width)).toBe(true);
    expect(Number.isFinite(v.height)).toBe(true);
    expect(v.width).toBeGreaterThan(0);
    expect(v.dpr).toBeGreaterThanOrEqual(1);
  });
});
