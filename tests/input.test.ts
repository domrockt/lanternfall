import { afterEach, describe, expect, it, vi } from "vitest";
import { getTouchSnapshot, resetTouchSnapshot } from "../src/input/TouchState";

// TouchControls braucht Phaser nur in Typ-Annotationen; der Stub haelt den
// Node-Testlauf frei von einer echten Canvas/DOM-Phaser-Instanz.
vi.mock("phaser", () => ({ default: {} }));
import { TouchControls } from "../src/input/TouchControls";
import {
  InputState,
  TOUCH_DEADZONE,
  MOVE_SOURCE_PRIORITY,
  PAD_DEADZONE,
  allActionsReleased,
  applyDeadzone,
  mergeActions,
  mergeSources,
  normalizeVector,
  readGamepadMoveActions,
  readKeyboardActions,
  readTouchActions,
  type ActionState,
  type GamepadSnapshot,
  type KeyboardSnapshot,
  type TouchSnapshot,
} from "../src/input/InputState";

function actions(partial: Partial<ActionState> = {}): ActionState {
  return {
    pause: false,
    confirm: false,
    back: false,
    up: false,
    down: false,
    left: false,
    right: false,
    ...partial,
  };
}

const idleKeyboard: KeyboardSnapshot = {
  up: false,
  down: false,
  left: false,
  right: false,
};

describe("menu pad arm gate", () => {
  it("only re-arms when every action is released", () => {
    expect(allActionsReleased(actions())).toBe(true);
    expect(allActionsReleased(actions({ confirm: true }))).toBe(false);
    expect(allActionsReleased(actions({ right: true }))).toBe(false);
    expect(allActionsReleased(actions({ pause: true, back: true }))).toBe(false);
  });
});

describe("fixed deadzone contract", () => {
  it("pins touch 12% and gamepad 18% (not just the generic rescale)", () => {
    expect(TOUCH_DEADZONE).toBe(0.12);
    expect(PAD_DEADZONE).toBe(0.18);
    expect(applyDeadzone(0.12, 0, TOUCH_DEADZONE)).toEqual({ x: 0, y: 0 });
    expect(applyDeadzone(0.18, 0, PAD_DEADZONE)).toEqual({ x: 0, y: 0 });
    expect(applyDeadzone(0.13, 0, TOUCH_DEADZONE).x).toBeCloseTo(0.01 / 0.88, 6);
    expect(applyDeadzone(0.19, 0, PAD_DEADZONE).x).toBeCloseTo(0.01 / 0.82, 6);
  });
});

describe("applyDeadzone", () => {
  it("returns zero exactly at and inside the deadzone", () => {
    expect(applyDeadzone(0, 0, 0.2)).toEqual({ x: 0, y: 0 });
    expect(applyDeadzone(0.2, 0, 0.2)).toEqual({ x: 0, y: 0 });
    expect(applyDeadzone(0.1, -0.1, 0.2)).toEqual({ x: 0, y: 0 });
  });

  it("remaps partial deflection linearly and clamps full deflection", () => {
    const v = applyDeadzone(0.5, 0, 0.2);
    expect(v.x).toBeCloseTo(0.375, 6);
    expect(v.y).toBeCloseTo(0, 6);
    expect(applyDeadzone(0.5, 0, 0).x).toBeCloseTo(0.5, 6);
    expect(applyDeadzone(0.6, 0, 0.2).x).toBeCloseTo(0.5, 6);

    const full = applyDeadzone(3, 4, 0.2);
    expect(Math.hypot(full.x, full.y)).toBeCloseTo(1, 6);
    expect(full.x).toBeCloseTo(0.6, 6);
    expect(full.y).toBeCloseTo(0.8, 6);
  });

  it("treats NaN and Infinity as zero", () => {
    expect(applyDeadzone(NaN, NaN, 0.2)).toEqual({ x: 0, y: 0 });
    expect(applyDeadzone(Infinity, NaN, 0.2)).toEqual({ x: 0, y: 0 });
  });
});

