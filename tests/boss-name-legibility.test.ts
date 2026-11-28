import { describe, expect, it, vi } from "vitest";
// UI.ts importiert Phaser (Szene); die gepruefte Geometrie ist rein.
// Phaser wird neutral gemockt (PixelText erweitert Phaser.GameObjects.Container) —
// Muster tests/boss-banner-layout.test.ts.
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  return { default: { GameObjects: { Container }, Scene } };
});
import { bossBarGeometry, bossNamePlateRect, BOSS_NAME_PLATE_ALPHA } from "../src/scenes/UI";

// m10-boss-name-legibility (#10455): Befund B3 — Boss-Name im M25-Chaos
// unlesbar. Diagnose (K1, m10-boss-name-before.json): Glyphen-Deckung im
// Chaos intakt (253/253 = 1.0) → Kontrastproblem, NICHT Layering. Fix:
// dunkle ink-Platte (Alpha 0,95 wie die Leiste) hinter dem Textband.
// Der Test prueft die Platten-Geometrie gegen die Leisten-Geometrie:
// bündig über der Leiste, gleiche Breite, Textband vollständig abgedeckt.

const VIEW_WIDTHS = [480, 640, 780, 960, 1280];

// Boss-Name-Anker (UI.createBossUI): PixelText zentriert bei (viewWidth/2, 33),
// Glyphen 5x7 (GLYPH_H) → Band y 33..40 (Unterkante = Leistenoberkante).
const NAME_TOP_Y = 33;
const NAME_BOTTOM_Y = 40;
// Bar-Anker: y=46, Höhe 12, Origin (0,0.5) → Oberkante 40.
const BAR_TOP_Y = 40;

describe("bossNamePlateRect (m10-boss-name-legibility #10455)", () => {
  it.each(VIEW_WIDTHS)("Platte bündig über der HP-Leiste bei viewWidth=%i", (width) => {
    const plate = bossNamePlateRect(width);
    const bar = bossBarGeometry(width);
    expect(plate.x).toBe(bar.left);
    expect(plate.w).toBe(bar.barW);
    expect(plate.y + plate.h).toBe(BAR_TOP_Y);
  });

  it.each(VIEW_WIDTHS)("Platte deckt das Textband vollständig bei viewWidth=%i", (width) => {
    const plate = bossNamePlateRect(width);
    expect(plate.y).toBeLessThanOrEqual(NAME_TOP_Y);
    expect(plate.y + plate.h).toBeGreaterThanOrEqual(NAME_BOTTOM_Y);
    // Name ist zentriert: Band liegt horizontal in der Platte.
    const nameHalf = 101 / 2; // gemessene Bandbreite "GLOCKENTURM-GOLEM" (before-JSON)
    expect(width / 2 - nameHalf).toBeGreaterThanOrEqual(plate.x);
    expect(width / 2 + nameHalf).toBeLessThanOrEqual(plate.x + plate.w);
  });

  it.each(VIEW_WIDTHS)("ganzzahlige Spielpixel bei viewWidth=%i", (width) => {
    const plate = bossNamePlateRect(width);
    for (const v of [plate.x, plate.y, plate.w, plate.h]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("Platte breiter als jeder beobachtete Boss-Name, aber nie die View überragend", () => {
    for (const width of VIEW_WIDTHS) {
      const plate = bossNamePlateRect(width);
      expect(plate.w).toBeGreaterThanOrEqual(101);
      expect(plate.x).toBeGreaterThanOrEqual(0);
      expect(plate.x + plate.w).toBeLessThanOrEqual(width);
    }
  });

  it("Platte-Alpha = Leisten-Alpha (0,95, eine dunkle Platte wie die Leiste)", () => {
    expect(BOSS_NAME_PLATE_ALPHA).toBe(0.95);
  });
});
