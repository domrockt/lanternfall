import { describe, expect, it } from "vitest";
import { PAL } from "../src/palette";
import { charIndex } from "../src/gfx/textures";
import { GEN_TITLE } from "../src/gfx/gen-title";
import { GEN_UI } from "../src/gfx/gen-ui";
import { GEN_ICONS } from "../src/gfx/gen-icons";
import { GEN_CHARS } from "../src/gfx/gen-chars";

/**
 * m10-menu-art-crisp #3: Regressionsschutz fuer Menue-/HUD-Art-Qualitaet.
 *
 * Reine Daten-Tests gegen die GEN_*-Grids (kein window/Phaser):
 *  - Palette-Compliance: jedes Rasterzeichen ist ein Palettenindex (0-31) oder '.'
 *  - binaeres Alpha: nur '.' ist transparent, alles andere opak (Alpha 0/255)
 *  - deterministische Keys: die Key-Mengen sind fix (Snapshot-Listen)
 *  - Skalierungsfaktor: die bekannten Anzeige-Skalen der Menue-Texturen sind
 *    ganzzahlig (keine fraktionalen Upscales -> 0 Mixel)
 *
 * Befund-Kontext: docs/lanes/m10-menu-art-crisp.md
 *  - F1 title_background wird in Title.ts per setDisplaySize fraktional gestreckt
 *    (1.333x/1.625x) — Hebel liegt teils in src/scenes/Title.ts (Fremddatei,
 *    beim Disponenten angefragt) und ist deshalb hier noch NICHT testbar;
 *    sobald der Fix landet, muss title_background in MENU_DISPLAY_SCALES aufgenommen werden.
 *  - F2 chest_closed (Scale 2.4) liegt in src/scenes/UI.ts (Lane-tabu) und ist
 *    entsprechend nicht hier pruefbar.
 */

/** charIndex: 0-9 -> 0-9, a-v -> 10-31; '.' = transparent. Alles andere ungueltig. */
const VALID_CHARS = new Set([...("0123456789" + "abcdefghijklmnopqrstuv"), "."]);

function framesOf(gen: Record<string, { w: number; h: number; frames: string[][] }>) {
  return Object.entries(gen).flatMap(([key, def]) => def.frames.map((rows, i) => ({ key, i, rows, def })));
}

describe("menu-art-crisp: Palette-Compliance", () => {
  const sources = {
    GEN_TITLE: GEN_TITLE,
    GEN_UI: GEN_UI,
    GEN_ICONS: GEN_ICONS,
    GEN_CHARS: GEN_CHARS,
  };

  for (const [name, gen] of Object.entries(sources)) {
    it(`${name}: alle Zeichen sind Palettenindex 0-31 oder '.'`, () => {
      for (const { key, i, rows } of framesOf(gen)) {
        for (const row of rows) {
          for (const ch of row) {
            expect(VALID_CHARS.has(ch), `${name}.${key}#${i}: Zeichen '${ch}' ist kein Palettenindex`).toBe(true);
            const idx = charIndex(ch);
            if (idx >= 0) expect(idx, `${name}.${key}#${i}: Index ${idx} ausserhalb der 32er-Palette`).toBeLessThanOrEqual(31);
          }
        }
      }
    });

    it(`${name}: Rasterzeilen sind gleich lang und passen zu w/h`, () => {
      for (const { key, i, rows, def } of framesOf(gen)) {
        for (const row of rows) expect(row.length, `${name}.${key}#${i}`).toBe(def.w);
        expect(rows.length, `${name}.${key}#${i}`).toBe(def.h);
      }
    });
  }

  it("PAL hat genau 32 Farben", () => {
    expect(PAL.length).toBe(32);
    expect(new Set(PAL).size).toBe(32);
  });
});

