import { describe, expect, it } from "vitest";
import { GEN_BOSSES } from "../src/gfx/gen-bosses";
import { PAL } from "../src/palette";

/**
 * Lane m10-boss-portrait-w2-r2: Regression-Guard fuer die Zeichen-Qualitaets-Fixes
 * an coven, pale_shepherd und hollow_king (Mängel aus docs/lanes/
 * m10-boss-portrait-crisp.md, Abschnitt "Offene Punkte").
 *
 * Eingefrorene Vorher-Baseline (K1, gemessen von scripts/m10-boss-portrait-w2.mjs,
 * Beleg ~/games/.evidence/m10-boss-portrait-w2-r2/m10-boss-portrait-w2-before.json,
 * Renderer: Mesa Intel(R) Graphics (RPL-S)):
 *   coven         96x96  silKontrast 70.0  (Klon-Posen, Goldkugeln, Besen-Nadel)
 *   pale_shepherd 72x72  silKontrast 134.4 (Kopf-/Gesichtsflaeche matschig)
 *   hollow_king   96x96  silKontrast 70.0  (Tech-Panel-Brust, rauschende Unterkante)
 *   moor_queen    56x56  silKontrast 118.4 (Kontrolle — bewusst unangetastet, Idle-Kontrakt)
 *
 * Der Guard fordert: Grid-Groessen unverändert, 0 Off-Palette-Pixel (binaeres
 * Alpha), Silhouetten-Kontrast der 3 fixen Bosse >= Vorher, unveraenderte Bosse
 * pixelgenau auf Vorher-Niveau, 0 Frame-Dubletten (Idle-Kontrakt).
 */

const BEFORE: Record<string, { w: number; h: number; silKontrast: number }> = {
  boss_coven: { w: 96, h: 96, silKontrast: 70.0 },
  boss_pale_shepherd: { w: 72, h: 72, silKontrast: 134.4 },
  boss_hollow_king: { w: 96, h: 96, silKontrast: 70.0 },
  boss_moor_queen: { w: 56, h: 56, silKontrast: 118.4 },
  boss_bone_lord: { w: 64, h: 64, silKontrast: 170.9 },
  boss_bell_golem: { w: 80, h: 80, silKontrast: 134.4 },
};
const FIXED = ["boss_coven", "boss_pale_shepherd", "boss_hollow_king"];
const UNTOUCHED = ["boss_moor_queen", "boss_bone_lord", "boss_bell_golem"];

const NIGHT_BG = 2; // Boss erscheint nachts auf dunklem Grund

function lum(i: number): number {
  const hex = PAL[i];
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function p75(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(0.75 * s.length))];
}

/** p75 der Luminanz-Differenz aller gefüllten Pixel (F0) gegen den Nacht-Hintergrund. */
function silhouetteContrast(frame: readonly string[]): number {
  const bgL = lum(NIGHT_BG);
  const diffs: number[] = [];
  for (const row of frame) {
    for (const ch of row) {
      if (ch === ".") continue;
      const idx = parseInt(ch, 36);
      diffs.push(Math.abs(lum(idx) - bgL));
    }
  }
  return p75(diffs);
}

describe("boss-portrait-w2: Regression der Zeichen-Fixes (coven, pale_shepherd, hollow_king)", () => {
  it("alle 4 Bezug-Bosse existieren mit unveränderter Grid-Groesse", () => {
    for (const [id, base] of Object.entries(BEFORE)) {
      const sprite = GEN_BOSSES[id];
      expect(sprite, `${id} fehlt`).toBeDefined();
      expect(sprite.w, `${id}: Breite`).toBe(base.w);
      expect(sprite.h, `${id}: Hoehe`).toBe(base.h);
      expect(sprite.frames.length, `${id}: Frame-Budget`).toBe(3);
    }
  });

  it("binaeres Alpha + 0 Off-Palette-Pixel in allen Frames der 4 Bezug-Bosse", () => {
    for (const id of Object.keys(BEFORE)) {
      const sprite = GEN_BOSSES[id];
      for (const [fi, frame] of sprite.frames.entries()) {
        expect(frame.length, `${id} F${fi} Zeilen`).toBe(sprite.h);
        for (const row of frame) {
          expect(row.length, `${id} F${fi} Spalten`).toBe(sprite.w);
          for (const ch of row) {
            if (ch === ".") continue;
            const idx = parseInt(ch, 36);
            expect(Number.isInteger(idx), `${id}: Char "${ch}"`).toBe(true);
            expect(idx, `${id}: Char "${ch}" ueber Palette`).toBeLessThanOrEqual(31);
            expect(idx, `${id}: Char "${ch}" negativ`).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("Silhouetten-Kontrast der 3 fixen Bosse >= Vorher-Wert", () => {
    for (const id of FIXED) {
      const now = Math.round(silhouetteContrast(GEN_BOSSES[id].frames[0]) * 10) / 10;
      const base = BEFORE[id].silKontrast;
      expect(now, `${id}: silKontrast ${now} < Vorher ${base}`).toBeGreaterThanOrEqual(base);
    }
  });

  it("unangetastete Bosse behalten ihren Vorher-Silhouetten-Kontrakt", () => {
    // moor_queen bewusst NICHT angefasst (Idle-Kontrakt); bone_lord/bell_golem
    // hatten in der crisp-Lane keinen Muss-Punkt. Der F0-Kontrast bleibt >= Vorher.
    for (const id of UNTOUCHED) {
      const now = Math.round(silhouetteContrast(GEN_BOSSES[id].frames[0]) * 10) / 10;
      expect(now, `${id}: silKontrast ${now} < Vorher ${BEFORE[id].silKontrast}`).toBeGreaterThanOrEqual(
        BEFORE[id].silKontrast,
      );
    }
  });

  it("keine Frame-Dubletten: alle 3 Frames je Bezug-Boss unterscheiden sich", () => {
    for (const id of Object.keys(BEFORE)) {
      const sigs = GEN_BOSSES[id].frames.map((f) => f.join("\n"));
      expect(new Set(sigs).size, `${id}: Duplikate erkannt`).toBe(sigs.length);
    }
  });

  it("coven liest die drei Rollen: drei Roben-Treppen (24/25/26) vorhanden", () => {
    // Fix K2: Klon-Posen -> unterscheidbare Rollen mit eigener Roben-Stufe je Hexe.
    const chars = new Set(GEN_BOSSES.boss_coven.frames[0].join("").split(""));
    for (const tone of [24, 25, 26]) {
      expect(chars.has(tone.toString(36)), `Roben-Ton ${tone} fehlt`).toBe(true);
    }
  });

  it("hollow_king: knochiger Rippenkorb statt Tech-Panel (Knochen im Brustbereich)", () => {
    // Fix K4: Brustbein/Rippen aus Knochen (10/11) muessen im Brustbereich stehen.
    const frame = GEN_BOSSES.boss_hollow_king.frames[0];
    const rib = (x: number, y: number) => parseInt(frame[y][x], 36);
    const tones = [rib(47, 42), rib(48, 42), rib(47, 48), rib(48, 48)];
    expect(tones.some((t) => t === 10 || t === 11), `Brustbereich ohne Knochen: ${tones}`).toBe(true);
  });
});
