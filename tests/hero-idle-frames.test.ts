import { describe, expect, it } from "vitest";
import { GEN_CHARS, type GenSprite } from "../src/gfx/gen-chars";
import { PLAYER_FRAMES } from "../src/gfx/chars";

/**
 * m10-hero-idle-frames (#8381): Regression fuer Helden-Idle + Lauf-Rhythmik.
 * Schranken: Idle-Satz vorhanden (2 Frames je Richtung), Idle-Versatz-Pose echt,
 * 0 Dubletten im 4-Richtungs-Lauf, 0 Off-Palette-Pixel, PLAYER_FRAMES verdrahtet.
 * Palette/binäres Alpha bleibt exakt (keine neuen Farben erlaubt).
 */

const CHARS = ["mira", "kael"] as const;
const DIRS = ["down", "up", "side"] as const;
const SIZE = 32;

function sprite(key: string): GenSprite {
  const s = GEN_CHARS[key] as GenSprite | undefined;
  expect(s, `${key} fehlt in GEN_CHARS`).toBeDefined();
  return s!;
}

function indexOf(ch: string): number | null {
  if (ch === ".") return null;
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "v") return ch.charCodeAt(0) - 97 + 10;
  return Number.NaN;
}

function rowSig(rows: string[]): string {
  return rows.join("\n");
}

describe("Helden-Idle + Lauf-Rhythmik (m10-hero-idle-frames)", () => {
  it("hat je Held und Richtung einen Idle-Satz mit genau 2 Frames (32x32)", () => {
    for (const char of CHARS) {
      for (const dir of DIRS) {
        const s = sprite(`player_${char}_${dir}_idle`);
        expect(s.frames, `${char}/${dir} idle`).toHaveLength(2);
        for (const f of s.frames) {
          expect(f).toHaveLength(SIZE);
          for (const row of f) expect(row).toHaveLength(SIZE);
        }
        // PLAYER_FRAMES verdrahtet dieselben Texture-Keys.
        const entry = char === "mira" ? PLAYER_FRAMES.mira : PLAYER_FRAMES.kael;
        expect(entry.idle[dir]).toHaveLength(2);
        for (let i = 0; i < 2; i++) {
          expect(entry.idle[dir][i]).toBe(`player_${char}_${dir}_idle_${i}`);
        }
      }
    }
  });

  it("hat eine echte Versatz-Pose im Idle (F0 vs F1 klar verschieden)", () => {
    for (const char of CHARS) {
      for (const dir of DIRS) {
        const [f0, f1] = sprite(`player_${char}_${dir}_idle`).frames;
        let diff = 0;
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) if (f0[y][x] !== f1[y][x]) diff++;
        }
        // Gemessen: 313-433 px. Schwelle bewusst unterhalb, um echte Posen zu fordern.
        expect(diff, `${char}/${dir}: Idle-Versatz nur ${diff} px`).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it("hat 0 Dubletten im 4-Richtungs-Lauf (Walk-Rhythmik erhalten)", () => {
    for (const char of CHARS) {
      for (const dir of DIRS) {
        const frames = sprite(`player_${char}_${dir}`).frames;
        expect(frames).toHaveLength(4);
        for (let i = 0; i < frames.length; i++) {
          for (let j = i + 1; j < frames.length; j++) {
            expect(rowSig(frames[i]), `${char}/${dir}: Lauf-Frame ${i} == ${j}`).not.toBe(rowSig(frames[j]));
          }
        }
        // Idle F1 (Atem-Versatz) darf kein Lauf-Frame sein; Idle F0 ist als
        // Ruhepose == Kontaktpose (Walk F0) erlaubt (Design-Entscheidung M4-02,
        // siehe docs/lanes/m10-hero-idle-frames.md) und muss sich gegen F1-F3 abgrenzen.
        const idle = sprite(`player_${char}_${dir}_idle`).frames;
        for (let j = 1; j < 4; j++) {
          expect(rowSig(idle[0]), `${char}/${dir}: Idle F0 == Walk F${j}`).not.toBe(rowSig(frames[j]));
        }
        for (let j = 0; j < 4; j++) {
          expect(rowSig(idle[1]), `${char}/${dir}: Idle F1 == Walk F${j}`).not.toBe(rowSig(frames[j]));
        }
      }
    }
  });

  it("nutzt nur Palette-Indizes 0..31 und binäres Alpha (0 Off-Palette-Pixel)", () => {
    for (const char of CHARS) {
      for (const dir of DIRS) {
        for (const key of [`player_${char}_${dir}`, `player_${char}_${dir}_idle`]) {
          for (const [fi, f] of sprite(key).frames.entries()) {
            for (const [y, row] of f.entries()) {
              for (const [x, ch] of Array.from(row).entries()) {
                const idx = indexOf(ch);
                if (idx !== null) {
                  expect(Number.isInteger(idx) && idx >= 0 && idx < 32,
                    `${key} F${fi} (${x},${y}): Off-Palette '${ch}'`).toBe(true);
                }
              }
            }
          }
        }
      }
    }
  });
});
