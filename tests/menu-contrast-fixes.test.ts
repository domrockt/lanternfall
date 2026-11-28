/**
 * m10-menu-contrast-fixes: Regressionstest für die Kontrast-/Overlap-Fixes aus
 * Lane m10-menu-quality-55 (Bedarfsmeldung 2026-11-28).
 *
 * Muster: scripts/m10-menu-quality.mjs — WCAG-artiges Verhältnis der
 * Palettefarbe gegen das gemessene Backdrop (Median-Luminanz aus dem Vorher-Scan,
 * hereingerechnet als konstante Backdrop-Luminanz je Zeile). Plus Positions-
 * Regressionen (Options-Footer ↔ Title-Hint, KAEL-Zeile ↔ Knopfreihe) direkt
 * aus den Quelldateien geparst.
 *
 * Belege: ~/games/.evidence/m10-menu-contrast-fixes/m10-menu-contrast-{before,after}-scan.json
 */
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { PAL } from "../src/palette";

const ROOT = new URL("..", import.meta.url);
const src = (p: string) => readFileSync(new URL(p, ROOT), "utf8");

function lum(hex: number): number {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = f((hex >> 16) & 255), g = f((hex >> 8) & 255), b = f(hex & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: number, b: number): number {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** Zeile (Datei, Text, alter Index, gemessener Median-Ratio aus dem Vorher-Scan). */
interface CLine {
  file: string;
  text: string;
  /** Anker für den Quelltext-Check (Default: text). */
  srcText?: string;
  old: 7 | 8;
  oldMedian: number;
  neu: 9 | 10;
}
const LINES: CLine[] = [
  { file: "src/scenes/Title.ts", text: "WASD/PFEILE BEWEGEN - WAFFEN FEUERN AUTOMATISCH", old: 7, oldMedian: 2.07, neu: 10 },
  { file: "src/scenes/Title.ts", text: "MAUS ODER PFEILE + ENTER WÄHLEN", old: 7, oldMedian: 2.07, neu: 10 },
  { file: "src/scenes/Title.ts", text: "ESC = PAUSE - O = OPTIONEN", old: 7, oldMedian: 2.07, neu: 10 },
  { file: "src/scenes/Title.ts", text: "30 MINUTEN BIS ZUR MORGENDAMMERUNG", old: 8, oldMedian: 4.34, neu: 9 },
  { file: "src/ui/options-menu.ts", text: "PFEILE ODER MAUS - ENTER/ESC", old: 7, oldMedian: 2.72, neu: 10 },
  { file: "src/ui/options-menu.ts", text: "OPTIONEN GELTEN SOFORT UND BLEIBEN GESPEICHERT", old: 8, oldMedian: 4.34, neu: 10 },
  { file: "src/scenes/Credits.ts", text: "SPIELIDEE & TECH-LEAD", srcText: "cx - 148, y, role,", old: 7, oldMedian: 2.73, neu: 10 },
  { file: "src/scenes/Credits.ts", text: "ESC / ENTER = ZURÜCK", old: 7, oldMedian: 2.95, neu: 10 },
  { file: "src/scenes/Credits.ts", text: "LANTERNFALL - DIE LETZTE LATERNE", old: 8, oldMedian: 4.16, neu: 9 },
  { file: "src/scenes/Credits.ts", text: "GRAFIK-PIPELINE: PROZEDURAL, 32 FARBEN", old: 8, oldMedian: 4.16, neu: 9 },
  { file: "src/scenes/CharSelect.ts", text: "PFEILE/MAUS = WAHL", old: 7, oldMedian: 2.77, neu: 10 },
  { file: "src/scenes/CharSelect.ts", text: "START: ", old: 7, oldMedian: 2.48, neu: 10 },
  { file: "src/scenes/CharSelect.ts", text: "bonusText(char)", old: 8, oldMedian: 3.78, neu: 9 },
];



/** Backdrop-Luminanz je Zeile, zurückgerechnet aus dem Vorher-Scan:
 *  L_bg = (L_alt + 0.05) / median_alt − 0.05. */
function backdropOf(line: CLine): number {
  return (lum(PAL[line.old]) + 0.05) / line.oldMedian - 0.05;
}

describe("m10-menu-contrast-fixes: Kontrast (Muster menu-quality-Scan)", () => {
  it("alle dokumentierten Zeilen waren vorher ein FAIL (< 4.5)", () => {
    for (const line of LINES) {
      expect(ratio(lum(PAL[line.old]), backdropOf(line)), line.text).toBeCloseTo(line.oldMedian, 1);
      expect(line.oldMedian, line.text).toBeLessThan(4.5);
    }
  });

  it("alle 13 Zeilen erreichen mit dem neuen Index >= 4.5", () => {
    for (const line of LINES) {
      const r = ratio(lum(PAL[line.neu]), backdropOf(line));
      expect(r, `${line.file}: "${line.text}" neu=${line.neu} ratio=${r}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("die Quelldateien verwenden die neuen Farb-Indices (kein fog/mist mehr an den Zeilen)", () => {
    for (const line of LINES) {
      const all: string[] = src(line.file).split("\n");
      const anchor = line.srcText ?? line.text;
      const idx = all.findIndex((l: string) => l.includes(anchor));
      expect(idx, `${line.file}: "${anchor}" gefunden?`).toBeGreaterThanOrEqual(0);
      // PixelText-Aufrufe koennen ueber zwei Zeilen gehen (Farbe in Zeile 2).
      const block = `${all[idx]} ${all[idx + 1] ?? ""}`;
      expect(block, `${line.file}: "${anchor}" → C.bone/C.paleMist`).toMatch(/C\.(bone|paleMist)/);
      expect(block, `${line.file}: "${anchor}" ohne alt-Farbe`).not.toMatch(/C\.(fog|mist)\b/);
    }
  });
});

/** Rechteck-Intersection wie im Scan (positiver Schnitt). */
function intersectH(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function num(re: RegExp, file: string, what: string): number {
  const m = re.exec(src(file));
  expect(m, `${file}: ${what} nicht gefunden`).not.toBeNull();
  return Number(m![1]);
}

describe("m10-menu-contrast-fixes: Overlap-Regression (Footer ↔ Title-Hint, KAEL ↔ Knopfreihe)", () => {
  const footerY = num(/H - (\d+), "OPTIONEN GELTEN SOFORT/, "src/ui/options-menu.ts", "Footer-y");
  const hintYs = [38, 28, 18].map(
    (n) => num(new RegExp(`H - (\\d+), "[^"]*(?:WASD|MAUS ODER|ESC = PAUSE)`), "src/scenes/Title.ts", `Hint ${n}`),
  );

  it("Options-Footer schneidet keine Title-Hint-Zeile (vorher 465 px²)", () => {
    for (const H of [360, 540]) {
      const f0 = H - footerY, f1 = H - footerY + 7; // Glyph-Höhe 7 (font.ts)
      for (const hy of hintYs) {
        const h0 = H - hy, h1 = H - hy + 7;
        const ov = intersectH(f0, f1, h0, h1);
        expect(ov, `H=${H}: Footer(H-${footerY}) vs Hint(H-${hy})`).toBeLessThanOrEqual(0);
      }
    }
  });

  it("Options-Footer hält >= 4 px Luft zur obersten Hint-Zeile", () => {
    const H = 360;
    const topHint = Math.min(...hintYs.map((hy) => H - hy));
    expect(H - footerY + 7).toBeLessThanOrEqual(topHint - 4);
  });

  it("KAEL-Zeile hält >= 4 px Luft zum oberen Knopf-Rahmen (vorher 2 px)", () => {
    // m10-title-bestwert-spacing: die Anker liegen jetzt in titleStatsLayout()
    // (Title.ts) — der Test liest sie von dort statt aus den PixelText-Aufrufen.
    const kaelY = num(/const kaelY = (\d+);/, "src/scenes/Title.ts", "KAEL-y (titleStatsLayout)");
    const buttonY = num(/const buttonsY = (\d+);/, "src/scenes/Title.ts", "Knopf-y (titleStatsLayout)");
    // Rahmen-Top = Knopf-Mitte - 12 (Höhe 22 + 1 px Outline), Text-Bottom = y + 7.
    for (const oy of [45, 135]) {
      const gap = buttonY + oy - 12 - (kaelY + oy + 7);
      expect(gap, `oy=${oy}: Gap ${gap}px`).toBeGreaterThanOrEqual(4);
    }
  });
});
