// m10-evo-fx-form-polish: Guards für die Evo-FX-Form-/Farb-Fixes (Dom-Kriterien).
// K1 Dither nur an Übergangskanten 1–2 px (hier: keine Alias-Löcher in Flächen),
// K2 Kerne flächig hell, K3 organische Formen, F Farbidentität je Evo.
// Rein statisch (Muster tests/evo-fx-gewittersiegel.test.ts): die Frame-Generatoren
// in gen-fx.ts sind reine Funktionen → Grids werden direkt geprüft.
import { describe, expect, it } from "vitest";
import {
  EVOLUTION_SIGNATURES,
  SIGNATURE_FRAME_COUNT,
  THORN_SIGNATURE_SIZE,
  THUNDER_SIGNATURE_SIZE,
  thunderSealFrame,
  thornSignatureFrame,
  thunderSignatureFrame,
  phoenixSignatureFrame,
} from "../src/gfx/gen-fx";
import { charIndex } from "../src/gfx/textures";

/** Sichtbare Pixel einer Zeile als Index-Set. */
function usedIndices(rows: string[]): number[] {
  const out = new Set<number>();
  for (const row of rows) for (const ch of row) {
    const i = charIndex(ch);
    if (i >= 0) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

function countIdx(rows: string[], idx: number): number {
  let n = 0;
  for (const row of rows) for (const ch of row) if (charIndex(ch) === idx) n++;
  return n;
}

/** Alias-Löcher: voll umschlossene transparente Pixel (= systematisches
 *  Flächendither, Befund phoenix vor dem Fix). */
function holeCount(rows: string[]): number {
  let holes = 0;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] !== ".") continue;
      let solid = 0;
      if (x > 0 && rows[y][x - 1] !== ".") solid++;
      if (x < rows[y].length - 1 && rows[y][x + 1] !== ".") solid++;
      if (y > 0 && rows[y - 1][x] !== ".") solid++;
      if (y < rows.length - 1 && rows[y + 1][x] !== ".") solid++;
      if (solid >= 4) holes++;
    }
  }
  return holes;
}

describe("m10-evo-fx-form-polish: Dornensturm-Signatur (giftgrün/rotbraun, gebacken)", () => {
  it("thorn_storm in Zielgröße 96x96 mit drawScale [1,1] (statt 32x32 @ 4,1–4,4x)", () => {
    expect(EVOLUTION_SIGNATURES.thorn_storm.drawScale).toEqual([1, 1]);
    expect(THORN_SIGNATURE_SIZE).toBe(96);
  });

  it("kein Ink/Grau-Flut: 0 % Pixel aus 0/1/2–9, Farbidentität giftgrün (31/30) + rotbraun (24)", () => {
    for (const kind of ["hit", "death"] as const) {
      for (let stage = 0; stage < SIGNATURE_FRAME_COUNT; stage++) {
        const rows = thornSignatureFrame(kind, stage);
        const used = usedIndices(rows);
        const bad = used.filter((i) => i <= 9 || i === 20 || i === 0);
        expect(bad, `${kind}#${stage} nutzt ${bad.join(",")}`).toEqual([]);
        expect(used).toContain(31);
        expect(used).toContain(24);
        // Kern flächig hell: giftgrün dominiert die Rankenfarbe marsh deutlich.
        expect(countIdx(rows, 31)).toBeGreaterThan(countIdx(rows, 30));
      }
    }
  });

  it("keine Alias-Löcher (K1: Dither nur an Übergangskanten)", () => {
    for (const kind of ["hit", "death"] as const) {
      for (let stage = 0; stage < SIGNATURE_FRAME_COUNT; stage++) {
        expect(holeCount(thornSignatureFrame(kind, stage)), `${kind}#${stage}`).toBe(0);
      }
    }
  });
});

describe("m10-evo-fx-form-polish: Gewittersiegel-Signatur (Gelb-Weiß, gebacken) + Ankündigung", () => {
  it("thunder_seal in Zielgröße 96x96 mit drawScale [1,1] (statt 32x32 @ 3,2–4,6x)", () => {
    expect(EVOLUTION_SIGNATURES.thunder_seal.drawScale).toEqual([1, 1]);
    expect(THUNDER_SIGNATURE_SIZE).toBe(96);
  });

  it("kein Ink, Kern flächig hell (13/12 dominiert die glow-Kante), Gelb-Weiß-Identität", () => {
    for (const kind of ["hit", "death"] as const) {
      for (let stage = 0; stage < SIGNATURE_FRAME_COUNT; stage++) {
        const rows = thunderSignatureFrame(kind, stage);
        const used = usedIndices(rows);
        const bad = used.filter((i) => i <= 11 || (i >= 14 && i <= 20) || i >= 23);
        expect(bad, `${kind}#${stage} nutzt ${bad.join(",")}`).toEqual([]);
        expect(countIdx(rows, 13) + countIdx(rows, 12)).toBeGreaterThan(countIdx(rows, 22));
        expect(holeCount(rows), `${kind}#${stage}`).toBe(0);
      }
    }
  });

  it("Siegel-Kreis als Ankündigung sichtbar: Anticipation-Frame 0 nutzt lantern(21)-Ring", () => {
    const used0 = usedIndices(thunderSealFrame(0));
    expect(used0).toContain(21); // Ring + Zacken sichtbar (vorher nightSlate 4)
    expect(used0).toContain(11); // Blitz-Rune in der Zwischenstufe (Bestand)
    expect(countIdx(thunderSealFrame(0), 13)).toBe(0); // kein lanternWhite-Kern vor Impact
    // Dauer-Puls (Frame 3) bleibt ebenfalls sichtbar.
    expect(usedIndices(thunderSealFrame(3))).toContain(21);
  });
});

describe("m10-evo-fx-form-polish: Phönix-Signatur ohne Flächendither", () => {
  it("keine Alias-Löcher mehr in den 128x128-Signaturen (Befund K1: checkerboard holes)", () => {
    for (const kind of ["hit", "death"] as const) {
      for (let stage = 0; stage < SIGNATURE_FRAME_COUNT; stage++) {
        expect(holeCount(phoenixSignatureFrame(kind, stage)), `${kind}#${stage}`).toBe(0);
      }
    }
  });
});
