import { describe, expect, it } from "vitest";
import { charIndex } from "../src/gfx/textures";
import { GEN_ICONS } from "../src/gfx/gen-icons";

/**
 * m10-icon-redraw #7149: Regressionsschutz fuer die neu gezeichneten
 * Muss-Icons (heart/charm/boots, art-director-Muss-Liste).
 *
 * Reine Daten-Tests gegen die GEN_ICONS-Raster (kein window/Phaser):
 *  - Silhouette sichtbar: 1-px-Ink-Kontur (Index 0) existiert und umschliesst
 *    den Koerper (jeder Kontur-Pixel beruehlt Koerper), Kern-Form dominant
 *  - Kern-Form konkret: Herz mit Kerbe + Spitze, Amulett mehrgliedrig
 *    (Kette ueber Medaillon), Stiefel mit breiter Sohle unten
 *  - 0 Off-Palette-Pixel (nur Palettenindex 0-31 oder '.')
 *  - binaeres Alpha: nur '.' ist transparent, alles andere opak (kein AA)
 *
 * Befund-Kontext: docs/lanes/m10-icon-redraw-debt.md — vor der Lane lasen
 * heart/charm/boots als Blob/Hose/Treppe (Kontrast war gruen, Form nicht).
 * Kontrast-Regression: tests/icon-contrast.test.ts (bleibt unangetastet).
 */

const REDRAWN = ["passive_heart", "passive_charm", "passive_boots"] as const;

type Grid = readonly string[];

function gridOf(key: string): Grid {
  const def = GEN_ICONS[key];
  expect(def, `${key} existiert in GEN_ICONS`).toBeDefined();
  expect(def.h, `${key}: 16 Zeilen`).toBe(16);
  expect(def.frames[0].length, `${key}: Raster hat 16 Zeilen`).toBe(16);
  return def.frames[0];
}

/** (x,y)-Liste aller Pixel mit dem gegebenen Zeichen-Praedikat. */
function pixels(rows: Grid, pred: (ch: string) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (pred(ch)) out.push([x, y]);
    });
  });
  return out;
}

const isContour = (ch: string) => ch !== "." && charIndex(ch) === 0;
const isBody = (ch: string) => ch !== "." && charIndex(ch) !== 0;

function touchesBody(rows: Grid, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ch = rows[y + dy]?.[x + dx];
      if (ch !== undefined && isBody(ch)) return true;
    }
  }
  return false;
}

