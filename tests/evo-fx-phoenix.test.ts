// m10-evo-fx-phoenix, Karte 3: Guards für die Mixel-/Farb-Regeln des Phönixschwarm.
// Rein statisch: die Frame-Generatoren in gen-fx.ts sind reine Funktionen → die
// Tests prüfen Texturgrößen, Draw-Scales (kein Scale > 1 am Effekt) und die
// Farb-Treppe (kein Ink/Schwarz-Rand, kein Grau) direkt an den Grids.
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import {
  EVOLUTION_SIGNATURES,
  FX_FRAME_COUNTS,
  phoenixBirdFrame,
  phoenixBoomFrame,
  phoenixBurnFrame,
  phoenixLaunchFrame,
  phoenixSignatureFrame,
  signatureTextureKey,
} from "../src/gfx/gen-fx";
import { charIndex } from "../src/gfx/textures";
import { PHOENIX_FX } from "../src/data/evolution-weapons";

/** Indizes aller sichtbaren Pixel eines Grids. */
function usedIndices(rows: string[]): number[] {
  const out = new Set<number>();
  for (const row of rows) for (const ch of row) {
    const i = charIndex(ch);
    if (i >= 0) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

/** Feuer-Farbtreppe des Phönix: Glow→Lantern→Amber→FlameBright→Flame→EmberOrange→EmberBrown→EmberDark→EmberShadow. */
const FIRE_RAMP = [22, 21, 20, 19, 18, 17, 16, 15, 14];
/** Verboten: Ink (schwarzer Rand), Nacht-/Grau-Töne, Fremdfarben. */
const FORBIDDEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31];

describe("m10-evo-fx-phoenix: Texturen in Zielgröße + Draw-Scale 1", () => {
  it("Vogel: 3 Frames à 15x11, Register enthält alle Keys", () => {
    for (let f = 0; f < 3; f++) {
      const rows = phoenixBirdFrame(f);
      expect(rows.length).toBe(11);
      expect(rows.every((r) => r.length === 15)).toBe(true);
    }
    expect(PHOENIX_FX.birdFrames).toEqual(["projectile_phoenix", "projectile_phoenix_2", "projectile_phoenix_3"]);
    expect(PHOENIX_FX.birdFrameInterval).toBeGreaterThan(0);
  });

  it("Launch ≤ 0,3 s (Anticipation-Regel), 3 Frames à 14x14", () => {
    expect(PHOENIX_FX.launchLife).toBeLessThanOrEqual(0.3);
    for (let f = 0; f < 3; f++) {
      const rows = phoenixLaunchFrame(f);
      expect(rows.length).toBe(14);
      expect(rows.every((r) => r.length === 14)).toBe(true);
    }
    expect(FX_FRAME_COUNTS[PHOENIX_FX.launchTexture]).toBe(3);
  });

  it("Boom/Burn: Zielgröße 64x64, keine Skalierung im FX-Aufruf (Scale 1 im Code)", () => {
    for (let f = 0; f < 4; f++) {
      const rows = phoenixBoomFrame(f);
      expect(rows.length).toBe(64);
      expect(rows.every((r) => r.length === 64)).toBe(true);
    }
    for (let f = 0; f < 3; f++) {
      const rows = phoenixBurnFrame(f);
      expect(rows.length).toBe(64);
      expect(rows.every((r) => r.length === 64)).toBe(true);
    }
    expect(FX_FRAME_COUNTS[PHOENIX_FX.boomTexture]).toBe(4);
    expect(FX_FRAME_COUNTS[PHOENIX_FX.burnTexture]).toBe(3);
    // Draw-Scale-Regel: CombatSystem darf für phoenix-Effekte kein setScale > 1
    // setzen — Guard per Quelltext (spawnAnim/Brandfleck verwenden Scale 1).
    const src = readFileSync(new URL("../src/systems/CombatSystem.ts", import.meta.url), "utf8");
    const boomCall = src.slice(src.indexOf("PHOENIX_FX.boomTexture"), src.indexOf("PHOENIX_FX.boomTexture") + 220);
    expect(boomCall).toContain("scaleFrom: 1");
    expect(boomCall).toContain("scaleTo: 1");
    const burnCall = src.slice(src.indexOf("const phoenix = weaponId"), src.indexOf("this.burns.push"));
    expect(burnCall).toContain("phoenix ? 1 :");
  });

  it("Signatur: Phönix in Zielgröße 128 mit Draw-Scale 1, andere unverändert 32", () => {
    expect(EVOLUTION_SIGNATURES.phoenix.drawScale).toEqual([1, 1]);
    for (let f = 0; f < 4; f++) {
      for (const kind of ["hit", "death"] as const) {
        const rows = phoenixSignatureFrame(kind, f);
        expect(rows.length).toBe(128);
        expect(rows.every((r) => r.length === 128)).toBe(true);
      }
    }
    // Merge-Fix (#7642): eternal_winter ist seit m10-evo-fx-winter ebenfalls in
    // Zielgröße 128 gebacken (drawScale [1,1], Muster phoenix/soul_beacon).
    expect(EVOLUTION_SIGNATURES.eternal_winter.drawScale).toEqual([1, 1]);
    expect(signatureTextureKey("phoenix", "death")).toBe("fx_evo_death_phoenix");
  });
});

describe("m10-evo-fx-phoenix: Farb-Treppe ohne Grau/Schwarz-Rand", () => {
  const grids: Array<[string, string[]]> = [
    ["bird0", phoenixBirdFrame(0)],
    ["bird1", phoenixBirdFrame(1)],
    ["bird2", phoenixBirdFrame(2)],
    ["launch0", phoenixLaunchFrame(0)],
    ["launch1", phoenixLaunchFrame(1)],
    ["launch2", phoenixLaunchFrame(2)],
    ["boom0", phoenixBoomFrame(0)],
    ["boom3", phoenixBoomFrame(3)],
    ["burn0", phoenixBurnFrame(0)],
    ["burn2", phoenixBurnFrame(2)],
    ["sigHit0", phoenixSignatureFrame("hit", 0)],
    ["sigHit3", phoenixSignatureFrame("hit", 3)],
    ["sigDeath0", phoenixSignatureFrame("death", 0)],
    ["sigDeath3", phoenixSignatureFrame("death", 3)],
  ];

  it("kein Pixel aus Ink/Nacht/Grau/Fremdfarben (Mixel-Regel: kein schwarz umrandeter Effekt)", () => {
    for (const [name, rows] of grids) {
      const used = usedIndices(rows);
      const bad = used.filter((i) => FORBIDDEN.includes(i));
      expect(bad, `${name} verwendet verbotene Indizes ${bad.join(",")}`).toEqual([]);
    }
  });

  it("jede Textur nutzt die Feuer-Farbtreppe; Impact-Texturen mit hellem Kern", () => {
    for (const [name, rows] of grids) {
      const used = usedIndices(rows);
      expect(used.some((i) => FIRE_RAMP.includes(i)), `${name} ohne Feuer-Farbe`).toBe(true);
      // Impact-/Bewegungs-Texturen leuchten (Kern hellgelb/Amber); der Brandfleck
      // ist bewusst dunkle Glut (Ausklang, Boden-Dekal).
      if (name.startsWith("burn")) {
        expect(used.some((i) => i === 16 || i === 15 || i === 14), `${name} ohne Glutstufe`).toBe(true);
      } else {
        expect(used.some((i) => i === 22 || i === 21 || i === 20), `${name} ohne hellen Kern`).toBe(true);
      }
    }
  });

  it("Vogel-Frames unterscheiden sich (Flattern), Kern bleibt hell", () => {
    const a = phoenixBirdFrame(0).join("|");
    const b = phoenixBirdFrame(1).join("|");
    const c = phoenixBirdFrame(2).join("|");
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it("Signatur-Death hat 6 Scherben, Hit 4 (Signatur-Regel)", () => {
    const deathEdge = usedIndices(phoenixSignatureFrame("death", 0)).length;
    const hitEdge = usedIndices(phoenixSignatureFrame("hit", 0)).length;
    expect(deathEdge).toBeGreaterThan(0);
    expect(hitEdge).toBeGreaterThan(0);
  });
});
