import { describe, expect, it, vi } from "vitest";
// UI.ts ist eine Phaser-Szene; die reine Anker-Geometrie braucht kein DOM.
// Phaser wird neutral gemockt (Muster tests/hud-anchor.test.ts).
vi.mock("phaser", () => {
  class Scene { constructor(_key?: string) { /* Stub */ } }
  class Container { constructor(_scene?: unknown, _x?: number, _y?: number) { /* Stub */ } }
  return { default: { Scene, GameObjects: { Container } } };
});
import { type AnchorBox, hudAnchorBoxes, HUD_MARGIN_X, HUD_TOP_Y } from "../src/scenes/UI";
import {
  insetsToGamePx,
  hudSideMargin,
  hudTopMargin,
  type SafeAreaInsets,
} from "../src/logic/safearea";

/**
 * M10-hud-notch-safearea (#1020): Safe-Area-Geometrie des HUD-Topstreifens.
 * iphone14-Profil (844x360, Notch links/rechts 47 CSS-Px, Home-Indikator
 * unten 21) darf 0 HUD-Pixel in der Notch-/Rundungs-Zone haben; alle Profile
 * ohne Geraete-Inset bleiben bitgleich zur 640x360-Referenz (Regression).
 */

const NO_INSETS: SafeAreaInsets = { left: 0, right: 0, top: 0, bottom: 0 };

/** View-Breiten der 7 Display-Profile (M8-Display-Tabelle). */
const PROFILE_WIDTHS = [640, 640, 640, 683, 844, 860, 546];

/** Notch-/Rundungs-Zonen in Spielpixeln (CSS = Spielpixel auf iphone14). */
function iphone14Zones(width: number): { x0: number; x1: number }[] {
  return [{ x0: 0, x1: 47 }, { x0: width - 47, x1: width }];
}

describe("m10-hud-safearea: insetsToGamePx", () => {
  it("rechnet CSS-Insets in Spielpixel um (aufrunden, nie in die Notch)", () => {
    // iphone14: Canvas-CSS 844 = View 844 -> 1:1.
    expect(insetsToGamePx(844, 844, { left: 47, right: 47, top: 0, bottom: 21 }))
      .toEqual({ left: 47, right: 47, top: 0, bottom: 21 });
    // Bruchteile runden auf (47.3 CSS -> 48 Spielpixel).
    expect(insetsToGamePx(640, 640, { left: 47.3, right: 0, top: 0, bottom: 0 }).left).toBe(48);
    // Skalierter Canvas (640er View auf 1920 CSS): Faktor 1/3.
    expect(insetsToGamePx(640, 1920, { left: 3, right: 6, top: 1.5, bottom: 0 }))
      .toEqual({ left: 1, right: 2, top: 1, bottom: 0 });
  });

  it("entwertet NaN/negative/kleine Werte zu 0 und faengt cssWidth<=0 ab", () => {
    expect(insetsToGamePx(640, 640, { left: NaN, right: -5, top: 0.2, bottom: 0 }))
      .toEqual({ left: 0, right: 0, top: 1, bottom: 0 });
    expect(insetsToGamePx(640, 0, { left: 10, right: 10, top: 0, bottom: 0 }))
      .toEqual({ left: 10, right: 10, top: 0, bottom: 0 });
  });
});

describe("m10-hud-safearea: effektive Margen", () => {
  it("hudSideMargin: inset 0 -> HUD-Konvention bitgleich; Deckel width/3", () => {
    expect(hudSideMargin(HUD_MARGIN_X, 0, 844)).toBe(HUD_MARGIN_X);
    expect(hudSideMargin(HUD_MARGIN_X, 47, 844)).toBe(52);
    // Deckel: niemals mehr als ein Drittel der View pro Seite.
    expect(hudSideMargin(HUD_MARGIN_X, 500, 300)).toBe(100);
  });

  it("hudTopMargin: mindestens HUD-Konvention, sonst Geraete-Inset", () => {
    expect(hudTopMargin(HUD_TOP_Y, 0)).toBe(HUD_TOP_Y);
    expect(hudTopMargin(HUD_TOP_Y, 12)).toBe(12);
  });
});

describe("m10-hud-safearea: Regression ohne Notch (bitgleich)", () => {
  it("insets 0 liefert exakt die alte 640x360-Referenz", () => {
    const ref: Record<string, AnchorBox> = {
      level: { x: 5, y: 1, w: 30, h: 7 },
      timer: { x: 305, y: 1, w: 30, h: 7 },
      kills: { x: 575, y: 1, w: 60, h: 7 },
      hp: { x: 5, y: 15, w: 106, h: 9 },
      xp: { x: 5, y: 8, w: 630, h: 4 },
      "iconrow-bg": { x: 114, y: 13, w: 212, h: 19 },
      icons: { x: 122, y: 15, w: 203, h: 16 },
      "evo-hint": { x: 330, y: 15, w: 120, h: 15 },
    };
    expect(hudAnchorBoxes(640, 360)).toEqual(ref);
    expect(hudAnchorBoxes(640, 360, {}, NO_INSETS)).toEqual(ref);
  });

  it("alle 7 Profilbreiten: insets 0 veraendert keine Ankerposition", () => {
    for (const width of PROFILE_WIDTHS) {
      expect(hudAnchorBoxes(width, 360, {}, NO_INSETS))
        .toEqual(hudAnchorBoxes(width, 360));
    }
  });
});

describe("m10-hud-safearea: iphone14 (844x360, insets 47/47/21)", () => {
  const INSET: SafeAreaInsets = { left: 47, right: 47, top: 0, bottom: 21 };
  const boxes = hudAnchorBoxes(844, 360, {}, INSET);

  it("0 HUD-Pixel in der Notch-Zone (links x<47, rechts x>797)", () => {
    const zones = iphone14Zones(844);
    for (const [name, b] of Object.entries(boxes)) {
      for (const z of zones) {
        const overlap = b.x < z.x1 && z.x0 < b.x + b.w;
        expect(overlap, `${name} (${b.x}..${b.x + b.w}) ragt in Zone ${z.x0}..${z.x1}`).toBe(false);
      }
    }
  });

  it("HUD-Pixel landen in der 0-Pixel-Notch-Menge: Anker an View-Rand MINUS Marge", () => {
    // Effektive Marge = HUD-Konvention (5) + Inset (47) = 52 >= Notch-Kante 47.
    expect(boxes.level.x).toBe(52);
    expect(boxes.kills.x + boxes.kills.w).toBe(792);
    expect(boxes.xp.x).toBe(52);
    expect(boxes.xp.w).toBe(844 - 104);
    // Timer bleibt zentriert und damit ebenfalls frei der Zonen.
    expect(boxes.timer.x).toBeGreaterThanOrEqual(47);
    expect(boxes.timer.x + boxes.timer.w).toBeLessThanOrEqual(797);
  });

  it("Touch-Pause-Knopf (TouchControls-Formel) endet exakt an der Notch-Kante", () => {
    // Formel aus src/input/TouchControls.ts update():
    //   x = round(width - max(PAUSE_MARGIN, inset.right) - PAUSE_W)
    const PAUSE_MARGIN = 10, PAUSE_W = 30;
    const x = Math.round(844 - Math.max(PAUSE_MARGIN, 47) - PAUSE_W);
    expect(x + PAUSE_W).toBeLessThanOrEqual(797);
    expect(x).toBe(767);
  });
});
