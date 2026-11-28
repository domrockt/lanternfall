import { describe, expect, it, vi } from "vitest";
// m10-title-bestwert-spacing: Abstand Bestwerte-Zeile (KAEL-Zeile) <-> Knopf-
// reihe (START/OPTIONEN/CREDITS) auf dem Title-Screen. art-director-Posten 6:
// >= 4 interne px Puffer, 0 Overlap. titleStatsLayout (in src/scenes/Title.ts)
// ist eine reine Funktion — hier wird der Puffer, die Anker-Stabilitaet und
// die Guard-Schaerfe geprueft. Title.ts importiert Phaser (Szene); Phaser wird
// neutral gemockt (Muster tests/title-bg-crisp.test.ts).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  return { default: { GameObjects: { Container }, Scene } };
});
import {
  TITLE_BUTTON_H,
  TITLE_STATS_BUTTON_GAP_MIN,
  titleStatsLayout,
} from "../src/scenes/Title";
import { GLYPH_H } from "../src/gfx/font";

/** Glyphen-Rechteck einer PixelText-Zeile: Origin oben-links, 5x7-Glyphen. */
function textRect(y: number, text: string): { y0: number; y1: number } {
  return { y0: y, y1: y + GLYPH_H };
}

/** Oberkante des ui_frame-Rahmens eines Menue-Knopfs (NineSlice Hoehe
 * TITLE_BUTTON_H, zentriert auf den Anker). */
function frameTop(buttonY: number): number {
  return buttonY - TITLE_BUTTON_H / 2;
}

/** Abnahme-Formate (Briefing): Basis 640x360 und 780x360@3. Beide nutzen
 * oy = round((H - 270) / 2) als vertikalen Offset des 480x270-Kernbilds. */
const FORMATS: Array<{ name: string; w: number; h: number }> = [
  { name: "640x360", w: 640, h: 360 },
  { name: "780x360", w: 780, h: 360 },
];

describe("titleStatsLayout – Puffer Bestwerte-Zeile <-> Knopfreihe", () => {
  it.each(FORMATS)(
    "$name: KAEL-Zeile und Knopfreihe haben >= 4 interne px Puffer, 0 Overlap",
    ({ h }) => {
      const oy = Math.round((h - 270) / 2);
      const st = titleStatsLayout();
      const kael = textRect(st.kaelY + oy, "KAEL");
      const top = frameTop(st.buttonsY + oy);
      expect(kael.y1).toBeLessThanOrEqual(top - TITLE_STATS_BUTTON_GAP_MIN);
      expect(Math.max(0, kael.y1 - top)).toBe(0); // 0 Overlap
      expect(st.statsButtonGap).toBe(top - kael.y1);
      expect(st.statsButtonGap).toBeGreaterThanOrEqual(TITLE_STATS_BUTTON_GAP_MIN);
    },
  );

  it("Puffer wird aus den Konstanten hergeleitet (keine handgesetzte Magie)", () => {
    const st = titleStatsLayout();
    expect(st.statsButtonGap).toBe(
      (st.buttonsY - TITLE_BUTTON_H / 2) - (st.kaelY + GLYPH_H),
    );
  });
});

describe("titleStatsLayout – Anker unveraendert (Bestand schützen)", () => {
  it("sichtbare Anker bleiben auf main-Stand (Buttons an ihrem Anker)", () => {
    const st = titleStatsLayout();
    expect(st.statsTop).toBe(167);
    expect(st.miraY).toBe(179);
    expect(st.kaelY).toBe(189);
    expect(st.buttonsY).toBe(214);
  });

  it("rein: wiederholte Aufrufe liefern identische Werte", () => {
    expect(titleStatsLayout()).toEqual(titleStatsLayout());
  });
});

describe("Guard-Schaerfe", () => {
  it("eine Verschiebung der KAEL-Zeile unter den Grenzpuffer wuerde den Test faellen", () => {
    // Simuliert eine Regression: Block um (gap - MIN + 1) px nach unten
    // verschoben -> Puffer < MIN, Overlap > 0. Der Guard muss anschlagen.
    const st = titleStatsLayout();
    const shift = st.statsButtonGap - TITLE_STATS_BUTTON_GAP_MIN + 1;
    expect(shift).toBeGreaterThanOrEqual(1);
    const kael = textRect(st.kaelY + shift, "KAEL");
    const top = frameTop(st.buttonsY);
    expect(kael.y1).toBeGreaterThan(top - TITLE_STATS_BUTTON_GAP_MIN);
  });
});
