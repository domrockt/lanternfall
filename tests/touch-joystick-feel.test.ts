import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTouchSnapshot, resetTouchSnapshot } from "../src/input/TouchState";

// M10-touch-joystick-feel, Karte K3: Regressionstests fuer den Joystick-Feel.
//
// Vertrag (nur Ausgabe-Semantik, Magnitude/Speed unangetastet):
//   - Deadzone: unter der Schwelle kein Bewegungs-Output, Schwelle skaliert
//     mit der Viewport-Breite (7 px @480, 9 px @640, 11 px @780).
//   - 8-Richtungs-Snapping NUR jenseits der Deadzone, Magnitude bleibt.
//   - Sektor-Hysterese: Mikro-Jitter an Sektorgrenzen flackert nicht.
//   - Output-Eps: Mikro-Jitter erzeugt keine Positions-Updates.
//   - Latenz: entscheidende Geste -> Bewegung im selben Event (0 Frames).
// Chest-lock-Gate-Verhalten (C1-C7) bleibt unveraendert (eigene Datei).

vi.mock("phaser", () => ({ default: {} }));
import {
  DEADZONE_FRACTION,
  OUTPUT_EPSILON,
  SECTOR_HYSTERESIS_RAD,
  SECTOR_STEP,
  TouchControls,
  joystickDeadzonePx,
  sectorIndex8,
  sectorWithHysteresis,
} from "../src/input/TouchControls";

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
};

function fakeNode(): Node {
  const node: Node = {
    visible: false,
    setScrollFactor() { return node; },
    setDepth() { return node; },
    setVisible(v: boolean) { node.visible = v; return node; },
    setPosition() { return node; },
    fillStyle() { return node; },
    fillRect() { return node; },
    setInteractive() { return node; },
    setStrokeStyle() { return node; },
    disableInteractive() { return node; },
    on() { return node; },
    destroy() { return node; },
  };
  return node;
}

interface Harness {
  controls: TouchControls;
  touchstart: (id: number, x?: number, y?: number) => void;
  touchmove: (id: number, x?: number, y?: number) => void;
  touchend: (id: number) => void;
}

function harness(viewWidth = 480): Harness {
  const canvasHandlers: Record<string, (ev: unknown) => void> = {};
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: viewWidth, height: 270 }),
    addEventListener: (type: string, cb: (ev: unknown) => void) => { canvasHandlers[type] = cb; },
    removeEventListener: () => {},
  };
  const scene = {
    scale: { width: viewWidth, height: 270 },
    game: { canvas },
    add: {
      graphics: () => fakeNode(),
      container: () => fakeNode(),
      rectangle: () => fakeNode(),
    },
    input: { on() {}, off() {} },
    time: { delayedCall: () => ({ remove() {} }) },
  };
  const controls = new TouchControls(scene as never, { canMove: () => true });
  const touchList = (t: { identifier: number; clientX: number; clientY: number } | null) => ({
    length: t ? 1 : 0,
    item: (i: number) => (i === 0 && t ? t : null),
  });
  const mk = (id: number, x: number, y: number) => ({ identifier: id, clientX: x, clientY: y });
  const event = (t: ReturnType<typeof mk> | null) => ({
    changedTouches: touchList(t),
    touches: touchList(t),
    preventDefault() {},
  });
  const fire = (type: string, t: ReturnType<typeof mk> | null) => canvasHandlers[type](event(t));
  return {
    controls,
    touchstart: (id, x = 100, y = 200) => fire("touchstart", mk(id, x, y)),
    touchmove: (id, x = 100, y = 200) => fire("touchmove", mk(id, x, y)),
    touchend: (id) => fire("touchend", null),
  };
}

const ORIGIN = { x: 100, y: 200 };
/** Fingerposition aus Polar-Koordinaten (Grad, Screen-Y zeigt nach unten). */
const polar = (deg: number, len: number) => ({
  x: ORIGIN.x + Math.cos((deg * Math.PI) / 180) * len,
  y: ORIGIN.y + Math.sin((deg * Math.PI) / 180) * len,
});

