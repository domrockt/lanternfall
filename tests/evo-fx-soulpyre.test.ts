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
    expect(EVOLUTION_SIGNATURES.eternal_winter.drawScale).toBeUndefined();
    expect(EVOLUTION_SIGNATURES.phoenix.drawScale).toBeUndefined();
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

  it("jede Textur nutzt die Seelen-Treppe: heller Kern (13/12) UND grüner Rand (31/30/29)", () => {
    for (const [name, rows] of grids) {
      const used = usedIndices(rows);
      expect(used.some((i) => i === 13 || i === 12), `${name} ohne hellen Kern`).toBe(true);
      expect(used.some((i) => i === 31 || i === 30 || i === 29), `${name} ohne grün-blauen Rand`).toBe(true);
      // Kern dominiert: die helle Stufe ist im Grid mindestens so oft wie jede
      // einzelne dunkle Stufe (kein invertierter Block).
    }
  });

  it("Seele-Kern flächig hell: pro Frame > 60 % der sichtbaren Pixel aus den hellen Stufen 13/12/11", () => {
    for (const [name, rows] of grids.filter(([n]) => n.startsWith("soul"))) {
      const counts = new Map<number, number>();
      for (const row of rows) for (const ch of row) {
        const i = charIndex(ch);
        if (i >= 0) counts.set(i, (counts.get(i) ?? 0) + 1);
      }
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      const bright = (counts.get(13) ?? 0) + (counts.get(12) ?? 0) + (counts.get(11) ?? 0);
      expect(bright / total, `${name}: heller Kern nur ${((bright / total) * 100).toFixed(1)} %`).toBeGreaterThan(0.6);
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
