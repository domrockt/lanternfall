// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
// m10-options-touch-focus K2: Zustandsmatrix der Menü-Fokus-/Pressed-Zustände
// als harte Assertions. menuButtonVisual und hoverRowAllowed sind reine
// Funktionen (src/ui/menu.ts, src/ui/options-menu.ts); Phaser wird neutral
// gemockt (Muster tests/title-bg-crisp.test.ts).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  class NineSlice {}
  class Rectangle {}
  class Zone {}
  return {
    default: {
      GameObjects: { Container, NineSlice, Rectangle, Zone },
      Scene,
      BlendModes: { ADD: 1 },
      Scale: { Events: { RESIZE: "resize" } },
      Scenes: { Events: { SHUTDOWN: "shutdown" } },
      Input: {},
    },
  };
});
import { BUTTON_PRESSED_ALPHA, menuButtonVisual, type ButtonVisualState } from "../src/ui/menu";
import { hoverRowAllowed } from "../src/ui/options-menu";

// Palette-Indizes (src/palette.ts): lantern=21, bone=10.
const LANTERN = 21;
const BONE = 10;

const visuals = (focus: boolean, hover: boolean, pressed: boolean) =>
  menuButtonVisual({ focus, hover, pressed, baseColorIndex: BONE });

describe("menuButtonVisual – Zustandsmatrix (K1-Befund als Test verankert)", () => {
  it("Idle: kein Outline, Basisfarbe, Hintergrund ungedimmt (AE=0)", () => {
    expect(visuals(false, false, false)).toEqual({
      outlineVisible: false,
      labelColorIndex: BONE,
      bgAlpha: 1,
    });
  });

  it("Tastatur-Fokus: Lanternfarbe + 1-px-Rahmen", () => {
    const v = visuals(true, false, false);
    expect(v.outlineVisible).toBe(true);
    expect(v.labelColorIndex).toBe(LANTERN);
    expect(v.bgAlpha).toBe(1);
  });

  it("Maus-Hover: identischer Zustand wie Tastatur-Fokus (konsistent)", () => {
    expect(visuals(false, true, false)).toEqual(visuals(true, false, false));
  });

  it("Fokus + Hover gleichzeitig: gleicher aktiver Zustand (keine Doppel-Optik)", () => {
    expect(visuals(true, true, false)).toEqual(visuals(true, false, false));
  });

  it("Pressed (Maus/Touch): aktiv hell UND kurz dunkler (bgAlpha < 1)", () => {
    const v = visuals(false, false, true);
    expect(v.outlineVisible).toBe(true);
    expect(v.labelColorIndex).toBe(LANTERN);
    expect(v.bgAlpha).toBe(BUTTON_PRESSED_ALPHA);
    expect(v.bgAlpha).toBeLessThan(1);
    expect(v.bgAlpha).toBeGreaterThan(0.4);
  });

  it.each([[true], [false]])("Pressed behält den aktiven Zustand bei (focus=%s)", (focus) => {
    const pressed = visuals(focus, false, true);
    const hovered = visuals(focus, true, false);
    expect(pressed.outlineVisible).toBe(hovered.outlineVisible);
    expect(pressed.labelColorIndex).toBe(hovered.labelColorIndex);
  });

  it("Aufeinanderfolgende Zustände wechseln sauber zurück (pressed -> idle)", () => {
    const idle = visuals(false, false, false);
    const pressed = visuals(false, false, true);
    expect(idle.outlineVisible).not.toBe(pressed.outlineVisible);
    expect(idle.bgAlpha).not.toBe(pressed.bgAlpha);
  });
});

describe("hoverRowAllowed – Zeilen-Hover-Guard beim Öffnen des Optionsmenüs", () => {
  it("stillstehender Zeiger seit dem Öffnen: keine Zeile anwählen (Leak-Fix)", () => {
    const p = { x: 240, y: 259 };
    expect(hoverRowAllowed(p, p)).toBe(false);
  });

  it("bewegter Zeiger: Zeile anwählen (normales Hover-Verhalten)", () => {
    expect(hoverRowAllowed({ x: 241, y: 259 }, { x: 240, y: 259 })).toBe(true);
    expect(hoverRowAllowed({ x: 240, y: 260 }, { x: 240, y: 259 })).toBe(true);
  });

  it("ohne Open-Pointer (Tastaturöffnung): Hover immer erlaubt", () => {
    expect(hoverRowAllowed({ x: 5, y: 5 }, null)).toBe(true);
  });
});

describe("Quelltext-Verankerung – Fixes sind verdrahtet", () => {
  const menuSrc = readFileSync("src/ui/menu.ts", "utf8");
  const optionsSrc = readFileSync("src/ui/options-menu.ts", "utf8");

  it("menu.ts: pointerdown setzt Pressed, pointerup/pointerout lösen ihn", () => {
    expect(menuSrc).toMatch(/pointerdown[\s\S]{0,200}pressed = true/);
    expect(menuSrc).toMatch(/pointerupoutside/);
    expect(menuSrc).toMatch(/pointerout[\s\S]{0,120}pressed = false/);
  });

  it("menu.ts: paint() nutzt die reine Matrixfunktion", () => {
    expect(menuSrc).toMatch(/menuButtonVisual\(\{ focus, hover, pressed/);
    expect(menuSrc).toMatch(/bg\.setAlpha\(v\.bgAlpha\)/);
  });

  it("options-menu.ts: open() merkt die Zeigerposition, pointerover fragt den Guard", () => {
    expect(optionsSrc).toMatch(/this\.openPointer = \{ x: p\.x, y: p\.y \}/);
    expect(optionsSrc).toMatch(/hoverRowAllowed\(pointer, this\.openPointer\)/);
  });
});
