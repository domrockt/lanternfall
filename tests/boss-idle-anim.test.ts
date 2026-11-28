import { describe, expect, it } from "vitest";
import { GEN_BOSSES } from "../src/gfx/gen-bosses";
import { BOSSES } from "../src/data/bosses";
import { PAL } from "../src/palette";

/**
 * M10-boss-idle-anim: Regressionstest fuer die Boss-Idle-Animation.
 * Vorher standen die Bosse optisch als Standbilder da: der Idle-Versatz
 * zwischen F0 und F1 betrug 2-3 px (verletzte die Mixel-/Wackel-Regel von
 * <= 1 px ganzzahlig) und bei bone_lord/hollow_king war der Telegraph-Frame
 * mit 110/472 px Differenz kaum vom Ruheframe zu unterscheiden.
 *
 * Kriterien:
 * - 6/6 Bosse haben >= 2 Idle-Frames (F0 + F1) und einen Telegraph-Frame (F2)
 * - 0 Frame-Duplikate je Boss (jeder Frame unterscheidet sich von F0)
 * - Palette-Compliance: nur Chars 0-9/a-v (Palettenindizes 0-31), "." transparent
 * - Frame-Budget neutral: genau 3 Frames je Boss (Sprite-Anzahl unveraendert)
 * - Idle-Versatz <= 1 px ganzzahlig (Bounding-Box-Top von F1 vs F0)
 */

const CHARS = GEN_BOSSES;

function frameSig(rows: readonly string[]): string {
  return rows.join("\n");
}

function bboxTop(rows: readonly string[]): number {
  return rows.findIndex((r) => /[^.]/.test(r));
}

describe("boss-idle-anim: 6 Bosse mit Idle-Animation", () => {
  it("alle 6 Boss-IDs aus den Daten haben generierte Sprites", () => {
    for (const boss of BOSSES) {
      expect(CHARS[`boss_${boss.id}`], `boss_${boss.id} fehlt in GEN_BOSSES`).toBeDefined();
    }
  });

  it("Frame-Budget neutral: genau 3 Frames je Boss (Ruhe/Atmen/Telegraph)", () => {
    for (const [id, sprite] of Object.entries(CHARS)) {
      expect(sprite.frames.length, `${id}`).toBe(3);
    }
  });

  it("6/6 Bosse: 0 Frame-Duplikate, jeder Frame unterscheidet sich von F0", () => {
    for (const [id, sprite] of Object.entries(CHARS)) {
      const sigs = sprite.frames.map(frameSig);
      expect(new Set(sigs).size, `${id}: Duplikate erkannt`).toBe(sigs.length);
    }
  });

  it("Idle-Versatz <= 1 px ganzzahlig (F1 vs F0, Bounding-Box-Top)", () => {
    for (const [id, sprite] of Object.entries(CHARS)) {
      const d = bboxTop(sprite.frames[1]) - bboxTop(sprite.frames[0]);
      expect(Math.abs(d), `${id}: Idle-Versatz ${d} px`).toBeLessThanOrEqual(1);
    }
  });

  it("Atmung sichtbar: F1 unterscheidet sich deutlich von F0 (> 100 px)", () => {
    for (const [id, sprite] of Object.entries(CHARS)) {
      let diff = 0;
      const a = sprite.frames[0], b = sprite.frames[1];
      for (let y = 0; y < a.length; y++)
        for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b[y][x]) diff++;
      expect(diff, `${id}: F0-F1-Diff nur ${diff} px`).toBeGreaterThan(100);
    }
  });

  it("Telegraph-Zucken lesbar: F2 unterscheidet sich deutlich von F0 (> 100 px)", () => {
    for (const [id, sprite] of Object.entries(CHARS)) {
      let diff = 0;
      const a = sprite.frames[0], b = sprite.frames[2];
      for (let y = 0; y < a.length; y++)
        for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b[y][x]) diff++;
      expect(diff, `${id}: F0-F2-Diff nur ${diff} px`).toBeGreaterThan(100);
    }
  });

  it("Palette-Compliance: nur Palettenindizes 0-31 als Chars, binaeres Alpha", () => {
    for (const [id, sprite] of Object.entries(CHARS)) {
      for (const frame of sprite.frames) {
        for (const row of frame) {
          for (const ch of row) {
            if (ch === ".") continue;
            const idx = parseInt(ch, 36);
            expect(idx, `${id}: Char "${ch}"`).toBeLessThanOrEqual(31);
            expect(idx, `${id}: Char "${ch}" negativ`).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("Palette-Compliance: alle verwendeten Indizes existieren in PAL (32 Farben)", () => {
    expect(PAL.length).toBe(32);
    for (const [id, sprite] of Object.entries(CHARS)) {
      const used = new Set(sprite.frames.flat().join("").split("").filter((c) => c !== "."));
      for (const ch of used) expect(parseInt(ch, 36), `${id}`).toBeLessThan(PAL.length);
    }
  });

  it("Frame-Grid konsistent: alle Frames eines Bosses haben w x h Zeilen/Spalten", () => {
    for (const [id, sprite] of Object.entries(CHARS)) {
      for (const [fi, frame] of sprite.frames.entries()) {
        expect(frame.length, `${id} F${fi} Zeilen`).toBe(sprite.h);
        for (const row of frame) expect(row.length, `${id} F${fi} Spalten`).toBe(sprite.w);
      }
    }
  });
});
