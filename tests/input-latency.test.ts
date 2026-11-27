import { afterEach, describe, expect, it, vi } from "vitest";
import { getTouchSnapshot, resetTouchSnapshot } from "../src/input/TouchState";

// TouchControls braucht Phaser nur in Typ-Annotationen; der Stub haelt den
// Node-Testlauf frei von einer echten Canvas/DOM-Phaser-Instanz.
vi.mock("phaser", () => ({ default: {} }));
import { TouchControls } from "../src/input/TouchControls";
import {
  InputState,
  TOUCH_DEADZONE,
  TOUCH_RELEASE_DEADZONE,
  applyTouchDeadzoneHysteresis,
  mergeSources,
  type GamepadSnapshot,
  type KeyboardSnapshot,
  type TouchSnapshot,
} from "../src/input/InputState";

const idleKeyboard: KeyboardSnapshot = { up: false, down: false, left: false, right: false };
const rest: TouchSnapshot = { active: false, x: 0, y: 0 };

describe("Touch-Deadzone-Hysterese (M10-touch-latency)", () => {
  it("ist unterhalb der Eingangsschwelle exakt inaktiv", () => {
    expect(applyTouchDeadzoneHysteresis(0, 0, false)).toEqual({ x: 0, y: 0, engaged: false });
    expect(applyTouchDeadzoneHysteresis(TOUCH_DEADZONE - 0.001, 0, false)).toEqual({
      x: 0, y: 0, engaged: false,
    });
  });

  it("aktiviert erst oberhalb der Eingangsschwelle", () => {
    const on = applyTouchDeadzoneHysteresis(TOUCH_DEADZONE + 0.01, 0, false);
    expect(on.engaged).toBe(true);
    expect(on.x).toBeGreaterThan(0);
  });

  it("hält das Engagement im Band zwischen Release- und Eingangsschwelle, gibt aber 0 aus", () => {
    const band = (TOUCH_DEADZONE + TOUCH_RELEASE_DEADZONE) / 2;
    expect(TOUCH_RELEASE_DEADZONE).toBeLessThan(TOUCH_DEADZONE);
    // Aktiv -> im Band: Zustand bleibt, Bewegung ist null (kein Zittern).
    expect(applyTouchDeadzoneHysteresis(band, 0, true)).toEqual({
      x: 0, y: 0, engaged: true,
    });
    // Inaktiv -> im Band: bleibt inaktiv.
    expect(applyTouchDeadzoneHysteresis(band, 0, false)).toEqual({
      x: 0, y: 0, engaged: false,
    });
  });

  it("gibt unterhalb der Release-Schwelle frei", () => {
    expect(applyTouchDeadzoneHysteresis(TOUCH_RELEASE_DEADZONE - 0.001, 0, true)).toEqual({
      x: 0, y: 0, engaged: false,
    });
  });

  it("zittert bei Ruhe nicht: winzige Noise-Werte ergeben immer 0", () => {
    const state = new InputState();
    const noise = [0.05, 0.1, 0.08, 0.11, 0.03, 0.09];
    for (const v of noise) {
      const frame = state.update({ touch: { active: true, x: v, y: -v * 0.4 } });
      expect(frame.move).toEqual({ x: 0, y: 0 });
    }
  });

  it("lässt die Achse nach dem Loslassen nicht kleben", () => {
    const state = new InputState();
    const moving = state.update({ touch: { active: true, x: 1, y: 0 } });
    expect(moving.move.x).toBeCloseTo(1, 6);
    // Loslassen = Snapshot inaktiv -> naechster Frame exakt 0.
    const released = state.update({ touch: { ...rest } });
    expect(released.move).toEqual({ x: 0, y: 0 });
    // Kein Nachlauf, auch wenn danach nur Rauschen anliegt.
    const after = state.update({ touch: { active: false, x: 0.11, y: 0 } });
    expect(after.move).toEqual({ x: 0, y: 0 });
  });
});

describe("Snapshot-Pfad ohne Zusatzframe (M10-touch-latency)", () => {
  it("spiegelt einen neuen Touch-Snapshot im selben update-Aufruf", () => {
    const state = new InputState();
    // Ein Frame: Snapshot kommt an, update liest ihn sofort (kein Puffer-Frame).
    const frame = state.update({ touch: { active: true, x: 0.6, y: 0 } });
    expect(frame.move.x).toBeCloseTo((0.6 - TOUCH_DEADZONE) / (1 - TOUCH_DEADZONE), 6);
  });

  it("Priorität bleibt Touch > Gamepad > Tastatur", () => {
    const pad: GamepadSnapshot = { axes: [-1, 0], buttons: [] };
    const kb: KeyboardSnapshot = { ...idleKeyboard, up: true };
    const touch: TouchSnapshot = { active: true, x: 1, y: 0 };
    expect(mergeSources({ touch, gamepad: pad, keyboard: kb }).x).toBeCloseTo(1, 6);
    // Touch im Hysterese-Band gibt 0 aus -> Gamepad gewinnt, nicht Tastatur.
    const band = (TOUCH_DEADZONE + TOUCH_RELEASE_DEADZONE) / 2;
    const state = new InputState();
    state.update({ touch: { active: true, x: 1, y: 0 } });
    const held = state.update({
      touch: { active: true, x: band, y: 0 },
      gamepad: pad,
      keyboard: kb,
    });
    expect(held.move.x).toBeLessThan(0);
    expect(held.move.y).toBeCloseTo(0, 6);
  });
});

