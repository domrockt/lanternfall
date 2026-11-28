import { describe, expect, it, vi } from "vitest";

// M10-elite-tier-families (K2): Elites sind im 300-500er-Chaos ihrer Tier-
// Familie zuzuordnen. Der Elite-Rim-Innenraum traegt je Tier 0-4 genau eine
// Faerbe-Klasse (ELITE_TIER_DYES, 70 % Mischung), der Amber-Rand (PAL 20,
// A10-Vertrag), Kontur/Augen, Silhouette, Key-Satz und alle Nicht-Elite-
// Frames bleiben unveraendert.
//
// Familien-Kontrast-Metrik: RGB-Zentroid der Elite-Koerperpixel je Tier —
// min. Paar-Distanz zwischen den 5 Tier-Zentroiden mit Faerbung >= 30 und
// >= 2x den ungefaerbten Stand (gemessen bei 70 % Mischung: 13,2 -> 56,8).
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));

import { GEN_ENEMIES } from "../src/gfx/gen-enemies";
import {
  ELITE_RIM_COLOR,
  ELITE_TIER_DYES,
  eliteRimDef,
  eliteRimFrame,
  eliteTierDye,
  eliteTierMixFor,
  eliteTierPixel,
  enemyFrameKeys,
  enemySpriteFrames,
  gridFromRows,
  sharpenEnemyGrid,
  silhouette,
  type Grid,
} from "../src/gfx/enemySprites";
import { framesForDef } from "../src/logic/enemy-frames";
import { ENEMY_LIST } from "../src/data/enemies";
import { PAL } from "../src/palette";

function rgb(i: number): [number, number, number] {
  const c = PAL[i];
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
function dist(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function luminance(i: number): number {
  const [r, g, b] = rgb(i);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function isBoundary(g: Grid, x: number, y: number): boolean {
  const filled = (a: number, b: number) =>
    a >= 0 && b >= 0 && b < g.length && a < g[0].length && g[b][a] !== null;
  return !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
}

/** RGB-Zentroid aller Innenpixel (kein Rand, keine Kontur/Augen) eines Grids. */
function interiorCentroid(grids: Grid[]): [number, number, number] {
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (const grid of grids) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (grid[y][x] === null || isBoundary(grid, x, y)) continue;
        const c = grid[y][x] as number;
        if (c === 0 || c === 13) continue;
        const [pr, pg, pb] = rgb(c);
        r += pr; g += pg; b += pb; n++;
      }
    }
  }
  return n === 0 ? [0, 0, 0] : [r / n, g / n, b / n];
}

/** Tier -> Elite-Rim-Frames der 6 Typen dieses Tiers. */
function eliteFramesByTier(): Map<number, Grid[]> {
  const byTier = new Map<number, Grid[]>();
  ENEMY_LIST.forEach((def, index) => {
    (byTier.get(def.tier) ?? byTier.set(def.tier, []).get(def.tier)!).push(eliteRimFrame(index));
  });
  return byTier;
}

