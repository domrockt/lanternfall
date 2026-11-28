import { describe, expect, it, vi } from "vitest";
// UI.ts importiert Phaser (Szene); die gepruefte Mathematik ist rein.
// Phaser wird neutral gemockt (Muster tests/chest-icon-crisp.test.ts).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  return { default: { GameObjects: { Container }, Scene } };
});
import {
  CHEST_ICON_DRAW_SCALE,
  CHEST_ICON_TEX,
  CHEST_SLOT_ICON_SCALE,
  CHEST_TITLE_SCALE,
  chestPanelBoxes,
} from "../src/scenes/UI";
import { chestPanelLayout } from "../src/logic/chest-reveal";
import { GLYPH_H } from "../src/gfx/font";

// m10-chest-closed-crisp-ui (menu-art-crisp Befund F2, UI-Teil): Guard gegen
// fraktionale Skalen und Icon-/Text-Überlappungen im offenen Truhen-Panel.
// Vorher-Befund (scripts/m10-chest-closed-ui.mjs TAG=before,
// ~/games/.evidence/m10-chest-closed-crisp-ui/): Reward-Slot-Icons Scale 2.4
// -> Gerätepixel je Texel 4.8 (@2) / 7.2 (@3), Crop-Run-Length 1844/3104
// nicht-Vielfache Runs (Mixel). chestSprite war bereits ganzzahlig (Stufe 3).
// Laufzeit-Anker: ChestSystem.applyPanelFix setzt Panel-Icon/Untertitel/Hints
// auf chestPanelLayout — deshalb prueft dieser Test den sichtbaren Zustand.

const PROFILES = [
  { label: "640x360", width: 640, height: 360, dpr: 2 },
  { label: "780x360", width: 780, height: 360, dpr: 3 },
  { label: "1920x1080", width: 1920, height: 1080, dpr: 2 },
];

type Box = { x: number; y: number; w: number; h: number };

/** Ink-Box eines PixelText-Anchor-Punkts (Glyphen Origin 0/0, Ink = GLYPH_H). */
const inkBox = (x: number, y: number, chars: number, scale: number): Box => ({
  x: x - (chars * 6 - 1) * scale / 2,
  y,
  w: (chars * 6 - 1) * scale,
  h: GLYPH_H * scale,
});

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("chest-closed-ui-crisp — ganzzahlige Skalen (Befund 2.4 ist weg)", () => {
  it("Panel-Icon: Draw-Stufe positiv ganzzahlig und == Laufzeit-Stufe aus chestPanelLayout", () => {
    expect(Number.isInteger(CHEST_ICON_DRAW_SCALE)).toBe(true);
    expect(CHEST_ICON_DRAW_SCALE).toBeGreaterThanOrEqual(1);
    expect(chestPanelLayout(0).iconScale).toBe(CHEST_ICON_DRAW_SCALE);
  });

  it("Reward-Slot-Icons: Skala positiv ganzzahlig (Vorher: 2.4)", () => {
    expect(Number.isInteger(CHEST_SLOT_ICON_SCALE)).toBe(true);
    expect(CHEST_SLOT_ICON_SCALE).toBeGreaterThanOrEqual(1);
    expect(CHEST_SLOT_ICON_SCALE).not.toBe(2.4);
  });

  it.each(PROFILES)("Gerätepixel je Texel ganzzahlig in %label ($dpr DPR)", ({ dpr }) => {
    const pxPerGame = dpr; // css == intern im Akzeptanzsetup
    expect(Number.isInteger(CHEST_ICON_DRAW_SCALE * pxPerGame)).toBe(true);
    expect(Number.isInteger(CHEST_SLOT_ICON_SCALE * pxPerGame)).toBe(true);
  });

  it("Slot-Icon passt ganzzahlig in den 44-px-Slot (kein Überhang in die Slot-Texte)", () => {
    const SLOT_BG = 44;
    const display = CHEST_ICON_TEX * CHEST_SLOT_ICON_SCALE;
    expect(display % 2).toBe(0); // ganzzahlige Kanten bei ganzzahligem Zentrum
    expect(display).toBeLessThanOrEqual(SLOT_BG - 4);
    expect(display).toBeLessThan(SLOT_BG);
  });
});

describe("chest-closed-ui-crisp — 0 Icon-Überlappungen mit Untertitel/Panel", () => {
  it.each(PROFILES)("%label ($width x $height): Icon-Box frei von Titel-/Untertitel-/Hint-/Slot-Text-Ink", ({ width, height }) => {
    const oy = Math.round((height - 270) / 2);
    const cx = width / 2;
    const lay = chestPanelLayout(oy);
    const half = (CHEST_ICON_TEX * lay.iconScale) / 2;
    const icon: Box = { x: cx - half, y: lay.iconY - half, w: half * 2, h: half * 2 };

    // Texte als Ink-Boxen (Glyphen Origin 0/0, Anker = Container-Position):
    const title = inkBox(cx, lay.titleY, 14, CHEST_TITLE_SCALE); // "TRUHE GEÖFFNET"
    const subtitle = inkBox(cx, lay.subtitleY, 22, 1); // "BELOHNUNGEN ROLLEN ..."
    const hints = lay.hintY.map((y) => inkBox(cx, y, 30, 1)); // Evo-Hinweiszeilen (Slot-Breite)

    expect(overlap(icon, title)).toBe(false);
    expect(overlap(icon, subtitle)).toBe(false);
    for (const h of hints) expect(overlap(icon, h)).toBe(false);

    // Icon vollständig im Panel-Rahmen (NineSlice, Origin 0.5, max 452 px).
    const frameW = Math.min(452, width - 24);
    const frame: Box = { x: cx - frameW / 2, y: 140 + oy - 122, w: frameW, h: 244 };
    expect(icon.x).toBeGreaterThanOrEqual(frame.x);
    expect(icon.y).toBeGreaterThanOrEqual(frame.y);
    expect(icon.x + icon.w).toBeLessThanOrEqual(frame.x + frame.w);
    expect(icon.y + icon.h).toBeLessThanOrEqual(frame.y + frame.h);
  });

  it.each(PROFILES)("%label: Panel-Anker-Boxen (chestPanelBoxes) unverändert überlappungsfrei", ({ width, height }) => {
    const boxes = chestPanelBoxes(width, height);
    const keys = Object.keys(boxes);
    // Keine Box schneidet eine fremde Box (Icon vs. Titel/Untertitel/Hints).
    const icon = boxes.icon;
    for (const k of keys) {
      if (k === "icon" || k === "frame") continue;
      const b = boxes[k] as Box;
      const cut = icon.x < b.x + b.w && b.x < icon.x + icon.w && icon.y < b.y + b.h && b.y < icon.y + icon.h;
      expect(cut, `icon vs ${k}`).toBe(false);
    }
  });
});
