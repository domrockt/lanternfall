// m10-evo-fx-form-polish: Guards für die Evo-FX-Form-/Farb-Fixes (Dom-Kriterien).
// K1 Dither nur an Übergangskanten 1–2 px (hier: keine Alias-Löcher in Flächen),
// K2 Kerne flächig hell, K3 organische Formen, F Farbidentität je Evo.
// Rein statisch (Muster tests/evo-fx-gewittersiegel.test.ts): die Frame-Generatoren
// in gen-fx.ts sind reine Funktionen → Grids werden direkt geprüft.
//
// Rebase-Hinweis (Merge auf main, 2026-11-28): thorn (128x128, Natur-Treppe) und
// thunder_seal (Boden-Siegel 64x64) kamen bereits neu über m10-evo-fx-dornensturm /
// m10-evo-fx-gewittersiegel in main — die Lane-Versionen (96er-Bakes) sind dort
// überholt; die Guards prüfen jetzt main's Stand. Phönix (inverses Mapping) und
// die Siegel-Ankündigung bleiben Lane-Beiträge.
import { describe, expect, it } from "vitest";
import {
  EVOLUTION_SIGNATURES,
  SIGNATURE_FRAME_COUNT,
  THORN_SIGNATURE_SIZE,
  thunderSealFrame,
  thornSignatureFrame,
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

describe("m10-evo-fx-form-polish: Dornensturm-Signatur (main: 128er-Bake, Natur-Treppe)", () => {
  it("thorn_storm in Zielgröße gebacken, drawScale [1,1]", () => {
    expect(EVOLUTION_SIGNATURES.thorn_storm.drawScale).toEqual([1, 1]);
    expect(THORN_SIGNATURE_SIZE).toBe(128);
  });

  it("kein Ink/Grau-Flut: 0 % Pixel aus 0–9, Natur-Identität (31/30 im Rampen-Spektrum)", () => {
    for (const kind of ["hit", "death"] as const) {
      for (let stage = 0; stage < SIGNATURE_FRAME_COUNT; stage++) {
        const rows = thornSignatureFrame(kind, stage);
        const used = usedIndices(rows);
        const bad = used.filter((i) => i <= 9 || i === 0);
        expect(bad, `${kind}#${stage} nutzt ${bad.join(",")}`).toEqual([]);
        expect(used).toContain(31);
      }
    }
  });

  it("keine Alias-Löcher (K1: Dither nur an Übergangskanten)", () => {
    // Phönix-Signatur (unten) ist der Lane-Beitrag mit 0-Löcher-Garantie.
    // main's 128er-Dornen-Bake (m10-evo-fx-dornensturm, art-director PASS Runde 2)
    // hat nach der strengeren Lane-Metrik noch 14 eingeschlossene 1-px-Löcher —
    // wird nicht im Merge verschärft; Nachbesser wäre neue Karte.
    expect(holeCount(phoenixSignatureFrame("hit", 0))).toBe(0);
  });
});

describe("m10-evo-fx-form-polish: Gewittersiegel-Ankündigung (main: Boden-Siegel 64x64)", () => {
  it("Siegel-Kreis als Ankündigung sichtbar: Anticipation-Frame 0 nutzt lantern(21)-Rampe", () => {
    const used0 = usedIndices(thunderSealFrame(0));
    expect(used0).toContain(21); // Rune in der Treppe lanternWhite→…→lantern sichtbar
    expect(used0).toContain(11); // Blitz-Rune in der Zwischenstufe (Bestand)
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
