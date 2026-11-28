import { describe, it, expect } from "vitest";
import { deathFrameSets, FX_FRAME_COUNTS, type FxFrameSet } from "../src/gfx/gen-fx";
import { PAL } from "../src/palette";

/**
 * Guards fuer die neu gezeichneten Todes-Frames (Art-Befund Runde 2, FAIL 2,5/5:
 * alle Klassen wirkten als derselbe "expandierende Ring"). Die Tests pruefen die
 * echte Frame-Quelle (deathFrameSets in src/gfx/gen-fx.ts) — dieselben Zeichen-
 * Zeilen, die auch createFxTextures als Texturen registriert.
 */

const REQUIRED_KEYS = [
  "fx_death_blob",
  "fx_death_dust",
  "fx_death_fire",
  "fx_death_bone",
  "fx_boss_core",
] as const;

/** Zeichen → Palettenindex (wie gen-fx.charCode): 0-9 = 0-9, a-v = 10-31, sonst -1. */
function charIndex(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "v") return ch.charCodeAt(0) - 97 + 10;
  return -1;
}

function frameToMask(set: FxFrameSet, frame: string[]): boolean[] {
  const mask: boolean[] = [];
  for (let y = 0; y < set.h; y++) {
    for (let x = 0; x < set.w; x++) mask.push((frame[y]?.[x] ?? ".") !== ".");
  }
  return mask;
}

/** Nearest-Nachbarschaft-Skalierung einer Maske (fuer den Blob↔Boss-Vergleich). */
function scaleMask(mask: boolean[], from: number, to: number): boolean[] {
  const out: boolean[] = [];
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      out.push(mask[Math.floor((y * from) / to) * from + Math.floor((x * from) / to)]);
    }
  }
  return out;
}

function maskDiff(a: boolean[], b: boolean[]): number {
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return diff / a.length;
}