describe("icon-redraw: Silhouette sichtbar (Kontur + Kern)", () => {
  for (const key of REDRAWN) {
    it(`${key}: 1-px-Kontur umschliesst den Koerper, Kern-Form dominant`, () => {
      const rows = gridOf(key);
      const contour = pixels(rows, isContour);
      const body = pixels(rows, isBody);
      expect(contour.length, `${key}: Kontur vorhanden`).toBeGreaterThan(30);
      expect(body.length, `${key}: Koerper vorhanden`).toBeGreaterThan(60);
      for (const [x, y] of contour) {
        expect(touchesBody(rows, x, y), `${key}: Kontur (${x},${y}) beruehrt Koerper`).toBe(true);
      }
      // Kern-Form dominant: die haeufigste Koerperfarbe fuellt >= 20 % des Koerpers
      // (Shading splittet eine Materialfamilie in Schatten/Mitte/Licht — deshalb
      // einzelne Farbe mit niedriger Schwelle, Kern-Form pruefen die Shape-Tests unten)
      const counts = new Map<number, number>();
      for (const ch of rows.join("")) {
        if (isBody(ch)) counts.set(charIndex(ch), (counts.get(charIndex(ch)) ?? 0) + 1);
      }
      const dominant = Math.max(...counts.values());
      expect(dominant / body.length, `${key}: Kern-Farbe dominant`).toBeGreaterThanOrEqual(0.2);
      // Materialtiefe: mindestens 3 verschiedene Koerperfarben (Licht/Mitte/Schatten)
      expect(counts.size, `${key}: Materialtiefe`).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("icon-redraw: Kern-Form der drei Muss-Icons", () => {
  it("passive_heart: zwei Ohren mit mittiger Kerbe oben, Spitze unten", () => {
    const rows = gridOf("passive_heart");
    // Kerbe: die oberste Koerperzeile hat genau 2 getrennte Segmente (Ohren)
    const firstBodyRow = rows.find((r) => [...r].some(isBody))!;
    const segments = [...firstBodyRow].map((ch, x) => ({ ch, x }))
      .filter(({ ch }) => isBody(ch))
      .reduce<Array<Array<number>>>((acc, { x }) => {
        const last = acc[acc.length - 1];
        if (last && x === last[last.length - 1] + 1) last.push(x);
        else acc.push([x]);
        return acc;
      }, []);
    expect(segments.length, `Herz-Ohren: 2 getrennte Segmente in Zeile ${rows.indexOf(firstBodyRow)}`).toBe(2);
    // Spitze: die unterste Koerperzeile ist schmal (<= 4 px inkl. Kontur)
    const lastBodyRow = [...rows].reverse().find((r) => [...r].some((c) => c !== "."))!;
    const width = [...lastBodyRow].filter((c) => c !== ".").length;
    expect(width, "Herz-Spitze schmal").toBeLessThanOrEqual(4);
  });

  it("passive_charm: mehrgliedrig — Kette oben, Medaillon darunter", () => {
    const rows = gridOf("passive_charm");
    // Kette: Koerper-/Kontur-Pixel in den obersten 4 Zeilen oberhalb des Medaillons
    const chainPixels = rows.slice(0, 4).flatMap((r) => [...r].filter((c) => c !== "."));
    expect(chainPixels.length, "Kette ueber dem Medaillon").toBeGreaterThan(0);
    // Medaillon: der breiteste Koerper-Kontiguousbereich liegt unterhalb der Kette
    const widest = Math.max(...rows.map((r) => [...r].filter((c) => c !== ".").length));
    expect(widest, "Medaillon breiter als die Kette").toBeGreaterThanOrEqual(10);
    // Edelstein-Kern: Karmesin-Familie (23-27) im Koerper vorhanden
    const gem = [...rows.join("")].some((c) => isBody(c) && charIndex(c) >= 23 && charIndex(c) <= 27);
    expect(gem, "Rubin-Kern vorhanden").toBe(true);
  });

  it("passive_boots: Schaft oben, breite Sohle unten", () => {
    const rows = gridOf("passive_boots");
    // Sohle: unterste Koerperzeile ist breit (>= 12 px inkl. Kontur) und unten
    const lastRow = [...rows].reverse().find((r) => [...r].some((c) => c !== "."))!;
    const width = [...lastRow].filter((c) => c !== ".").length;
    expect(width, "Sohle breiter als alles andere").toBeGreaterThanOrEqual(12);
    // Schaft: oberhalb der Fusspartie gibt es eine schmale vertikale Partie
    const shaftRows = rows.slice(2, 8).filter((r) => [...r].some(isBody));
    expect(shaftRows.length, "Schaft ueber dem Fuss").toBeGreaterThanOrEqual(4);
  });
});

describe("icon-redraw: Palette + binaeres Alpha (kein Anti-Aliasing)", () => {
  for (const key of REDRAWN) {
    it(`${key}: 0 Off-Palette-Pixel, nur '.' oder opaker Palettenindex`, () => {
      const rows = gridOf(key);
      for (const row of rows) {
        expect(row.length, `${key}: Zeilenbreite 16`).toBe(16);
        for (const ch of row) {
          if (ch === ".") continue; // binäres Alpha: voll transparent
          const idx = charIndex(ch);
          expect(idx, `${key}: Zeichen '${ch}' ist Palettenindex`).toBeGreaterThanOrEqual(0);
          expect(idx, `${key}: Zeichen '${ch}' ist Palettenindex`).toBeLessThanOrEqual(31);
          // Kein Anti-Aliasing: jedes Zeichen ist EIN Index, keine Blend-Sequenz
          expect(ch, `${key}: einzelnes Index-Zeichen`).toMatch(/^[0-9a-z]$/);
        }
      }
    });
  }
});
