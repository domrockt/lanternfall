import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { GEN_BOSSES } from "../src/gfx/gen-bosses";
import { BOSSES } from "../src/data/bosses";
import { PAL } from "../src/palette";

/**
 * M10-boss-portrait-crisp: Guard fuer den Zeichen-Qualitaets-Pass der 6 Bosse.
 *
 * Die Bosse treten alle 5 Minuten auf und sind bis zu 96 px gross — ihre
 * Zeichenqualitaet (Konturen, Silhouetten-Lesbarkeit, Lichtkanten) ist Teil der
 * Abnahme. Der Guard friert die Before-Baseline ein (shots/m10-boss-portrait-
 * before.json, gerendert von scripts/m10-boss-portrait.mjs) und fordert:
 * - 6/6 Bosse aus src/data/bosses haben generierte Sprites mit 3 Frames
 * - 0 Off-Palette-Pixel (nur Indizes 0-31 + binaeres Alpha ".")
 * - Silhouetten-Kontrast (p75 der Luminanz-Differenz gegen Nacht-Hintergrund
 *   PAL[2]) je Boss >= Vorher-Wert — der Qualitaets-Pass darf die Silhouette
 *   nicht verschlechtern
 * - 0 Frame-Dubletten je Boss (Idle-Anim-Vertrag bleibt bestehen)
 */

interface BaselineRow {
  id: string;
  silhouetteContrast: number;
}

const BASELINE: BaselineRow[] = JSON.parse(
  readFileSync(new URL("../shots/m10-boss-portrait-before.json", import.meta.url), "utf8"),
) as BaselineRow[];

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

describe("boss-portrait-crisp: Zeichenqualitaet der 6 Bosse", () => {
  it("6/6 Bosse aus den Daten haben generierte Sprites", () => {
    for (const boss of BOSSES) {
      expect(GEN_BOSSES[`boss_${boss.id}`], `boss_${boss.id} fehlt`).toBeDefined();
    }
    expect(BOSSES.length).toBe(6);
  });

  it("binaeres Alpha + 0 Off-Palette-Pixel in allen Frames aller 6 Bosse", () => {
    for (const [id, sprite] of Object.entries(GEN_BOSSES)) {
      for (const frame of sprite.frames) {
        for (const row of frame) {
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

  it("Silhouetten-Kontrast je Boss >= Vorher-Wert (Before-Baseline)", () => {
    for (const base of BASELINE) {
      const sprite = GEN_BOSSES[base.id];
      expect(sprite, `${base.id} im Baseline-JSON unbekannt`).toBeDefined();
      const now = Math.round(silhouetteContrast(sprite.frames[0]) * 10) / 10;
      expect(now, `${base.id}: silKontrast ${now} < Vorher ${base.silhouetteContrast}`).toBeGreaterThanOrEqual(
        base.silhouetteContrast,
      );
    }
  });

  it("keine Frame-Dubletten: alle 3 Frames je Boss unterscheiden sich", () => {
    for (const [id, sprite] of Object.entries(GEN_BOSSES)) {
      const sigs = sprite.frames.map((f) => f.join("\n"));
      expect(new Set(sigs).size, `${id}: Duplikate erkannt`).toBe(sigs.length);
      expect(sigs.length, `${id}: Frame-Budget`).toBe(3);
    }
  });

  it("Frame-Grid konsistent: alle Frames w x h", () => {
    for (const [id, sprite] of Object.entries(GEN_BOSSES)) {
      for (const [fi, frame] of sprite.frames.entries()) {
        expect(frame.length, `${id} F${fi} Zeilen`).toBe(sprite.h);
        for (const row of frame) expect(row.length, `${id} F${fi} Spalten`).toBe(sprite.w);
      }
    }
  });
});
