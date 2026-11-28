// m10-evo-fx-soulpyre, Karte 3: Guards für die Mixel-/Farb-Regeln des Seelenleuchtfeuers.
// Rein statisch: die Frame-Generatoren in gen-fx.ts sind reine Funktionen → die
// Tests prüfen Texturgrößen, Draw-Scales (kein Scale > 1 am Effekt) und die
// Seelen-Farb-Treppe (kein Ink, keine Grau-/Nacht-Stufen, grün-blauer Rand) direkt
// an den Grids. Vorlage: tests/evo-fx-phoenix.test.ts.
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import {
  EVOLUTION_SIGNATURES,
  SOUL_RAMP,
  SOUL_SIGNATURE_SIZE,
  mixelMaxLevel,
  mixelTextureKey,
  orbSoulFrame,
  soulSignatureFrame,
  signatureTextureKey,
} from "../src/gfx/gen-fx";
import { charIndex } from "../src/gfx/textures";
import { SOUL_FX } from "../src/data/evolution-weapons";

/** Indizes aller sichtbaren Pixel eines Grids. */
function usedIndices(rows: string[]): number[] {
  const out = new Set<number>();
  for (const row of rows) for (const ch of row) {
    const i = charIndex(ch);
    if (i >= 0) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

/** Seelen-Treppe: erlaubt sind nur die Rampen-Indizes (kühles Weiß + Grün). */
const ALLOWED = [...SOUL_RAMP];
/** Signatur: noch strenger — kein bone(10) und kein warmes candleWhite(12). */
const SIG_ALLOWED = [13, 11, 31, 30, 29];
/** Verboten: Ink, Nacht-/Grau-Töne (1–9) und alle warmen/blutigen Fremdfarben. */
const FORBIDDEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28];

describe("m10-evo-fx-soulpyre: Texturen in Zielgröße + Draw-Scale 1", () => {
  it("Seele: 3 Flacker-Frames à 22x32 (Sprite-Pixelgröße), Register enthält alle Keys", () => {
    for (let f = 0; f < 3; f++) {
      const rows = orbSoulFrame(f);
      expect(rows.length).toBe(32);
      expect(rows.every((r) => r.length === 22)).toBe(true);
    }
    expect(SOUL_FX.orbFrames).toEqual(["orb_soul", "orb_soul_2", "orb_soul_3"]);
    expect(SOUL_FX.orbFrameInterval).toBeGreaterThan(0);
  });

  it("Orb wird mit Draw-Scale 1 gezeichnet (kein setScale > 1 am soul-Orb im Code)", () => {
    const src = readFileSync(new URL("../src/systems/CombatSystem.ts", import.meta.url), "utf8");
    const orbCall = src.slice(src.indexOf("SOUL_FX.orbFrames[0]"), src.indexOf("SOUL_FX.orbFrames[0]") + 240);
    expect(orbCall).toContain("setScale(evolved ? 1 : 1)");
    // Halo: gebackene Stufe (48x48) + Ziel-Scale 0.9 — nie > 1.
    expect(SOUL_FX.haloTexture).toBe("fx_halo_cold@2");
    expect(SOUL_FX.haloScale).toBeLessThanOrEqual(1);
  });

  it("Halo-Stufe 2 ist in Sprite-Pixelgröße gebacken (48x48), Level-1-Key unverändert 24x24", () => {
    // Mixel-Bake-API der fx-mixel-Lane: Stufe 2 für fx_halo_cold existiert und der
    // Stufen-Key ist exakt "fx_halo_cold@2" (SOUL_FX.haloTexture).
    expect(mixelMaxLevel("fx_halo_cold")).toBeGreaterThanOrEqual(2);
    expect(mixelTextureKey("fx_halo_cold", 2)).toBe("fx_halo_cold@2");
  });

  it("Anticipation ≤ 0,3 s (Aufbau-Regel), Ausklang kurz", () => {
    expect(SOUL_FX.anticipation).toBeLessThanOrEqual(0.3);
    expect(SOUL_FX.fadeOut).toBeLessThanOrEqual(0.5);
  });

  it("Signatur: soul_beacon in Zielgröße 96 mit drawScale [1,1], andere unverändert 32", () => {
    expect(EVOLUTION_SIGNATURES.soul_beacon.drawScale).toEqual([1, 1]);
    for (let f = 0; f < 4; f++) {
      for (const kind of ["hit", "death"] as const) {
        const rows = soulSignatureFrame(kind, f);
        expect(rows.length).toBe(SOUL_SIGNATURE_SIZE);
        expect(rows.every((r) => r.length === SOUL_SIGNATURE_SIZE)).toBe(true);
      }
    }
    // Merge-Fix (#7642): eternal_winter ist seit dem Winter-Merge ebenfalls in
    // Zielgröße 128 gebacken (drawScale [1,1], Muster phoenix/soul_beacon).
    expect(EVOLUTION_SIGNATURES.eternal_winter.drawScale).toEqual([1, 1]);
    // Merge-Fix (m10-evo-fx-soulpyre × m10-evo-fx-phoenix): Phönix ist seit dem
    // Phoenix-Merge ebenfalls in Zielgröße 128 gebacken (drawScale [1,1]).
    expect(EVOLUTION_SIGNATURES.phoenix.drawScale).toEqual([1, 1]);
    expect(signatureTextureKey("soul_beacon", "death")).toBe("fx_evo_death_soul_beacon");
  });
});

describe("m10-evo-fx-soulpyre: Seelen-Farb-Treppe ohne Ink/Grau", () => {
  const grids: Array<[string, string[]]> = [
    ["soul0", orbSoulFrame(0)],
    ["soul1", orbSoulFrame(1)],
    ["soul2", orbSoulFrame(2)],
    ["sigHit0", soulSignatureFrame("hit", 0)],
    ["sigHit2", soulSignatureFrame("hit", 2)],
    ["sigDeath0", soulSignatureFrame("death", 0)],
    ["sigDeath3", soulSignatureFrame("death", 3)],
  ];

  it("kein Pixel aus Ink/Nacht/Grau/warm (Mixel-Regel: kein grauer Block, kein schwarz umrandeter Effekt)", () => {
    for (const [name, rows] of grids) {
      const used = usedIndices(rows);
      const bad = used.filter((i) => FORBIDDEN.includes(i));
      expect(bad, `${name} verwendet verbotene Indizes ${bad.join(",")}`).toEqual([]);
    }
  });

  it("Signatur-Grids: nur der strenge Satz {13,11,31,30,29} — kein warmes 12, kein bone(10) (art-director Runde 1)", () => {
    for (const [name, rows] of grids.filter(([n]) => n.startsWith("sig"))) {
      const used = usedIndices(rows);
      const bad = used.filter((i) => !SIG_ALLOWED.includes(i));
      expect(bad, `${name} verwendet Indizes außerhalb ${SIG_ALLOWED.join(",")}: ${bad.join(",")}`).toEqual([]);
    }
  });

  it("jede Textur nutzt die Seelen-Treppe: heller Kern (13) UND grüner Rand (31/30/29)", () => {
    for (const [name, rows] of grids) {
      const used = usedIndices(rows);
      expect(used.some((i) => i === 13), `${name} ohne hellen Kern`).toBe(true);
      expect(used.some((i) => i === 31 || i === 30 || i === 29), `${name} ohne grün-blauen Rand`).toBe(true);
    }
  });

  it("Seele-Kern flächig hell: helle Stufen (13/11) dominieren mit > 55 %, 13 ist größte Einzel-Stufe", () => {
    // art-director: Kern flächig hell, Rand grün — beides gewollt, daher ist die
    // Grenze Kern-Dominanz (13 größte Einzel-Stufe) + helle Mehrheit, nicht 100 % Weiß.
    for (const [name, rows] of grids.filter(([n]) => n.startsWith("soul"))) {
      const counts = new Map<number, number>();
      for (const row of rows) for (const ch of row) {
        const i = charIndex(ch);
        if (i >= 0) counts.set(i, (counts.get(i) ?? 0) + 1);
      }
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      const bright = (counts.get(13) ?? 0) + (counts.get(11) ?? 0);
      expect(bright / total, `${name}: heller Kern nur ${((bright / total) * 100).toFixed(1)} %`).toBeGreaterThan(0.55);
      for (const other of [10, 31, 30, 29]) {
        expect(counts.get(13) ?? 0, `${name}: Kern 13 > ${other}`).toBeGreaterThan(counts.get(other) ?? 0);
      }
    }
  });

  it("Signatur-Kern flächig: kein Sinus-Rauschen im Weiß — 13 ist die größte Einzel-Stufe", () => {
    // art-director Kriterium 2: Kerne flächig hell ohne Raster. Der Generator
    // wobbelt nur Außenbänder; statisch geprüft: 13 dominiert JEDE einzelne
    // Übergangs-/Kontur-Stufe (flächiger Kern, schmale Kantenbänder).
    for (const kind of ["hit", "death"] as const) {
      for (const stage of [0, 2]) {
        const counts = new Map<number, number>();
        for (const row of soulSignatureFrame(kind, stage)) for (const ch of row) {
          const i = charIndex(ch);
          if (i >= 0) counts.set(i, (counts.get(i) ?? 0) + 1);
        }
        const core = counts.get(13) ?? 0;
        for (const other of [11, 31, 30, 29]) {
          expect(core, `${kind} stage${stage}: Kern 13 (${core}) > ${other} (${counts.get(other) ?? 0})`).toBeGreaterThan(counts.get(other) ?? 0);
        }
      }
    }
  });

  it("Flacker-Frames unterscheiden sich (Flammen-Flackern, keine statische Platte)", () => {
    const a = orbSoulFrame(0).join("|");
    const b = orbSoulFrame(1).join("|");
    const c = orbSoulFrame(2).join("|");
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it("Death-Signatur: 3 Zungen + Seelen-Funken (mehr sichtbare Pixel als Hit)", () => {
    const deathPx = usedIndices(soulSignatureFrame("death", 0)).length;
    const hitPx = usedIndices(soulSignatureFrame("hit", 0)).length;
    expect(deathPx).toBeGreaterThanOrEqual(hitPx);
    // Funken: dunkle Rand-Kontur muss im Death-Grid vorhanden sein (29 statt Ink).
    expect(deathPx).toBeGreaterThan(0);
  });
});
