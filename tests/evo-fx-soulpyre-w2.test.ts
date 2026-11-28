// m10-evo-fx-soulpyre-w2, Karte 2/3: Guards für die Kältefeuer-Identität des
// Seelenleuchtfeuers (Dom-Regel 02:00Z: Standbild muss OHNE Beschriftung als
// Seele/Kältefeuer erkennbar sein). Rein statisch an den reinen Frame-
// Generatoren + FX-Parametern. Befund der Vorher-Sichtung: grün-moorige Rampe
// (31/30/29) las sich als blasses Grün-Weiß, Halo-Ring als graue Blase.
import { describe, expect, it } from "vitest";
import {
  SOUL_RAMP,
  SOUL_SIGNATURE_SIZE,
  orbSoulFrame,
  soulSignatureFrame,
  mixelMaxLevel,
  mixelLevel1Frames,
  mixelBakes,
} from "../src/gfx/gen-fx";
import { charIndex } from "../src/gfx/textures";
import { SOUL_FX } from "../src/data/evolution-weapons";

/** Zähler der sichtbaren Paletten-Indizes eines Grids. */
function counts(rows: string[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const row of rows) for (const ch of row) {
    const i = charIndex(ch);
    if (i >= 0) out.set(i, (out.get(i) ?? 0) + 1);
  }
  return out;
}

const COLD = [13, 11, 9, 6, 5] as const;

describe("m10-evo-fx-soulpyre-w2: Kältefeuer-Identität (Dom-Regel 02:00Z)", () => {
  it("SOUL_RAMP ist die kalte Treppe [13,11,9,6,5] — kein Grün (28–31), kein warmes 10/12", () => {
    expect([...SOUL_RAMP]).toEqual([...COLD]);
    expect(SOUL_RAMP.some((i) => i >= 28)).toBe(false);
    expect(SOUL_RAMP.includes(10) || SOUL_RAMP.includes(12)).toBe(false);
    expect(SOUL_RAMP.includes(0)).toBe(false);
  });

  it("Orb + Signatur: kein Pixel außerhalb der kalten Treppe (kein Grün-/Moor-/Ink-Einschluss)", () => {
    const grids: Array<[string, string[]]> = [
      ["orb0", orbSoulFrame(0)],
      ["orb1", orbSoulFrame(1)],
      ["orb2", orbSoulFrame(2)],
      ["hit0", soulSignatureFrame("hit", 0)],
      ["hit3", soulSignatureFrame("hit", 3)],
      ["death0", soulSignatureFrame("death", 0)],
      ["death3", soulSignatureFrame("death", 3)],
    ];
    for (const [name, rows] of grids) {
      const used = [...counts(rows).keys()].sort((a, b) => a - b);
      const bad = used.filter((i) => !COLD.includes(i as 13 | 11 | 9 | 6 | 5));
      expect(bad, `${name} verwendet kaltfremde Indizes ${bad.join(",")}`).toEqual([]);
    }
  });

  it("Kern flächig hell: 13 ist die größte Einzel-Stufe in Orb UND Signatur (kein Grau-Reading)", () => {
    const grids: Array<[string, string[]]> = [
      ["orb0", orbSoulFrame(0)],
      ["hit0", soulSignatureFrame("hit", 0)],
      ["death2", soulSignatureFrame("death", 2)],
    ];
    for (const [name, rows] of grids) {
      const c = counts(rows);
      const core = c.get(13) ?? 0;
      expect(core, `${name}: kein flächiger Kern`).toBeGreaterThan(0);
      for (const other of COLD.filter((i) => i !== 13)) {
        expect(core, `${name}: Kern 13 (${core}) > ${other} (${c.get(other) ?? 0})`).toBeGreaterThan(c.get(other) ?? 0);
      }
    }
  });

  it("kalte Identität am Orb: cyan/blau-Bänder (9/6) sichtbar, 1-2 px Kantenbänder statt Flächen-Dither", () => {
    for (let f = 0; f < 3; f++) {
      const c = counts(orbSoulFrame(f));
      expect((c.get(9) ?? 0) + (c.get(6) ?? 0), `frame ${f} ohne kalte Kantenbänder`).toBeGreaterThan(0);
    }
  });

  it("Halo ist stufiges Kalt-Glow (Kern hell, keine Hohlring-Blase): Zentrum 13, Stufen 9/8/6, kein Ink", () => {
    const halo = mixelLevel1Frames()["fx_halo_cold"];
    expect(halo).toBeDefined();
    for (let f = 0; f < halo.frames.length; f++) {
      const rows = halo.frames[f];
      const S = halo.h;
      const mid = Math.floor(S / 2);
      const centerRow = rows[mid];
      // Zentrum des Glows ist hell (13/9), nicht leer oder dunkel.
      expect(centerRow, `halo frame ${f}: Zentrum nicht hell`).toContain("d"); // charIndex('d') = 13
      const c = counts(rows);
      expect(c.get(6) ?? 0, `halo frame ${f} ohne kalte Außenstufe (6)`).toBeGreaterThan(0);
      expect(c.get(9) ?? 0, `halo frame ${f} ohne paleMist-Stufe (9)`).toBeGreaterThan(0);
      expect(c.get(0) ?? 0, `halo frame ${f} mit Ink`).toBe(0);
      // Stufig gefüllt statt Ring: mehr als die Hälfte des Radius-Kreises ist opaque.
      const opaque = [...c.values()].reduce((a, b) => a + b, 0);
      const r = 10.5 + f * 0.4;
      expect(opaque, `halo frame ${f} nicht gefüllt (opaque ${opaque}, Kreis ~${Math.round(Math.PI * r * r)})`)
        .toBeGreaterThan(Math.PI * r * r * 0.8);
    }
  });

  it("Halo-Bake bleibt verfügbar (Stufe 2 für SOUL_FX.haloTexture, Mixel-Regel Scale <= 1)", () => {
    expect(mixelMaxLevel("fx_halo_cold")).toBeGreaterThanOrEqual(2);
    expect(mixelBakes().some((b) => b.base === "fx_halo_cold" && b.level === 2)).toBe(true);
    expect(SOUL_FX.haloTexture).toBe("fx_halo_cold@2");
    expect(SOUL_FX.haloScale).toBeLessThanOrEqual(1);
  });

  it("aufsteigende Funken sind kalt getönt (sparkTint 9, paleMist) statt grün (31)", () => {
    expect(SOUL_FX.sparkTint).toBe(9);
    expect(SOUL_FX.sparkTexture).toBe("fx_star");
    // Death-Signatur-Funken: kalte Füße (9) statt grün.
    const c = counts(soulSignatureFrame("death", 1));
    expect(c.get(9) ?? 0, "Death-Funken ohne kalte Füße").toBeGreaterThan(0);
  });

  it("Signaturen bleiben in Zielgröße 96 gebacken (eine Pixelgröße, Draw-Scale 1)", () => {
    expect(SOUL_SIGNATURE_SIZE).toBe(96);
    for (const kind of ["hit", "death"] as const) {
      for (let stage = 0; stage < 4; stage++) {
        const rows = soulSignatureFrame(kind, stage);
        expect(rows.length).toBe(SOUL_SIGNATURE_SIZE);
        expect(rows.every((r) => r.length === SOUL_SIGNATURE_SIZE)).toBe(true);
      }
    }
  });
});
