import { describe, expect, it, vi } from "vitest";
// UI.ts importiert Phaser (Szene); die gepruefte Mathematik ist rein.
// Phaser wird neutral gemockt (Muster tests/chest-hint-wrap.test.ts).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  return { default: { GameObjects: { Container }, Scene } };
});
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import {
  CHEST_HINT_Y,
  CHEST_ICON_DRAW_SCALE,
  CHEST_ICON_SCALE,
  CHEST_ICON_TEX,
  CHEST_ICON_Y,
  CHEST_PANEL_BAND_H,
  chestPanelBoxes,
} from "../src/scenes/UI";

// m10-chest-icon-crisp K2: Regressionstest zur ganzzahligen Draw-Stufe des
// Truhen-Icons im offenen Panel (menu-art-crisp Befund F2).
// Ist-Befund (shots/m10-chest-icon-before.json): chest_closed wurde mit dem
// Layout-Wert 2.6 fraktional skaliert — Geraetepixel je Texel 5.2 (640x360@2)
// und 7.8 (780x360@3), Mixelklasse wie title_background F1. Fix: Anker-Boxen
// bleiben beim Layout-Wert 2.6 (Panel-Layout unveraendert), der Draw-Pfad
// nutzt die naechste ganzzahlige Stufe CHEST_ICON_DRAW_SCALE.
const PROFILES = [
  { label: "640x360", width: 640, height: 360 },
  { label: "780x360", width: 780, height: 360 },
  { label: "1920x1080", width: 1920, height: 1080 },
];

const oy = (height: number) => Math.round((height - CHEST_PANEL_BAND_H) / 2);
/** Geraetepixel je Texel = Draw-Scale x (Screenshot-px je Spielpixel). */
const pxPerGame = (dpr: number) => dpr; // css == intern im Akzeptanzsetup

describe("chestIconDrawScale – ganzzahlige Draw-Stufe (Befund 2.6 ist weg)", () => {
  it("Draw-Stufe ist positive ganze Zahl", () => {
    expect(Number.isInteger(CHEST_ICON_DRAW_SCALE)).toBe(true);
    expect(CHEST_ICON_DRAW_SCALE).toBeGreaterThanOrEqual(1);
  });

  it("Draw-Stufe ist die naechste ganzzahlige Stufe zum Layout-Wert 2.6 (kein Sprung)", () => {
    expect(Math.abs(CHEST_ICON_DRAW_SCALE - CHEST_ICON_SCALE)).toBeLessThan(1);
    expect(CHEST_ICON_DRAW_SCALE).toBe(3);
  });

  it.each(PROFILES)("Geraetepixel je Texel ganzzahlig in %ix%i (DPR 2 und 3)", ({ height }) => {
    for (const dpr of [2, 3]) {
      const dev = CHEST_ICON_DRAW_SCALE * pxPerGame(dpr);
      expect(Number.isInteger(dev)).toBe(true);
    }
  });

  it("Befund-Kontrast: der alte Layout-Wert 2.6 waere NICHT ganzzahlig (Abnahme 640x360@2 / 780x360@3)", () => {
    expect(Number.isInteger(CHEST_ICON_SCALE * pxPerGame(2))).toBe(false);
    expect(Number.isInteger(CHEST_ICON_SCALE * pxPerGame(3))).toBe(false);
  });
});

describe("Draw-Icon passt ins Panel (Layout-Wert/Anker-Boxen unveraendert)", () => {
  it("Layout-Wert CHEST_ICON_SCALE bleibt 2.6 (chest-panel-ui-Anker pinnt ihn)", () => {
    expect(CHEST_ICON_SCALE).toBe(2.6);
  });

  it.each(PROFILES)(
    "Icon bei %ix%i: unter Untertitel, ueber Hint-Band, innerhalb Rahmen, zentriert ganzzahlig",
    ({ width, height }) => {
      const o = oy(height);
      const cx = width / 2;
      const drawHalf = (CHEST_ICON_TEX * CHEST_ICON_DRAW_SCALE) / 2;
      const top = CHEST_ICON_Y + o - drawHalf;
      const bottom = CHEST_ICON_Y + o + drawHalf;
      const boxes = chestPanelBoxes(width, height);
      const subtitleBottom = boxes.subtitle.y + boxes.subtitle.h;
      const hintTop = boxes["hint-0"].y;

      expect(Number.isInteger(cx)).toBe(true);
      expect(Number.isInteger(CHEST_ICON_Y + o)).toBe(true);
      // Klar ueber dem Hint-Band (Skript-Kriterium iconClearOfHintTop):
      expect(bottom).toBeLessThanOrEqual(hintTop);
      // Klar unter dem Untertitel:
      expect(top).toBeGreaterThanOrEqual(subtitleBottom);
      // Innerhalb des Panel-Rahmens (+/- 2 px wie im chest-panel-ui-Test):
      expect(top).toBeGreaterThanOrEqual(boxes.frame.y + 2);
      expect(bottom).toBeLessThanOrEqual(boxes.frame.y + boxes.frame.h - 2);
      // Keine Ueberlappung mit Untertitel/Hint-Baenden:
      expect(bottom <= boxes["hint-0"].y && top >= subtitleBottom).toBe(true);
    },
  );

  it.each(PROFILES)("chestPanelBoxes icon-Box bleibt beim Layout-Wert 2.6 (%ix%i)", ({ width, height }) => {
    const boxes = chestPanelBoxes(width, height);
    const o = oy(height);
    const cx = width / 2;
    const layoutHalf = (CHEST_ICON_TEX * CHEST_ICON_SCALE) / 2;
    expect(boxes.icon).toEqual({
      x: Math.round(cx - layoutHalf),
      y: Math.round(CHEST_ICON_Y + o - layoutHalf),
      w: Math.round(layoutHalf * 2),
      h: Math.round(layoutHalf * 2),
    });
  });
});

describe("Szenen-Quelle – Draw-Pfad nutzt die ganzzahlige Stufe", () => {
  it("UI.ts zeichnet chestSprite nie mehr mit dem fraktionalen Layout-Wert", () => {
    const src = readFileSync("src/scenes/UI.ts", "utf8");
    expect(src).toContain("CHEST_ICON_DRAW_SCALE");
    expect(src).not.toContain("setScale(CHEST_ICON_SCALE)");
  });
});
