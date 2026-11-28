// m10-evo-fx-gewittersiegel, Karte 4: Guards für Sichtbarkeit + Mixel-/Farb-Regeln.
// Rein statisch (Muster tests/evo-fx-phoenix.test.ts): die Frame-Generatoren in
// gen-fx.ts sind reine Funktionen → Texturgrößen, Phasen-Frames und Farb-Treppe
// werden direkt an den Grids geprüft; die Sichtbarkeits-Regression zum 2-s-Bug
// als Quelltext-Guard an fireThunderSeal/updateSeals (hold = ganzer Cooldown-
// Zyklus, Destroy nur nach Ausklang).
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { FX_FRAME_COUNTS, thunderSealFrame } from "../src/gfx/gen-fx";
import { charIndex } from "../src/gfx/textures";
import { THUNDER_FX } from "../src/data/evolution-weapons";

/** Indizes aller sichtbaren Pixel eines Grids. */
function usedIndices(rows: string[]): number[] {
  const out = new Set<number>();
  for (const row of rows) for (const ch of row) {
    const i = charIndex(ch);
    if (i >= 0) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

/** countPixels: Anzahl Pixel einer bestimmten Stufe (helle Kernstufen). */
function countBright(rows: string[], indices: number[]): number {
  const set = new Set(indices);
  let n = 0;
  for (const row of rows) for (const ch of row) if (set.has(charIndex(ch))) n++;
  return n;
}

/** Blitz-Treppe: lanternWhite(13)/candleWhite(12) Kern → glow(22)/lantern(21) Kante, boneLight(11) Zwischenstufe. */
const BOLT_RAMP = [13, 12, 22, 21, 11];
/** Siegel-Grundfläche + Kontur (kühle Dunkelstufe, kein Ink/Grau). */
const BASE = [2, 3, 4];
/** Verboten: Ink(0), Nacht(1), Grau-Stufen(5–9), bone(10), warme Glut, Blut, Moor. */
const FORBIDDEN = [0, 1, 5, 6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 31];

describe("m10-evo-fx-gewittersiegel: Textur in Zielgröße, Draw-Scale 1", () => {
  const grids = [0, 1, 2, 3].map((f) => thunderSealFrame(f));

  it("4 Phasen-Frames à 64x64, registriert als fx_seal_thunder", () => {
    expect(THUNDER_FX.sealTexture).toBe("fx_seal_thunder");
    expect(FX_FRAME_COUNTS[THUNDER_FX.sealTexture]).toBe(4);
    for (const rows of grids) {
      expect(rows.length).toBe(64);
      expect(rows.every((r) => r.length === 64)).toBe(true);
    }
  });

  it("Phasen unterscheiden sich: 0/1 Anticipation, 2 Impact-Flash (heller Kern), 3 Dauer-Puls", () => {
    const [f0, f1, f2, f3] = grids.map((g) => g.join("|"));
    expect(f0).not.toBe(f1);
    expect(f1).not.toBe(f2);
    expect(f2).not.toBe(f3);
    // Impact-Frame leuchtet am hellsten (Kern lanternWhite/candleWhite).
    const bright = grids.map((g) => countBright(g, [13, 12]));
    expect(bright[2]).toBeGreaterThan(bright[0]);
    expect(bright[2]).toBeGreaterThan(bright[1]);
    expect(bright[2]).toBeGreaterThan(bright[3]);
    // Anticipation-Frame 0 bleibt dunkel (Ladezustand).
    expect(bright[0]).toBeLessThan(bright[1]);
  });

  it("Sprite-Pixelgröße = Texturgröße: fireThunderSeal zeichnet mit Scale 1 (kein >1x-Hochskalieren)", () => {
    const src = readFileSync(new URL("../src/systems/CombatSystem.ts", import.meta.url), "utf8");
    const fire = src.slice(src.indexOf("private fireThunderSeal"), src.indexOf("private updateSeals"));
    expect(fire).toContain("THUNDER_FX.sealTexture");
    expect(fire).toContain(".setScale(1)");
    expect(fire).not.toMatch(/setScale\(1\.[89]/);
    const update = src.slice(src.indexOf("private updateSeals"), src.indexOf("private updateWinter"));
    // Alte Nachglüh-Skalierung 2.0 → 2.6 (>1x) ist weg; Impact-Flash mit Scale 1.
    expect(update).not.toMatch(/scaleFrom: 2\.0/);
    expect(update).not.toMatch(/scaleTo: 2\.6/);
    expect(update).toContain("scaleFrom: 1");
    // Kettenblitz-Ziele nur herunterskaliert (<= 1).
    expect(THUNDER_FX.chainScaleFrom).toBeLessThanOrEqual(1);
    expect(THUNDER_FX.chainScaleTo).toBeLessThanOrEqual(1);
  });
});

describe("m10-evo-fx-gewittersiegel: Regression 2-s-Bug (Sichtbarkeit über die volle Wirkungsdauer)", () => {
  const src = readFileSync(new URL("../src/systems/CombatSystem.ts", import.meta.url), "utf8");
  const fire = src.slice(src.indexOf("private fireThunderSeal"), src.indexOf("private updateSeals"));
  const update = src.slice(src.indexOf("private updateSeals"), src.indexOf("private updateWinter"));

  it("Siegel lebt einen ganzen Cooldown-Zyklus (hold = effectiveCooldown), nicht nur 0,55 s", () => {
    expect(fire).toContain("hold: cycle");
    expect(fire).toContain("effectiveCooldown(stats.cooldown");
    // Anticipation und Ausklang sind getrennte Phasen-Werte.
    expect(THUNDER_FX.anticipation).toBeGreaterThan(0);
    expect(THUNDER_FX.fadeOut).toBeGreaterThan(0);
    expect(THUNDER_FX.fadeOut).toBeLessThan(THUNDER_FX.anticipation);
  });

  it("Impact zerstört das Siegel nicht mehr (Dauer-Pulsphase, Destroy erst nach hold <= 0)", () => {
    // impacted = true setzt nur den Phasenwechsel, kein destroy daneben.
    const impactBlock = update.slice(update.indexOf("seal.impacted = true"), update.indexOf("// Phase 2"));
    expect(impactBlock).not.toContain("destroy");
    expect(impactBlock).toContain("continue");
    // Einziger Destroy-Pfad: Ausklang nach hold <= 0.
    const destroyIdx = update.indexOf("seal.sprite.destroy()");
    expect(destroyIdx).toBeGreaterThan(-1);
    expect(update.slice(Math.max(0, destroyIdx - 200), destroyIdx)).toContain("seal.hold <= 0");
  });

  it("Dauer-Pulsphase hält das Siegel lesbar (Alpha am Fade gekoppelt, Grundalpha > 0,5)", () => {
    expect(THUNDER_FX.sustainAlpha).toBeGreaterThan(0.5);
    const sustain = update.slice(update.indexOf("// Phase 2"));
    expect(sustain).toContain("sustainFrame");
    expect(sustain).toContain("THUNDER_FX.fadeOut");
  });
});

describe("m10-evo-fx-gewittersiegel: Farb-Treppe ohne Ink/Grau", () => {
  it("kein Pixel aus Ink/Grau/warmen/Fremdfarben (kühles Blitz-Weiß/Gelb auf dunkler Grundfläche)", () => {
    for (let f = 0; f < 4; f++) {
      const used = usedIndices(thunderSealFrame(f));
      const bad = used.filter((i) => FORBIDDEN.includes(i));
      expect(bad, `Frame ${f} verwendet verbotene Indizes ${bad.join(",")}`).toEqual([]);
      // Grundfläche + Kontur sind vorhanden (dunkle Siegel-Basis).
      expect(used.some((i) => BASE.includes(i)), `Frame ${f} ohne Siegel-Grundfläche`).toBe(true);
      // Blitz-Treppe mit hellem Kern und Gelb-Kante.
      expect(used.some((i) => BOLT_RAMP.includes(i)), `Frame ${f} ohne Blitz-Farbe`).toBe(true);
    }
  });

  it("Impact-Frame nutzt Gelb-Kante (lantern 21 / glow 22), Anticipation bleibt kühl-dunkel", () => {
    expect(countBright(thunderSealFrame(2), [21, 22])).toBeGreaterThan(0);
    const used0 = usedIndices(thunderSealFrame(0));
    // Anticipation: Rune in der Zwischenstufe boneLight(11), kein weißer Kern.
    expect(used0.includes(11)).toBe(true);
    expect(countBright(thunderSealFrame(0), [13, 12])).toBe(0);
  });
});
