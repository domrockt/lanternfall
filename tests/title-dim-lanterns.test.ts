import { describe, expect, it, vi } from "vitest";
// m10-title-dim-lanterns: Dim-Ausnahmepfad der Laternen-Flammen (K2/K3).
// lanternGlassHoles (rein, in src/scenes/Title.ts) definiert die 8x6-Texel-
// Fenster ueber den opaken Glas-Reihen der 4 Flammen-Patches; die Lasur
// (nightDeep, alpha 0,62) und die Vignette bekommen dort clearRect-Fenster,
// damit das Glas die ungedimmte Palette zeigt (Kern = Stufe 13 lanternWhite).
// Die Tests sichern: Ausrichtung (Patch-Reihe 5, 8x6), Position je Viewport,
// Fenster liegen im Dim-Bereich, und — wichtig gegen Kasten-Artefakte — die
// Fenster ueberdecken NUR voll opake Texel der Frames (Reihen 5-10 sind in
// f0/f1/f2 ohne Luecke opak; Reihen 0-4 transparent bleiben hinter dem Dim).
// Dim-Staerke unveraendert (Fix ueber Ausnahmepfad, NICHT ueber Asset-Werte).
// Title.ts importiert Phaser (Szene); Phaser wird neutral gemockt
// (Muster tests/title-bg-crisp.test.ts).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  return { default: { GameObjects: { Container }, Scene } };
});
import {
  lanternGlassHoles,
  TITLE_DIM_ALPHA,
  TITLE_FLAME_DEPTH,
  TITLE_GLASS_HOLE,
  titleBgLayout,
} from "../src/scenes/Title";
import { GEN_TITLE, TITLE_FLAME_SPOTS } from "../src/gfx/gen-title";

const FLAME_KEYS = ["title_flame_f0", "title_flame_f1", "title_flame_f2"] as const;
/** Logische Views (M8: Hoehe 360, Breite je Seitenverhaeltnis). */
const VIEWS: Array<[number, number]> = [[640, 360], [780, 360], [480, 270]];

describe("lanternGlassHoles – Ausrichtung am Flammen-Patch", () => {
  it.each(VIEWS)("je Laterne ein 8x6-Fenster ab Patch-Reihe 5 (%ix%i)", (w, h) => {
    const bgL = titleBgLayout(w, h);
    const holes = lanternGlassHoles(bgL);
    expect(holes).toHaveLength(TITLE_FLAME_SPOTS.length);
    holes.forEach((hole, i) => {
      const spot = TITLE_FLAME_SPOTS[i]!;
      expect(hole).toEqual({
        x: bgL.x + spot.x,
        y: bgL.y + spot.y + TITLE_GLASS_HOLE.row,
        w: TITLE_GLASS_HOLE.w,
        h: TITLE_GLASS_HOLE.h,
      });
    });
  });

  it("Fenster enden genau am Patch-Unterrand (keine Reihen ueber 5+6 hinaus)", () => {
    const bgL = titleBgLayout(640, 360);
    for (const hole of lanternGlassHoles(bgL)) {
      expect(hole.h).toBe(6);
      expect(TITLE_GLASS_HOLE.row + hole.h).toBe(11); // Patchhoehe
    }
  });

  it("Fenster liegen vollstaendig in der Bodenlasur (y 132+oy, Hoehe 138)", () => {
    for (const [w, h] of VIEWS) {
      const bgL = titleBgLayout(w, h);
      const oy = Math.round((h - 270) / 2);
      const dimTop = 132 + oy;
      for (const hole of lanternGlassHoles(bgL)) {
        expect(hole.y).toBeGreaterThanOrEqual(dimTop);
        expect(hole.y + hole.h).toBeLessThanOrEqual(dimTop + 138);
        expect(hole.x).toBeGreaterThanOrEqual(0);
        expect(hole.x + hole.w).toBeLessThanOrEqual(w);
      }
    }
  });
});

describe("Dim-Ausnahmepfad – Guard gegen Kasten-Artefakte", () => {
  /** Glas-Reihen 5..10 je Frame: jede Zelle opak (kein '.'), sonst kaeme an den
   * transparenten Reihen undunkler Hintergrund durchs Fenster (helles Kasten). */
  function glassRowsOpaque(rows: string[]): boolean {
    return rows.slice(TITLE_GLASS_HOLE.row, TITLE_GLASS_HOLE.row + TITLE_GLASS_HOLE.h)
      .every((row) => row.length === TITLE_GLASS_HOLE.w && !row.includes("."));
  }

  it("Reihen 5-10 sind in allen Frames voll opak (8 Spalten, keine Luecke)", () => {
    for (const key of FLAME_KEYS) {
      const def = GEN_TITLE[key]!;
      for (const frame of def.frames) {
        expect(glassRowsOpaque(frame)).toBe(true);
      }
    }
  });

  it("Reihen 0-4 (Funken) sind NICHT Teil der Fenster (Patch-Reihe 5 ist Start)", () => {
    expect(TITLE_GLASS_HOLE.row).toBe(5);
    const bgL = titleBgLayout(640, 360);
    for (const [i, hole] of lanternGlassHoles(bgL).entries()) {
      const spot = TITLE_FLAME_SPOTS[i]!;
      expect(hole.y - (bgL.y + spot.y)).toBe(5);
    }
  });
});

describe("Dim-Staerke unveraendert (kein Overbright-Regression)", () => {
  it("Lasur-Alpha bleibt 0,62 wie in main (Fix nur ueber Ausnahmefenster)", () => {
    expect(TITLE_DIM_ALPHA).toBe(0.62);
  });

  it("Flammen-Depth bleibt unter Menue-Buttons (6) und Vignette (50)", () => {
    // Depth-Entscheid gegen depth > 50: Flammen ueber der Vignette waeren auch
    // ueber den Buttons (Menue-Onboarding leidet); Ausnahme nur via Fenster.
    expect(TITLE_FLAME_DEPTH).toBe(2);
    expect(TITLE_FLAME_DEPTH).toBeLessThan(6);
  });
});
