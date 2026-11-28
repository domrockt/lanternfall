import { describe, expect, it, vi } from "vitest";
// UI.ts importiert Phaser (Szene); die gepruefte Mathematik ist rein.
// Phaser wird neutral gemockt (PixelText erweitert Phaser.GameObjects.Container).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  return { default: { GameObjects: { Container }, Scene } };
});
import {
  CHEST_FRAME_W,
  CHEST_HINT_PITCH,
  CHEST_HINT_Y,
  CHEST_ICON_SCALE,
  CHEST_PANEL_BAND_H,
  CHEST_SLOT_LABEL_CHARS,
  chestPanelBoxes,
} from "../src/scenes/UI";
import { slotLabelLines, wrapHintLines } from "../src/gfx/text";
import { EVOLUTIONS } from "../src/data/evolutions";

// m10-chest-hint-wrap K3: Regressionstest zum Wortumbruch im Truhen-Panel.
// Ist-Befund (shots/m10-chest-hint-wrap-before.json): Slot-Label
// "SEELENLEUCHTFEUER" brach ohne Trennstrich mitten im Wort; vom Evo-Satz
// renderte nur eine Zeile (chestHintChars), die zweite Hint-Zeile blieb leer.
// Abnahmekriterien je Viewport-Profil: kein mid-word Cut, 0 Zeichenverlust,
// beide Evo-Hint-Zeilen gefuellt und verlustfrei, 0 Ueberlappungen (Hint vs.
// Icon/Slots, Slot-Label untereinander), alles innerhalb Panel-Rahmen (+-2 px)
// und Viewport.
const PROFILES = [
  { label: "640x360", width: 640, height: 360 },
  { label: "780x360", width: 780, height: 360 },
  { label: "1920x1080", width: 1920, height: 1080 },
];

// Font-Metriken wie im Spiel (src/gfx/font.ts, hier ohne Phaser-Import).
const GLYPH_ADVANCE = 6;
const GLYPH_H = 7;
const SLOT_W = 96; // Slot-Box wie createChestUI
const SLOT_PITCH = 86;
const SLOT_TEXT_Y = 202; // Zeile 1 der Slot-Labels (Zeile 2: +11)
const REWARDS = 3; // gemessener Fall: Evolution + 2 weitere Rewards

function glyphW(chars: number): number {
  return Math.max(0, chars * GLYPH_ADVANCE - 1);
}

function centeredBox(chars: number, x: number, y: number): Box {
  const w = glyphW(chars);
  return { left: x - Math.floor(w / 2), right: x - Math.floor(w / 2) + w, top: y, bottom: y + GLYPH_H };
}

