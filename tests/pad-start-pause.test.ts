import { describe, expect, it } from "vitest";
import {
  escToggleAllowed,
  InputState,
  mergeSources,
  MOVE_SOURCE_PRIORITY,
  padToggleEvent,
  PAD_START_KEY,
  type EscToggleEvent,
  type GamepadSnapshot,
} from "../src/input/InputState";

// Lane m10-pad-start-pause-r2, K4: Regressionstests fuer die Pad-Start-Pause.
//
// Befund (K1, docs/lanes/m10-pad-start-pause-r2.md): Pad-Start (Button 9)
// loest die Run-Pause bereits aus, aber der Frame-Pfad in Run.ts rief
// togglePause() OHNE Event auf — der Dedup-Pfad escToggleAllowed wurde
// umgangen. K2 fuehrt Pad-/Touch-Pause als ESC-Aequivalent in denselben Pfad:
// padToggleEvent(ts) erzeugt ein synthetisches Event (key = PAD_START_KEY),
// das dieselben Regeln durchlaeuft (nur keydown, kein repeat, timeStamp-Dedup).
//
// Zielkorridore:
//  - ein physischer Pad-Press togglet genau einmal (0 Doppel-Events),
//  - ESC-Verhalten bitgleich (Bestandsregeln, eigene Dedup-Urteile unberuehrt),
//  - MOVE_SOURCE_PRIORITY/Merge unberuehrt (touch > gamepad > keyboard).

const kd = (ts: number, repeat = false): EscToggleEvent =>
  ({ key: "Escape", type: "keydown", timeStamp: ts, repeat });

const pad = (axes: number[], pressed: number[]): GamepadSnapshot => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => pressed.includes(i)),
});

describe("padToggleEvent – synthetisches Pad-Start-Event (m10-pad-start-pause-r2 K2)", () => {
  it("Form: keydown, kein repeat, key = PAD_START_KEY", () => {
    expect(padToggleEvent(1234)).toEqual({
      key: PAD_START_KEY,
      type: "keydown",
      timeStamp: 1234,
      repeat: false,
    });
  });
});

describe("escToggleAllowed – Pad-Start durchlaeuft denselben Dedup (K2)", () => {
  it("erster Pad-Press togglet", () => {
    const first = escToggleAllowed(padToggleEvent(1000), null);
    expect(first.allowed).toBe(true);
    expect(first.lastAcceptedTs).toBe(1000);
  });

  it("Doppel-Dispatch desselben Presses (gleicher ms-Floor) togglet genau einmal", () => {
    const ts = Math.floor(performance.now());
    const first = escToggleAllowed(padToggleEvent(ts), null);
    expect(first.allowed).toBe(true);
    for (let i = 0; i < 4; i++) {
      const again = escToggleAllowed(padToggleEvent(ts), first.lastAcceptedTs);
      expect(again.allowed).toBe(false);
      expect(again.lastAcceptedTs).toBe(first.lastAcceptedTs);
    }
  });

  it("zweiter Press mit neuem timeStamp togglet (Start-Start-Zyklus)", () => {
    const first = escToggleAllowed(padToggleEvent(1000), null);
    expect(escToggleAllowed(padToggleEvent(1500), first.lastAcceptedTs).allowed).toBe(true);
  });

  it("ESC und Pad teilen den Dedup-Merker (ESC-Aequivalent, kein Doppel-Event im Mix)", () => {
    const padFirst = escToggleAllowed(padToggleEvent(2000), null);
    expect(padFirst.allowed).toBe(true);
    // Ein ESC-Dispatch mit demselben timeStamp kann kein zweiter physikalischer Press sein:
    expect(escToggleAllowed(kd(2000), padFirst.lastAcceptedTs).allowed).toBe(false);
  });

  it("synthetisches Event ohne keydown (keyup/Repeat) togglet nie", () => {
    const first = escToggleAllowed(padToggleEvent(3000), null);
    expect(escToggleAllowed({ ...padToggleEvent(3000), type: "keyup" }, first.lastAcceptedTs).allowed)
      .toBe(false);
    expect(escToggleAllowed({ ...padToggleEvent(3000), repeat: true }, first.lastAcceptedTs).allowed)
      .toBe(false);
  });

  it("ohne Event (Portrait-Autopause) togglet immer — Verhalten bitgleich", () => {
    expect(escToggleAllowed(null, 4000).allowed).toBe(true);
    expect(escToggleAllowed(undefined, null).allowed).toBe(true);
  });

  it("fremde Keys (z. B. resize-Event) togglen immer — ESC-Bitgleichheit", () => {
    const ev: EscToggleEvent = { key: "resize", type: "event", timeStamp: 5000, repeat: false };
    const first = escToggleAllowed(ev, null);
    expect(first.allowed).toBe(true);
    // fremde Keys veraendern den ESC-Merker nicht
    expect(first.lastAcceptedTs).toBeNull();
  });
});

describe("InputState – Pad-Start feuert genau eine pause-Edge (K2/K4)", () => {
  const state = new InputState();
  const step = (pressed: boolean) =>
    state.update({ gamepad: pad([0, 0, 0, 0], pressed ? [9] : []) }).actions.pause;

  it("gehaltener Start: eine Edge beim Press, keine weiteren solange gehalten", () => {
    expect(step(true)).toBe(true); // Press -> genau eine Edge
    for (let i = 0; i < 10; i++) expect(step(true)).toBe(false); // halten -> keine Edges
    expect(step(false)).toBe(false); // Release -> keine Edge
  });

  it("zweiter Press feuert wieder genau eine Edge (Start-Start-Zyklus)", () => {
    expect(step(true)).toBe(true);
    expect(step(false)).toBe(false);
    expect(step(true)).toBe(true);
    expect(step(false)).toBe(false);
  });
});

describe("MOVE_SOURCE_PRIORITY unberuehrt (K4)", () => {
  it("Prioritaet touch > gamepad > keyboard, keine Mischung", () => {
    expect([...MOVE_SOURCE_PRIORITY]).toEqual(["touch", "gamepad", "keyboard"]);
    const sources = {
      keyboard: { up: false, down: false, left: false, right: false },
      gamepad: pad([0, 0, 0, 0], []),
      touch: { active: true, x: 0, y: 0 },
    };
    expect(mergeSources(sources)).toEqual({ x: 0, y: 0 }); // alles in der Totzone
    // Gamepad-Stick schlaegt Tastatur, sobald er sich bewegt:
    const viaPad = mergeSources({
      ...sources,
      keyboard: { up: true, down: false, left: false, right: false },
      gamepad: pad([0.9, 0, 0, 0], []),
    });
    expect(viaPad.x).toBeCloseTo((0.9 - 0.18) / 0.82, 6); // PAD_DEADZONE-Remap
    expect(viaPad.y).toBe(0);
    // Touch schlaegt beides:
    const viaTouch = mergeSources({ ...sources, touch: { active: true, x: 0, y: -0.9 } });
    expect(viaTouch.x).toBe(0);
    expect(viaTouch.y).toBeCloseTo(-(0.9 - 0.12) / 0.88, 6); // TOUCH_DEADZONE-Remap
  });

  it("Pad-Start (Button 9) beeinflusst den Bewegungsvektor nicht", () => {
    const moving = mergeSources({ gamepad: pad([0.9, 0, 0, 0], [9]) });
    const still = mergeSources({ gamepad: pad([0.9, 0, 0, 0], []) });
    expect(moving).toEqual(still);
  });
});
