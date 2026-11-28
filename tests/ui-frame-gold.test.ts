/**
 * Lane m10-ui-frame-gold (#10373): Design-Guard für den 9-Slice-Rahmen ui_frame.
 *
 * Der offene Punkt aus docs/lanes/m10-palette-audit.md Z.197 („Gold-Rahmen bewusst
 * ohne Tinte?") wurde vom art-director geprüft: PASS 4/5 — die helle Kante oben/links
 * (mist 8 / fog 7) trägt die Silhouette gegen den fast schwarzen Hintergrund, die
 * Tinte (0, Luminanz <= 0,03) sitzt unten/rechts und in den Ecken (Bevel-Schattenseite).
 * Der Test schreibt dieses geprüfte Design fest, damit kein späterer Fix die
 * Lichtkante „repariert" und der Rahmen ungewollt konturiert wird.
 *
 * Verwandt, aber getrennt: tests/ui-frame-polish.test.ts (#8081, WCAG-3:1 der
 * Lichtkante + Glyphen). Dieser Guard hier: Geometrie + Farbfamilien + Palette.
 */
import { describe, expect, it } from "vitest";
import { GEN_UI } from "../src/gfx/gen-ui";
import { PAL } from "../src/palette";

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

function luminance(i: number): number {
  const hex = PAL[i];
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = f((hex >> 16) & 255);
  const g = f((hex >> 8) & 255);
  const b = f(hex & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const frame = GEN_UI.ui_frame;
const rows = frame.frames[0];
const grid = rows.map((row) => [...row].map((ch) => DIGITS.indexOf(ch)));

describe("ui_frame — geprüftes Design (art-director PASS 4/5, Lane m10-ui-frame-gold)", () => {
  it("existiert als 24x24-Grid (nineslice-Rand 8 unverändert)", () => {
    expect(frame.w).toBe(24);
    expect(frame.h).toBe(24);
    expect(frame.frames).toHaveLength(1);
    expect(rows).toHaveLength(24);
    for (const row of rows) expect(row).toHaveLength(24);
  });

  it("alle Pixel liegen auf der 32er-Palette (0 Off-Palette)", () => {
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        const i = grid[y][x];
        expect(i, `Pixel (${x},${y}) = "${rows[y][x]}"`).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThanOrEqual(31);
      }
    }
  });

  it("aeusserte Kante oben/links ist die Lichtkante (mist/fog), NICHT Tinte", () => {
    // Zeile 0 und Spalte 0 zwischen den harten Ink-Ecken: Licht (8/7).
    expect(grid[0][10]).toBe(8);
    expect(grid[1][10]).toBe(7);
    expect(grid[10][0]).toBe(8);
    expect(grid[10][1]).toBe(7);
    expect(luminance(grid[0][10])).toBeGreaterThan(0.1);
    expect(luminance(grid[10][0])).toBeGreaterThan(0.1);
  });

  it("Bevel-Schattenseite: untere und rechte Kante sind lückenlos Tinte (Luminanz <= 0,03)", () => {
    for (let x = 0; x < 24; x++) {
      expect(luminance(grid[23][x]), `Zeile 23, Spalte ${x}`).toBeLessThanOrEqual(0.03);
    }
    for (let y = 0; y < 24; y++) {
      expect(luminance(grid[y][23]), `Spalte 23, Zeile ${y}`).toBeLessThanOrEqual(0.03);
    }
  });

  it("alle vier Eckpixel sind hart mit Tinte gesetzt", () => {
    expect(grid[0][0]).toBe(0);
    expect(grid[0][23]).toBe(0);
    expect(grid[23][0]).toBe(0);
    expect(grid[23][23]).toBe(0);
  });

  it("Gold-Nieten sitzen in allen vier Ecken (Gold/Amber-Familie, Indizes 16-22)", () => {
    // Nieten-Blöcke 3x3 um (3,3), (18,3), (3,18), (18,18).
    for (const [cx, cy] of [[3, 3], [18, 3], [3, 18], [18, 18]] as const) {
      const block: number[] = [];
      for (let y = cy; y < cy + 3; y++) for (let x = cx; x < cx + 3; x++) block.push(grid[y][x]);
      const warm = block.filter((i) => i >= 16 && i <= 22).length;
      expect(warm, `Niete bei (${cx},${cy})`).toBeGreaterThanOrEqual(6);
    }
  });

  it("Innenfläche bleibt Nacht (Index 2) — kein Fix hat sie verändert", () => {
    expect(grid[10][10]).toBe(2);
    expect(grid[12][12]).toBe(2);
  });
});