function norm(s: string): string {
  return s.replaceAll(" ", "").replaceAll("-", "");
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** chestHintChars wie createChestUI: max(24, floor((frameW - 20) / 6)). */
function chestHintChars(width: number): number {
  return Math.max(24, Math.floor((Math.min(CHEST_FRAME_W, width - 24) - 20) / 6));
}

/** Alle Evo-Hint-Saetze wie evolutionSentence in UI.ts. */
function sentences(): string[] {
  return EVOLUTIONS.map((e) => `AUS ${e.description.toUpperCase()} WIRD ${e.name.toUpperCase()}.`);
}

const EVO_NAMES = EVOLUTIONS.map((e) => e.name.toUpperCase());

for (const p of PROFILES) {
  describe(`chest-hint-wrap ${p.label}`, () => {
    const boxes = chestPanelBoxes(p.width, p.height);
    const oy = Math.round((p.height - CHEST_PANEL_BAND_H) / 2);
    const cx = p.width / 2;
    const maxChars = chestHintChars(p.width);
    const hintW = Math.min(CHEST_FRAME_W, p.width - 24) - 20;
    const iconBox: Box = {
      left: boxes.icon.x,
      right: boxes.icon.x + boxes.icon.w,
      top: boxes.icon.y,
      bottom: boxes.icon.y + boxes.icon.h,
    };

    it("Evo-Satz: beide Hint-Zeilen gefuellt, verlustfrei, kein Satz-Abbruch, ohne Ellipsis", () => {
      for (const sentence of sentences()) {
        const lines = wrapHintLines(sentence, maxChars);
        expect(lines.length).toBeLessThanOrEqual(2);
        // Beide Zeilen sichtbar (Mehrwort-Satz), kein Abbruch: Zusammensetzen
        // ergibt exakt den Satz.
        expect(lines.length).toBe(2);
        for (const line of lines) {
          expect(line.length).toBeGreaterThan(0);
          expect(line.length).toBeLessThanOrEqual(maxChars);
          expect(line).not.toContain("..");
        }
        expect(lines.join(" ")).toBe(sentence);
        // Zeilenbreite in px passt in die Hint-Zone.
        for (const line of lines) expect(glyphW(line.length)).toBeLessThanOrEqual(hintW);
      }
    });

    it("Slot-Labels: kein mid-word Cut, 0 Zeichenverlust, Zeilen <= Slot-Breite", () => {
      for (const name of EVO_NAMES) {
        const lines = slotLabelLines(name, CHEST_SLOT_LABEL_CHARS);
        expect(lines.length).toBeLessThanOrEqual(2);
        for (const line of lines) {
          expect(line.length).toBeGreaterThan(0);
          expect(line.length).toBeLessThanOrEqual(CHEST_SLOT_LABEL_CHARS);
          expect(glyphW(line.length)).toBeLessThanOrEqual(SLOT_W);
        }
        expect(norm(lines.join(""))).toBe(norm(name));
        if (lines.length === 2) {
          // Bruch nur an Wortgrenze oder mit Trennstrich — nie stumm mitten im Wort.
          expect(name[lines[0].length] === " " || lines[0].endsWith("-")).toBe(true);
        } else {
          expect(name.length).toBeLessThanOrEqual(CHEST_SLOT_LABEL_CHARS);
        }
      }
      // Der gemeldete Fall ist jetzt ein Trennstrich-Umbruch.
      expect(slotLabelLines("SEELENLEUCHTFEUER", CHEST_SLOT_LABEL_CHARS)).toEqual(["SEELENLEU-", "CHTFEUER"]);
    });

    it("gerenderte Boxen: 0 Ueberlappungen, innerhalb Panel-Rahmen und Viewport", () => {
      const rendered: { label: string; box: Box }[] = [];
      sentences().forEach((sentence) => {
        wrapHintLines(sentence, maxChars).forEach((line, i) => {
          rendered.push({
            label: `hint-${i}`,
            box: centeredBox(line.length, cx, CHEST_HINT_Y + oy + i * CHEST_HINT_PITCH),
          });
        });
      });
      EVO_NAMES.forEach((name) => {
        slotLabelLines(name, CHEST_SLOT_LABEL_CHARS).forEach((line, i) => {
          const y = SLOT_TEXT_Y + oy + i * 11;
          rendered.push({ label: `slot-label-r${i}`, box: centeredBox(line.length, cx, y) });
        });
      });
      // Hint-Zeilen frei von Icon und Slot-Label-Reihen; Slot-Label-Reihen
      // (alle im selben zentrierten Slot-Raster) untereinander frei.
      const hints = rendered.filter((r) => r.label.startsWith("hint"));
      const slotLabels = rendered.filter((r) => r.label.startsWith("slot-label"));
      for (const h of hints) {
        expect(overlaps(h.box, iconBox)).toBe(false);
        for (const s of slotLabels) expect(overlaps(h.box, s.box)).toBe(false);
      }
      for (let i = 0; i < rendered.length; i++) {
        const b = rendered[i].box;
        expect(b.left).toBeGreaterThanOrEqual(boxes.frame.x - 2);
        expect(b.right).toBeLessThanOrEqual(boxes.frame.x + boxes.frame.w + 2);
        expect(b.top).toBeGreaterThanOrEqual(boxes.frame.y - 2);
        expect(b.bottom).toBeLessThanOrEqual(boxes.frame.y + boxes.frame.h + 2);
        expect(b.top).toBeGreaterThanOrEqual(0);
        expect(b.left).toBeGreaterThanOrEqual(0);
        expect(b.right).toBeLessThanOrEqual(p.width);
        expect(b.bottom).toBeLessThanOrEqual(p.height);
      }
      // Slot-Labels im 3-Reward-Raster ragen nicht in Nachbarslots.
      for (let slot = 0; slot < REWARDS - 1; slot++) {
        const xA = cx + (slot - (REWARDS - 1) / 2) * SLOT_PITCH;
        const xB = cx + (slot + 1 - (REWARDS - 1) / 2) * SLOT_PITCH;
        for (const line of slotLabelLines(EVO_NAMES[0], CHEST_SLOT_LABEL_CHARS)) {
          const bA = centeredBox(line.length, xA, SLOT_TEXT_Y + oy);
          const bB = centeredBox(line.length, xB, SLOT_TEXT_Y + oy);
          expect(overlaps(bA, bB)).toBe(false);
        }
      }
    });

    it("Untertitel-Anker aus m10-chest-panel-ui unveraendert (Hint frei vom Icon)", () => {
      expect(boxes.subtitle.y + boxes.subtitle.h).toBeLessThanOrEqual(iconBox.top);
      expect(iconBox.bottom).toBeLessThanOrEqual(CHEST_HINT_Y + oy);
    });
  });
}
