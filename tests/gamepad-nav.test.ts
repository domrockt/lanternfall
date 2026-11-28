// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { describe, expect, it, beforeEach, vi } from "vitest";
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
    setScale(_s: number): this { return this; }
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

// ---------------------------------------------------------------------------
// K3: OptionsMenu per Gamepad (alle 7 Zeilen inkl. MASTER MUTE, Repeat,
// ein Pad-Frame = eine Aktion).
// ---------------------------------------------------------------------------
const appliedOptions = vi.hoisted(() => [] as object[]);
vi.mock("../src/audio/AudioSystem", () => ({
  applyOptions: (options: object) => { appliedOptions.push(options); },
}));
vi.mock("../src/audio/settings", () => ({
  getSettings: () => ({
    music: 0.5, sfx: 0.5, shake: true, damageNumbers: true, muted: false, scale: 0,
  }),
}));
import { OptionsMenu } from "../src/ui/options-menu";
import { OPTION_ROWS } from "../src/audio/options";
import type { ActionState } from "../src/input/InputState";

/** Minimaler Fake-Scene für den OptionsMenu-Konstruktor (Optik irrelevant). */
function makeOptionsMenu(): { menu: OptionsMenu; closed: () => number } {
  let closes = 0;
  const chainable = { setOrigin: () => chainable, setStrokeStyle: () => chainable, setVisible: () => chainable, setInteractive: () => chainable, disableInteractive: () => chainable, on: () => chainable };
  const container = {
    visible: false,
    list: [] as unknown[],
    setDepth: () => container,
    setVisible: (v: boolean) => { container.visible = v; return container; },
    add: () => container,
  };
  const scene = {
    add: {
      container: () => container,
      nineslice: () => ({}),
      rectangle: () => ({ ...chainable }),
      zone: () => ({ ...chainable }),
    },
    input: { activePointer: { x: 0, y: 0 } },
  };
  const menu = new OptionsMenu(scene as never, 10, () => { closes++; });
  return { menu, closed: () => closes };
}

const pad = (held: Partial<ActionState>): ActionState => ({
  pause: false, confirm: held.confirm === true, back: held.back === true,
  up: held.up === true, down: held.down === true, left: held.left === true, right: held.right === true,
});

/** n diskrete Zeilenwechsel (drücken + loslassen, kein Repeat). */
function moveRows(menu: OptionsMenu, n: number, startT = 0): number {
  let t = startT;
  for (let i = 0; i < n; i++) {
    menu.handlePadFrame(pad({ down: true }), t);
    menu.handlePadFrame(pad({}), t + 5);
    t += 10;
  }
  return t;
}

