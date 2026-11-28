import { describe, expect, it } from "vitest";
import { C, PAL } from "../src/palette";
import { slotNameLines } from "../src/logic/text";
import { weaponDef } from "../src/data/weaponIds";
import { WEAPONS } from "../src/data/weapons";
import { EVOLUTION_WEAPONS } from "../src/data/evolution-weapons";
import { PASSIVES } from "../src/data/passives";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";

/**
 * Lane m10-ui-pause-quality: Regressionsschutz fuer den Pause-Screen.
 *
 * Belegte Mängel (Vorher-Scan ~/games/.evidence/m10-ui-pause-quality/
 * m10-ui-pause-quality-before-scan.json, Profile 640x360@2 + 780x360@3 identisch):
 *  - 12 Pause-Build-Texte in C.mist (Index 8) mit Kontrast 4.15 < 4.5 (K2).
 *  - 10 Icon-Frame-Overlaps (je 16 px^2: 16 px Breite x 1 px Höhe bei Pitch 15) (K3).
 *  - Zeile 6 (SEELENLEUCHTFEUER) mit Name->LV-Puffer 4 px statt dem Zeilen-1-5-
 *    Minimum von 22 px; LV 8 sass 2 px an der Sanduhr-Icon-Kante (K3, Hebel 7).
 *
 * Reine Tests (kein window/Phaser): Kontrastmetrik identisch zum Scan
 * (scripts/m10-ui-pause-quality.mjs), Layout-Geometrie exakt wie refreshPause,
 * plus Quell-Checks auf UI.ts. Baseline-Zahlen sind im Test fixiert, damit eine
 * Ruecknahme des Fixes sichtbar wird.
 */