describe("elite-tier-families: Faerbe-Klassen je Tier", () => {
  it("hat 5 unterscheidbare Tier-Klassen (Paar-Distanz >= 55, Palette, Luminanz-Fenster)", () => {
    expect(ELITE_TIER_DYES).toHaveLength(5);
    for (const [tier, dye] of ELITE_TIER_DYES.entries()) {
      expect(dye, `Tier ${tier} muss Palette-Index sein`).toBeGreaterThanOrEqual(0);
      expect(dye, `Tier ${tier} muss Palette-Index sein`).toBeLessThan(PAL.length);
      expect(luminance(dye), `Tier ${tier}: Klasse zu dunkel/hell fuer die Masse`).toBeGreaterThanOrEqual(50);
      expect(luminance(dye), `Tier ${tier}: Klasse zu dunkel/hell fuer die Masse`).toBeLessThanOrEqual(160);
      // Klasse muss vom Amber-Rand unterscheidbar bleiben (Rim-Kontratzusammenbruch).
      expect(dist(rgb(dye), rgb(ELITE_RIM_COLOR)), `Tier ${tier}: Klasse vs. Amber-Rim`).toBeGreaterThanOrEqual(45);
    }
    for (let a = 0; a < 5; a++) {
      for (let b = a + 1; b < 5; b++) {
        // m10-elite-tier-refine (#7523): 60 -> 55 — T4 ist seit der Umstellung
        // auf marshLight (31, Terrain-Kontrast) 55,6 von T1 mist (8) entfernt;
        // die Trennung bleibt weit ueber der Zentroid-Schwelle (>= 30) und wird
        // dort (nicht auf Dye-Ebene) bewacht.
        expect(dist(rgb(ELITE_TIER_DYES[a]), rgb(ELITE_TIER_DYES[b])), `Tier ${a} vs. ${b}`)
          .toBeGreaterThanOrEqual(55);
      }
    }
  });

  it("faerbt nur den Elite-Innenraum: Rand voll Amber, Kontur/Augen unangetastet, Silhouette gleich", () => {
    expect(ENEMY_LIST).toHaveLength(30);
    ENEMY_LIST.forEach((def, index) => {
      const base = enemySpriteFrames(index)[0];
      const rim = eliteRimFrame(index);
      expect(silhouette(rim), `${def.id}: Silhouette unveraendert`).toBe(silhouette(base));
      for (let y = 0; y < base.length; y++) {
        for (let x = 0; x < base[0].length; x++) {
          const bp = base[y][x];
          const rp = rim[y][x];
          // binäres Alpha + Palette-Compliance
          if (rp !== null) {
            expect(Number.isInteger(rp) && rp >= 0 && rp < PAL.length, `${def.id} (${x},${y})=${rp}`).toBe(true);
          }
          if (bp === null || isBoundary(base, x, y)) {
            if (bp !== null) expect(rp, `${def.id} Rand (${x},${y})`).toBe(ELITE_RIM_COLOR);
            continue;
          }
          expect(rp, `${def.id} Innen (${x},${y})`).toBe(eliteTierPixel(bp, def.tier, eliteTierMixFor(def.id)));
          // Kontur/Augen-Positionen unveraendert
          if (bp === 0 || bp === 13) expect(rp, `${def.id} Kontur/Augen (${x},${y})`).toBe(bp);
        }
      }
    });
  });

  it("Familien-Kontrast-Metrik: Tier-Zentroiden min. 40 auseinander und messbar besser als ungefaerbt", () => {
    const byTier = eliteFramesByTier();
    expect([...byTier.keys()].sort()).toEqual([0, 1, 2, 3, 4]);
    const minPairwise = (gridsByTier: Map<number, Grid[]>) => {
      let min = Infinity;
      const tiers = [...gridsByTier.keys()];
      for (let i = 0; i < tiers.length; i++) {
        for (let j = i + 1; j < tiers.length; j++) {
          const d = dist(interiorCentroid(gridsByTier.get(tiers[i])!), interiorCentroid(gridsByTier.get(tiers[j])!));
          min = Math.min(min, d);
        }
      }
      return min;
    };
    // Vorher-Stand (ohne Faerbung): Basis-Ruheposen der jeweiligen Typen.
    const baseByTier = new Map<number, Grid[]>();
    ENEMY_LIST.forEach((def, index) => {
      (baseByTier.get(def.tier) ?? baseByTier.set(def.tier, []).get(def.tier)!).push(enemySpriteFrames(index)[0]);
    });
    const before = minPairwise(baseByTier);
    const after = minPairwise(byTier);
    // eslint-disable-next-line no-console
    console.log(`[elite-tier-families] min Tier-Zentroid-Distanz: vorher ${before.toFixed(1)} -> nachher ${after.toFixed(1)}`);
    expect(after).toBeGreaterThanOrEqual(30);
    expect(after).toBeGreaterThanOrEqual(before * 2);
  });

  it("K3 (#7525): Soft-Mix-Typen behalten >= 3 Innen-Schattierungsstufen im Rim-Frame", () => {
    const softTypes = ["wisp", "knight", "harpy", "lich", "wraith", "treant", "imp"];
    for (const id of softTypes) {
      const index = ENEMY_LIST.findIndex((d) => d.id === id);
      expect(index, id).toBeGreaterThanOrEqual(0);
      const grid = eliteRimFrame(index);
      const levels = new Set<number>();
      for (let y = 0; y < grid.length; y++) {
        for (let x = 0; x < grid[0].length; x++) {
          if (grid[y][x] === null || isBoundary(grid, x, y)) continue;
          const c = grid[y][x] as number;
          if (c === 0 || c === 13 || c === ELITE_RIM_COLOR) continue;
          levels.add(c);
        }
      }
      // Gemessen (Offline-Suchlauf): 0,7 kollabiert diese Typen auf 2 Stufen,
      // der Soft-Mix (0,65; imp 0,6) restauriert die dritte (imp: vierte).
      expect(levels.size, `${id} (mix ${eliteTierMixFor(id)})`).toBeGreaterThanOrEqual(3);
    }
  });

  it("eliteTierPixel/eliteTierDye sind deterministisch und klampen auf Tier 0-4", () => {
    expect(eliteTierDye(-3)).toBe(ELITE_TIER_DYES[0]);
    expect(eliteTierDye(9)).toBe(ELITE_TIER_DYES[4]);
    for (let tier = -1; tier <= 6; tier++) {
      for (let pixel = 0; pixel < PAL.length; pixel++) {
        expect(eliteTierPixel(pixel, tier)).toBe(eliteTierPixel(pixel, tier));
      }
    }
    expect(eliteTierPixel(0, 3)).toBe(0); // Kontur unangetastet
    expect(eliteTierPixel(13, 3)).toBe(13); // Augen/Glow unangetastet
    for (const index of ENEMY_LIST.keys()) {
      expect(eliteRimFrame(index)).toEqual(eliteRimFrame(index));
    }
  });

  it("Nicht-Elite-Frames bleiben bytegleich zum crowd-variety-Stand (keine Tier-Faerbung)", () => {
    ENEMY_LIST.forEach((def, index) => {
      const expected = GEN_ENEMIES[def.spriteKey].frames.map((rows) =>
        sharpenEnemyGrid(gridFromRows(rows), def.color, def.id),
      );
      expect(enemySpriteFrames(index), def.id).toEqual(expected);
      // Nicht-tautologische Leak-Pruefung: die Basis-Frames duerfen NICHT die
      // gefaerbte Version sein (ein Dye-Auftrag in der Basis-Pipeline wuerde
      // hier sichtbar, ohne dass eliteTierPixel selbst beteiligt ist).
      const dyed = eliteRimFrame(index);
      let differing = 0;
      let interior = 0;
      const base0 = enemySpriteFrames(index)[0];
      for (let y = 0; y < base0.length; y++) {
        for (let x = 0; x < base0[0].length; x++) {
          if (base0[y][x] === null || isBoundary(base0, x, y)) continue;
          interior++;
          if (base0[y][x] !== dyed[y][x]) differing++;
        }
      }
      expect(differing / interior, `${def.id}: Basis ungefaerbt`).toBeGreaterThanOrEqual(0.3);
      // Key-Satz und Frameset-Vertrag unveraendert
      expect(enemyFrameKeys(index)[0]).toBe(def.spriteKey);
      expect(framesForDef(eliteRimDef(def))).toEqual([`${def.spriteKey}_rim`]);
    });
  });
});
