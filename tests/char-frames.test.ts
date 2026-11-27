import { describe, expect, it } from "vitest";
import { GEN_CHARS, type GenSprite } from "../src/gfx/gen-chars";

/**
 * Helden-Frames: Mira + Kael, 4 Richtungen (links wird in Run.ts per flipX
 * aus "side" gespiegelt), je 4 Lauf-Frames. Der Test ist die harte Schranke
 * gegen Frame-Duplikate, Off-Palette-Pixel und Alpha-Zwischentoene.
 */

const CHARS = ["mira", "kael"] as const;
const DIRS = ["down", "up", "side"] as const;
const FRAME_SIZE = 32;

function framesOf(char: string, dir: string): string[][] {
  const sprite = GEN_CHARS[`player_${char}_${dir}`] as GenSprite | undefined;
  expect(sprite, `player_${char}_${dir} fehlt`).toBeDefined();
  return sprite!.frames;
}

function indexOf(ch: string): number | null {
  if (ch === ".") return null;
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "v") return ch.charCodeAt(0) - 97 + 10;
  return Number.NaN;
}

function alphaOf(ch: string): number {
  return ch === "." ? 0 : 255;
}

describe("Helden-Frames (M10-heroes-pass)", () => {
  it("hat 2 Helden x 3 Laufrichtungen (+ gespiegelt links) x 4 Frames", () => {
    for (const char of CHARS) {
      for (const dir of DIRS) {
        const frames = framesOf(char, dir);
        expect(frames, `${char}/${dir}`).toHaveLength(4);
        for (const f of frames) {
          expect(f).toHaveLength(FRAME_SIZE);
          for (const row of f) expect(row).toHaveLength(FRAME_SIZE);
        }
      }
    }
  });

  it("haelt die Frame-Groesse ueber alle Lauf-Frames konstant", () => {
    const sizes = new Set<string>();
    for (const char of CHARS) {
      for (const dir of DIRS) {
        const frames = framesOf(char, dir);
        for (const f of frames) sizes.add(`${f.length}x${f[0].length}`);
      }
    }
    expect(sizes).toEqual(new Set([`${FRAME_SIZE}x${FRAME_SIZE}`]));
    // Auch die Basis-Keys sind 32x32.
    for (const char of CHARS) {
      const base = GEN_CHARS[`player_${char}`] as GenSprite;
      expect([base.w, base.h]).toEqual([FRAME_SIZE, FRAME_SIZE]);
    }
  });

  it("hat je Richtung paarweise verschiedene Frames (0 Duplikate)", () => {
    for (const char of CHARS) {
      for (const dir of DIRS) {
        const frames = framesOf(char, dir);
        for (let i = 0; i < frames.length; i++) {
          for (let j = i + 1; j < frames.length; j++) {
            expect(frames[i], `${char}/${dir}: Frame ${i} == ${j}`).not.toEqual(frames[j]);
          }
        }
      }
    }
  });

  it("nutzt nur Palette-Indizes 0..31 und Alpha ausschliesslich 0/255", () => {
    for (const char of CHARS) {
      for (const dir of DIRS) {
        for (const [fi, f] of framesOf(char, dir).entries()) {
          for (const [y, row] of f.entries()) {
            for (const [x, ch] of Array.from(row).entries()) {
              const idx = indexOf(ch);
              if (idx !== null) {
                expect(Number.isInteger(idx) && idx >= 0 && idx < 32,
                  `${char}/${dir} F${fi} (${x},${y}): ungueltiger Index '${ch}'`).toBe(true);
              }
              expect([0, 255], `${char}/${dir} F${fi} (${x},${y})`).toContain(alphaOf(ch));
            }
          }
        }
      }
    }
  });

  it("ist in jeder Richtung und jedem Frame zu >= 35 % vom anderen Helden verschieden", () => {
    for (const dir of DIRS) {
      const mira = framesOf("mira", dir);
      const kael = framesOf("kael", dir);
      for (let i = 0; i < 4; i++) {
        let diff = 0;
        for (let y = 0; y < FRAME_SIZE; y++) {
          for (let x = 0; x < FRAME_SIZE; x++) {
            if (mira[i][y][x] !== kael[i][y][x]) diff++;
          }
        }
        expect(diff / (FRAME_SIZE * FRAME_SIZE), `${dir} F${i}`).toBeGreaterThanOrEqual(0.35);
      }
    }
  });
});
