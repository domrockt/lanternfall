import { describe, expect, it } from "vitest";
import { GEN_CHARS, type GenSprite } from "../src/gfx/gen-chars";
import { CHARACTER_LIST } from "../src/data/characters";

/**
 * M10-hero-portraits: harte Schranke für die CharSelect-Porträts.
 *
 * Befund (Dom, 21:45Z, Punkt 5): Kael-Porträt las sich nicht als Mönch
 * (Kopf über Kasten mit Zacken), Mira-Porträt war grob. Diese Tests sichern
 * die technische Basis (ohne Browser, deterministisch):
 * - beide Porträts existieren in exakt 48x48 (eine Pixelgröße, kein Mixel),
 * - nur Palettenfarben (Indizes 0..31, transparent = "."),
 * - die Auswahl-Szene rendert beide: für jeden Charakter aus CHARACTER_LIST
 *   löst der in CharSelect.ts gebaute Textur-Key `portrait_<id>` auf, und
 *   "portrait_" ist ein Baking-Präfix (Textur landet im Atlas, keine
 *   Fehltextur zur Laufzeit).
 */

const SIZE = 48;

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

describe("Helden-Porträts (M10-hero-portraits)", () => {
  it("hat beide Porträt-Sprites in erwarteter Größe (48x48, 1 Frame)", () => {
    for (const name of ["mira", "kael"]) {
      const sprite = spriteOf(`portrait_${name}`);
      expect(sprite.w, `${name}: Breite`).toBe(SIZE);
      expect(sprite.h, `${name}: Höhe`).toBe(SIZE);
      expect(sprite.frames, `${name}: genau 1 Portrait-Frame`).toHaveLength(1);
      for (const rows of sprite.frames) {
        expect(rows).toHaveLength(SIZE);
        for (const row of rows) expect(row).toHaveLength(SIZE);
      }
    }
  });

  it("nutzt nur Palettenfarben (Indizes 0..31, binaere Alpha)", () => {
    for (const name of ["mira", "kael"]) {
      const sprite = spriteOf(`portrait_${name}`);
      for (const rows of sprite.frames) {
        for (const row of rows) {
          for (const ch of row) {
            const idx = indexOf(ch);
            expect(idx === null || (idx >= 0 && idx <= 31), `${name}: Off-Palette '${ch}'`).toBe(true);
            expect(idx, `${name}: Off-Palette '${ch}'`).not.toBeNaN();
          }
        }
      }
    }
  });

  it("Auswahl-Szene rendert beide Porträts ohne Fehltextur", () => {
    // CharSelect.ts baut `portrait_${char.id}` — der Key muss für JEDEN
    // Charakter der Auswahl auflösen (kein undefined -> keine pinken
    // Fehltextur-Boxen), mit 48x48-Frame-Daten wie in K1 dokumentiert.
    expect(CHARACTER_LIST.length).toBeGreaterThanOrEqual(2);
    const keys = new Set<string>();
    for (const char of CHARACTER_LIST) {
      const key = `portrait_${char.id}`;
      const sprite = spriteOf(key); // wirft/befeht, wenn Fehltextur droht
      expect(sprite.w).toBe(SIZE);
      expect(sprite.h).toBe(SIZE);
      keys.add(key);
    }
    expect(keys.has("portrait_mira")).toBe(true);
    expect(keys.has("portrait_kael")).toBe(true);
  });
});
