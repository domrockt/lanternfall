// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { describe, expect, it, vi } from "vitest";
// Lane m10-gamepad-menu-nav: Gamepad-Navigation auf Widget-Ebene.
// K2: menuRepeatTick + MenuFocus (src/ui/menu.ts). Phaser neutral gemockt
// (Muster tests/options-focus.test.ts). K4 ergänzt options-menu + Harness.
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
vi.mock("../src/gfx/font", () => {
  class FakePixelText {
    value: string;
    colorIndex: number;
    constructor(_scene: unknown, _x: number, _y: number, text = "", colorIndex = 13) {
      this.value = text;
      this.colorIndex = colorIndex;
    }
    setText(v: string): this { this.value = v; return this; }
    setColorIndex(i: number): this { this.colorIndex = i; return this; }
  }
  return { PixelText: FakePixelText };
});
import {
  MENU_REPEAT_FIRST_MS,
  MENU_REPEAT_NEXT_MS,
  MenuFocus,
  menuRepeatTick,
  type MenuButton,
  type MenuRepeatState,
} from "../src/ui/menu";

describe("menuRepeatTick – Repeat-Debounce (~200 ms erst, ~100 ms folgend)", () => {
  const fresh = (): MenuRepeatState => ({ held: false, fires: 0, lastFireMs: -1 });

  it("Press-Flanke feuert sofort genau einmal", () => {
    const s = fresh();
    expect(menuRepeatTick(s, true, 1000)).toBe(true);
    expect(menuRepeatTick(s, true, 1010)).toBe(false);
    expect(menuRepeatTick(s, true, 1000 + 199)).toBe(false); // 199 ms nach Press
    expect(s.fires).toBe(1);
  });

  it("Erstwiederholung nach ~200 ms, dann Folgerepeat alle ~100 ms", () => {
    const s = fresh();
    expect(menuRepeatTick(s, true, 0)).toBe(true); // Press
    expect(menuRepeatTick(s, true, MENU_REPEAT_FIRST_MS - 1)).toBe(false);
    expect(menuRepeatTick(s, true, MENU_REPEAT_FIRST_MS)).toBe(true); // Erstwiederholung
    expect(menuRepeatTick(s, true, MENU_REPEAT_FIRST_MS + MENU_REPEAT_NEXT_MS - 1)).toBe(false);
    expect(menuRepeatTick(s, true, MENU_REPEAT_FIRST_MS + MENU_REPEAT_NEXT_MS)).toBe(true);
    expect(menuRepeatTick(s, true, MENU_REPEAT_FIRST_MS + 2 * MENU_REPEAT_NEXT_MS)).toBe(true);
    expect(s.fires).toBe(4);
  });

  it("Loslassen setzt zurück; neuer Press feuert sofort wieder", () => {
    const s = fresh();
    expect(menuRepeatTick(s, true, 0)).toBe(true);
    expect(menuRepeatTick(s, true, 150)).toBe(false);
    expect(menuRepeatTick(s, false, 160)).toBe(false);
    expect(s.held).toBe(false);
    expect(menuRepeatTick(s, true, 170)).toBe(true);
    expect(s.fires).toBe(1);
  });

  it("ist driftfrei (lastFireMs wandert um Intervalle, nicht auf now)", () => {
    const s = fresh();
    menuRepeatTick(s, true, 0);
    menuRepeatTick(s, true, MENU_REPEAT_FIRST_MS);
    menuRepeatTick(s, true, MENU_REPEAT_FIRST_MS + MENU_REPEAT_NEXT_MS + 37); // verspäteter Frame
    expect(s.lastFireMs).toBe(MENU_REPEAT_FIRST_MS + MENU_REPEAT_NEXT_MS);
  });
});

const fakeButton = (name: string, log: string[]): MenuButton => ({
  container: {} as never,
  bg: {} as never,
  label: {} as never,
  setFocused(value: boolean): void {
    if (value) log.push(`focus:${name}`);
  },
  setEnabled(): void {},
  press(): void {
    log.push(`press:${name}`);
  },
});

describe("MenuFocus – Fokus-API auf Widget-Ebene", () => {
  it("startet auf Index 0, Fokus visualisiert wie Hover (setFocused)", () => {
    const log: string[] = [];
    const focus = new MenuFocus([fakeButton("a", log), fakeButton("b", log)]);
    expect(focus.currentIndex).toBe(0);
    expect(log).toEqual(["focus:a"]);
  });

  it("moveFocus wrappt in beide Richtungen und zeichnet genau einen Fokus", () => {
    const log: string[] = [];
    const focus = new MenuFocus([
      fakeButton("a", log), fakeButton("b", log), fakeButton("c", log),
    ]);
    log.length = 0;
    focus.moveFocus(1);
    expect(focus.currentIndex).toBe(1);
    expect(log).toEqual(["focus:b"]);
    focus.moveFocus(1);
    focus.moveFocus(1);
    expect(focus.currentIndex).toBe(0); // wrap vorwärts
    focus.moveFocus(-1);
    expect(focus.currentIndex).toBe(2); // wrap rückwärts
  });

  it("confirm feuert genau EIN Event (den Knopf), deaktivierte Knöpfe nicht", () => {
    const log: string[] = [];
    const btn = fakeButton("a", log);
    const focus = new MenuFocus([btn]);
    log.length = 0;
    focus.confirm();
    expect(log).toEqual(["press:a"]);
  });

  it("back ruft den Szenen-Callback, confirm nicht", () => {
    let backs = 0;
    const focus = new MenuFocus([fakeButton("a", [])], { onBack: () => { backs++; } });
    focus.back();
    focus.confirm();
    expect(backs).toBe(1);
  });

  it("leere Liste: moveFocus/confirm sind No-Ops", () => {
    const focus = new MenuFocus([]);
    expect(() => { focus.moveFocus(1); focus.confirm(); }).not.toThrow();
    expect(focus.currentIndex).toBe(0);
  });
});
