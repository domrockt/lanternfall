import { describe, expect, it, vi } from "vitest";
// ChestSystem importiert Phaser (Szene/BlendModes); die reine Layout-Funktion
// braucht kein DOM. Phaser wird wie in boss-spawn-composition.test.ts gemockt.
vi.mock("phaser", () => ({ default: {} }));
import {
  CHEST_ARROW_INSET,
  CHEST_ARROW_MARGIN,
  computeChestArrow,
  type ArrowView,
} from "../src/systems/ChestSystem";

/** Standard-View 640x360, zoom 1, worldView == gesamter View. */
function view(width = 640, height = 360, zoom = 1): ArrowView {
  const vw = width / zoom;
  const vh = height / zoom;
  return {
    width,
    height,
    viewX: width / 2 - vw / 2,
    viewY: height / 2 - vh / 2,
    viewWidth: vw,
    viewHeight: vh,
    zoom,
  };
}

/** Gerenderte Screen-Position eines scrollFactor-0-Objekts (Zoom um Mitte). */
function renderPos(layout: { x: number; y: number }, width: number, height: number, zoom: number) {
  return {
    x: width / 2 + (layout.x - width / 2) * zoom,
    y: height / 2 + (layout.y - height / 2) * zoom,
  };
}

function angleDiffDeg(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) * 180 / Math.PI;
}

/** Winkel von der View-Mitte zur Truhe (wahre Richtung, Screen-Raum). */
function trueAngleDeg(v: ArrowView, chestX: number, chestY: number): number {
  const zoom = v.zoom;
  const sx = v.width / 2 + (chestX - (v.viewX + v.viewWidth / 2)) * zoom;
  const sy = v.height / 2 + (chestY - (v.viewY + v.viewHeight / 2)) * zoom;
  return Math.atan2(sy - v.height / 2, sx - v.width / 2);
}

describe("M10 chest-arrow: Randpfeil-Layout (computeChestArrow)", () => {
  it("Randfall rechts: sichtbar, Winkel 0, sitzt am Margin-Rand (640 und 780 breit)", () => {
    for (const width of [640, 780]) {
      const v = view(width);
      const layout = computeChestArrow(v, v.viewX + v.viewWidth + 1500, v.viewY + v.viewHeight / 2);
      expect(layout.visible).toBe(true);
      expect(angleDiffDeg(layout.angle, trueAngleDeg(v, v.viewX + v.viewWidth + 1500, v.viewY + v.viewHeight / 2))).toBeLessThanOrEqual(5);
      const rp = renderPos(layout, v.width, v.height, v.zoom);
      expect(rp.x).toBeCloseTo(v.width - CHEST_ARROW_MARGIN, 1);
      expect(rp.y).toBeCloseTo(v.height / 2, 1);
    }
  });

  it("Eckfall diagonal weit hinter der Ecke: Winkel bleibt <= 5 Grad (alte Achsen-Klemme: ~15-19 Grad)", () => {
    for (const width of [640, 780]) {
      const v = view(width);
      const chest = { x: v.viewX + v.viewWidth + 1500, y: v.viewY + v.viewHeight + 1500 };
      const layout = computeChestArrow(v, chest.x, chest.y);
      expect(layout.visible).toBe(true);
      expect(angleDiffDeg(layout.angle, trueAngleDeg(v, chest.x, chest.y))).toBeLessThanOrEqual(5);
      // Pfeil liegt auf dem Strahl Mitte->Truhe: Winkel von der Mitte zum
      // Renderpunkt == Truchenrichtung.
      const rp = renderPos(layout, v.width, v.height, v.zoom);
      const rAngle = Math.atan2(rp.y - v.height / 2, rp.x - v.width / 2);
      expect(angleDiffDeg(rAngle, trueAngleDeg(v, chest.x, chest.y))).toBeLessThanOrEqual(5);
      // Und sitzt im Margin-Rechteck.
      expect(rp.x).toBeGreaterThanOrEqual(CHEST_ARROW_MARGIN - 1);
      expect(rp.x).toBeLessThanOrEqual(v.width - CHEST_ARROW_MARGIN + 1);
      expect(rp.y).toBeGreaterThanOrEqual(CHEST_ARROW_MARGIN - 1);
      expect(rp.y).toBeLessThanOrEqual(v.height - CHEST_ARROW_MARGIN + 1);
    }
  });

  it("Zoom-Puls 1.14: Truhe 10 px hinter dem sichtbaren Rand -> Pfeil sichtbar am Rand, nicht an camera.width gemessen", () => {
    const zoom = 1.14;
    const v = view(640, 360, zoom);
    // 10 px hinter dem sichtbaren rechten Rand (worldView-Raum).
    const chest = { x: v.viewX + v.viewWidth + 10, y: v.viewY + v.viewHeight / 2 };
    const layout = computeChestArrow(v, chest.x, chest.y);
    expect(layout.visible).toBe(true); // vor dem Fix: verborgen (camera.width-Check)
    expect(angleDiffDeg(layout.angle, trueAngleDeg(v, chest.x, chest.y))).toBeLessThanOrEqual(5);
    const rp = renderPos(layout, v.width, v.height, zoom);
    expect(rp.x).toBeCloseTo(v.width - CHEST_ARROW_MARGIN, 0);
    expect(rp.y).toBeCloseTo(v.height / 2, 0);
  });

  it("Truhe im View (inkl. Randbereich): Pfeil unsichtbar", () => {
    const v = view(640, 360);
    expect(computeChestArrow(v, v.viewX + v.viewWidth / 2, v.viewY + v.viewHeight / 2).visible).toBe(false);
    // Knapp innerhalb des Einzugs.
    expect(computeChestArrow(v, v.viewX + CHEST_ARROW_INSET + 2, v.viewY + v.viewHeight / 2).visible).toBe(false);
    // Ein Pixel ausserhalb des Einzugs: sichtbar.
    expect(computeChestArrow(v, v.viewX + CHEST_ARROW_INSET - 2, v.viewY + v.viewHeight / 2).visible).toBe(true);
  });

  it("Zoom-Renderposition: scrollFactor-0-Rueckrechnung landet exakt am Soll-Randpunkt", () => {
    const zoom = 1.14;
    const v = view(780, 360, zoom);
    const chest = { x: v.viewX + v.viewWidth / 2, y: v.viewY + v.viewHeight + 400 };
    const layout = computeChestArrow(v, chest.x, chest.y);
    expect(layout.visible).toBe(true);
    const rp = renderPos(layout, v.width, v.height, zoom);
    const expAngle = Math.atan2(chest.y - (v.viewY + v.viewHeight / 2), chest.x - (v.viewX + v.viewWidth / 2));
    expect(angleDiffDeg(Math.atan2(rp.y - v.height / 2, rp.x - v.width / 2), expAngle)).toBeLessThanOrEqual(5);
    expect(rp.y).toBeCloseTo(v.height - CHEST_ARROW_MARGIN, 0);
  });
});