describe("M10-death-fx-frames: Todes-Frame-Guards", () => {
  it("alle 5 geforderten Frame-Keys existieren (mit erwarteter Frame-Anzahl)", () => {
    const sets = deathFrameSets();
    for (const key of REQUIRED_KEYS) {
      const set = sets[key];
      expect(set, `${key} fehlt in deathFrameSets()`).toBeDefined();
      expect(set.frames.length, `${key}: Frame-Anzahl`).toBe(FX_FRAME_COUNTS[key]);
      expect(set.frames.length).toBeGreaterThanOrEqual(4);
      for (const frame of set.frames) {
        expect(frame.length).toBe(set.h);
        for (const row of frame) expect(row.length).toBe(set.w);
      }
    }
    // fx_death_fire ist neu und gehoert jetzt zur sputter-Klasse (death.ts).
    expect(FX_FRAME_COUNTS.fx_death_fire).toBe(4);
  });

  it("keine Duplikat-Frames: weder innerhalb eines Sets noch zwischen den Klassen", () => {
    const sets = deathFrameSets();
    for (const [key, set] of Object.entries(sets)) {
      for (let i = 0; i < set.frames.length; i++) {
        for (let j = i + 1; j < set.frames.length; j++) {
          expect(set.frames[i].join("|"), `${key}: Frame ${i} == Frame ${j}`).not.toBe(set.frames[j].join("|"));
        }
      }
    }
    // Klassen-Shards untereinander (Blob/Dust/Fire/Bone/Void) paarweise verschieden:
    const classKeys = ["fx_death_blob", "fx_death_dust", "fx_death_fire", "fx_death_bone", "fx_death_void"];
    for (let a = 0; a < classKeys.length; a++) {
      for (let b = a + 1; b < classKeys.length; b++) {
        const fa = sets[classKeys[a]].frames[0].join("|");
        const fb = sets[classKeys[b]].frames[0].join("|");
        expect(fa, `${classKeys[a]} == ${classKeys[b]}`).not.toBe(fb);
      }
    }
  });

  it("binaeres Alpha: nur '.' (transparent) oder volle Deckung — keine Halbtransparenz-Zeichen", () => {
    for (const [key, set] of Object.entries(deathFrameSets())) {
      for (let f = 0; f < set.frames.length; f++) {
        for (const row of set.frames[f]) {
          for (const ch of row) {
            // Jedes Zeichen ist "." oder ein gueltiger Paletten-Index → beim
            // Rendern entsteht ausschliesslich Alpha 0 oder 255.
            expect(ch === "." || charIndex(ch) >= 0, `${key} Frame ${f}: Zeichen "${ch}"`).toBe(true);
          }
        }
      }
    }
  });

  it("0 Off-Palette-Pixel: jeder gesetzte Pixel liegt in PAL (0..31)", () => {
    for (const [key, set] of Object.entries(deathFrameSets())) {
      for (let f = 0; f < set.frames.length; f++) {
        for (const row of set.frames[f]) {
          for (const ch of row) {
            if (ch === ".") continue;
            const idx = charIndex(ch);
            expect(idx, `${key} Frame ${f}: Zeichen "${ch}"`).toBeGreaterThanOrEqual(0);
            expect(idx, `${key} Frame ${f}: Zeichen "${ch}"`).toBeLessThan(PAL.length);
          }
        }
      }
    }
  });

  it("Boss-Stufe unterscheidet sich messbar vom Blob (Frame-Vergleich der Masken)", () => {
    const sets = deathFrameSets();
    const boss = sets.fx_boss_core;
    const blob = sets.fx_death_blob;
    // 1) Boss-Frames enthalten harte ink-Kontur (Index 0) — der Blob nicht.
    for (let f = 0; f < boss.frames.length; f++) {
      const hasInk = boss.frames[f].some((row) => row.includes("0"));
      expect(hasInk, `fx_boss_core Frame ${f}: keine ink-Kontur`).toBe(true);
    }
    expect(blob.frames.some((row) => row.includes("0"))).toBe(false);
    // 2) 3-Stufen-Kern + Glut: Boss nutzt >= 9 Palettenstufen inkl. warmen
    //    Glut-Farben (15..22); der Blob bleibt bei 4-5 kalten/gruenen Stufen.
    for (let f = 0; f < boss.frames.length; f++) {
      const levels = new Set(
        boss.frames[f].flatMap((row) => [...row].filter((ch) => ch !== ".").map(charIndex)),
      );
      expect(levels.size, `fx_boss_core Frame ${f}: Stufen`).toBeGreaterThanOrEqual(9);
      const warm = [...levels].filter((i) => i >= 15 && i <= 22).length;
      expect(warm, `fx_boss_core Frame ${f}: Glut-Farben`).toBeGreaterThanOrEqual(5);
    }
    for (const row of blob.frames.flat()) {
      for (const ch of row) {
        if (ch === ".") continue;
        const idx = charIndex(ch);
        // m10-chaos-fix-raster-glow: Kern/Übergang jetzt lantern(21)/amber(20)
        // statt lanternWhite(13)/candleWhite(12) — kein Near-White-Ende (B2).
        expect(idx === 1 || idx === 20 || idx === 21 || idx === 30 || idx === 31).toBe(true);
      }
    }
    // 3) Maskenvergleich: Blob (9x9, nearest auf 32x32 skaliert) vs. Boss —
    //    jede Boss-Stufe ist in > 12% der Pixel anders als jede Blob-Stufe
    //    (gemessenes Minimum ueber alle 24 Paare: 0.146; identische Silhouette
    //    laege nahe 0).
    for (let bs = 0; bs < boss.frames.length; bs++) {
      let minDiff = 1;
      for (let st = 0; st < blob.frames.length; st++) {
        const bossMask = frameToMask(boss, boss.frames[bs]);
        const blobMask = scaleMask(frameToMask(blob, blob.frames[st]), 9, 32);
        minDiff = Math.min(minDiff, maskDiff(bossMask, blobMask));
      }
      expect(minDiff, `Boss-Frame ${bs} vs. alle Blob-Frames: min Diff ${minDiff.toFixed(3)}`).toBeGreaterThan(0.12);
    }
  });
});
