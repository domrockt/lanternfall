import { describe, expect, it } from "vitest";
import { GEN_CHARS, type GenSprite } from "../src/gfx/gen-chars";

/**
 * M10-hero-contrast: Helden-Kontrast als harte Testschranke.
 *
 * Befund (Dom, 21:45Z): Kael (grau) ging zwischen grauen Gegnern unter und
 * sein Portraet las sich nicht als Moench. Diese Tests beweisen auf der
 * Textur-Ebene (deterministisch, ohne Browser):
 * - beide Helden, 4 Richtungen (links = gespiegeltes "side"), 0 Off-Palette-Pixel,
 * - warme Akzent-Quote von Kael deutlich ueber der Baseline vor dem Fix (0.19),
 * - warme Lichtkante (Rim 21/22) an der Oberkante jedes Lauf-Frames,
 * - Kael-Portraet: Moench-Silhouette (Kapuze + Laterne), grauer Bart, kein INK im Gesicht.
 */

const CHARS = ["mira", "kael"] as const;
const DIRS = ["down", "up", "side"] as const;

function spriteOf(key: string): GenSprite {
  const sprite = GEN_CHARS[key] as GenSprite | undefined;
  expect(sprite, `${key} fehlt`).toBeDefined();
  return sprite!;
}

function indexOf(ch: string): number | null {
  if (ch === ".") return null;
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "v") return ch.charCodeAt(0) - 97 + 10;
  return Number.NaN;
}

/** Grau/eiserne Farbfamilie der Gegner (Nacht-, Nebel-, Knochen-Rampen). */
const ENEMY_GREY = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

/** Anteil Koerperpixel in warmer Akzentfarbe (r-b >= 40, nicht grau). */
function warmAccentShare(sprite: GenSprite): number[] {
  return sprite.frames.map((rows) => {
    let body = 0;
    let warm = 0;
    for (const row of rows) {
      for (const ch of row) {
        const idx = indexOf(ch);
        if (idx === null) continue;
        expect(idx, `Off-Palette-Index ${idx}`).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(31);
        body++;
        const [r, g, b] = PAL_RGB[idx];
        if (!ENEMY_GREY.has(idx) && r - b >= 40) warm++;
      }
    }
    return warm / Math.max(1, body);
  });
}

/** Rim-Pixel: Laterne/Glow (21/22) mit Kontur (0) oder Transparenz oben/links. */
function rimPixels(rows: string[]): number {
  let n = 0;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const idx = indexOf(rows[y][x]);
      if (idx !== 21 && idx !== 22) continue;
      const up = y > 0 ? indexOf(rows[y - 1][x]) : null;
      const left = x > 0 ? indexOf(rows[y][x - 1]) : null;
      if (up === null || up === 0 || left === null || left === 0) n++;
    }
  }
  return n;
}

// Die 32 Palette-Farben (aus src/palette.ts uebernommen; Test soll ohne
// DOM/Phaser-Import laufen).
const PAL_RGB: Array<[number, number, number]> = [
  [0x06, 0x07, 0x0c], [0x0a, 0x0e, 0x16], [0x10, 0x17, 0x24], [0x17, 0x20, 0x2e],
  [0x1e, 0x2a, 0x3a], [0x2a, 0x35, 0x47], [0x3a, 0x4a, 0x5c], [0x4e, 0x5f, 0x6e],
  [0x6b, 0x7c, 0x86], [0x8f, 0xa0, 0xa6], [0xb8, 0xc4, 0xc2], [0xd9, 0xdd, 0xcd],
  [0xf2, 0xed, 0xd8], [0xff, 0xf8, 0xe6], [0x2b, 0x14, 0x10], [0x4d, 0x22, 0x14],
  [0x7a, 0x33, 0x1a], [0xa8, 0x4a, 0x21], [0xcf, 0x6b, 0x26], [0xef, 0x91, 0x30],
  [0xff, 0xb8, 0x4d], [0xff, 0xd7, 0x7a], [0xff, 0xee, 0xb0], [0x3d, 0x12, 0x20],
  [0x7a, 0x1f, 0x2e], [0xb8, 0x30, 0x3f], [0xe4, 0x57, 0x4d], [0xff, 0x8a, 0x6b],
  [0x16, 0x26, 0x1e], [0x22, 0x38, 0x2a], [0x3d, 0x5a, 0x38], [0x6f, 0x9b, 0x58],
];

