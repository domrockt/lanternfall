import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTouchSnapshot, resetTouchSnapshot, setTouchSnapshot } from "../src/input/TouchState";

// m10-chest-lock-touch, Karte K3: Die 7 Truhen-Gesten-Konstellationen aus
// scripts/m10-chest-lock.mjs als Unit-Tests (Stubs statt Phaser/CDP).
//
// Regel (TouchState/TouchControls): Gesten nur annehmen, wenn der Run laeuft und
// nicht pausiert/Level-up/Truhe ist (opts.canMove). Die Konstellationen decken
// Joystick-Drift, Pause-Tap und Dash-Swipe ab:
//
//   C1 Touchstart bei offener Truhe + Drag, der erst nach dem Dismiss ankommt
//   C2 Joystick laeuft, Truhe oeffnet sich beim Halten -> Geste sofort verwerfen
//   C3 Finger startet bei offener Truhe, bleibt ueber den Dismiss gehalten
//   C4 Dash-Swipe (start+move+end) bei offener Truhe
//   C5 Langzeit-Drift: viele Moves bei offener Truhe
//   C6 Pause-Tap auf den Pause-Knopf bei offener Truhe
//   C7 Kein Kleben: nach dem Verwerfen startet eine neue Geste sofort
//
// Negativ-Block: normale Gesten ausserhalb der Truhe bleiben unveraendert.

vi.mock("phaser", () => ({ default: {} }));
import { TouchControls } from "../src/input/TouchControls";

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = {
    matchMedia: () => ({ matches: true }),
  } as never;
  resetTouchSnapshot();
});

afterEach(() => {
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = originalWindow;
  resetTouchSnapshot();
});

type Node = Record<string, unknown> & {
  visible: boolean;
  handlers: Record<string, () => void>;
};

function fakeNode(): Node {
  const node: Node = {
    visible: false,
    handlers: {},
    setScrollFactor() { return node; },
    setDepth() { return node; },
    setVisible(v: boolean) { node.visible = v; return node; },
    setPosition() { return node; },
    fillStyle() { return node; },
    fillRect() { return node; },
    setInteractive() { return node; },
    setStrokeStyle() { return node; },
    disableInteractive() { return node; },
    on(type: string, cb: () => void) { node.handlers[type] = cb; return node; },
  };
  return node;
}

interface Harness {
  controls: import("../src/input/TouchControls").TouchControls;
  dom: Record<string, (ev: unknown) => void>;
  pauseButton: Node;
  firePulseTimer: () => void;
  setCanMove: (v: boolean) => void;
  touchstart: (id: number, x?: number, y?: number) => void;
  touchmove: (id: number, x?: number, y?: number) => void;
  touchend: (id: number) => void;
  identifier: () => number | null;
  stickVisible: () => boolean;
}

function harness(): Harness {
  let canMove = true;
  let pulseCb: (() => void) | undefined;
  const canvasHandlers: Record<string, (ev: unknown) => void> = {};
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270 }),
    addEventListener: (type: string, cb: (ev: unknown) => void) => { canvasHandlers[type] = cb; },
    removeEventListener: () => {},
  };
  const pauseButton = fakeNode();
  const scene = {
    scale: { width: 480, height: 270 },
    game: { canvas },
    add: {
      graphics: () => fakeNode(),
      container: () => fakeNode(),
      rectangle: () => {
        const n = fakeNode();
        // Der erste Rectangle-Knoten ist der Pause-Bg (createPauseButton).
        if (!scene.__pauseBg) scene.__pauseBg = n;
        return n;
      },
    },
    input: { on() {}, off() {} },
    time: {
      delayedCall: (_ms: number, cb: () => void) => {
        pulseCb = cb;
        return { remove() { pulseCb = undefined; } };
      },
    },
    __pauseBg: undefined as Node | undefined,
  };
  const controls = new TouchControls(scene as never, { canMove: () => canMove });
  const pauseButtonNode = scene.__pauseBg as unknown as Node;
  const touchList = (t: { identifier: number; clientX: number; clientY: number } | null) => ({
    length: t ? 1 : 0,
    item: (i: number) => (i === 0 && t ? t : null),
  });
  const mk = (id: number, x = 100, y = 200) => ({ identifier: id, clientX: x, clientY: y });
  const event = (changed: ReturnType<typeof mk> | null, touches: ReturnType<typeof touchList>) => ({
    changedTouches: touchList(changed),
    touches,
    preventDefault() {},
  });

  const touchstart = (id: number, x = 100, y = 200) => {
    const t = mk(id, x, y);
    canvasHandlers.touchstart(event(t, touchList(t)));
  };
  const touchmove = (id: number, x = 100, y = 200) => {
    const t = mk(id, x, y);
    canvasHandlers.touchmove(event(t, touchList(t)));
  };
  const touchend = (id: number) => {
    const t = mk(id);
    canvasHandlers.touchend(event(t, touchList(null)));
  };

  return {
    controls,
    dom: canvasHandlers,
    pauseButton: pauseButtonNode,
    firePulseTimer: () => pulseCb?.(),
    setCanMove: (v: boolean) => { canMove = v; },
    touchstart,
    touchmove,
    touchend,
    identifier: () => (controls as unknown as { identifier: number | null }).identifier,
    stickVisible: () =>
      Boolean((controls as unknown as { stickContainer?: { visible: boolean } }).stickContainer?.visible),
  };
}

const snapshot = () => getTouchSnapshot();

