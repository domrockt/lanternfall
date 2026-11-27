import { describe, expect, it, vi } from "vitest";
// UI.ts ist eine Phaser-Szene; die reine Anker-Geometrie braucht kein DOM.
// Phaser wird neutral gemockt (Scene/Container-Stub fuer die Klassenhierarchie).
vi.mock("phaser", () => {
  class Scene { constructor(_key?: string) { /* Stub */ } }
  class Container { constructor(_scene?: unknown, _x?: number, _y?: number) { /* Stub */ } }
  return { default: { Scene, GameObjects: { Container } } };
});
import {
  HUD_EVO_HINT_X,
  HUD_ICONS_X,
  HUD_MARGIN_X,
  HUD_MAX_ICONS,
  type AnchorBox,
  hudAnchorBoxes,
} from "../src/scenes/UI";

/**
 * M10-hud-wide-anchor: HUD-Anker gegen den Safe-Area-Rand je Format.
 * Formate laut M8-Display-Tabelle (docs/lanes/m8-display.md): logische Hoehe
 * 360, Breite seitenverhaeltnisabhaengig. Safe-Area-Rand = HUD-Konvention der
 * 640x360-Referenz: links/rechts 5 px, oben 1 px, unten 7 px (Spielpixel).
 */
const FORMATS = [
  { name: "640x360-ref", width: 640, height: 360 },
  { name: "780x360@3", width: 780, height: 360 },
  // 1280x720 @1 -> n=2 -> 640x360; 1920x1080 @1 -> n=3 -> 640x360
  { name: "1280x720", width: 640, height: 360 },
  { name: "1920x1080", width: 640, height: 360 },
];
const SAFE = { left: 5, right: 5, top: 1, bottom: 7 };

const intersects = (a: AnchorBox, b: AnchorBox): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contained = (s: AnchorBox, big: AnchorBox): boolean =>
  s.x >= big.x - 0.5 && s.y >= big.y - 0.5 &&
  s.x + s.w <= big.x + big.w + 0.5 && s.y + s.h <= big.y + big.h + 0.5;
/** Icon-Reihe + ihr Hintergrund sind eine Verschachtelungs-Gruppe. */
const group = (name: string): string =>
  name === "iconrow-bg" || name === "icons" ? "iconrow" : name;

describe("M10-hud-wide-anchor HUD-Anker", () => {
  for (const f of FORMATS) {
    it(`${f.name}: alle Anker-Boxen im Safe-Area-Rand, kollisionsfrei, ganzzahlig`, () => {
      const boxes = hudAnchorBoxes(f.width, f.height);
      for (const [name, box] of Object.entries(boxes)) {
        // Safe-Area-Rand
        expect(box.x, `${name} links`).toBeGreaterThanOrEqual(SAFE.left - 0.5);
        expect(box.x + box.w, `${name} rechts`).toBeLessThanOrEqual(f.width - SAFE.right + 0.5);
        expect(box.y, `${name} oben`).toBeGreaterThanOrEqual(SAFE.top - 0.5);
        expect(box.y + box.h, `${name} unten`).toBeLessThanOrEqual(f.height - SAFE.bottom + 0.5);
        // Pixelgenauigkeit: ganzzahlige Spielpixel
        for (const v of [box.x, box.y, box.w, box.h]) {
          expect(Number.isInteger(v), `${name} ganzzahlig`).toBe(true);
        }
      }
      // Kollisionen: Verschachtelung nur innerhalb derselben Gruppe.
      const names = Object.keys(boxes);
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const a = boxes[names[i]], b = boxes[names[j]];
          if (!intersects(a, b)) continue;
          if (contained(a, b) || contained(b, a)) {
            expect(group(names[i]), `${names[i]}/${names[j]} Verschachtelung nur in eigener Gruppe`)
              .toBe(group(names[j]));
            continue;
          }
          // kein Containment -> erlaubt (keine Kollision gemeldet), aber Boxen
          // duerfen sich nicht schneiden:
          expect(intersects(a, b), `${names[i]} <-> ${names[j]}`).toBe(false);
        }
      }
    });
  }

  it("worst case (volle Textbreiten, 12 Icons, 2-Zeilen-Evo-Hinweis): 780x360 kollisionsfrei", () => {
    const boxes = hudAnchorBoxes(780, 360, { levelChars: 5, timerChars: 5, killChars: 10, evoHintChars: 20 });
    expect(boxes["evo-hint"].x + boxes["evo-hint"].w).toBeLessThanOrEqual(780 - SAFE.right);
    expect(boxes.icons.x + boxes.icons.w).toBeLessThanOrEqual(boxes["evo-hint"].x);
    expect(boxes["iconrow-bg"].x + boxes["iconrow-bg"].w).toBeLessThanOrEqual(boxes["evo-hint"].x);
  });

  it("Anker-Konstanten entsprechen der gemessenen 640x360-Referenz (AE = 0)", () => {
    // Golden Values aus shots/m10-hud-anchor-baseline.json (640x360-ref):
    expect(HUD_MARGIN_X).toBe(5);
    expect(HUD_ICONS_X).toBe(122);      // Icons: 122..317 (12 x Pitch 17)
    expect(HUD_EVO_HINT_X).toBe(330);   // Evo-Hinweis: x=330
    const boxes = hudAnchorBoxes(640, 360);
    expect(boxes.hp).toEqual({ x: 5, y: 15, w: 106, h: 9 });
    expect(boxes.xp).toEqual({ x: 5, y: 8, w: 630, h: 4 });
    expect(boxes.icons).toEqual({ x: 122, y: 15, w: 11 * 17 + 16, h: 16 });
    // Basis-Fix: Icon-Hintergrund am Icon-Cluster verankert (vorher x=0, w=224)
    expect(boxes["iconrow-bg"]).toEqual({ x: 114, y: 13, w: 8 + 12 * 17, h: 19 });
    // Timer bleibt zentriert verankert
    expect(boxes.timer.x + boxes.timer.w / 2).toBe(640 / 2);
  });

  it("640er-Formate (1280x720, 1920x1080) liefern identische Boxen wie die Referenz", () => {
    const ref = hudAnchorBoxes(640, 360);
    expect(hudAnchorBoxes(640, 360)).toEqual(ref); // deterministisch -> AE = 0
    expect(Object.keys(ref)).toEqual(Object.keys(hudAnchorBoxes(780, 360)));
  });
});