describe("Helden-Kontrast (M10-hero-contrast)", () => {
  it("hat beide Helden in 4 Richtungen (+ Idle/Hit) mit binaerer Alpha und nur Palettenfarben", () => {
    for (const char of CHARS) {
      for (const key of [
        `player_${char}`,
        ...DIRS.map((d) => `player_${char}_${d}`),
        ...DIRS.map((d) => `player_${char}_${d}_idle`),
        `player_${char}_hit`,
        `portrait_${char}`,
      ]) {
        const sprite = spriteOf(key);
        for (const rows of sprite.frames) {
          for (const row of rows) {
            for (const ch of row) {
              const idx = indexOf(ch);
              expect(idx === null || (idx >= 0 && idx <= 31), `${key}: Off-Palette '${ch}'`).toBe(true);
            }
          }
        }
      }
    }
  });

  it("hebt Kael mit warmem Akzent deutlich ueber die Grau-Baseline (vor Fix 0.19)", () => {
    const shares: number[] = [];
    for (const dir of DIRS) {
      const perFrame = warmAccentShare(spriteOf(`player_kael_${dir}`));
      for (const s of perFrame) {
        expect(s, `kael/${dir} warm-Akzent ${s.toFixed(3)} < 0.22`).toBeGreaterThanOrEqual(0.22);
        shares.push(s);
      }
    }
    const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
    expect(mean, `kael mean ${mean.toFixed(3)} < 0.25`).toBeGreaterThanOrEqual(0.25);
  });

  it("traegt beide Helden eine warme Lichtkante oben-links (Rim) in jedem Lauf-Frame", () => {
    for (const char of CHARS) {
      for (const dir of DIRS) {
        for (const [i, rows] of spriteOf(`player_${char}_${dir}`).frames.entries()) {
          expect(
            rimPixels(rows),
            `${char}/${dir} Frame ${i}: Rim-Pixel < 30`,
          ).toBeGreaterThanOrEqual(30);
        }
      }
    }
  });

  it("zeigt das Kael-Portraet als Moench: Kapuze + brennende Laterne, grauer Bart, kein INK im Gesicht", () => {
    const p = spriteOf("portrait_kael").frames[0];
    const px = (x: number, y: number) => indexOf(p[y][x]);
    // Kapuzenkalotte: Ruebe/Robe-Rampe (2/3/4/6) ueber dem Gesicht.
    let hood = 0;
    for (let y = 4; y < 14; y++) for (let x = 8; x < 40; x++) if ([2, 3, 4, 6].includes(px(x, y) ?? -1)) hood++;
    expect(hood, "Kapuze fehlt/zu klein").toBeGreaterThanOrEqual(120);
    // Laterne rechts mit Glow-Kern (13/22).
    let glow = 0;
    for (let y = 28; y < 42; y++) for (let x = 34; x < 46; x++) if ([13, 22].includes(px(x, y) ?? -1)) glow++;
    expect(glow, "Laterne ohne Glutkern").toBeGreaterThanOrEqual(6);
    // Grauer Bart (Knochen-Rampe 8/9/10), keine roten Reste (23/24/25).
    let grey = 0;
    for (let y = 28; y < 40; y++) {
      for (let x = 12; x < 38; x++) {
        const idx = px(x, y);
        if (idx === 8 || idx === 9 || idx === 10) grey++;
        expect([23, 24, 25]).not.toContain(idx);
      }
    }
    expect(grey, "grauer Bart fehlt").toBeGreaterThanOrEqual(20);
    // Kein Konturschwarz im Gesicht (Regel: 0 nur aussen).
    for (let y = 16; y < 36; y++) for (let x = 16; x < 34; x++) expect(px(x, y)).not.toBe(0);
  });

  it("haelt beide Portraets auf derselben Augenlinie (gemeinsame Bueste)", () => {
    for (const char of CHARS) {
      const p = spriteOf(`portrait_${char}`).frames[0];
      expect(indexOf(p[24][18]), `${char}: Pupille links`).toBe(1);
      expect(indexOf(p[24][19]), `${char}: Pupille links (2. px)`).toBe(1);
    }
  });
});
