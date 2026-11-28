import { describe, expect, it, vi } from "vitest";

// M10-crowd-variant-tone (#7327): Variantenton skeleton/centipede/harpy & Co.
// kraeftig trennen. Vorher-Befund (shots/m10-crowd-tone-before.json): 21/30
// Typ-Paare mit RGB-Distanz < 60 zwischen Basis- und Varianten-Koerper-Mittel-
// ton. Der Fix mischt schwache Typen zu 80 % Richtung Familien-Gegenton.
// Guard: die Distanz bleibt dauerhaft ueber der Zielmarke — ohne Silhouette-,
// Framezahl- oder Key-Aenderungen (Vertraege aus tests/crowd-variety.test.ts).
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));

import { ENEMY_LIST } from "../src/data/enemies";
import {
  enemyFrameGrids,
  enemyFrameKeys,
  enemySpriteFrames,
  enemyVariantColor,
  enemyVariantTone,
  type Grid,
} from "../src/gfx/enemySprites";
import { PAL } from "../src/palette";

/** Zielmarke (Befund #7327, fixiert): RGB-Distanz Basis-Mittelton vs. Varianten-Mittelton. */
const MIN_RGB_DIST = 60;
/** Kollisionsmarke: Varianten-Mittelton darf keiner fremden Typ-Basis nahekommen. */
const MIN_CROSS_DIST = 40;

function rgb(i: number): [number, number, number] {
  return [(PAL[i] >> 16) & 255, (PAL[i] >> 8) & 255, PAL[i] & 255];
}

function luminance([r, g, b]: readonly number[]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbDist(a: readonly number[], b: readonly number[]): number {
  return Math.round(Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) * 10) / 10;
}

/** Koerper-Mittelton: Mittel-RGB aller Pixel ohne Kontur (0) und Augen/Glow (13). */
function bodyMean(grid: Grid): [number, number, number] {
  const sum = [0, 0, 0];
  let n = 0;
  for (const row of grid) {
    for (const c of row) {
      if (c === null || c === 0 || c === 13) continue;
      const [r, g, b] = rgb(c);
      sum[0] += r; sum[1] += g; sum[2] += b;
      n++;
    }
  }
  expect(n, "Frame muss Koerperpixel haben").toBeGreaterThan(0);
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

function silhouette(grid: Grid): string {
  return grid.map((row) => row.map((p) => (p === null ? "." : "#")).join("")).join("\n");
}

describe("crowd-variant-tone: kraeftig getrennte Variantentoene (#7327)", () => {
  // bog_rat/wisp/bogzombie: textures.ts (SPRITE_GRIDS/SPRITE_FRAMES) ueberschreibt
  // die generierten Frames mit handgezeichneten 2-Frame-Sets — deren Varianten-
  // Frames (2/3) werden im Spiel nie angezeigt (Vorher-Messung hatte fuer sie
  // verzerrte Atlas-Werte). Distanz-Guard gilt für die 27 gerenderten Typen.
  const HAND_DRAWN = new Set(["enemy_bog_rat", "enemy_wisp", "enemy_bogzombie"]);
  const rendered = ENEMY_LIST.map((def, i) => ({ def, i })).filter(({ def }) => !HAND_DRAWN.has(def.spriteKey));
  const baseMeans = ENEMY_LIST.map((_, i) => bodyMean(enemyFrameGrids(i)[0]));
  const variantMeans = ENEMY_LIST.map((_, i) => bodyMean(enemyFrameGrids(i)[2]));

  it("hat je Typ RGB-Distanz >= 60 zwischen Basis- und Varianten-Mittelton (Zielmarke Befund #7327)", () => {
    for (const { def, i } of rendered) {
      const d = rgbDist(baseMeans[i], variantMeans[i]);
      expect(d, `${def.id}: Basis vs. Varianten-Mittelton (rgbDist=${d})`).toBeGreaterThanOrEqual(MIN_RGB_DIST);
    }
  });

  it("hat je Typ eine klare Helligkeits- oder Farb-Lage-Verschiebung (Luminanz- oder Hue-Sprung)", () => {
    for (const { def, i } of rendered) {
      const dl = Math.round(Math.abs(luminance(baseMeans[i]) - luminance(variantMeans[i])) * 10) / 10;
      const dr = rgbDist(baseMeans[i], variantMeans[i]);
      // Entweder deutliche Helligkeits-Lage oder deutliche RGB-Lage (Hue versetzt).
      expect(dl >= 20 || dr >= MIN_RGB_DIST, `${def.id}: dl=${dl} dr=${dr}`).toBe(true);
    }
  });

  it("umgefärbte Varianten kollidieren nicht mit fremden Typ-Basen (>= 40 RGB)", () => {
    // Nur die durch #7327 umgefärbten Typen werden bewacht; Vorher-Bestand
    // (z. B. crow-Rampenvariante nahe mudling-Basis, 24.2) bleibt unangetastet.
    for (const { def, i } of rendered) {
      if (enemyVariantTone(i) === enemyVariantColor(i)) continue;
      for (const { def: other, i: j } of rendered) {
        if (i === j) continue;
        const d = rgbDist(variantMeans[i], baseMeans[j]);
        expect(d, `${def.id}: Variante vs. Basis von ${other.id} (rgbDist=${d})`)
          .toBeGreaterThanOrEqual(MIN_CROSS_DIST);
      }
    }
  });

  it("laesst Silhouetten, Key-Satz und Framezahl unveraendert (Vertraege aus crowd-variety)", () => {
    for (const [index, def] of ENEMY_LIST.entries()) {
      const keys = enemyFrameKeys(index);
      expect(keys).toHaveLength(4);
      expect(keys[0]).toBe(def.spriteKey);
      const grids = enemyFrameGrids(index);
      expect(grids).toHaveLength(4);
      const baseFrames = enemySpriteFrames(index);
      expect(silhouette(grids[2]), `${def.id}: Silhouette Pose 2`).toBe(silhouette(baseFrames[2]));
      expect(silhouette(grids[3]), `${def.id}: Silhouette Pose 3`).toBe(silhouette(baseFrames[3]));
    }
  });

  it("bleibt palettetreu mit binärem Alpha in allen Frames", () => {
    for (const [index] of ENEMY_LIST.entries()) {
      for (const grid of enemyFrameGrids(index)) {
        for (const row of grid) {
          for (const c of row) {
            if (c === null) continue;
            expect(Number.isInteger(c) && c >= 0 && c < PAL.length, `Pixel ${c}`).toBe(true);
          }
        }
      }
    }
  });

  it("Varianten-Zielton ist deterministisch und ein gueltiger Palette-Index", () => {
    for (const index of ENEMY_LIST.keys()) {
      const t = enemyVariantTone(index);
      expect(enemyVariantTone(index)).toBe(t);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(PAL.length);
    }
  });
});