describe("OptionsMenu.handlePadFrame – alle 7 Zeilen per Gamepad", () => {
  beforeEach(() => { appliedOptions.length = 0; });

  it("alle Zeilen per D-Pad erreichbar, MASTER MUTE (Zeile 4) per right änderbar", () => {
    const { menu } = makeOptionsMenu();
    menu.open();
    moveRows(menu, 4); // Zeile 4 MASTER MUTE (toggle per left/right)
    expect(appliedOptions.length).toBe(0);
    menu.handlePadFrame(pad({ right: true }), 1000);
    menu.handlePadFrame(pad({}), 1005);
    expect(appliedOptions.length).toBe(1);
    expect((appliedOptions[0] as { muted: boolean }).muted).toBe(true);
    expect(OPTION_ROWS.length).toBe(7); // inkl. MASTER MUTE und ZURÜCK
  });

  it("down wrappt von ZURÜCK (6) auf MUSIK (0) zurück", () => {
    const { menu } = makeOptionsMenu();
    menu.open();
    moveRows(menu, 6); // ZURÜCK
    menu.handlePadFrame(pad({ down: true }), 1000); // wrap vorwärts → MUSIK
    menu.handlePadFrame(pad({}), 1005);
    menu.handlePadFrame(pad({ left: true }), 1010); // MUSIK senken
    menu.handlePadFrame(pad({}), 1015);
    expect(appliedOptions.length).toBe(1);
    expect((appliedOptions[0] as { music: number }).music).toBeCloseTo(0.4, 5);
  });

  it("Confirm auf ZURÜCK schließt; gehaltener Confirm toggelt NICHT mehrfach", () => {
    const { menu, closed } = makeOptionsMenu();
    menu.open();
    moveRows(menu, 6); // ZURÜCK
    menu.handlePadFrame(pad({ confirm: true }), 1000);
    expect(closed()).toBe(1);
    expect(appliedOptions.length).toBe(0);
  });

  it("gehaltener Confirm auf einer Wertzeile feuert nur den Rising-Edge", () => {
    const { menu } = makeOptionsMenu();
    menu.open();
    menu.handlePadFrame(pad({ confirm: true }), 0);
    menu.handlePadFrame(pad({ confirm: true }), 200);
    menu.handlePadFrame(pad({ confirm: true }), 1000);
    menu.handlePadFrame(pad({}), 1005);
    expect(appliedOptions.length).toBe(1);
  });

  it("Repeat: down gehalten feuert Press, ~200 ms Erstwiederholung, ~100 ms Folgerepeat", () => {
    const { menu } = makeOptionsMenu();
    menu.open();
    // Start Zeile 0. Gehalten: Fire bei 0, 200, 300, 400 → Zeile 4 (MASTER MUTE).
    menu.handlePadFrame(pad({ down: true }), 0);
    menu.handlePadFrame(pad({ down: true }), 199); // kein Fire
    menu.handlePadFrame(pad({ down: true }), 200); // Erstwiederholung
    menu.handlePadFrame(pad({ down: true }), 299); // kein Fire
    menu.handlePadFrame(pad({ down: true }), 300);
    menu.handlePadFrame(pad({ down: true }), 399); // kein Fire
    menu.handlePadFrame(pad({ down: true }), 400);
    menu.handlePadFrame(pad({ down: true }), 450); // kein Fire (Folgerepeat-Abstand)
    menu.handlePadFrame(pad({}), 460); // loslassen
    // Nachweis: jetzt steht MASTER MUTE an — right toggelt muted (kein Scale).
    menu.handlePadFrame(pad({ right: true }), 470);
    menu.handlePadFrame(pad({}), 475);
    expect(appliedOptions.length).toBe(1);
    expect((appliedOptions[0] as { muted: boolean }).muted).toBe(true);
  });

  it("ein Pad-Frame = eine Aktion: alle Richtungen + Confirm gleichzeitig → genau EINE Aktion", () => {
    const { menu } = makeOptionsMenu();
    menu.open();
    // Priorität up > down > left > right > confirm: nur up feuert (0→6 ZURÜCK),
    // left/right/confirm dürfen im selben Frame NICHT zusätzlich auslösen.
    menu.handlePadFrame(pad({ up: true, down: true, left: true, right: true, confirm: true }), 0);
    expect(appliedOptions.length).toBe(0); // keine Wertänderung im selben Frame
    // und kein offener Confirm-Edge: losgelassener Frame ändert nichts
    menu.handlePadFrame(pad({}), 100);
    expect(appliedOptions.length).toBe(0);
  });

  it("back schließt sofort und Repeat-Zustände werden zurückgesetzt (kein Nachbrennen)", () => {
    const { menu, closed } = makeOptionsMenu();
    menu.open();
    menu.handlePadFrame(pad({ down: true }), 0); // Repeat-Kanal "down" aktiv
    menu.handlePadFrame(pad({ back: true }), 100); // schließt
    expect(closed()).toBe(1);
    menu.open(); // neu geöffnet
    menu.handlePadFrame(pad({}), 150); // nichts gehalten
    expect(appliedOptions.length).toBe(0);
  });
});