describe("chest-lock-touch: 7 Konstellationen (K1-C1..C7)", () => {
  it("C1 Touchstart bei offener Truhe: Drag wird auch nach dem Dismiss nicht zum Joystick", () => {
    const h = harness();
    h.setCanMove(false); // Truhe offen
    h.touchstart(4, 92, 200);
    expect(h.identifier()).toBeNull();
    expect(h.stickVisible()).toBe(false);
    expect(snapshot().active).toBe(false);

    // Truhe wird geschlossen (canMove true), der Finger bleibt gehalten und zieht.
    h.setCanMove(true);
    h.touchmove(4, 130, 200);
    expect(h.identifier()).toBeNull();
    expect(h.stickVisible()).toBe(false);
    expect(snapshot().active).toBe(false);
  });

  it("C2 Joystick laeuft, Truhe oeffnet sich beim Halten: Geste wird sofort verworfen", () => {
    const h = harness();
    h.touchstart(4, 92, 200);
    h.touchmove(4, 120, 200); // Drift
    expect(snapshot().active).toBe(true);
    expect(snapshot().x).toBeGreaterThan(0);

    // Truhe oeffnet sich (canMove false) und der Finger zieht weiter.
    h.setCanMove(false);
    h.touchmove(4, 130, 200);
    expect(h.identifier()).toBeNull();
    expect(h.stickVisible()).toBe(false);
    const s = snapshot();
    expect(s.active).toBe(false);
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
  });

  it("C3 Finger startet bei offener Truhe und bleibt ueber den Dismiss gehalten: kein Joystick", () => {
    const h = harness();
    h.setCanMove(false);
    h.touchstart(4, 92, 200);
    h.setCanMove(true); // Truhe per Tipp uebernommen, Finger noch gehalten
    for (let i = 0; i < 8; i++) h.touchmove(4, 92 + 4 * i, 200 - 2 * i);
    expect(h.identifier()).toBeNull();
    expect(h.stickVisible()).toBe(false);
    expect(snapshot().active).toBe(false);
  });

  it("C4 Dash-Swipe bei offener Truhe: start+move+end hinterlaesst nichts", () => {
    const h = harness();
    h.setCanMove(false);
    h.touchstart(4, 92, 200);
    h.touchmove(4, 110, 200);
    h.touchmove(4, 128, 200);
    h.touchend(4);
    expect(h.identifier()).toBeNull();
    expect(h.stickVisible()).toBe(false);
    expect(snapshot().active).toBe(false);
  });

  it("C5 Langzeit-Drift: 10 Move-Versuche bei offener Truhe bewegen nichts", () => {
    const h = harness();
    h.setCanMove(false);
    h.touchstart(4, 92, 200);
    for (let i = 0; i < 10; i++) {
      h.touchmove(4, 92 + (i % 2 === 0 ? 30 : 8), 200 - (i % 3) * 8);
      expect(h.identifier()).toBeNull();
      expect(h.stickVisible()).toBe(false);
      expect(snapshot().active).toBe(false);
    }
  });

  it("C6 Pause-Tap bei offener Truhe: Pause-Knopf feuert nicht", () => {
    const h = harness();
    h.setCanMove(false);
    h.pauseButton.handlers.pointerdown?.();
    expect(h.controls.pausePressed).toBe(false);
    expect(snapshot().pause).toBe(false);
  });

  it("C7 Kein Kleben: nach dem Verwerfen startet eine neue Geste sofort", () => {
    const h = harness();
    // Geste startet im Run, Truhe oeffnet sich, Geste wird verworfen.
    h.touchstart(4, 92, 200);
    h.setCanMove(false);
    h.touchmove(4, 120, 200);
    expect(h.identifier()).toBeNull();
    h.touchend(4);
    // Truhe uebernommen (canMove true): neue Geste funktioniert normal.
    h.setCanMove(true);
    h.touchstart(7, 92, 200);
    expect(h.identifier()).toBe(7);
    expect(h.stickVisible()).toBe(true);
    h.touchmove(7, 136, 200);
    const s = snapshot();
    expect(s.active).toBe(true);
    expect(s.x).toBeGreaterThan(0);
  });
});

describe("chest-lock-touch: Negativ-Check (normale Gesten ausserhalb der Truhe)", () => {
  it("normaler Drag erzeugt den Rohvektor und das Ende resettet", () => {
    const h = harness();
    h.touchstart(4, 92, 200);
    h.touchmove(4, 136, 200); // 44 px = voller Ring
    const s = snapshot();
    expect(s.active).toBe(true);
    expect(s.x).toBeCloseTo(1, 6);
    expect(s.y).toBe(0);
    h.touchend(4);
    expect(snapshot().active).toBe(false);
  });

  it("Pause-Tap im Run feuert genau einmal und der Puls laeuft ab", () => {
    const h = harness();
    h.pauseButton.handlers.pointerdown?.();
    expect(h.controls.pausePressed).toBe(true);
    expect(h.controls.pausePressed).toBe(false); // entprellt
    expect(snapshot().pause).toBe(true);
    h.firePulseTimer();
    expect(snapshot().pause).toBe(false);
  });

  it("Pause-Puls bleibt bei canMove=false erhalten (Run/UI-Reihenfolge), Bewegung wird genullt", () => {
    const h = harness();
    h.touchstart(4, 92, 200);
    h.pauseButton.handlers.pointerdown?.(); // Puls im Flug
    expect(snapshot().pause).toBe(true);
    h.setCanMove(false); // z. B. Level-up poppt auf
    h.controls.update();
    const s = snapshot();
    expect(s.active).toBe(false);
    expect(s.x).toBe(0);
    expect(s.pause).toBe(true); // Puls geht nicht verloren
  });

  it("setTouchSnapshot begrenzt den Rohvektor auf [-1,1] (Dash-Clamp)", () => {
    setTouchSnapshot({ active: true, x: 5, y: -5 });
    const s = snapshot();
    expect(s.x).toBe(1);
    expect(s.y).toBe(-1);
  });
});