describe("touch-joystick-feel: Deadzone-Semantik", () => {
  it("joystickDeadzonePx skaliert mit der Viewport-Breite (480/640/780)", () => {
    expect(joystickDeadzonePx(480)).toBe(Math.round(44 * DEADZONE_FRACTION));
    expect(joystickDeadzonePx(640)).toBe(Math.round(44 * DEADZONE_FRACTION * (640 / 480)));
    expect(joystickDeadzonePx(780)).toBe(Math.round(44 * DEADZONE_FRACTION * (780 / 480)));
    expect(joystickDeadzonePx(780)).toBeGreaterThan(joystickDeadzonePx(480));
  });

  it("unter der Totzone: kein Bewegungs-Output, auch bei Mikro-Jitter", () => {
    const h = harness();
    h.touchstart(1, ORIGIN.x, ORIGIN.y);
    const dead = joystickDeadzonePx(480);
    // Mehrere Moves unter der Schwelle, inkl. Rauschen um den Ursprung.
    for (const len of [1, 3, dead - 1, dead - 2, 2, dead - 1]) {
      const p = polar(37, len);
      h.touchmove(1, p.x, p.y);
      const s = getTouchSnapshot();
      expect(s.active).toBe(true);
      expect(s.x).toBe(0);
      expect(s.y).toBe(0);
    }
  });

  it("ab der Totzone: Bewegungs-Output setzt ein (im selben Event, 0 Frames Latenz)", () => {
    const h = harness();
    h.touchstart(1, ORIGIN.x, ORIGIN.y);
    h.touchmove(1, polar(0, joystickDeadzonePx(480) + 2).x, ORIGIN.y);
    const s = getTouchSnapshot();
    expect(s.x).toBeGreaterThan(0);
    expect(s.y).toBe(0);
  });

  it("zurueck unter die Totzone: Vektor kehrt auf 0 zurueck", () => {
    const h = harness();
    h.touchstart(1, ORIGIN.x, ORIGIN.y);
    h.touchmove(1, polar(0, 20).x, ORIGIN.y);
    expect(getTouchSnapshot().x).toBeGreaterThan(0);
    h.touchmove(1, polar(0, 3).x, ORIGIN.y);
    const s = getTouchSnapshot();
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
  });
});

describe("touch-joystick-feel: 8-Richtungs-Snapping (nur jenseits der Totzone)", () => {
  it("sectorIndex8/snap: Rohwinkel 10° -> Sektor 0, 30° -> Sektor 45°, 80° -> Sektor 90°", () => {
    expect(sectorIndex8((10 * Math.PI) / 180)).toBe(0);
    expect(sectorIndex8((30 * Math.PI) / 180)).toBe(1);
    expect(sectorIndex8((80 * Math.PI) / 180)).toBe(2);
  });

  it("jenseits der Totzone wird der Winkel auf den Sektor gerastet, Magnitude bleibt", () => {
    const h = harness();
    h.touchstart(1, ORIGIN.x, ORIGIN.y);
    const len = 25; // deutlich ueber der Totzone (7 px @480)
    const p = polar(20, len); // 20° roh -> Sektor 0 gerastet
    h.touchmove(1, p.x, p.y);
    const s = getTouchSnapshot();
    expect(s.y).toBe(0); // Sektor 0 = exakt +x
    expect(s.x).toBeCloseTo(len / 44, 5); // Magnitude unveraendert
  });

  it("negative Winkel rasten ebenso (Screen-Y nach unten)", () => {
    const h = harness();
    h.touchstart(1, ORIGIN.x, ORIGIN.y);
    const p = polar(-30, 25); // -> Sektor -45° (+45° Sektor 7)
    h.touchmove(1, p.x, p.y);
    const s = getTouchSnapshot();
    expect(s.x).toBeGreaterThan(0);
    expect(s.y).toBeLessThan(0);
    expect(Math.abs(s.y)).toBeCloseTo(s.x, 5); // exakte Diagonale
  });
});

describe("touch-joystick-feel: Sektor-Hysterese (kein Richtungsflackern)", () => {
  it("sectorWithHysteresis haelt den Sektor im Marge-Band an der Grenze", () => {
    const boundary = 1.5 * SECTOR_STEP; // 67.5°-Grenze zwischen Sektor 1 (45°) und Sektor 2 (90°)
    // Knapp hinter der Grenze (naechster Sektor waere 2): Sektor 1 bleibt stehen.
    expect(sectorWithHysteresis(boundary + SECTOR_HYSTERESIS_RAD / 2, 1)).toBe(1);
    // Von der Rueckseite: Sektor 2 bleibt ebenso stehen.
    expect(sectorWithHysteresis(boundary - SECTOR_HYSTERESIS_RAD / 2, 2)).toBe(2);
    // Deutlich jenseits des Marge-Bands: Wechsel findet statt.
    expect(sectorWithHysteresis(boundary + SECTOR_HYSTERESIS_RAD * 2, 1)).toBe(2);
  });

  it("Jitter-Serie an der Sektorgrenze: <= 1 Richtungswechsel pro 4 Frames", () => {
    const h = harness();
    h.touchstart(1, ORIGIN.x, ORIGIN.y);
    // Winkel oszilliert +/-2.5° um die 22.5°-Grenze, Radius 20 (weit ueber Totzone).
    let changes = 0;
    let prevSector = -1;
    for (let i = 0; i < 24; i++) {
      const deg = i % 2 === 0 ? 20 : 25;
      const p = polar(deg, 20);
      h.touchmove(1, p.x, p.y);
      const s = getTouchSnapshot();
      if (s.x !== 0 || s.y !== 0) {
        const sec = sectorIndex8(Math.atan2(s.y, s.x));
        if (prevSector >= 0 && sec !== prevSector) changes++;
        prevSector = sec;
      }
    }
    expect(changes).toBeLessThanOrEqual(24 / 4);
  });
});

