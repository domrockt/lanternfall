import { describe, expect, it } from "vitest";
// m10-title-flame-glow-r2: Regression für die verstärkten Glut-Akzente der
// Titelflammen. Die crisp-Lane prüft bereits Struktur/AE (tests/title-flame.test.ts);
// diese Datei sichert das Sichtbarkeits-Ziel: flächiger heller Glutkern statt
// Einzel-Pixel, in den Frames UND in der gebackenen Basis (F0 = Zellkopie).
// Palette-Guard: tests/palette-compliance.test.ts läuft zusätzlich in npm test.
import { GEN_TITLE, TITLE_FLAME_SPOTS } from "../src/gfx/gen-title";

const BASE = GEN_TITLE.title_background;
const FLAME_KEYS = ["title_flame_f0", "title_flame_f1", "title_flame_f2"];

/** char-Palette-Index (wie src/gfx/textures.ts charIndex). */
function charIndex(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "z") return ch.charCodeAt(0) - 97 + 10;
  return -1;
}

/** Glut-Texel: 13 (lanternWhite, heißer Kern) + 22 (glow, Glutfläche). */
function isEmber(ch: string): boolean {
  const i = charIndex(ch);
  return i === 13 || i === 22;
}

/** Glas-Ausschnitt eines Frames: Patch-Reihen 5..10 (6 Reihen x 8 Spalten). */
function glassRows(rows: string[]): string[] {
  return rows.slice(5, 11);
}

/** 11 Reihen x 8 Spalten des Basis-Bildes an einem Patch-Anker. */
function spotSlice(spot: { x: number; y: number }): string[] {
  return BASE.frames[0].slice(spot.y, spot.y + 11).map((row) => row.slice(spot.x, spot.x + 8));
}

function emberShare(rows: string[]): number {
  let ember = 0;
  let total = 0;
  for (const row of rows) {
    for (const ch of row) {
      total++;
      if (isEmber(ch)) ember++;
    }
  }
  return ember / total;
}

/** Schwelle aus K1 (Zielkorridor, vor dem Fix festgelegt): vorher 0,125. */
const EMBER_SHARE_MIN = 0.3;

describe("title-flame-glow: Grid-Groesse", () => {
  it.each(FLAME_KEYS)("%s bleibt 8x11 mit genau einem Frame", (key) => {
    const def = GEN_TITLE[key];
    expect(def.w).toBe(8);
    expect(def.h).toBe(11);
    expect(def.frames.length).toBe(1);
    expect(def.frames[0].length).toBe(11);
    for (const row of def.frames[0]) expect(row.length).toBe(8);
  });

  it("Glas (Reihen 5..10) ist an allen Spots voll opak, Funkenbereich 0..4 transparent in F0", () => {
    const f0 = GEN_TITLE.title_flame_f0.frames[0];
    for (const row of glassRows(f0)) for (const ch of row) expect(ch).not.toBe(".");
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) expect(f0[r][c]).toBe(".");
  });
});

describe("title-flame-glow: Palette-compliance", () => {
  it.each(FLAME_KEYS)("%s nutzt nur Palette 13/20/21/22 + binäres Alpha", (key) => {
    for (const row of GEN_TITLE[key].frames[0]) {
      for (const ch of row) {
        if (ch === ".") continue;
        expect([13, 20, 21, 22]).toContain(charIndex(ch));
      }
    }
  });

  it("Basis nutzt im Glas-Fenster je Spot dieselben 4 Palette-Indizes", () => {
    const used = new Set<number>();
    for (const spot of TITLE_FLAME_SPOTS) {
      for (const row of glassRows(spotSlice(spot))) {
        for (const ch of row) used.add(charIndex(ch));
      }
    }
    expect([...used].sort()).toEqual([13, 20, 21, 22]);
  });
});

describe("title-flame-glow: Glut-Flächenanteil", () => {
  it.each(FLAME_KEYS)("Frame %s: Glut-Anteil (13+22) im Glas >= 0.3", (key) => {
    const share = emberShare(glassRows(GEN_TITLE[key].frames[0]));
    expect(share).toBeGreaterThanOrEqual(EMBER_SHARE_MIN);
  });

  it("gebackenes Basis-Glas hat an allen 4 Spots denselben Glut-Anteil >= 0.3", () => {
    for (const spot of TITLE_FLAME_SPOTS) {
      expect(emberShare(glassRows(spotSlice(spot)))).toBeGreaterThanOrEqual(EMBER_SHARE_MIN);
    }
  });

  it("Kern ist flächig hell (>= 6 Texel Palette 13 je Glas), kein Einzel-Pixel-Glow", () => {
    for (const spot of TITLE_FLAME_SPOTS) {
      let hot = 0;
      for (const row of glassRows(spotSlice(spot))) for (const ch of row) if (charIndex(ch) === 13) hot++;
      expect(hot).toBeGreaterThanOrEqual(6);
    }
  });

  it("F0 bleibt Zellkopie der Basis (AE=0-Vertrag der crisp-Lane bleibt bestehen)", () => {
    const f0 = GEN_TITLE.title_flame_f0.frames[0];
    for (const spot of TITLE_FLAME_SPOTS) {
      for (let dy = 0; dy < 11; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          const ch = f0[dy][dx];
          if (ch === ".") continue;
          expect(BASE.frames[0][spot.y + dy][spot.x + dx]).toBe(ch);
        }
      }
    }
  });
});
