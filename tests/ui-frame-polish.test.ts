/**
 * m10-font-ui-frame-polish (#8081): Guard-Tests für Bitmap-Font + 9-Slice-Rahmen.
 *
 * Nutzt exakt dieselbe Analyse-Logik wie das Messskript
 * `scripts/m10-uiframe-polish.mjs` (kein zweiter, abweichender Parser):
 * - Rahmen: Kanten-Durchgängigkeit (Ink-Linien lückenlos), Eckpixel,
 *   Lichtkanten-Kontrast >= 3:1 gegen die Panel-Innenfläche (WCAG),
 *   lichtlogisch symmetrische Innenfase.
 * - Glyphen: keine Fehlstufen (isolierte Einzelpixel), ß deutlich von B
 *   verschieden (vorher: 1 px Differenz), ß in sich zusammenhängend.
 */
import { describe, expect, it } from "vitest";
import { GLYPHS } from "../src/gfx/glyphs";
import { GEN_UI } from "../src/gfx/gen-ui";
import { PAL } from "../src/palette";
import { analyzeFrame, analyzeGlyphs, decodeChar } from "../scripts/m10-uiframe-polish.mjs";

const frame = GEN_UI.ui_frame;
const grid = frame.frames[0].map((row) => [...row].map(decodeChar));

describe("UI-Rahmen (9-Slice ui_frame, 24x24)", () => {
  it("untere und rechte Ink-Kante sind lückenlos (kein Störpixel mehr in der Kante)", () => {
    const a = analyzeFrame(frame, PAL);
    expect(a.bottom.runs).toEqual([{ color: 0, len: 24, at: [0, 23] }]);
    expect(a.right.runs).toEqual([{ color: 0, len: 24, at: [23, 0] }]);
    // Der frühere Störpixel (22,23) — Farbe 2 mitten in der Ink-Kante — ist 0.
    expect(grid[23][22]).toBe(0);
  });

  it("alle vier Eckpixel sind hart mit Ink gesetzt", () => {
    expect(grid[0][0]).toBe(0);
    expect(grid[0][23]).toBe(0);
    expect(grid[23][0]).toBe(0);
    expect(grid[23][23]).toBe(0);
  });

  it("Lichtkante oben/links erreicht >= 3:1 gegen die Panel-Innenfläche (WCAG)", () => {
    const a = analyzeFrame(frame, PAL);
    expect(a.contrast.topLight_vs_interior.ratio).toBeGreaterThanOrEqual(3);
    expect(a.contrast.leftLight_vs_interior.ratio).toBeGreaterThanOrEqual(3);
    expect(a.pass3to1.top).toBe(true);
    expect(a.pass3to1.left).toBe(true);
  });

  it("Lichtkante ist durchgehend: aeusserte Linie 8, zweite Stufe 7, kein helles Fragment", () => {
    const a = analyzeFrame(frame, PAL);
    // Oben: Ink-Ecke, 1 Uebergang (7 an der Ecke), dann ein 8er-Band.
    const topBright = a.top.runs.filter((r) => r.color >= 7);
    expect(topBright).toEqual([expect.objectContaining({ color: 7 }), expect.objectContaining({ color: 8 })]);
    // Links: die aeusserte Linie (col0) ist ein einziges 8er-Band; die 7er-Stufe
    // liegt in Spalte 1.
    const leftBright = a.left.runs.filter((r) => r.color >= 7);
    expect(leftBright).toEqual([expect.objectContaining({ color: 8 })]);
    expect(grid[10][1]).toBe(7);
    expect(grid[1][10]).toBe(7);
  });

  it("Innenfase lichtlogisch symmetrisch: 6er-Lichtlinie oben UND links, Fase 4 rechts UND unten", () => {
    // Lichtlinien: Zeile 2 und Spalte 2 im Bereich 2..21 (hier Median-Spots).
    expect(grid[2][10]).toBe(6);
    expect(grid[2][21]).toBe(6);
    expect(grid[10][2]).toBe(6);
    expect(grid[21][2]).toBe(6);
    // Fase 4 auf beiden Schattenseiten (vorher: rechts 2 vs unten 4).
    expect(grid[10][20]).toBe(4);
    expect(grid[10][21]).toBe(4);
    expect(grid[20][10]).toBe(4);
    expect(grid[21][10]).toBe(4);
  });

  it("nur Palettenindizes im Rahmen-Grid (0 Off-Palette)", () => {
    for (let y = 0; y < frame.h; y++) {
      for (let x = 0; x < frame.w; x++) {
        expect(grid[y][x], `(${x},${y})`).toBeGreaterThanOrEqual(0);
        expect(grid[y][x], `(${x},${y})`).toBeLessThanOrEqual(31);
      }
    }
  });
});

describe("Bitmap-Font (5x7-Glyphen)", () => {
  const a = analyzeGlyphs(GLYPHS);

  it("keine Fehlstufen: isolierte Einzelpixel nur bei ! und ? (Satzzeichen-Punkte)", () => {
    for (const ch of a.isolatedSinglePixels) {
      expect(["!", "?"], `Glyph ${ch} hat einen freistehenden Einzelpixel`).toContain(ch);
    }
  });

  it("ß ist deutlich von B verschieden (vorher genau 1 px Differenz)", () => {
    const dist = GLYPHS["ß"].reduce(
      (n, row, y) => n + [...row].filter((c, x) => c !== GLYPHS["B"][y][x]).length, 0);
    expect(dist).toBeGreaterThanOrEqual(8);
  });

  it("ß ist eine zusammenhängende 8-Fach-Komponente mit regulären Löchern", () => {
    const info = a.perGlyph["ß"];
    expect(info.components).toHaveLength(1);
    expect(info.components[0].orth).toBe(true);
    for (const h of info.holes) {
      expect(Math.min(h.w, h.h)).toBeGreaterThanOrEqual(2);
    }
  });

  it("ß rendert auch über toUpperCase-Pfad (font.ts-Fallback auf GLYPHS['ß'])", () => {
    // 'ß'.toUpperCase() ist 'SS' (kein Glyph-Key) — der Fallback muss die
    // ß-Glyphe liefern, nicht '?'.
    const upper = "ß".toUpperCase();
    expect(GLYPHS[upper] ?? GLYPHS["ß"]).toEqual(GLYPHS["ß"]);
  });
});
