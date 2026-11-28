import { describe, expect, it } from "vitest";

// M10-weapon-shot-readability: Die 6 Spieler-Waffen-Projektile muessen im
// 300-500-Gegner-Chaos optisch klar unterscheidbar sein — je Waffe eigene
// Kernfarbe, dunkle Kontur und Groessenstufe, kein Auswaschen im ADD-Glow
// (kein A7-Near-White). Reine Optik: Trefferverhalten/Schaden bleibt bitgleich.
//
// Schwellen (vor der Messung festgelegt, Lane-Briefing):
//   - Farbmasken je Paar disjunkt (nur Ink 0 geteilt, wie tests/shot-clarity.test.ts)
//   - WCAG-Kontrast der Kernfarben >= 1,4
//   - RGB-Euklid-Distanz der Kernfarben >= 110
//   - Silhouetten-XOR >= 8 px
//   - A7-Near-White (r,g,b >= 150 und r >= 235) = 0 Pixel je Signatur
import { WEAPON_SHOT_SIGNATURES, type WeaponShotSignature } from "../src/gfx/gen-fx";
import { PAL } from "../src/palette";

/** A7-Near-White (ACCEPTANCE-Kalibrierung): r,g,b >= 150 und r >= 235. */
function isNearWhiteA7(hex: number): boolean {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return r >= 150 && g >= 150 && b >= 150 && r >= 235;
}

interface SigInfo {
  sig: WeaponShotSignature;
  w: number;
  h: number;
  colors: Set<number>;
  mask: boolean[][];
  opaque: number;
  nearWhite: number;
}

function sigInfo(id: string): SigInfo {
  const s = WEAPON_SHOT_SIGNATURES[id];
  expect(s, `Signatur "${id}" fehlt in WEAPON_SHOT_SIGNATURES`).toBeDefined();
  const sig = s!;
  const h = sig.rows.length;
  const w = sig.rows[0]!.length;
  expect(w, `${id}: Breite`).toBe(sig.w);
  expect(h, `${id}: Hoehe`).toBe(sig.h);
  const mask: boolean[][] = [];
  const colors = new Set<number>();
  let opaque = 0;
  let nearWhite = 0;
  for (let y = 0; y < h; y++) {
    const row = sig.rows[y]!;
    expect(row.length, `${id}: Zeilenlaenge ${y}`).toBe(w);
    mask.push([]);
    for (let x = 0; x < w; x++) {
      const ch = row[x]!;
      if (ch === ".") {
        mask[y]!.push(false);
        continue;
      }
      const idx = ch >= "0" && ch <= "9"
        ? ch.charCodeAt(0) - 48
        : ch.charCodeAt(0) - 97 + 10;
      expect(idx, `${id}: Zeichen "${ch}"`).toBeGreaterThanOrEqual(0);
      expect(idx, `${id}: Zeichen "${ch}"`).toBeLessThanOrEqual(31);
      const hex = PAL[idx]!;
      expect(hex, `${id}: Palette ${idx}`).toBeDefined();
      colors.add(idx);
      mask[y]!.push(true);
      opaque++;
      if (isNearWhiteA7(hex)) nearWhite++;
    }
  }
  return { sig, w, h, colors, mask, opaque, nearWhite };
}

function rgbOf(idx: number): [number, number, number] {
  const hex = PAL[idx]!;
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function luminance(idx: number): number {
  const [r, g, b] = rgbOf(idx);
  const f = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function wcagContrast(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbDistance(a: number, b: number): number {
  const [r1, g1, b1] = rgbOf(a);
  const [r2, g2, b2] = rgbOf(b);
  return Math.round(Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2));
}

/** Silhouetten-XOR beider Masken, zentriert auf die jeweilige Groesse gepaddet. */
function silhouetteXor(a: SigInfo, b: SigInfo): number {
  const w = Math.max(a.w, b.w);
  const h = Math.max(a.h, b.h);
  const sample = (s: SigInfo, x: number, y: number): boolean => {
    const dx = x - Math.floor((w - s.w) / 2);
    const dy = y - Math.floor((h - s.h) / 2);
    if (dx < 0 || dy < 0 || dx >= s.w || dy >= s.h) return false;
    return s.mask[dy]![dx]!;
  };
  let xor = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (sample(a, x, y) !== sample(b, x, y)) xor++;
    }
  }
  return xor;
}

// Schwellen (Lane-Briefing K4, vor der Messung festgelegt):
const MIN_CORE_CONTRAST = 1.4;
const MIN_CORE_RGB_DISTANCE = 110;
const MIN_SILHOUETTE_XOR = 8;

describe("M10-weapon-shot-readability — Signatur-Daten", () => {
  it("Signatur vorhanden, rechteckig, Palette-konform, binaeres Alpha", () => {
    for (const id of ["ember", "frost"]) {
      const info = sigInfo(id);
      expect(info.opaque, `${id}: nicht leer`).toBeGreaterThan(0);
      // Dunkle Kontur: Index 0 (ink) berandet jede Signatur.
      expect(info.colors.has(0), `${id}: Ink-Kontur`).toBe(true);
      expect(info.colors.has(info.sig.core), `${id}: Kernfarbe vorhanden`).toBe(true);
    }
  });

  it("kein A7-Near-White in den Signaturen (0 Pixel je Waffe)", () => {
    for (const id of ["ember", "frost"]) {
      const info = sigInfo(id);
      expect(info.nearWhite, `${id}: A7-Near-White-Pixel`).toBe(0);
    }
  });
});

describe("M10-weapon-shot-readability — Paar ember vs frost", () => {
  const a = sigInfo("ember");
  const b = sigInfo("frost");

  it("Farbmasken disjunkt (nur Ink 0 geteilt)", () => {
    const shared = [...a.colors].filter((i) => b.colors.has(i));
    expect(shared, "geteilte Farben").toEqual([0]);
  });

  it(`Kern-Kontrast >= ${MIN_CORE_CONTRAST} (WCAG)`, () => {
    const k = wcagContrast(a.sig.core, b.sig.core);
    expect(k).toBeGreaterThanOrEqual(MIN_CORE_CONTRAST);
  });

  it(`Kern-RGB-Distanz >= ${MIN_CORE_RGB_DISTANCE}`, () => {
    const d = rgbDistance(a.sig.core, b.sig.core);
    expect(d).toBeGreaterThanOrEqual(MIN_CORE_RGB_DISTANCE);
  });

  it(`Silhouetten-XOR >= ${MIN_SILHOUETTE_XOR} px`, () => {
    expect(silhouetteXor(a, b)).toBeGreaterThanOrEqual(MIN_SILHOUETTE_XOR);
  });

  it("Groessenstufen unterscheiden sich (Mixel-Regel: Zielgroesse, Scale 1)", () => {
    expect(b.w * b.h).not.toBe(a.w * a.h);
    expect(b.w).toBeGreaterThan(a.w);
  });
});