function lin(v: number): number {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function lum(hex: number): number {
  return 0.2126 * lin((hex >> 16) & 255) + 0.7152 * lin((hex >> 8) & 255) + 0.0722 * lin(hex & 255);
}
/** WCAG-Kontrastverhältnis zweier Palettenindizes (identische Formel wie der Scan). */
export function contrast(aIdx: number, bIdx: number): number {
  const la = lum(PAL[aIdx]);
  const lb = lum(PAL[bIdx]);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Hintergründe des Pause-Panels (ui_frame-Basis + Panel-/Dim-Töne). */
const PAUSE_BACKGROUNDS = [
  ["ink (ui_frame-Basis)", C.ink],
  ["nightDeep (Dim-Overlay)", C.nightDeep],
  ["night (Vignette-Backdrop)", C.night],
  ["nightMid (Panel)", C.nightMid],
] as const;

// --- Layout-Konstanten exakt wie src/scenes/UI.ts refreshPause (K2/K3) ---
/** Spalten-Puffer Name->LV: Minimum der Zeilen 1-5 im Vorher-Scan (22 px). */
const PAUSE_NAME_LV_BUFFER_PX = 22;
/** Breite von "LV n" (ein-stelliges Level) in px. */
const LV_TEXT_W = 23;
/** Glyph-Vorschub: GLYPH_W 5 + 1 px Abstand (src/gfx/font.ts). */
const GLYPH_ADVANCE = 6;
/** Icon-Seite (Frames sind 16x16) und Zeilen-Pitch nach K3. */
const ICON_SIZE = 16;
const PAUSE_ROW_PITCH = 19;
const PAUSE_ROW_PITCH_BEFORE = 15;
/** Spaltenanker wie in refreshPause (Offsets ohne ox; Puffer heben ox auf). */
const WEAPON_NAME_X = 84;
const WEAPON_LV_RIGHT = 212;
const PASSIVE_NAME_X = 234;
const PASSIVE_LV_RIGHT = 386;
/** Erste Build-Zeile (Panel-relativ, +oy im Scene-Code). */
const FIRST_ROW_Y = 76;
const MAX_ROWS = 6;

function colMaxChars(nameX: number, lvRightX: number): number {
  return Math.max(4, Math.floor((lvRightX - LV_TEXT_W - PAUSE_NAME_LV_BUFFER_PX - nameX + 1) / GLYPH_ADVANCE));
}
/** Rect-Ende (rechte Kante) eines Texts der Laenge len an Spaltenanfang nameX. */
function textEnd(nameX: number, len: number): number {
  return nameX + GLYPH_ADVANCE * len - 1;
}

/** Alle moeglichen Pause-Build-Zeilen: Waffen (Basis + Evo) und Powerups. */
function weaponDisplayNames(): string[] {
  const names = new Set<string>();
  for (const def of Object.values(WEAPONS)) names.add(def.name.toUpperCase());
  for (const def of Object.values(EVOLUTION_WEAPONS)) names.add(def.name.toUpperCase());
  return [...names];
}
function passiveDisplayNames(): string[] {
  return Object.values(PASSIVES).map((def) => def.name.toUpperCase());
}

describe("ui-pause-quality K2: Kontrast der Pause-Build-Texte (>= 4.5:1)", () => {
  it("candleWhite (12) auf allen Panel-Hintergruenden >= 4.5:1", () => {
    for (const [bName, bIdx] of PAUSE_BACKGROUNDS) {
      expect(contrast(C.candleWhite, bIdx), `candleWhite auf ${bName}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("bone (10, Waffen-Spalte, unveraendert) auf allen Panel-Hintergruenden >= 4.5:1", () => {
    for (const [bName, bIdx] of PAUSE_BACKGROUNDS) {
      expect(contrast(C.bone, bIdx), `bone auf ${bName}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("mist (8) bleibt der dokumentierte Knackpunkt (< 4.5) — Fix war berechtigt", () => {
    // Vorher-Scan: 12 Build-Texte idx 8 @ 4.15 (median). Regression waere sichtbar.
    expect(contrast(C.mist, C.nightDeep)).toBeLessThan(4.5);
    expect(contrast(C.mist, C.night)).toBeCloseTo(4.15, 1);
  });
});

describe("ui-pause-quality K3: Icon-Frame-Abstand (0 Overlaps)", () => {
  it(`Pitch ${PAUSE_ROW_PITCH}: 16-px-Icon-Frames aufeinanderfolgender Zeilen ueberlappen nicht (3 px Luft)`, () => {
    for (let i = 1; i < MAX_ROWS; i++) {
      const prevTop = FIRST_ROW_Y + (i - 1) * PAUSE_ROW_PITCH - 4;
      const curTop = FIRST_ROW_Y + i * PAUSE_ROW_PITCH - 4;
      const overlap = prevTop + ICON_SIZE - curTop;
      expect(overlap, `Zeile ${i + 1} vs ${i}`).toBeLessThanOrEqual(0);
    }
    // explizit: genau 3 px Luft zwischen den Frames
    expect(FIRST_ROW_Y + PAUSE_ROW_PITCH - 4 - (FIRST_ROW_Y - 4 + ICON_SIZE)).toBe(3);
  });
  it("Pitch 15 (Vorher-Stand) dokumentiert den Mangel: 1 px Frame-Overlap je Zeilenpaar", () => {
    const prevTop = FIRST_ROW_Y - 4;
    const curTop = FIRST_ROW_Y + PAUSE_ROW_PITCH_BEFORE - 4;
    expect(prevTop + ICON_SIZE - curTop).toBe(1);
  });
});

describe("ui-pause-quality K3: Zeilen-1-5-Spaltenpuffer gilt fuer alle Build-Zeilen", () => {
  const weaponMax = colMaxChars(WEAPON_NAME_X, WEAPON_LV_RIGHT);
  const passiveMax = colMaxChars(PASSIVE_NAME_X, PASSIVE_LV_RIGHT);

  it("Spalten-Puffer-Formel entspricht dem Vorher-Scan (Zeilen 1-5: min 22 px)", () => {
    expect(weaponMax).toBe(14); // GEWITTERSIEGEL/GEISTERLATERNE (14 Zeichen) = 22 px Puffer
    expect(passiveMax).toBe(18);
    // Zeile 6 vorher: SEELENLEUCHTFEUER (17) endete bei 265 -> 4 px Puffer (Mangel).
    expect(WEAPON_LV_RIGHT - LV_TEXT_W - textEnd(WEAPON_NAME_X, 17)).toBe(4);
  });

  for (const [colName, nameX, lvRight, maxChars, names] of [
    ["Waffen", WEAPON_NAME_X, WEAPON_LV_RIGHT, weaponMax, weaponDisplayNames()],
    ["Powerups", PASSIVE_NAME_X, PASSIVE_LV_RIGHT, passiveMax, passiveDisplayNames()],
  ] as const) {
    it(`${colName}: jede einzeilige Zeile haelt >= ${PAUSE_NAME_LV_BUFFER_PX} px Puffer zur LV-Spalte`, () => {
      for (const name of names) {
        const lines = slotNameLines(name, maxChars);
        for (const line of lines) {
          const buffer = lvRight - LV_TEXT_W - textEnd(nameX, line.length);
          expect(buffer, `${colName} '${line}' (${name})`).toBeGreaterThanOrEqual(PAUSE_NAME_LV_BUFFER_PX);
        }
      }
    });
    it(`${colName}: Namen bis ${maxChars} Zeichen bleiben einzeilig (Zeilen 1-5 pixelgleich)`, () => {
      for (const name of names) {
        if (name.length <= maxChars) {
          expect(slotNameLines(name, maxChars), name).toEqual([name]);
        }
      }
    });
  }

  it("SEELENLEUCHTFEUER (Zeile 6) wird zweizeilig mit vollem Spalten-Puffer umbrochen", () => {
    const lines = slotNameLines("SEELENLEUCHTFEUER", weaponMax);
    expect(lines.length).toBe(2);
    for (const line of lines) {
      const buffer = WEAPON_LV_RIGHT - LV_TEXT_W - textEnd(WEAPON_NAME_X, line.length);
      expect(buffer).toBeGreaterThanOrEqual(PAUSE_NAME_LV_BUFFER_PX);
    }
  });

  it("keine Zeile rutscht in die naechste (2. Umbruchzeile bleibt vor Pitch/Buttons)", () => {
    // 2. Umbruchzeile sitzt bei y+10, Glyph 7 px hoch -> Unterkante y+17 < Pitch 19.
    expect(10 + 7).toBeLessThan(PAUSE_ROW_PITCH);
  });
});

describe("ui-pause-quality: Quell-Checks UI.ts (Fix bleibt verdrahtet)", () => {
  const src = readFileSync(new URL("../src/scenes/UI.ts", import.meta.url), "utf8");

  it("refreshPause nutzt Pitch 19 (+4 px Icon-Abstand)", () => {
    expect(src).toMatch(/const PAUSE_ROW_PITCH = 19;/);
  });
  it("Spaltenpuffer-Formel in UI.ts entspricht der Test-Formel (Anti-Drift, Review-Nit 1/2)", () => {
    // Pinnt lvTextW und Glyph-Vorschub 6: driftet eine Seite, schlaegt der Test an.
    expect(src).toMatch(/const lvTextW = 23;/);
    expect(src).toMatch(/- nameX \+ 1\) \/ 6\)/);
  });
  it("Powerup-Spalte (Namen + LV) auf candleWhite, nicht mehr mist", () => {
    expect(src).toMatch(/C\.candleWhite, 234, 386/);
    expect(src).not.toMatch(/C\.mist, 234, 386/);
  });
  it("Namensspalte bricht ueber slotNameLines mit Spalten-Puffer-Formel um", () => {
    expect(src).toMatch(/slotNameLines\(name, colMaxChars/);
    expect(src).toMatch(/PAUSE_NAME_LV_BUFFER_PX = 22;/);
  });
  it("Waffen-Spalte bleibt bone (ausserhalb des gemeldeten Mangels)", () => {
    expect(src).toMatch(/C\.bone, 84, 212/);
  });
  it("Hinweiszeilen (ESC/PFEILE) auf den Kontrast-Fix aus m10-pause-footer-contrast", () => {
    // Folge-Karte zu diesem Out-of-Scope-Pin: beide Footer-Hints erreichten auf
    // dem Panel nur 4.15/2.72 (Vorher-Scan m10-menu-art-resight) und sind jetzt
    // wie die akzeptierten Menue-Footer auf paleMist/bone gehoben (Karten #11602).
    expect(src).toMatch(/"ESC = WEITER - O = OPTIONEN - Q = AUFGABE", C\.paleMist/);
    expect(src).toMatch(/"PFEILE \+ ENTER ODER MAUS", C\.bone/);
  });
});
