import { describe, expect, it, vi } from "vitest";
// UI.ts importiert Phaser (Szene); die gepruefte Panel-Box-Mathematik ist rein.
// Phaser wird neutral gemockt (PixelText erweitert Phaser.GameObjects.Container).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  return { default: { GameObjects: { Container }, Scene } };
});
import {
  CHEST_FRAME_H,
  CHEST_FRAME_W,
  CHEST_ICON_SCALE,
  CHEST_PANEL_BAND_H,
  CHEST_SUBTITLE_GAP_PX,
  CHEST_SUBTITLE_MIN_GAP_PX,
  CHEST_TITLE_SCALE,
  chestPanelBoxes,
  type AnchorBox,
} from "../src/scenes/UI";

// m10-chest-panel-ui K3: Box-Mathematik des offenen Truhen-Panels. Der
// Ist-Befund (shots/m10-chest-panel-before.json) war ein Gap von nur 2 px
// zwischen Titel-Unterkante und Untertitel-Oberkante. Abnahmekriterium:
// Untertitel-Oberkante >= Titel-Unterkante + 4 px, 0 Ueberlappungen der
// Panel-Inhalte, alles innerhalb Panel-Rahmen und Viewport — in drei
// Viewport-Profilen (640x360, 780x360, 1920x1080).
const PROFILES = [
  { label: "640x360", width: 640, height: 360 },
  { label: "780x360", width: 780, height: 360 },
  { label: "1920x1080", width: 1920, height: 1080 },
];

const CONTENT = ["title", "subtitle", "icon", "hint-0", "hint-1"] as const;

function overlaps(a: AnchorBox, b: AnchorBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function bottom(b: AnchorBox): number {
  return b.y + b.h;
}

for (const p of PROFILES) {
  describe(`chestPanelBoxes ${p.label}`, () => {
    const boxes = chestPanelBoxes(p.width, p.height);

    it("Untertitel-Oberkante >= Titel-Unterkante + 4 px (Ist-Befund war 2 px)", () => {
      const gap = boxes.subtitle.y - bottom(boxes.title);
      expect(gap).toBeGreaterThanOrEqual(CHEST_SUBTITLE_MIN_GAP_PX);
      // Der Anker ist bewusst gewaehlt: Titel-Unterkante + Gap, skalierungs-
      // unabhaengig vom Viewport.
      expect(gap).toBe(CHEST_SUBTITLE_GAP_PX);
    });

    it("Titel nutzt die dokumentierte Glyph-Skala (Untertitel-Anker bleibt korrekt)", () => {
      expect(CHEST_TITLE_SCALE).toBe(2);
      expect(CHEST_ICON_SCALE).toBe(2.6);
    });

    it("0 Ueberlappungen zwischen Panel-Inhalten", () => {
      for (let i = 0; i < CONTENT.length; i++) {
        for (let j = i + 1; j < CONTENT.length; j++) {
          expect(overlaps(boxes[CONTENT[i]], boxes[CONTENT[j]]), `${CONTENT[i]} vs ${CONTENT[j]}`).toBe(false);
        }
      }
    });

    it("alle Panel-Inhalte innerhalb des Panel-Rahmens", () => {
      const frame = boxes.frame;
      expect(frame.w).toBeLessThanOrEqual(CHEST_FRAME_W);
      expect(frame.h).toBe(CHEST_FRAME_H);
      for (const key of CONTENT) {
        const b = boxes[key];
        expect(b.x, `${key} left`).toBeGreaterThanOrEqual(frame.x + 2);
        expect(bottom(b), `${key} bottom`).toBeLessThanOrEqual(bottom(frame) - 2);
        expect(b.x + b.w, `${key} right`).toBeLessThanOrEqual(frame.x + frame.w - 2);
        expect(b.y, `${key} top`).toBeGreaterThanOrEqual(frame.y + 2);
      }
    });

    it("alle Panel-Inhalte innerhalb des Viewports (kein Abschneiden)", () => {
      for (const key of [...CONTENT, "frame"] as const) {
        const b = boxes[key];
        expect(b.x, `${key} left`).toBeGreaterThanOrEqual(0);
        expect(b.y, `${key} top`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, `${key} right`).toBeLessThanOrEqual(p.width);
        expect(bottom(b), `${key} bottom`).toBeLessThanOrEqual(p.height);
      }
    });

    it("Panel-Band-Offset ist aufloesungsunabhaengig abgeleitet", () => {
      const oy = Math.round((p.height - CHEST_PANEL_BAND_H) / 2);
      expect(boxes.title.y).toBe(38 + oy);
      expect(boxes.subtitle.y).toBe(bottom(boxes.title) + CHEST_SUBTITLE_GAP_PX);
    });
  });
}