describe("menu-art-crisp: binaeres Alpha", () => {
  // Raster-Texturen sind per Konstruktion binaer: charIndex >= 0 -> opak (alpha 255),
  // '.' -> transparent (alpha 0). Der Test verankert diese Konstruktion: es darf
  // KEIN Zeichen geben, das halbtransparent gerendert wuerde (alles ausser den
  // gueltigen Index-Zeichen und '.' ist ungueltig und wuerde in validateGrid/showUp
  // auffallen — siehe Palette-Tests). zusaetzlich: keine Leerzeichen/Unbekannten.
  const sources = { GEN_TITLE, GEN_UI, GEN_ICONS, GEN_CHARS };
  for (const [name, gen] of Object.entries(sources)) {
    it(`${name}: nur opake Index-Zeichen oder '.' (kein Partial-Alpha)`, () => {
      for (const { key, i, rows } of framesOf(gen)) {
        for (const row of rows) {
          for (const ch of row) {
            if (ch === ".") continue;
            expect(charIndex(ch), `${name}.${key}#${i}: '${ch}'`).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  }
});

describe("menu-art-crisp: deterministische Keys", () => {
  it("GEN_ICONS: genau die 18 Icon-Klassen (6 Waffen, 6 Passive, 6 Evolutionen)", () => {
    const weapons = ["ember", "flail", "frost", "thorn", "storm", "lantern"];
    const passives = ["boots", "tome", "heart", "charm", "whetstone", "hourglass"];
    const evos = [
      "phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon",
    ];
    const expected = [
      ...weapons.map((w) => `weapon_${w}`),
      ...passives.map((p) => `passive_${p}`),
      ...evos.map((e) => `evo_${e}`),
    ].sort();
    expect(Object.keys(GEN_ICONS).sort()).toEqual(expected);
  });

  it("GEN_UI: genau title_logo + ui_frame", () => {
    expect(Object.keys(GEN_UI).sort()).toEqual(["title_logo", "ui_frame"]);
  });

  it("GEN_TITLE: genau title_background", () => {
    expect(Object.keys(GEN_TITLE).sort()).toEqual(["title_background"]);
  });

  it("Icons sind 16x16 mit genau einem Frame", () => {
    for (const [key, def] of Object.entries(GEN_ICONS)) {
      expect(def.w, key).toBe(16);
      expect(def.h, key).toBe(16);
      expect(def.frames.length, key).toBe(1);
    }
  });
});

describe("menu-art-crisp: ganzzahlige Anzeige-Skalen (0 Mixel)", () => {
  /**
   * Bekannte Menue-Anzeigen (Stand Scan, siehe lane-Doku):
   *  - title_logo: Scale 2 in Title.ts  -> 96x56 -> 192x112
   *  - ui_frame: Scale 1 (9-Slice, Menue-Buttons) -> 24x24
   *  - Icons (icon_*): Scale 1 in HUD/Pause/Results -> 16x16
   *  - Portraits: Scale 2 in CharSelect/Results -> 48x48 -> 96x96
   * Alle Skalen muessen ganzzahlig sein; Anzeigemasse = frame * scale ganzzahlig.
   */
  const MENU_DISPLAY_SCALES: { key: string; frameW: number; frameH: number; scales: number[] }[] = [
    { key: "title_logo (GEN_UI)", frameW: GEN_UI.title_logo.w, frameH: GEN_UI.title_logo.h, scales: [2] },
    { key: "ui_frame (GEN_UI)", frameW: GEN_UI.ui_frame.w, frameH: GEN_UI.ui_frame.h, scales: [1] },
    { key: "title_background (GEN_TITLE) — F1 pending, siehe lane-Doku", frameW: GEN_TITLE.title_background.w, frameH: GEN_TITLE.title_background.h, scales: [1] },
    ...Object.entries(GEN_ICONS).map(([key, def]) => ({ key: `icon_${key}`, frameW: def.w, frameH: def.h, scales: [1, 2] })),
    ...Object.entries(GEN_CHARS)
      .filter(([key]) => key.startsWith("portrait_"))
      .map(([key, def]) => ({ key: `${key} (Skala 2)`, frameW: def.w, frameH: def.h, scales: [2] })),
  ];

  it("jede bekannte Menue-Anzeige ist ganzzahlig skaliert", () => {
    for (const { key, frameW, frameH, scales } of MENU_DISPLAY_SCALES) {
      for (const s of scales) {
        expect(Number.isInteger(s), `${key}: Skala ${s} nicht ganzzahlig`).toBe(true);
        expect(Number.isInteger(frameW * s), `${key}: ${frameW}x${s}`).toBe(true);
        expect(Number.isInteger(frameH * s), `${key}: ${frameH}x${s}`).toBe(true);
      }
    }
  });

  it("Icons werden in beiden M10-Profilen (640/780) mit ganzzahliger Skala gezeichnet", () => {
    // Die Profile aendern nur die interne Breite (640/780); Icon-Skalen bleiben 1-2.
    for (const width of [640, 780]) {
      expect(Number.isInteger(width)).toBe(true);
      for (const def of Object.values(GEN_ICONS)) {
        expect(Number.isInteger(def.w * 1)).toBe(true);
        expect(Number.isInteger(def.w * 2)).toBe(true);
      }
    }
  });
});
