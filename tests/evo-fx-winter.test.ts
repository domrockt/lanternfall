// m10-evo-fx-winter, Karte 3: Guards für die Mixel-/Farb-Regeln des Ewigen Winters.
// Muster: tests/evo-fx-phoenix.test.ts. Rein statisch: die Frame-Generatoren in
// gen-fx.ts sind reine Funktionen → die Tests prüfen Texturgrößen, Draw-Scales
// (kein Scale > 1 am Effekt) und die Farb-Treppe (kein Ink/Schwarz-Rand, keine
// graue Blob-Wolke) direkt an den Grids.
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import {
  EVOLUTION_SIGNATURES,
  FX_FRAME_COUNTS,
  FX_MIXEL_BASES,
  SIGNATURE_FRAME_COUNT,
  frostRingFrame,
  iceFrame,
  mixelBakes,
  mixelLevelFor,
  mixelMaxLevel,
  signatureTextureKey,
  winterSignatureFrame,
} from "../src/gfx/gen-fx";
import { SPRITE_GRIDS, charIndex } from "../src/gfx/textures";
import { WINTER_FX } from "../src/data/evolution-weapons";

/** Indizes aller sichtbaren Pixel eines Grids. */
function usedIndices(rows: string[]): number[] {
  const out = new Set<number>();
  for (const row of rows) for (const ch of row) {
    const i = charIndex(ch);
    if (i >= 0) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

/** Eis-Farbtreppe des Winters: lanternWhite→candleWhite→boneLight→paleMist→mist→fogBlue,
 *  plus blueGrey(5) als kühle Außenkante (art-director Runde 1: Kontrast auf hellem Grund). */
const ICE_RAMP = [13, 12, 11, 9, 8, 6, 5];
/** Verboten: Ink (schwarzer Rand), Nacht-/Grau-Blobs, warme/Moor-Fremdfarben. */
const FORBIDDEN = [0, 1, 2, 3, 4, 7, 10, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];

describe("m10-evo-fx-winter: Signatur in Zielgröße 128x128 @ Draw-Scale 1", () => {
  const sig = EVOLUTION_SIGNATURES.eternal_winter;

  it("drawScale [1,1] gesetzt — Signatur rendert in Zielgröße, nicht 32x32 @ 3,2-4,6", () => {
    expect(sig.drawScale).toEqual([1, 1]);
    // Guard am Quelltext: spawnEvolution folgt sig.drawScale (Mixel-Regel).
    const src = readFileSync(new URL("../src/systems/FxSystem.ts", import.meta.url), "utf8");
    expect(src).toContain("sig.drawScale");
    expect(src).toContain("drawScale?.[0]");
    expect(src).toContain("drawScale?.[1]");
  });

  it("4 Frames à 128x128, Hit und Death verschieden", () => {
    for (const kind of ["hit", "death"] as const) {
      const frames = Array.from({ length: SIGNATURE_FRAME_COUNT }, (_, i) => winterSignatureFrame(kind, i));
      for (const rows of frames) {
        expect(rows.length).toBe(128);
        expect(rows.every((r) => r.length === 128)).toBe(true);
      }
      expect(FX_FRAME_COUNTS[signatureTextureKey("eternal_winter", kind)]).toBe(SIGNATURE_FRAME_COUNT);
      // Frames sollen verschieden sein (Animation, keine eingefrorene Textur).
      expect(new Set(frames).size).toBe(SIGNATURE_FRAME_COUNT);
    }
    expect(winterSignatureFrame("hit", 0)).not.toEqual(winterSignatureFrame("death", 0));
  });

  it("keine graue Blob-Wolke: nur Eis-Treppe, 0 Ink/Fremdfarben, Kristall hat klaren Kern", () => {
    for (const kind of ["hit", "death"] as const) {
      for (let stage = 0; stage < SIGNATURE_FRAME_COUNT; stage++) {
        const used = usedIndices(winterSignatureFrame(kind, stage));
        expect(used.filter((i) => FORBIDDEN.includes(i))).toEqual([]);
        expect(used.every((i) => ICE_RAMP.includes(i))).toBe(true);
        // Treppe vollständig ausgenutzt: heller Kern UND kalter Rand vorhanden.
        expect(used).toContain(13);
        expect(used).toContain(6);
      }
    }
  });

  it("Timing-Signatur bleibt erhalten (hit 0,22 / death 0,75)", () => {
    expect(sig.hitLifetime).toBe(0.22);
    expect(sig.deathLifetime).toBe(0.75);
  });
});

describe("m10-evo-fx-winter: Eisspitzen-Projektil ohne Ink", () => {
  it("projectile_ice: 7x7, Eis-Treppe, 0 Ink-Pixel (vorher 12/25)", () => {
    const def = SPRITE_GRIDS.projectile_ice;
    expect(def.w).toBe(7);
    expect(def.h).toBe(7);
    expect(def.rows.length).toBe(7);
    expect(def.rows.every((r) => r.length === 7)).toBe(true);
    const used = usedIndices(def.rows);
    expect(used).not.toContain(0);
    expect(used.every((i) => ICE_RAMP.includes(i))).toBe(true);
    expect(used).toContain(13); // weißer Kern
    expect(used).toContain(6); // blauer Rand statt schwarzer Kontur
    expect(WINTER_FX.spikeTexture).toBe("projectile_ice");
  });
});

describe("m10-evo-fx-winter: fx_ice-Partikel in Eis-Treppe (art-director Runde 3)", () => {
  it("4 Frames 15x21, nur Eis-Farben — Regression: 'j/i/g' codeten zu flame/ember (Glut-Sturm-Bug)", () => {
    const all: number[] = [];
    for (let stage = 0; stage < 4; stage++) {
      const rows = iceFrame(stage);
      expect(rows.length).toBe(21);
      expect(rows.every((r) => r.length === 15)).toBe(true);
      const used = usedIndices(rows);
      expect(used.every((i) => ICE_RAMP.includes(i))).toBe(true);
      expect(used.some((i) => FORBIDDEN.includes(i))).toBe(false);
      expect(used).toContain(13); // lanternWhite Kern
      expect(used).toContain(9); // paleMist Facette (war 'j' → pal19 flameBright)
      all.push(...used);
    }
    // Späte Zerfallsstufen sind zu schmal für den Rand; die Familie muss die
    // komplette Treppe zeigen (mist 'i'→8 war flame, fogBlue 'g'→6 war emberBrown).
    expect(all).toContain(8);
    expect(all).toContain(6);
  });
});

describe("m10-evo-fx-winter: Aura-Siegel ring_frost als Mixel-Bake (Draw-Scale <= 1)", () => {
  it("ring_frost ist Mixel-Basis mit maxLevel 3, Level-1-Frame 96x96 registriert", () => {
    expect(FX_MIXEL_BASES).toContain("ring_frost");
    expect(mixelMaxLevel("ring_frost")).toBe(3);
    expect(FX_FRAME_COUNTS["ring_frost"]).toBe(1);
    const rows = frostRingFrame(96, 1);
    expect(rows.length).toBe(96);
    expect(rows.every((r) => r.length === 96)).toBe(true);
    // Abnahme Runde 1 (art-director): kühle Außenkante blueGrey(5) vorhanden.
    expect(usedIndices(rows)).toContain(5);
  });

  it("Level-1-Geometrie: Band bei r ~40-47, Zentrum frei (kein gefüllter Blob)", () => {
    const rows = frostRingFrame(96, 1);
    const at = (x: number, y: number) => charIndex(rows[y][x]);
    expect(at(48, 48)).toBe(-1); // Zentrum transparent
    expect(at(48, 48 + 44)).toBeGreaterThanOrEqual(0); // Band
    expect(at(48, 48 + 20)).toBe(-1); // innen frei
  });

  it("Bake-Stufen: identische Geometrie in L-facher Größe, Level-Auswahl deckt Scale 2-3", () => {
    const bakes = mixelBakes().filter((b) => b.base === "ring_frost");
    expect(bakes.map((b) => b.level).sort()).toEqual([2, 3]);
    for (const bake of bakes) {
      expect(bake.frames.length).toBe(1);
      expect(bake.frames[0].length).toBe(96 * bake.level);
      expect(bake.frames[0].every((r) => r.length === 96 * bake.level)).toBe(true);
      const used = usedIndices(bake.frames[0]);
      expect(used.every((i) => ICE_RAMP.includes(i))).toBe(true);
    }
    // Beobachteter Ist-Scale 2.013 → Stufe 3, Draw-Scale = 2.013/3 <= 1.
    expect(mixelLevelFor("ring_frost", 2.013)).toBe(3);
    expect(2.013 / mixelLevelFor("ring_frost", 2.013)).toBeLessThanOrEqual(1);
  });
});

describe("m10-evo-fx-winter: WINTER_FX-Parameter (reine FX-Werte)", () => {
  it("Anticipation ≤ 0,3 s, Partikel in Sprite-Pixelgröße, Zielgrößen eingetragen", () => {
    expect(WINTER_FX.windupLife).toBeLessThanOrEqual(0.3);
    expect(WINTER_FX.windupLife).toBeGreaterThan(0);
    expect(WINTER_FX.particleScale).toBeLessThanOrEqual(1);
    expect(WINTER_FX.auraTexture).toBe("ring_frost");
    expect(WINTER_FX.particleTexture).toBe("fx_ice");
    expect(WINTER_FX.impactTexture).toBe("fx_shock");
    expect(WINTER_FX.signatureDrawScale).toEqual([1, 1]);
  });
});