describe("touch-joystick-feel: Output-Eps (keine Positions-Updates durch Mikro-Jitter)", () => {
  it("60 Mikro-Jitter-Moves (< OUTPUT_EPSILON Differenz) erzeugen max. 1 Snapshot-Aenderung", () => {
    const h = harness();
    h.touchstart(1, ORIGIN.x, ORIGIN.y);
    h.touchmove(1, polar(0, 15).x, ORIGIN.y); // etabliert den Vektor
    const base = getTouchSnapshot();
    let changes = 0;
    for (let i = 0; i < 60; i++) {
      const len = 15 + (i % 2 === 0 ? 0.4 : -0.4); // +/-0.4 px -> Unit-Delta ~0.009 < 0.02
      h.touchmove(1, polar(0, len).x, ORIGIN.y);
      const s = getTouchSnapshot();
      if (Math.abs(s.x - base.x) > 1e-9 || Math.abs(s.y - base.y) > 1e-9) changes++;
    }
    expect(changes).toBeLessThanOrEqual(1);
  });

  it("echte Bewegung ueberschreitet das Eps sofort (kein Latenz-Opfer)", () => {
    expect(OUTPUT_EPSILON).toBeLessThan(0.03);
    const h = harness();
    h.touchstart(1, ORIGIN.x, ORIGIN.y);
    h.touchmove(1, polar(0, 15).x, ORIGIN.y);
    const before = getTouchSnapshot();
    h.touchmove(1, polar(0, 20).x, ORIGIN.y); // +5 px -> Unit-Delta 0.11 > Eps
    expect(getTouchSnapshot().x).toBeGreaterThan(before.x);
  });
});

describe("touch-joystick-feel: Latenz Geste -> Bewegung <= 2 Frames", () => {
  it("entscheidende Geste (Sprung 20 px): Bewegung im selben Event = 0 Frames", () => {
    const h = harness();
    h.touchstart(2, ORIGIN.x, ORIGIN.y);
    for (let i = 0; i < 3; i++) {
      h.touchmove(2, ORIGIN.x + 0.4, ORIGIN.y + (i % 2 === 0 ? 0.3 : -0.3));
      const s = getTouchSnapshot();
      expect(s.x).toBe(0); // Mikro-Jitter emittiert keine Bewegung
      expect(s.y).toBe(0);
    }
    h.touchmove(2, ORIGIN.x + 20, ORIGIN.y);
    const s = getTouchSnapshot();
    expect(s.x).toBeGreaterThan(0); // 0 Frames Latenz <= 2
  });

  it("Dauer-Drift: Updates folgen innerhalb desselben Events (1 Frame-Schrittweise reicht)", () => {
    const h = harness();
    h.touchstart(2, ORIGIN.x, ORIGIN.y);
    let movedFrames = 0;
    for (let i = 1; i <= 10; i++) {
      h.touchmove(2, ORIGIN.x + i * 3, ORIGIN.y);
      if (getTouchSnapshot().x > 0) movedFrames++;
    }
    expect(movedFrames).toBeGreaterThanOrEqual(8); // 10 Moves, 1 unter Totzone + Eps-Intro
  });
});

describe("touch-joystick-feel: chest-lock-Gate-Verhalten unveraendert", () => {
  it("canMove=false verwirft weiterhin die Geste (K2-Semantik)", () => {
    const canvasHandlers: Record<string, (ev: unknown) => void> = {};
    const canvas = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270 }),
      addEventListener: (type: string, cb: (ev: unknown) => void) => { canvasHandlers[type] = cb; },
      removeEventListener: () => {},
    };
    let canMove = false;
    const scene = {
      scale: { width: 480, height: 270 },
      game: { canvas },
      add: { graphics: () => fakeNode(), container: () => fakeNode(), rectangle: () => fakeNode() },
      input: { on() {}, off() {} },
      time: { delayedCall: () => ({ remove() {} }) },
    };
    new TouchControls(scene as never, { canMove: () => canMove });
    const t = { identifier: 4, clientX: 92, clientY: 200 };
    const ev = { changedTouches: { length: 1, item: () => t }, touches: { length: 1, item: () => t }, preventDefault() {} };
    canvasHandlers.touchstart(ev);
    canMove = true;
    canvasHandlers.touchmove({ ...ev });
    const s = getTouchSnapshot();
    expect(s.active).toBe(false); // Geste bleibt verworfen (Gate EINMALIG bei Touchstart)
  });
});
