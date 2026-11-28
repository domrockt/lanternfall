import { describe, expect, it } from "vitest";

// M10-weapon-shot-readability: Die 6 Spieler-Waffen-Projektile muessen im
// 300-500-Gegner-Chaos optisch klar unterscheidbar sein — je Waffe eigene
// Kernfarbe, dunkle Kontur und Groessenstufe, kein Auswaschen im ADD-Glow
// (kein A7-Near-White). Reine Optik: Trefferverhalten/Schaden bleibt bitgleich
// (die Signatur-Tabelle aendert nur Textur-Inhalt/-Groesse, keine Radien).
//
// Schwellen (vor der Messung festgelegt, Lane-Briefing):
//   - Kernfarben je Paar via WCAG-Kontrast >= 1,4 ODER RGB-Distanz >= 110 getrennt
//     (Luminanz-Separation oder chromatische Separation — beidesTraegt im Chaos)
//   - keine beiden Waffen teilen einen Kern-Index; geteilte Nicht-Kern-Farben <= 3
//   - Silhouetten-XOR >= 8 px (Form als eigener Unterscheidungskanal)
//   - A7-Near-White (r,g,b >= 150 und r >= 235) = 0 Pixel je Signatur
//   - Groessenstufen: alle 6 Signaturflaechen paarweise verschieden
import { WEAPON_SHOT_SIGNATURES, type WeaponShotSignature } from "../src/gfx/gen-fx";
import { PAL } from "../src/palette";

const WEAPON_IDS = ["ember", "flail", "frost", "storm", "thorn", "lantern"] as const;
type WeaponId = (typeof WEAPON_IDS)[number];

/** A7-Near-White (ACCEPTANCE-Kalibrierung): r,g,b >= 150 und r >= 235. */
function isNearWhiteA7(hex: number): boolean {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return r >= 150 && g >= 150 && b >= 150 && r >= 235;
}

interface SigInfo {
  id: WeaponId;
  sig: WeaponShotSignature;
  w: number;
  h: number;
  colors: Set<number>;
  mask: boolean[][];
  opaque: number;
  nearWhite: number;
}

function sigInfo(id: WeaponId): SigInfo {
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
  return { id, sig, w, h, colors, mask, opaque, nearWhite };
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
const MAX_SHARED_NON_CORE_COLORS = 3;

const INFOS: Record<WeaponId, SigInfo> = Object.fromEntries(
  WEAPON_IDS.map((id) => [id, sigInfo(id)]),
) as Record<WeaponId, SigInfo>;

describe("M10-weapon-shot-readability — 6 Waffen-Signaturen", () => {
  it("alle 6 Waffen vorhanden, rechteckig, Palette-konform, nicht leer", () => {
    for (const id of WEAPON_IDS) {
      const info = INFOS[id];
      expect(info.opaque, `${id}: nicht leer`).toBeGreaterThan(0);
      expect(info.colors.has(info.sig.core), `${id}: Kernfarbe vorhanden`).toBe(true);
      expect(info.sig.texture, `${id}: Textur-Key`).toBeTruthy();
    }
  });

  it("dunkle Kontur je Signatur (Ink 0 oder Luminanz <= 0,03)", () => {
    for (const id of WEAPON_IDS) {
      const hasDark = [...INFOS[id].colors].some((i) => luminance(i) <= 0.03);
      expect(hasDark, `${id}: dunkle Kontur`).toBe(true);
    }
  });

  it("kein A7-Near-White in den Signaturen (0 Pixel je Waffe)", () => {
    for (const id of WEAPON_IDS) {
      expect(INFOS[id].nearWhite, `${id}: A7-Near-White-Pixel`).toBe(0);
    }
  });

  it("kein Kern-Index doppelt vergeben", () => {
    const cores = WEAPON_IDS.map((id) => INFOS[id].sig.core);
    expect(new Set(cores).size).toBe(WEAPON_IDS.length);
  });

  it("Groessenstufen: alle 6 Signaturflaechen paarweise verschieden", () => {
    const areas = WEAPON_IDS.map((id) => INFOS[id].w * INFOS[id].h);
    expect(new Set(areas).size).toBe(WEAPON_IDS.length);
  });
});

describe("M10-weapon-shot-readability — alle 15 Waffenpaare", () => {
  for (let i = 0; i < WEAPON_IDS.length; i++) {
    for (let j = i + 1; j < WEAPON_IDS.length; j++) {
      const a = INFOS[WEAPON_IDS[i]];
      const b = INFOS[WEAPON_IDS[j]];
      it(`${a.id} vs ${b.id}: Kern getrennt (WCAG >= ${MIN_CORE_CONTRAST} oder RGB-Dist >= ${MIN_CORE_RGB_DISTANCE})`, () => {
        const k = wcagContrast(a.sig.core, b.sig.core);
        const d = rgbDistance(a.sig.core, b.sig.core);
        const separated = k >= MIN_CORE_CONTRAST || d >= MIN_CORE_RGB_DISTANCE;
        expect(separated, `${a.id}/${b.id}: WCAG ${k.toFixed(2)}, RGB-Dist ${d}`).toBe(true);
      });

      it(`${a.id} vs ${b.id}: max. ${MAX_SHARED_NON_CORE_COLORS} geteilte Nicht-Kern-Farben`, () => {
        const shared = [...a.colors].filter((c) => b.colors.has(c) && c !== a.sig.core && c !== b.sig.core);
        expect(shared.length, `geteilt: ${shared.join(",")}`).toBeLessThanOrEqual(MAX_SHARED_NON_CORE_COLORS);
      });

      it(`${a.id} vs ${b.id}: Silhouetten-XOR >= ${MIN_SILHOUETTE_XOR} px`, () => {
        expect(silhouetteXor(a, b)).toBeGreaterThanOrEqual(MIN_SILHOUETTE_XOR);
      });
    }
  }
});

describe("M10-weapon-shot-readability — Paar ember vs frost (streng)", () => {
  const a = INFOS.ember;
  const b = INFOS.frost;

  it("Farbmasken disjunkt (nur Ink 0 geteilt)", () => {
    const shared = [...a.colors].filter((i) => b.colors.has(i));
    expect(shared, "geteilte Farben").toEqual([0]);
  });

  it(`Kern-Kontrast >= ${MIN_CORE_CONTRAST} UND Kern-RGB-Distanz >= ${MIN_CORE_RGB_DISTANCE}`, () => {
    expect(wcagContrast(a.sig.core, b.sig.core)).toBeGreaterThanOrEqual(MIN_CORE_CONTRAST);
    expect(rgbDistance(a.sig.core, b.sig.core)).toBeGreaterThanOrEqual(MIN_CORE_RGB_DISTANCE);
  });

  it("Groessenstufe frost > ember (Mixel-Regel: Zielgroesse, Scale 1)", () => {
    expect(b.w).toBeGreaterThan(a.w);
  });
});
