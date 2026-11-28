import { describe, expect, it, vi } from "vitest";

// M10-touch-overlay-crisp, Karte K3: Guard gegen matschige Touch-Overlay-
// Darstellung (Beleg shots/m10-touch-overlay-before.json, Befunde F1-F7):
// Alpha-Fills blendeten mit dem Spielfeld (Kontrast ueber dem Laternen-Hotspot
// 1.01-1.19, Farb-Drift dark<->hot bis 68 Kanalstufen). Der Vertrag nach dem
// Fix, fuer beide Abnahmeformate (640x360@2, 780x360@3):
//   - ALLE Draw-Groessen ganzzahlig (Spielpixel-Raster, kein Mixel).
//   - ALLE Alphas >= OVERLAY_MIN_ALPHA (0.85) -> keine Untergrundabhaengigkeit.
//   - Sichtbare Koerper-Fills (Ring/Knauf/Balken) Kontrast >= 3.0 gegen dunkles
//     UND helles (Laternen-Hotspot) Spielfeld.
//   - Safe-Area-Marge des Pause-Knopfs bleibt erfuellt (pauseAnchor bytegleich).
// Phaser wird neutral gemockt (Muster tests/touch-joystick-feel.test.ts).
vi.mock("phaser", () => ({ default: {} }));

import {
  KNOB_RADIUS,
  OVERLAY_MIN_ALPHA,
  PAUSE_MARGIN,
  PAUSE_H,
  PAUSE_W,
  RING_RADIUS,
  pauseAnchor,
  touchOverlaySpec,
} from "../src/input/TouchControls";
import { PAL } from "../src/palette";

/** Gemessene Spielfeld-Untergruende (shots/m10-touch-overlay-before.json). */
const FIELD_DARK: [number, number, number] = [39, 55, 39]; // 780x360@3, Sample dark
const FIELD_HOT: [number, number, number] = [91, 94, 62]; // Sample hot (Spielerlaterne)

/** Beide Abnahme-Viewports (K1/K4-Profile). */
const VIEWS: Array<{ w: number; h: number; label: string }> = [
  { w: 640, h: 360, label: "640x360" },
  { w: 780, h: 360, label: "780x360" },
];

