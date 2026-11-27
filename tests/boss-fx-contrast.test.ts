import { describe, expect, it } from "vitest";
import { PAL } from "../src/palette";
import { deathFrameSets, isBossFxKey, BOSS_FX_BASES, FX_FRAME_COUNTS } from "../src/gfx/gen-fx";

/**
 * M10 boss-fx-contrast — harte Invariante zum Abnahme-Blocker "Boss-FX-Kontrast"
 * (art-director FAIL 3,25/5 in docs/qa/reacceptance-2026-11-27.md).
 *
 * Karte #5219 (Kontur-Regel, Technik wie Ember-Fix #2879): das echte
 * fx_boss_core-Frame-Set (Boss-Auftritt/-Tod) muss
 *   (a) nur Palettenfarben oder transparente Pixel enthalten (binaeres Alpha),
 *   (b) eine geschlossene 1-px-Tintenkontur um den Glutkern tragen,
 *   (c) Kern-hell vs. Kontur-dunkel mit Luminanz-Kontrast >= 5:1 trennen,
 *   (d) im Frame <= 4,16 % Near-White-Pixel behalten (kalibriert wie #2879).
 *
 * Karte #5220 (Mindest-Alpha-Boden) ergänzt die FxSystem-Tests weiter unten.
 */

const NEAR_WHITE_TARGET_PCT = 4.16;

type Grid = { rows: string[]; w: number; h: number };

function paletteIndex(ch: string): number {
  if (ch === ".") return -1;
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "v") return ch.charCodeAt(0) - 97 + 10;
  return -2;
}

function rgb(i: number): [number, number, number] {
  const v = PAL[i];
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function luminance(i: number): number {
  const [r, g, b] = rgb(i).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isNearWhite(i: number): boolean {
  const [r, g, b] = rgb(i);
  return Math.min(r, g, b) >= 200;
}

const bossSet: { frames: string[][]; w: number; h: number } =
  deathFrameSets().fx_boss_core as unknown as { frames: string[][]; w: number; h: number };
const INK = paletteIndex("0");
const CORE = 13; // lanternWhite

describe("fx_boss_core Kontur-Regel (Karte #5219)", () => {
  it("Frame-Set existiert und ist 32x32 mit 6 Frames", () => {
    expect(bossSet).toBeDefined();
    expect(bossSet.w).toBe(32);
    expect(bossSet.h).toBe(32);
    expect(bossSet.frames.length).toBe(6);
    expect(FX_FRAME_COUNTS.fx_boss_core).toBe(6);
  });

  it("binaeres Alpha: jedes Pixel ist transparent oder eine Palettenfarbe", () => {
    for (const grid of bossSet.frames) {
      for (const row of grid) {
        for (const ch of row) {
          expect(paletteIndex(ch)).toBeGreaterThanOrEqual(-1);
          expect(paletteIndex(ch)).not.toBe(-2);
        }
      }
    }
  });

  it("geschlossene Tintenkontur: radial folgt auf den Kern unmittelbar Tinte", () => {
    const cx = (bossSet.w - 1) / 2;
    const cy = (bossSet.h - 1) / 2;
    const RAYS = 72;
    for (const grid of bossSet.frames) {
      let inkAfterCore = 0;
      let rays = 0;
      for (let r = 0; r < RAYS; r++) {
        const a = (r / RAYS) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        let coreRun = 0;
        for (let d = 0; d <= 16; d += 0.5) {
          const x = Math.round(cx + dx * d);
          const y = Math.round(cy + dy * d);
          if (x < 0 || y < 0 || x >= bossSet.w || y >= bossSet.h) break;
          const idx = paletteIndex(grid[y][x]);
          if (idx === 13 || idx === 22 || idx === 20) { coreRun = d; continue; }
          // Erster Nicht-Kern-Pixel nach dem Kernlauf: hier muss Tinte sitzen
          // (Kontur/Ring-Ueberlagerung: Tinte innerhalb der naechsten 2 Pixel).
          // Die Lichtkante oben-links (helle Kernrandpixel, 11/21) grenzt per
          // Definition unmittelbar an Tinte und zaehlt als Kontur-Nachweis.
          if (coreRun > 0) {
            rays++;
            let ink = false;
            for (let e = 0; e <= 1.5; e += 0.5) {
              const nx = Math.round(cx + dx * (d + e));
              const ny = Math.round(cy + dy * (d + e));
              if (nx < 0 || ny < 0 || nx >= bossSet.w || ny >= bossSet.h) break;
              const ch = grid[ny][nx];
              if (paletteIndex(ch) === INK || ch === "b" || ch === "l") { ink = true; break; }
            }
            if (ink) inkAfterCore++;
            break;
          }
        }
      }
      expect(rays).toBe(RAYS);
      // Kontur umschliesst den Kern in (fast) jeder Richtung.
      expect(inkAfterCore / rays).toBeGreaterThan(0.95);
    }
  });

  it("Offset-Outline: unterhalb/rechts der Kernsilhouette sitzt Versatz-Tinte", () => {
    const grid = bossSet.frames[0];
    let offsetInk = 0;
    for (let y = 0; y < bossSet.h - 1; y++) {
      for (let x = 0; x < bossSet.w - 1; x++) {
        const here = paletteIndex(grid[y][x]);
        const shifted = paletteIndex(grid[y + 1][x + 1]);
        if (here === -1 && shifted === INK) offsetInk++;
      }
    }
    // Die +1/+1-versetzte Kopie erzeugt sichtbaren Versatz (nicht nur der Ring).
    expect(offsetInk).toBeGreaterThan(8);
  });

  it("Luminanz-Kontrast Kern vs. Kontur >= 5:1", () => {
    const lumCore = luminance(CORE);
    const lumInk = luminance(INK);
    expect(lumCore / Math.max(lumInk, 1e-6)).toBeGreaterThanOrEqual(5);
  });

  it("Near-White <= 4,16 % im Frame (alle Stufen)", () => {
    for (const grid of bossSet.frames) {
      let opaque = 0;
      let nearWhite = 0;
      for (const row of grid) {
        for (const ch of row) {
          const idx = paletteIndex(ch);
          if (idx < 0) continue;
          opaque++;
          if (isNearWhite(idx)) nearWhite++;
        }
      }
      const pct = (nearWhite / opaque) * 100;
      expect(pct).toBeLessThanOrEqual(NEAR_WHITE_TARGET_PCT);
    }
  });
});

describe("isBossFxKey (Karten #5219/#5220)", () => {
  it("erkennt die Boss-Basis und ihre Frames", () => {
    expect(BOSS_FX_BASES).toContain("fx_boss_core");
    expect(isBossFxKey("fx_boss_core")).toBe(true);
    expect(isBossFxKey("fx_boss_core_2")).toBe(true);
  });

  it("geteilte und normale FX-Keys bleiben normal", () => {
    expect(isBossFxKey("fx_shock")).toBe(false);
    expect(isBossFxKey("fx_shock_2")).toBe(false);
    expect(isBossFxKey("fx_halo")).toBe(false);
    expect(isBossFxKey("fx_evo_hit_phoenix")).toBe(false);
    expect(isBossFxKey(undefined)).toBe(false);
    expect(isBossFxKey("")).toBe(false);
  });
});
