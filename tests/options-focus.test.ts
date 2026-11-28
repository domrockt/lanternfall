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
// PixelText ersetzen: Die Verhaltens-Tests unten fahren das echte Wiring von
// createMenuButton (pointerdown/up/out + setEnabled) gegen eine Fake-Scene;
// nur der Font wird durch einen Aufzeichner ersetzt.
const pixelTexts = vi.hoisted(() => [] as Array<{ value: string; colorIndex: number; setColorIndex: (i: number) => unknown }>);
vi.mock("../src/gfx/font", () => {
  class FakePixelText {
    value: string;
    colorIndex: number;
    constructor(_scene: unknown, _x: number, _y: number, text = "", colorIndex = 13) {
      this.value = text;
      this.colorIndex = colorIndex;
      pixelTexts.push(this);
    }
    setText(v: string): this { this.value = v; return this; }
    setColorIndex(i: number): this { this.colorIndex = i; return this; }
  }
  return { PixelText: FakePixelText };
});
import { BUTTON_PRESSED_ALPHA, createMenuButton, menuButtonVisual, type ButtonVisualState, type MenuButton } from "../src/ui/menu";
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

describe("createMenuButton – Event-Lifecycle (echtes Wiring gegen Fake-Scene)", () => {
  interface Handlers { [event: string]: () => void }
  interface FakeObjects { alpha: number; outlineVisible: boolean; interactive: boolean }
  /** Das zuletzt erzeugte (gemockte) Label-Objekt des Buttons. */
  const label = () => pixelTexts[pixelTexts.length - 1];

  function makeButton(): { button: MenuButton; handlers: Handlers; objs: FakeObjects; clicks: number[] } {
    const handlers: Handlers = {};
    const objs: FakeObjects = { alpha: 1, outlineVisible: false, interactive: true };
    const clicks: number[] = [];
    const scene = {
      add: {
        container: () => {
          const c = {
            x: 100, y: 50, list: [] as unknown[],
            setDepth: () => c,
            add: (_o: unknown) => c,
          };
          return c;
        },
        nineslice: () => ({
          setAlpha: (a: number) => { objs.alpha = a; return undefined as never; },
        }),
        rectangle: () => {
          const rect = {
            setStrokeStyle: () => rect,
            setVisible: (v: boolean) => { objs.outlineVisible = v; return rect; },
          };
          return rect;
        },
        zone: () => {
          const z = {
            setInteractive: () => { objs.interactive = true; return z; },
            disableInteractive: () => { objs.interactive = false; return z; },
            on: (ev: string, cb: () => void) => { handlers[ev] = cb; return z; },
          };
          return z;
        },
        existing: () => undefined,
      },
    };
    const button = createMenuButton(
      scene as unknown as Parameters<typeof createMenuButton>[0],
      100, 50, 96, "TEST", () => clicks.push(1), {},
    );
    return { button, handlers, objs, clicks };
  }

  it("pointerdown setzt Pressed (dunkler + aktiv), pointerup löst ihn, Klick feuert sofort", () => {
    const b = makeButton();
    b.handlers["pointerdown"]();
    expect(b.objs.alpha).toBe(BUTTON_PRESSED_ALPHA);
    expect(b.objs.outlineVisible).toBe(true);
    expect(label().colorIndex).toBe(LANTERN);
    expect(b.clicks.length).toBe(1);
    b.handlers["pointerup"]();
    expect(b.objs.alpha).toBe(1);
    b.handlers["pointerout"]();
    expect(b.objs.outlineVisible).toBe(false);
    expect(label().colorIndex).toBe(BONE);
  });

  it("setEnabled(false) während Pressed setzt den Zustand zurück (kein Stuck-Dunkel)", () => {
    // Stuck-Pfad (Review-Befund): FORTSETZEN deaktiviert die Zone mitten im
    // Pressed; eine deaktivierte Zone kriegt kein pointerup/pointerout mehr.
    const b = makeButton();
    b.handlers["pointerdown"]();
    expect(b.objs.alpha).toBe(BUTTON_PRESSED_ALPHA);
    b.button.setEnabled(false);
    expect(b.objs.alpha).toBe(1);
    expect(b.objs.outlineVisible).toBe(false);
    expect(label().colorIndex).toBe(BONE);
    expect(b.objs.interactive).toBe(false);
  });

  it("setEnabled(false) während Hover setzt ebenfalls zurück (kein Stuck-Aktiv)", () => {
    const b = makeButton();
    b.handlers["pointerover"]();
    expect(b.objs.outlineVisible).toBe(true);
    b.button.setEnabled(false);
    expect(b.objs.outlineVisible).toBe(false);
    expect(label().colorIndex).toBe(BONE);
  });

  it("setEnabled(true) nach dem Reset: interaktiv wieder hergestellt", () => {
    const b = makeButton();
    b.handlers["pointerover"]();
    b.button.setEnabled(false);
    b.button.setEnabled(true);
    expect(b.objs.interactive).toBe(true);
    expect(b.objs.outlineVisible).toBe(false);
  });
});

describe("Quelltext-Verankerung – Guards sind verdrahtet (whitespace-tolerant)", () => {
  const menuSrc = readFileSync("src/ui/menu.ts", "utf8");
  const optionsSrc = readFileSync("src/ui/options-menu.ts", "utf8");

  it("menu.ts: paint() nutzt die reine Matrixfunktion", () => {
    expect(menuSrc).toMatch(/menuButtonVisual\(\s*\{\s*focus,\s*hover,\s*pressed/);
    expect(menuSrc).toMatch(/bg\.setAlpha\(v\.bgAlpha\)/);
  });

  it("menu.ts: kein toter pointerupoutside-Handler (feuert in Phaser 3 nie)", () => {
    expect(menuSrc).not.toMatch(/pointerupoutside/);
  });

  it("options-menu.ts: open() merkt die Zeigerposition, pointerover fragt den Guard", () => {
    expect(optionsSrc).toMatch(/openPointer\s*=\s*\{\s*x:\s*p\.x,\s*y:\s*p\.y\s*\}/);
    expect(optionsSrc).toMatch(/hoverRowAllowed\(pointer,\s*this\.openPointer\)/);
  });

  it("options-menu.ts: close() koppelt den Guard an die Sichtbarkeit zurück", () => {
    expect(optionsSrc).toMatch(/this\.openPointer\s*=\s*null/);
  });
});