describe("Loslassen: pointerup/touchend -> Achse 0 im naechsten Frame", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;
    resetTouchSnapshot();
  });

  function fakeNode(extra: Record<string, unknown> = {}) {
    const node: Record<string, unknown> & { visible?: boolean } = {
      visible: false,
      ...extra,
      setScrollFactor() { return node; },
      setDepth() { return node; },
      setVisible(v: boolean) { node.visible = v; return node; },
      setPosition() { return node; },
      fillStyle() { return node; },
      fillRect() { return node; },
      setInteractive() { return node; },
      setStrokeStyle() { return node; },
      on() { return node; },
    };
    return node;
  }

  function harness(canMove: () => boolean) {
    const handlers: Record<string, (ev: unknown) => void> = {};
    const canvas = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270 }),
      addEventListener: (type: string, cb: (ev: unknown) => void) => { handlers[type] = cb; },
      removeEventListener: () => {},
    };
    const scene = {
      scale: { width: 480, height: 270 },
      game: { canvas },
      add: {
        graphics: () => fakeNode(),
        container: () => fakeNode({ list: [] }),
        rectangle: () => fakeNode(),
      },
      input: { on() {}, off() {} },
      time: { delayedCall: () => ({ remove() {} }) },
    };
    const touch = { identifier: 4, clientX: 100, clientY: 200 };
    const event = {
      changedTouches: { length: 1, item: () => touch },
      touches: { length: 1, item: () => touch },
      preventDefault() {},
    };
    return {
      controls: new TouchControls(scene as never, { canMove }),
      handlers,
      event,
      touch,
    };
  }

  it("setzt den Snapshot bei touchend sofort auf inaktiv, update liefert 0", () => {
    (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: true }) } as never;
    const { controls, handlers, event, touch } = harness(() => true);
    const state = new InputState();

    handlers.touchstart(event);
    expect(getTouchSnapshot().active).toBe(true);
    touch.clientX = 140; // 40 px nach rechts (Stick-Radius 44)
    handlers.touchmove(event);
    const moving = state.update({ touch: getTouchSnapshot() });
    expect(moving.move.x).toBeGreaterThan(0.8);

    // Loslassen: TouchControls nullt den Snapshot synchron; der naechste
    // InputState-Frame sieht exakt (0,0) - kein Kleben/Nachlauf.
    handlers.touchend(event);
    expect(getTouchSnapshot()).toEqual({ active: false, x: 0, y: 0, pause: false });
    const stopped = state.update({ touch: getTouchSnapshot() });
    expect(stopped.move).toEqual({ x: 0, y: 0 });

    // Ein danach anliegender alter Finger darf nichts wiederbeleben.
    const later = state.update({ touch: { active: true, x: 0.1, y: 0 } });
    expect(later.move).toEqual({ x: 0, y: 0 });
  });

  it("blockiert Gesten bei Pause/Level-up/Truhe (canMove=false)", () => {
    (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: true }) } as never;
    let canMove = false;
    const { controls, handlers, event } = harness(() => canMove);
    const state = new InputState();

    handlers.touchstart(event);
    expect(getTouchSnapshot().active).toBe(false);
    expect(state.update({ touch: getTouchSnapshot() }).move).toEqual({ x: 0, y: 0 });

    // Wird waehrend eines gehaltenen Fingers pausiert, nullt controls.update()
    // die Achse im gleichen Frame.
    canMove = true;
    handlers.touchstart(event);
    expect(getTouchSnapshot().active).toBe(true);
    canMove = false;
    controls.update();
    expect(getTouchSnapshot().active).toBe(false);
    expect(state.update({ touch: getTouchSnapshot() }).move).toEqual({ x: 0, y: 0 });
  });

  it("reset() verwirft die Hysterese-Historie", () => {
    const state = new InputState();
    state.update({ touch: { active: true, x: 1, y: 0 } });
    state.update({ touch: { active: true, x: 0.1, y: 0 } }); // im Band, engaged bleibt
    state.reset();
    // Nach reset startet die Hysterese inaktiv: 0.1 liegt unter der Eingangsschwelle.
    expect(state.update({ touch: { active: true, x: 0.1, y: 0 } }).move).toEqual({ x: 0, y: 0 });
  });
});

