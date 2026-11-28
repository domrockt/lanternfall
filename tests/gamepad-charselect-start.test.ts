// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { describe, expect, it, vi } from "vitest";
// Lane m10-gamepad-charselect-start (Karte #10415): Regression zum Befund B1
// (docs/lanes/m10-sightprep-smoke.md) — Gamepad-Start aus CharSelect warf zum
// Titel zurück, weil der Pad-Startfokus in der Knopfreihe lag und d-right dort
// auf ZURÜCK wrappte (A löste dann "back" aus). Der Harness
// scripts/verify-input.mjs (runGamepadSuite) erwartet: D-Pad-rechts wählt Kael
// (Reihe 0), A startet den Run. Hier wird genau diese Druckfolge als reine
// Nav-Kette nachgebaut; die Szene startet mit padRow = 0 (CharSelect.create).
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
import { charSelectPadNav, type CharSelectNavState } from "../src/scenes/CharSelect";
import type { ActionState } from "../src/input/InputState";

/** Pad-Startzustand der Szene: Reihe 0 (Charakter-Panel), Mira fokussiert,
 * Knopf-Fokus START (wird erst nach `down` relevant). */
const boot: CharSelectNavState = { row: 0, charIndex: 0, buttonIndex: 1 };

const pad = (held: Partial<ActionState>): ActionState => ({
  pause: false, confirm: held.confirm === true, back: held.back === true,
  up: held.up === true, down: held.down === true, left: held.left === true, right: held.right === true,
});

const nav = (s: CharSelectNavState, a: ActionState) =>
  charSelectPadNav(s, a, { chars: 2, buttons: 2 }); // Mira, Kael — ZURÜCK, START

describe("B1-Regression: Gamepad-Start aus CharSelect (Harness-Druckfolge)", () => {
  it("d-right wählt in Reihe 0 Kael (charIndex 1), Fokus bleibt in der Panel-Reihe", () => {
    const afterRight = nav(boot, pad({ right: true }));
    expect(afterRight).toMatchObject({ row: 0, charIndex: 1, action: null });
  });

  it("d-right + A = Harness-Folge: A bestätigt Kael und startet den Run (action 'start')", () => {
    const afterRight = nav(boot, pad({ right: true }));
    const afterA = nav(
      { row: afterRight.row, charIndex: afterRight.charIndex, buttonIndex: afterRight.buttonIndex },
      pad({ confirm: true }),
    );
    expect(afterA.action).toBe("start");
    expect(afterA.charIndex).toBe(1); // Kael — Szene startet CHARACTER_LIST[this.index]
  });

  it("d-left vom Startzustand wrappt NICHT in die Knopfreihe (B1-Weg gestellt)", () => {
    const afterLeft = nav(boot, pad({ left: true }));
    expect(afterLeft).toMatchObject({ row: 0, charIndex: 1, action: null }); // wrap zu Kael
    expect(nav(afterLeft, pad({ confirm: true })).action).toBe("start");
  });

  it("Negativfall: back bleibt erreichbar — B-Knopf aus Reihe 0", () => {
    expect(nav(boot, pad({ back: true })).action).toBe("back");
  });

  it("Negativfall: back bleibt erreichbar — down in Knopfreihe, links zu ZURÜCK, A", () => {
    const row1 = nav(boot, pad({ down: true }));
    expect(row1).toMatchObject({ row: 1, buttonIndex: 1 });
    const onBack = nav(row1, pad({ left: true }));
    expect(onBack).toMatchObject({ row: 1, buttonIndex: 0 });
    expect(nav(onBack, pad({ confirm: true })).action).toBe("back");
  });

  it("down + A ohne Wrap startet weiterhin über den START-Knopf", () => {
    const row1 = nav(boot, pad({ down: true }));
    expect(nav(row1, pad({ confirm: true })).action).toBe("start");
  });
});
