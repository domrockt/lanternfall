import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { charIndex, SPRITE_GRIDS } from "../src/gfx/textures";
import { shouldAtlasKey } from "../src/gfx/atlas";

/**
 * m10-chest-arrow-texture-r2: Das Truhen-Randpfeil-Grid "arrow_chest" ist im
 * M6-robust-Refactor aus SPRITE_GRIDS verloren gegangen (Bedarfsmeldung
 * m10-atlas-gutter, 2026-11-28T03:05Z) — der Pfeil renderte als Phaser-
 * __MISSING-Fehlertextur. Diese Tests sichern die wieder ergänzte Textur:
 * Existenz, Dimensionen, Palette-Compliance (binäres Alpha), Blickrichtung
 * (Spitze rechts, rotation 0 = Richtung Truhe) und den unveränderten
 * ChestSystem-Verweis.
 */

const grid = SPRITE_GRIDS.arrow_chest;

describe("arrow_chest Grid", () => {
  it("existiert in SPRITE_GRIDS mit 16x16", () => {
    expect(grid).toBeDefined();
    expect(grid.w).toBe(16);
    expect(grid.h).toBe(16);
    expect(grid.rows).toHaveLength(16);
    for (const row of grid.rows) expect(row).toHaveLength(16);
  });

  it("nutzt nur transparente Pixel oder Palettenindizes 0-31 (binäres Alpha)", () => {
    for (const row of grid.rows) {
      for (const ch of row) {
        if (ch === ".") continue;
        const i = charIndex(ch);
        expect(i, `Zeichen "${ch}"`).toBeGreaterThanOrEqual(0);
        expect(i, `Zeichen "${ch}"`).toBeLessThan(32);
      }
    }
  });

  it("ist im Lantern-Look: Kontur, Glow-Füllung, Laterne-Schattierung, helle Spitze", () => {
    const chars = new Set(grid.rows.join("").split(""));
    expect(chars.has("0"), "1-px Kontur (ink)").toBe(true);
    expect(chars.has("m"), "Füllung glow (22)").toBe(true);
    expect(chars.has("l"), "Schattierung lantern (21)").toBe(true);
    expect(chars.has("d"), "Spitzen-Highlight lanternWhite (13)").toBe(true);
  });

  it("zeigt nach rechts (rotation 0 = Richtung Truhe)", () => {
    // Nicht-transparente Pixel je Spalte/Zeile
    const cols: number[] = [];
    for (let x = 0; x < grid.w; x++) {
      if (grid.rows.some((r) => r[x] !== ".")) cols.push(x);
    }
    const rowsOf = (x: number) => {
      const ys: number[] = [];
      grid.rows.forEach((row, y) => {
        if (row[x] !== ".") ys.push(y);
      });
      return ys;
    };
    const minX = Math.min(...cols);
    const maxX = Math.max(...cols);
    // Spitze ist rechts: die rechtesten Pixel liegen in den mittleren Zeilen
    const tipRows = rowsOf(maxX);
    expect(tipRows.length).toBeGreaterThanOrEqual(1);
    for (const y of tipRows) expect(Math.abs(y - 7.5)).toBeLessThanOrEqual(1.5);
    // Und der Pfeil ist horizontal ausbalanciert um eine rechte Spitze:
    expect(maxX).toBeGreaterThan(12);
    expect(minX).toBeLessThan(4);
  });
});

describe("arrow_chest Verdrahtung", () => {
  it("ChestSystem bindet weiter 'arrow_chest' (Verweis unverändert, Zeile 316)", () => {
    const src = readFileSync(new URL("../src/systems/ChestSystem.ts", import.meta.url), "utf8");
    expect(src).toContain('makeImage(scene, 0, 0, "arrow_chest")');
  });

  it("landet im Runtime-Atlas (Präfix arrow_chest in ATLAS_PREFIXES)", () => {
    expect(shouldAtlasKey("arrow_chest")).toBe(true);
  });
});