describe("normalizeVector", () => {
  it("normalizes axis and diagonal vectors to length 1", () => {
    expect(normalizeVector(3, 0)).toEqual({ x: 1, y: 0 });
    const diag = normalizeVector(1, 1);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1, 6);
    expect(diag.x).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it("returns zero for zero and invalid vectors", () => {
    expect(normalizeVector(0, 0)).toEqual({ x: 0, y: 0 });
    // NaN is treated as 0, so only the y component remains
    expect(normalizeVector(NaN, 5)).toEqual({ x: 0, y: 1 });
  });
});

describe("mergeSources priority", () => {
  it("has the documented priority order touch > gamepad > keyboard", () => {
    expect([...MOVE_SOURCE_PRIORITY]).toEqual(["touch", "gamepad", "keyboard"]);
  });

  it("prefers touch over gamepad and keyboard", () => {
    const touch: TouchSnapshot = { active: true, x: 1, y: 0 };
    const pad: GamepadSnapshot = { axes: [-1, 0], buttons: [] };
    const kb: KeyboardSnapshot = { ...idleKeyboard, up: true };
    const move = mergeSources({ touch, gamepad: pad, keyboard: kb });
    expect(move.x).toBeCloseTo(1, 6);
    expect(move.y).toBeCloseTo(0, 6);
  });

  it("prefers gamepad over keyboard when touch is inactive", () => {
    const touch: TouchSnapshot = { active: false, x: 1, y: 0 };
    const pad: GamepadSnapshot = { axes: [0, 1], buttons: [] };
    const kb: KeyboardSnapshot = { ...idleKeyboard, left: true };
    const move = mergeSources({ touch, gamepad: pad, keyboard: kb });
    expect(move.y).toBeGreaterThan(0);
    expect(move.x).toBeCloseTo(0, 6);
  });

  it("falls back to keyboard and normalizes the diagonal", () => {
    const kb: KeyboardSnapshot = { ...idleKeyboard, up: true, right: true };
    const move = mergeSources({ keyboard: kb });
    expect(Math.hypot(move.x, move.y)).toBeCloseTo(1, 6);
    expect(move.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(move.y).toBeCloseTo(-Math.SQRT1_2, 6);
  });

  it("returns zero when no source is active", () => {
    expect(mergeSources({})).toEqual({ x: 0, y: 0 });
    expect(
      mergeSources({ touch: { active: true, x: 0.01, y: 0 }, keyboard: idleKeyboard }),
    ).toEqual({ x: 0, y: 0 });
  });
});

describe("gamepad mapping", () => {
  it("gives the D-Pad priority over the stick", () => {
    const buttons = new Array<boolean>(16).fill(false);
    buttons[12] = true; // D-Pad up
    const pad: GamepadSnapshot = { axes: [1, 0], buttons };
    const move = mergeSources({ gamepad: pad });
    expect(move.x).toBeCloseTo(0, 6);
    expect(move.y).toBeCloseTo(-1, 6);
  });

  it("maps A/B/Start and D-Pad buttons to actions", () => {
    const buttons = new Array<boolean>(16).fill(false);
    buttons[0] = true; // A confirm
    buttons[1] = true; // B back
    buttons[9] = true; // Start pause
    buttons[14] = true; // D-Pad left
    buttons[13] = true; // D-Pad down
    const a = readGamepadMoveActions({ axes: [], buttons });
    expect(a.confirm).toBe(true);
    expect(a.back).toBe(true);
    expect(a.pause).toBe(true);
    expect(a.left).toBe(true);
    expect(a.down).toBe(true);
    expect(a.up).toBe(false);
    expect(a.right).toBe(false);
  });

  it("uses stick axes outside PAD_DEADZONE for directions", () => {
    const inside = readGamepadMoveActions({
      axes: [PAD_DEADZONE * 0.5, -PAD_DEADZONE * 0.5],
      buttons: [],
    });
    expect(inside).toEqual(actions());

    const outside = readGamepadMoveActions({ axes: [0.9, -0.9], buttons: [] });
    expect(outside.right).toBe(true);
    expect(outside.up).toBe(true);
    expect(outside.left).toBe(false);
    expect(outside.down).toBe(false);
  });

  it("is defensive with short arrays and invalid axes", () => {
    const a = readGamepadMoveActions({ axes: [NaN], buttons: [true] });
    expect(a.confirm).toBe(true);
    expect(a.up || a.down || a.left || a.right).toBe(false);
    expect(readGamepadMoveActions(null)).toEqual(actions());
  });
});

describe("keyboard and touch actions", () => {
  it("maps keyboard directions and meta buttons", () => {
    const a = readKeyboardActions({
      up: true,
      down: false,
      left: true,
      right: false,
      pause: true,
      confirm: false,
      back: true,
    });
    expect(a).toEqual(actions({ up: true, left: true, pause: true, back: true }));
  });

  it("maps touch pause only", () => {
    expect(readTouchActions({ active: true, x: 1, y: 1, pause: true })).toEqual(
      actions({ pause: true }),
    );
    expect(readTouchActions({ active: true, x: 1, y: 1 })).toEqual(actions());
  });

  it("ORs actions from multiple sources", () => {
    const merged = mergeActions(actions({ pause: true }), actions({ up: true }), actions());
    expect(merged.pause).toBe(true);
    expect(merged.up).toBe(true);
    expect(merged.back).toBe(false);
  });
});

describe("InputState edge detection", () => {
  it("fires on press, stays silent while held, re-fires after release", () => {
    const state = new InputState();

    const pressed = state.update({ keyboard: { ...idleKeyboard, up: true, confirm: true } });
    expect(pressed.actions.up).toBe(true);
    expect(pressed.actions.confirm).toBe(true);
    expect(pressed.move.y).toBeCloseTo(-1, 6);

    const held = state.update({ keyboard: { ...idleKeyboard, up: true, confirm: true } });
    expect(held.actions.up).toBe(false);
    expect(held.actions.confirm).toBe(false);
    expect(held.move.y).toBeCloseTo(-1, 6);

    const released = state.update({ keyboard: idleKeyboard });
    expect(released.actions.up).toBe(false);
    expect(released.move).toEqual({ x: 0, y: 0 });

    const again = state.update({ keyboard: { ...idleKeyboard, up: true } });
    expect(again.actions.up).toBe(true);
  });

  it("reset clears history so the next frame fires again", () => {
    const state = new InputState();
    state.update({ keyboard: { ...idleKeyboard, pause: true } });
    state.update({ keyboard: { ...idleKeyboard, pause: true } });
    state.reset();
    const afterReset = state.update({ keyboard: { ...idleKeyboard, pause: true } });
    expect(afterReset.actions.pause).toBe(true);
  });

  it("uses touch priority in the merged movement vector", () => {
    const state = new InputState();
    const frame = state.update({
      touch: { active: true, x: 0.5, y: 0 },
      keyboard: { ...idleKeyboard, left: true },
    });
    expect(frame.move.x).toBeCloseTo((0.5 - TOUCH_DEADZONE) / (1 - TOUCH_DEADZONE), 6);
    expect(frame.move.y).toBeCloseTo(0, 6);
  });

  it("survives missing or null sources", () => {
    const state = new InputState();
    const frame = state.update({});
    expect(frame.move).toEqual({ x: 0, y: 0 });
    expect(frame.actions).toEqual(actions());
    expect(state.update({ keyboard: null, touch: null, gamepad: null }).move).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("TouchControls chest gate", () => {
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
    return { controls: new TouchControls(scene as never, { canMove }), handlers, event };
  }

  it("verwirft einen Finger, der bei offener Truhe (canMove=false) aufgesetzt wurde", () => {
    (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: true }) } as never;
    let canMove = false;
    const { controls, handlers, event } = harness(() => canMove);
    expect(typeof handlers.touchstart).toBe("function");

    // Touchstart, waehrend die Truhe offen ist: kein Joystick.
    handlers.touchstart(event);
    expect((controls as unknown as { identifier: number | null }).identifier).toBeNull();
    expect((controls as unknown as { stickContainer: { visible: boolean } }).stickContainer.visible).toBe(false);

    // Die Truhe wird waehrend des gehaltenen Fingers geschlossen (pointerup),
    // danach darf der noch gehaltene Finger nicht als Joystick nachrutschen.
    canMove = true;
    handlers.touchmove(event);
    expect((controls as unknown as { identifier: number | null }).identifier).toBeNull();
    expect((controls as unknown as { stickContainer: { visible: boolean } }).stickContainer.visible).toBe(false);
    expect(getTouchSnapshot().active).toBe(false);

    // Gegenprobe: ein neuer Touchstart bei canMove=true erzeugt den Joystick.
    handlers.touchend(event);
    handlers.touchstart(event);
    expect((controls as unknown as { identifier: number | null }).identifier).toBe(4);
    expect((controls as unknown as { stickContainer: { visible: boolean } }).stickContainer.visible).toBe(true);
  });
});
