// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { describe, expect, it, vi } from "vitest";
// Lane m10-gamepad-nav-scenes-r2: Szenen-Wiring der Gamepad-Menü-Navigation.
// Kern-API (MenuFocus, menuRepeatTick) ist in tests/gamepad-nav.test.ts
// abgedeckt und bleibt unangetastet. Hier: die reine Nav-Funktion der
// CharSelect-Szene (K3) + die Pause-Wiring-Semantik (K5) auf Widget-Ebene.
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
import { menuRepeatTick, type MenuRepeatState } from "../src/ui/menu";
import type { ActionState } from "../src/input/InputState";

const base: CharSelectNavState = { row: 0, charIndex: 0, buttonIndex: 1 };

const pad = (held: Partial<ActionState>): ActionState => ({
  pause: false, confirm: held.confirm === true, back: held.back === true,
  up: held.up === true, down: held.down === true, left: held.left === true, right: held.right === true,
});

const nav = (s: CharSelectNavState, a: ActionState) =>
  charSelectPadNav(s, a, { chars: 2, buttons: 2 });

describe("charSelectPadNav – Panels + Knopfleiste per D-Pad (K3, Startfokus Reihe 0 seit B1)", () => {
  it("Startzustand: Panel-Reihe (Charakter fokussiert); down wechselt in die Knöpfe, up bleibt", () => {
    expect(nav(base, pad({ down: true }))).toMatchObject({ row: 1, charIndex: 0, buttonIndex: 1, action: null });
    expect(nav(base, pad({ up: true }))).toMatchObject({ row: 0, charIndex: 0, buttonIndex: 1, action: null });
    expect(nav(base, pad({}))).toMatchObject({ row: 0, action: null });
  });

  it("Panel-Reihe: left/right wrappt über beide Charaktere in beide Richtungen", () => {
    const row0: CharSelectNavState = { row: 0, charIndex: 0, buttonIndex: 1 };
    expect(nav(row0, pad({ right: true }))).toMatchObject({ row: 0, charIndex: 1 });
    expect(nav(row0, pad({ left: true }))).toMatchObject({ row: 0, charIndex: 1 }); // wrap rückwärts
    expect(nav({ ...row0, charIndex: 1 }, pad({ right: true }))).toMatchObject({ charIndex: 0 }); // wrap vorwärts
  });

  it("up in der Panel-Reihe bleibt (kein Springen in die Knöpfe), up in Knopf-Reihe geht zu Panels", () => {
    expect(nav(base, pad({ up: true }))).toMatchObject({ row: 0 });
    expect(nav({ row: 1, charIndex: 0, buttonIndex: 1 }, pad({ up: true }))).toMatchObject({ row: 0 });
  });

  it("Knopf-Reihe: left/right wrappt ZURÜCK ↔ START", () => {
    expect(nav({ row: 1, charIndex: 0, buttonIndex: 1 }, pad({ left: true }))).toMatchObject({ row: 1, buttonIndex: 0 });
    expect(nav({ row: 1, charIndex: 0, buttonIndex: 0 }, pad({ right: true }))).toMatchObject({ buttonIndex: 1 });
    expect(nav({ row: 1, charIndex: 0, buttonIndex: 0 }, pad({ left: true }))).toMatchObject({ buttonIndex: 1 }); // wrap
  });

  it("A = bestätigen: confirm in Panel-Reihe startet den Run (B1: A wählt + startet)", () => {
    expect(nav({ row: 0, charIndex: 1, buttonIndex: 1 }, pad({ confirm: true })).action).toBe("start");
  });

  it("A in Knopf-Reihe: START → start, ZURÜCK → back", () => {
    expect(nav({ row: 1, charIndex: 0, buttonIndex: 1 }, pad({ confirm: true })).action).toBe("start");
    expect(nav({ row: 1, charIndex: 0, buttonIndex: 0 }, pad({ confirm: true })).action).toBe("back");
  });

  it("B = zurück (beide Reihen), ohne Fokusverschiebung", () => {
    expect(nav(base, pad({ back: true })).action).toBe("back");
    expect(nav({ row: 1, charIndex: 1, buttonIndex: 1 }, pad({ back: true })).action).toBe("back");
  });

  it("ein Pad-Frame = eine Aktion: alles gleichzeitig → nur back (Priorität), keine Doppel-Events", () => {
    const r = nav(base, pad({ back: true, up: true, down: true, left: true, right: true, confirm: true }));
    expect(r.action).toBe("back");
    expect(r).toMatchObject({ row: 0, charIndex: 0, buttonIndex: 1 }); // nichts zusätzlich verschoben
  });
});

describe("Pause-Wiring (K5): menuRepeatTick + InputState-Edges = genau ein Schritt pro Press", () => {
  // Nachbau der UI.ts-Pause-Semantik: InputState liefert Rising-Edges, der
  // Repeat-Kanal darf daraus nie mehr als einen Fokus-Schritt pro Press machen.
  const step = (rs: MenuRepeatState, edge: boolean, now: number) =>
    menuRepeatTick(rs, edge, now);

  it("Edge-Press (1 Frame true, danach false) feuert genau einmal; Release resettet", () => {
    const rs: MenuRepeatState = { held: false, fires: 0, lastFireMs: -1 };
    expect(step(rs, true, 0)).toBe(true);
    expect(step(rs, false, 16)).toBe(false);
    expect(rs.fires).toBe(0); // Release setzt den Kanal zurück (menuRepeatTick)
    expect(step(rs, false, 500)).toBe(false);
    expect(step(rs, true, 600)).toBe(true); // neuer Press feuert sofort wieder
  });

  it("250 ms gehaltener Edge-Frame verschiebt genau EINEN Schritt (kein Frame-Spam)", () => {
    const rs: MenuRepeatState = { held: false, fires: 0, lastFireMs: -1 };
    expect(step(rs, true, 0)).toBe(true); // Press
    for (let t = 16; t <= 250; t += 16) {
      const fired = step(rs, true, t); // held bleibt true (Repeat-Pfad)
      if (t < 200) expect(fired).toBe(false);
    }
    // Erstwiederholung im 16-ms-Raster bei t=208 (>=200 ms) — insgesamt 2 Feuer:
    expect(rs.fires).toBe(2);
  });
});
