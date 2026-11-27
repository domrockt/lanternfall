import { describe, expect, it } from "vitest";
import {
  EVOLUTION_SIGNATURE_IDS,
  EVOLUTION_SIGNATURES,
  FX_FRAME_COUNTS,
  SIGNATURE_FRAME_COUNT,
  evolutionSignature,
  fxFrames,
  lodSignatureView,
  signatureFrame,
  signatureTextureKey,
  signaturesCollide,
  type EvoSignature,
} from "../src/gfx/gen-fx";

const ALL: EvoSignature[] = EVOLUTION_SIGNATURE_IDS.map((id) => EVOLUTION_SIGNATURES[id]);

function frameGrid(sig: EvoSignature, kind: "hit" | "death", stage: number): string[] {
  return signatureFrame(sig.shape, sig.palette, stage);
}

function inkCount(rows: string[]): number {
  return rows.reduce((n, row) => n + [...row].filter((c) => c !== ".").length, 0);
}

function diffPixels(a: string[], b: string[]): number {
  let n = 0;
  for (let y = 0; y < a.length; y++) {
    for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b[y]?.[x]) n++;
  }
  return n;
}

describe("M10 Evolutions-Signaturen", () => {
  it("kennt genau die 6 Evolutionen und ihre Basiswaffen", () => {
    expect(EVOLUTION_SIGNATURE_IDS.slice().sort()).toEqual([
      "eternal_winter", "phoenix", "soul_beacon", "thorn_storm", "thunder_seal", "wrath_pendulum",
    ]);
    const base = ALL.map((s) => s.baseWeapon).sort();
    expect(base).toEqual(["ember", "flail", "frost", "lantern", "storm", "thorn"]);
    for (const s of ALL) expect(evolutionSignature(s.evolution)).toBe(s);
    expect(evolutionSignature("ember")).toBeUndefined();
  });

  it("alle 6 Signaturen sind paarweise verschieden (Form + Hauptindex + Timing)", () => {
    for (let i = 0; i < ALL.length; i++) {
      for (let j = i + 1; j < ALL.length; j++) {
        const a = ALL[i];
        const b = ALL[j];
        expect(signaturesCollide(a, b), `${a.evolution} vs ${b.evolution}`).toBe(false);
        expect(a.shape === b.shape && a.palette[0] === b.palette[0] && a.hitLifetime === b.hitLifetime).toBe(false);
      }
    }
    // Haupt-Palettenindizes sind zusaetzlich alle unterschiedlich.
    expect(new Set(ALL.map((s) => s.palette[0])).size).toBe(ALL.length);
    // Treffer- und Todes-Timing unterscheiden sich je Evolution ebenfalls.
    expect(new Set(ALL.map((s) => `${s.hitLifetime}/${s.deathLifetime}`)).size).toBe(ALL.length);
  });

  it("nutzt nur gueltige Palettenindizes und die erlaubten Formen", () => {
    const shapes = new Set(["ring", "beam", "splitter", "cloud"]);
    for (const s of ALL) {
      expect(shapes.has(s.shape)).toBe(true);
      expect(s.palette).toHaveLength(3);
      for (const idx of s.palette) {
        expect(Number.isInteger(idx)).toBe(true);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(31);
      }
    }
    // Jede Form kommt mindestens einmal vor, damit alle Formen im Spiel existieren.
    expect(new Set(ALL.map((s) => s.shape)).size).toBeGreaterThanOrEqual(4);
  });

  it("LOD behaelt den Palettenindex und laesst die Signaturen unterscheidbar", () => {
    for (const level of ["full", "reduced", "minimal"] as const) {
      const views = ALL.map((s) => lodSignatureView(s, level));
      for (let i = 0; i < views.length; i++) {
        expect(views[i].paletteIndex).toBe(ALL[i].palette[0]);
        expect(views[i].shape).toBe(ALL[i].shape);
      }
      // Unter minimal: Alpha 0,5 und NORMAL-Blend wie im ACCEPTANCE-A7-Pfad.
      if (level === "minimal") {
        for (const v of views) {
          expect(v.alpha).toBe(0.5);
          expect(v.blend).toBe("NORMAL");
        }
      }
      // Auch nach LOD-Anwendung bleiben alle 6 Kombinationen paarweise verschieden.
      const keys = new Set(views.map((v) => `${v.shape}/${v.paletteIndex}`));
      expect(keys.size).toBe(views.length);
    }
  });

  it("registriert Hit-/Death-Texturen mit konstanten 4 Frames", () => {
    expect(SIGNATURE_FRAME_COUNT).toBe(4);
    for (const id of EVOLUTION_SIGNATURE_IDS) {
      const hitKey = signatureTextureKey(id, "hit");
      const deathKey = signatureTextureKey(id, "death");
      expect(hitKey).not.toBe(deathKey);
      expect(FX_FRAME_COUNTS[hitKey]).toBe(4);
      expect(FX_FRAME_COUNTS[deathKey]).toBe(4);
      expect(fxFrames(hitKey, FX_FRAME_COUNTS[hitKey])).toHaveLength(4);
    }
    // Bestehende Keys/Framecounts bleiben unveraendert (Atlas-Kompatibilitaet).
    expect(FX_FRAME_COUNTS.fx_fire).toBe(6);
    expect(FX_FRAME_COUNTS.fx_ice).toBe(4);
    expect(FX_FRAME_COUNTS.fx_seal).toBe(5);
    expect(FX_FRAME_COUNTS.fx_death_bone).toBe(4);
  });

  it("erzeugt sichtbare, paarweise differente Pixel-Formen", () => {
    for (const s of ALL) {
      for (const kind of ["hit", "death"] as const) {
        for (let stage = 0; stage < SIGNATURE_FRAME_COUNT; stage++) {
          const rows = frameGrid(s, kind, stage);
          expect(rows).toHaveLength(17);
          expect(rows.every((r) => r.length === 17)).toBe(true);
          expect(inkCount(rows)).toBeGreaterThan(12);
          // Nur Palettenzeichen (a-v bzw. 0-9), keine Off-Palette-Glyphen.
          expect(rows.join("")).toMatch(/^[.0-9a-v]+$/);
        }
      }
    }
    // Pixel-Diff zwischen je zwei Evolutionen > Schwelle 20 Pixel (nicht identisch).
    for (let i = 0; i < ALL.length; i++) {
      for (let j = i + 1; j < ALL.length; j++) {
        const d = diffPixels(frameGrid(ALL[i], "hit", 1), frameGrid(ALL[j], "hit", 1));
        expect(d, `${ALL[i].evolution} vs ${ALL[j].evolution}`).toBeGreaterThan(20);
      }
    }
    // Zeichen-Encoding: jeder Tinten-Char decodiert auf einen der drei Palettenindizes.
    const decode = (ch: string): number =>
      ch >= "0" && ch <= "9" ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 97 + 10;
    for (const s of ALL) {
      const chars = new Set([...frameGrid(s, "hit", 0).join("")].filter((c) => c !== ".").map(decode));
      for (const idx of chars) expect(s.palette as readonly number[]).toContain(idx);
    }
  });
});
