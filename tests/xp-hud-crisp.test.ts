import { describe, expect, it, vi } from "vitest";
// UI.ts ist eine Phaser-Szene; die reinen HUD-Geometriefunktionen brauchen
// kein DOM. Phaser wird neutral gemockt (wie tests/hud-anchor.test.ts).
vi.mock("phaser", () => {
  class Scene { constructor(_key?: string) { /* Stub */ } }
  class Container { constructor(_scene?: unknown, _x?: number, _y?: number) { /* Stub */ } }
  return { default: { Scene, GameObjects: { Container } } };
});
import {
  crispFillWidth,
  bossBarGeometry,
  HUD_HP_FILL_W,
  HUD_HP_W,
  type AnchorBox,
  hudAnchorBoxes,
} from "../src/scenes/UI";

/**
 * m10-xp-hud-crisp: Guard gegen die menu-art-crisp Befundklasse F1 im
 * In-Game-HUD (Beleg shots/m10-xp-hud-before.json): Fuell-Rechtecke (XP, HP,
 * Boss) mit fraktionaler Display-Breite und Boss-Segmente auf fraktionalen
 * x-Positionen. Nach dem Fix muessen ALLE HUD-Rechtecke in den 3
 * Abnahmeformaten (640x360@2 -> 640, 780x360@3 -> 780, 1080p -> 640) auf
 * ganzzahligen Spielpixeln sitzen.
 */

// Interne Viewbreiten der 3 Formate (1080p = 1920/3 = 640):
const WIDTHS = [640, 780, 640];
// XP-Fuell-Basisbreite je Format: Breite - Safe-Margen (5/5) - 2 px Inset:
const XP_BASE_W: Record<number, number> = { 640: 628, 780: 768 };

describe("m10-xp-hud-crisp: crispFillWidth (XP/HP/Boss-Fuellung)", () => {
  it("liefert fuer jeden Ratio-Sweep ganzzahlige Fuellbreiten", () => {
    const bases = [...new Set([...Object.values(XP_BASE_W), HUD_HP_FILL_W, 228, 724])];
    for (const base of bases) {
      for (let k = 0; k <= 128; k++) {
        const ratio = k / 128;
        const w = crispFillWidth(base, ratio);
        expect(Number.isInteger(w)).toBe(true);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(base);
      }
    }
  });

  it("ist monoton nicht-fallend im Ratio", () => {
    let last = -1;
    for (let k = 0; k <= 256; k++) {
      const w = crispFillWidth(628, k / 256);
      expect(w).toBeGreaterThanOrEqual(last);
      last = w;
    }
  });

  it("bildet die Extremwerte exakt ab", () => {
    expect(crispFillWidth(628, 1)).toBe(628);
    expect(crispFillWidth(628, 0)).toBe(0);
    expect(crispFillWidth(82, 1)).toBe(82);
    expect(crispFillWidth(228, 1)).toBe(228);
  });

  it("klammert Ratio ausserhalb [0,1]", () => {
    expect(crispFillWidth(628, 2)).toBe(628);
    expect(crispFillWidth(628, -3)).toBe(0);
  });

  it("Fix-Nachweis: die before-Befunde sind jetzt ganzzahlig", () => {
    // before-JSON: displayW 235.5 (640x360@2), 341.333 (780x360@3),
    // 209.333 (1080p) bei xpRatio 0.375/0.444/0.333; hp 81.648 bei 0.996.
    expect(Number.isInteger(crispFillWidth(XP_BASE_W[640], 0.375))).toBe(true);
    expect(Number.isInteger(crispFillWidth(XP_BASE_W[780], 0.444))).toBe(true);
    expect(Number.isInteger(crispFillWidth(XP_BASE_W[640], 0.333))).toBe(true);
    expect(Number.isInteger(crispFillWidth(HUD_HP_FILL_W, 0.996))).toBe(true);
  });
});

describe("m10-xp-hud-crisp: bossBarGeometry (Boss-Leiste)", () => {
  const VIEW_WIDTHS = [...WIDTHS, 683, 1024, 400]; // + dynamische/ schmale Views

  it("liefert fuer jede Viewbreite ganzzahlige Geometrie", () => {
    for (const w of VIEW_WIDTHS) {
      const g = bossBarGeometry(w);
      expect(Number.isInteger(g.barW)).toBe(true);
      expect(Number.isInteger(g.left)).toBe(true);
      expect(Number.isInteger(g.fillX)).toBe(true);
      expect(Number.isInteger(g.fillW)).toBe(true);
      expect(Number.isInteger(g.capXs[0])).toBe(true);
      expect(Number.isInteger(g.capXs[1])).toBe(true);
      for (const x of g.segXs) expect(Number.isInteger(x)).toBe(true);
    }
  });

  it("bleibt bei den Referenzbreiten pixelgleich zum alten Layout", () => {
    // barW = min(236, W-48); links mittig; Fuellung 4 px innen, 8 px schmaler.
    for (const w of [640, 780]) {
      const g = bossBarGeometry(w);
      expect(g.barW).toBe(236);
      expect(g.left).toBe(Math.round(w / 2 - 118));
      expect(g.fillX).toBe(g.left + 4);
      expect(g.fillW).toBe(228);
      expect(g.fillW).toBeLessThan(g.barW);
      // Segmente liegen innerhalb der Fuellung, Endkappen ausserhalb:
      for (const x of g.segXs) {
        expect(x).toBeGreaterThan(g.fillX);
        expect(x).toBeLessThan(g.fillX + g.fillW);
      }
      expect(g.capXs[0]).toBe(g.left - 5);
      expect(g.capXs[1]).toBe(g.left + g.barW - 5);
    }
  });

  it("hat 8 Segmente (wie vorher)", () => {
    expect(bossBarGeometry(640).segXs).toHaveLength(8);
  });

  it("Fix-Nachweis: Segment-x ist nicht mehr i*(236-8)/9-fraktional", () => {
    // before: left + 4 + i*25.333 -> 231.333, 256.667, 282.0, ...
    const g = bossBarGeometry(640);
    for (const x of g.segXs) expect(x % 1).toBe(0);
  });
});

describe("m10-xp-hud-crisp: HUD-Anker ganzzahlig in allen 3 Formaten", () => {
  it("hudAnchorBoxes liefert nur ganzzahlige Rechtecke", () => {
    for (const w of WIDTHS) {
      const boxes: Record<string, AnchorBox> = hudAnchorBoxes(w, 360, { iconCount: 12 });
      for (const [name, b] of Object.entries(boxes)) {
        expect(Number.isInteger(b.x), `${name}.x @${w}`).toBe(true);
        expect(Number.isInteger(b.y), `${name}.y @${w}`).toBe(true);
        expect(Number.isInteger(b.w), `${name}.w @${w}`).toBe(true);
        expect(Number.isInteger(b.h), `${name}.h @${w}`).toBe(true);
      }
    }
  });

  it("HP-Fuellbreite passt in den HP-Rahmen", () => {
    expect(HUD_HP_FILL_W).toBeLessThan(HUD_HP_W);
  });
});