function lum([r, g, b]: readonly number[]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: readonly number[], b: readonly number[]): number {
  const l1 = lum(a);
  const l2 = lum(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
function palColor(index: number): [number, number, number] {
  const v = PAL[index];
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

describe("m10-touch-overlay-crisp: ganzzahlige Draw-Groessen", () => {
  it("Ring- und Knauf-Fills sitzen auf ganzzahligen Radien/Strichstaerken", () => {
    const spec = touchOverlaySpec();
    expect(Number.isInteger(spec.ring.radius)).toBe(true);
    expect(Number.isInteger(spec.knob.radius)).toBe(true);
    for (const fill of [...spec.ring.fills, ...spec.knob.fills]) {
      expect(Number.isInteger(fill.radius)).toBe(true);
      expect(Number.isInteger(fill.thickness)).toBe(true);
      expect(fill.radius).toBeGreaterThan(0);
      expect(fill.thickness).toBeGreaterThanOrEqual(0);
      // Alle Fills liegen in der 32er-Palette.
      expect(fill.colorIndex).toBeGreaterThanOrEqual(0);
      expect(fill.colorIndex).toBeLessThan(PAL.length);
    }
  });

  it("Knauf bleibt innerhalb des Rings und beide Formate passen den Ring um den Ursprung", () => {
    const spec = touchOverlaySpec();
    const outer = Math.max(...spec.ring.fills.map((f) => f.radius));
    expect(outer).toBeLessThanOrEqual(RING_RADIUS + 1);
    expect(KNOB_RADIUS).toBeLessThan(RING_RADIUS);
    // Deadzone-Vertrag (touch-joystick-feel) unangetastet: Knob klemmt am Ring.
    for (const view of VIEWS) {
      const deadzone = Math.round(RING_RADIUS * 0.16 * Math.max(1, view.w / 480));
      expect(deadzone).toBeLessThan(RING_RADIUS);
    }
  });

  it("Pause-Knopf: ganzzahlige Groessen, Balken zentriert (Randmargen 8/8)", () => {
    const p = touchOverlaySpec().pause;
    expect(p.width).toBe(PAUSE_W);
    expect(p.height).toBe(PAUSE_H);
    expect(Number.isInteger(p.barWidth)).toBe(true);
    expect(Number.isInteger(p.barHeight)).toBe(true);
    for (const bx of p.barOffsetsX) expect(Number.isInteger(bx)).toBe(true);
    // Balken symmetric im 30er-Knopf: linke Kante 8, rechte Kante 22 -> Marge 8/8.
    expect(p.barOffsetsX[0] - p.barWidth / 2).toBe(8);
    expect(PAUSE_W - (p.barOffsetsX[1] + p.barWidth / 2)).toBe(8);
    // Balken ueberlappen sich nicht und liegen innerhalb des Knopfs.
    expect(p.barOffsetsX[1] - p.barWidth / 2).toBeGreaterThanOrEqual(p.barOffsetsX[0] + p.barWidth / 2);
  });
});

describe("m10-touch-overlay-crisp: Mindest-Deckkraft (kein Untergrund-Blending)", () => {
  it("alle Overlay-Alphas >= OVERLAY_MIN_ALPHA", () => {
    const spec = touchOverlaySpec();
    for (const fill of [...spec.ring.fills, ...spec.knob.fills]) {
      expect(fill.alpha).toBeGreaterThanOrEqual(OVERLAY_MIN_ALPHA);
    }
    const p = spec.pause;
    expect(p.bgAlpha).toBeGreaterThanOrEqual(OVERLAY_MIN_ALPHA);
    expect(p.strokeAlpha).toBeGreaterThanOrEqual(OVERLAY_MIN_ALPHA);
    expect(p.barAlpha).toBeGreaterThanOrEqual(OVERLAY_MIN_ALPHA);
  });

  it("Koerper-Fills haben Kontrast >= 3.0 gegen dunkles UND helles Spielfeld", () => {
    const spec = touchOverlaySpec();
    // Ring: der sichtbare Ringkoerper (bone) — Kontur (ink) ist als 1-px-Kante
    // daneben und braucht keinen Eigenkontrast.
    const ringBody = spec.ring.fills.find((f) => f.colorIndex !== 0);
    expect(ringBody).toBeDefined();
    const knobBody = spec.knob.fills[spec.knob.fills.length - 1];
    const barColor = palColor(11); // C.boneLight (Balken-Fill)
    for (const field of [FIELD_DARK, FIELD_HOT]) {
      expect(contrast(palColor(ringBody!.colorIndex), field)).toBeGreaterThanOrEqual(3.0);
      expect(contrast(palColor(knobBody.colorIndex), field)).toBeGreaterThanOrEqual(3.0);
      expect(contrast(barColor, field)).toBeGreaterThanOrEqual(3.0);
    }
  });
});

describe("m10-touch-overlay-crisp: Safe-Area-Marge des Pause-Knopfs bleibt erfuellt", () => {
  it("pauseAnchor haelt PAUSE_MARGIN in beiden Viewports (ohne und mit Inset)", () => {
    for (const view of VIEWS) {
      for (const inset of [
        { right: 0, top: 0 },
        { right: 47, top: 0 },
        { right: 20, top: 30 },
      ]) {
        const a = pauseAnchor(view.w, view.h, inset.right, inset.top);
        expect(Number.isInteger(a.x)).toBe(true);
        expect(Number.isInteger(a.y)).toBe(true);
        // Knopf vollstaendig im View, Rand >= PAUSE_MARGIN bzw. Inset.
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.x + PAUSE_W).toBeLessThanOrEqual(view.w - Math.max(PAUSE_MARGIN, inset.right) + PAUSE_MARGIN);
        expect(view.w - (a.x + PAUSE_W)).toBeGreaterThanOrEqual(Math.max(PAUSE_MARGIN, inset.right));
        expect(a.y).toBeGreaterThanOrEqual(Math.max(PAUSE_MARGIN, inset.top));
        expect(a.y + PAUSE_H).toBeLessThanOrEqual(view.h);
      }
    }
  });

  it("bleibt ohne Inset bitgleich zur 640x360-Referenz (hud-safearea Regression)", () => {
    expect(pauseAnchor(640, 360, 0, 0)).toEqual({ x: 600, y: 10 });
    expect(pauseAnchor(780, 360, 0, 0)).toEqual({ x: 740, y: 10 });
  });
});
