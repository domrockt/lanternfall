import { describe, expect, it, vi } from "vitest";

// M10-crowd-variety: zweite Ton-/Detail-Variante je Gegnertyp.
// Befund: die Gegnermasse (Minute 30, 300-500 Gegner) wirkt geklont, weil alle
// Instanzen eines Typs denselben Ton tragen. Der Fix registriert Frames 2/3
// jedes Typs in einer Varianten-Tonstufe (Familien-Rampe, gleiche Silhouette).
// Instanz-Auswahl bleibt unverändert: die Lauf-Phase streut die Instanzen über
// die 4 Frame-Keys (framesForDef/runFrameIndex, Run.ts/EnemyPool unangetastet).
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));

import { ENEMY_LIST } from "../src/data/enemies";
import { GEN_ENEMY_FAMILIES } from "../src/gfx/gen-enemies";
import {
  ELITE_RIM_FRAMES,
  eliteRimFrame,
  eliteRimFrameKey,
  enemyFrameGrids,
  enemyFrameKeys,
  enemySpriteFrames,
  enemyVariantColor,
  enemyVariantFrames,
  type Grid,
} from "../src/gfx/enemySprites";
import { PAL } from "../src/palette";
import { runFrameIndex } from "../src/logic/enemy-frames";

function luminance(i: number): number {
  const c = PAL[i];
  return 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
}

function silhouette(grid: Grid): string {
  return grid.map((row) => row.map((p) => (p === null ? "." : "#")).join("")).join("\n");
}

function pixelsDiffer(a: Grid, b: Grid): number {
  let diff = 0;
  let n = 0;
  for (let y = 0; y < a.length; y++) {
    for (let x = 0; x < a[0].length; x++) {
      n++;
      if (a[y][x] !== b[y][x]) diff++;
    }
  }
  return diff / n;
}

describe("crowd-variety: zweite Variante je Gegnertyp", () => {
  it("hat für alle 30 Typen eine Variantenfarbe aus der Familien-Rampe, die von der Basis abweicht", () => {
    expect(ENEMY_LIST).toHaveLength(30);
    for (const [index, def] of ENEMY_LIST.entries()) {
      const entry = GEN_ENEMY_FAMILIES[def.spriteKey];
      expect(entry, def.id).toBeDefined();
      const variant = enemyVariantColor(index);
      expect(PAL[variant], `${def.id}: Variantenfarbe muss Palette-Index sein`).toBeTypeOf("number");
      expect(entry.ramp, `${def.id}: Variante muss aus der Familien-Rampe kommen`).toContain(variant);
      expect(variant, `${def.id}: Variante muss sichtbar von der Basis abweichen`)
        .not.toBe(def.color);
    }
  });

  it("registriert >= 2 unterscheidbare Frames je Typ (Basis 0/1, Variante 2/3) bei unverändertem Key-Satz", () => {
    for (const [index, def] of ENEMY_LIST.entries()) {
      const keys = enemyFrameKeys(index);
      // Key-Satz unverändert (Atlas/framesForDef-Vertrag: 4 Keys, Key 0 = spriteKey).
      expect(keys).toHaveLength(4);
      expect(keys[0]).toBe(def.spriteKey);
      const grids = enemyFrameGrids(index);
      expect(grids).toHaveLength(4);
      // Variante (2/3) unterscheidet sich sichtbar von der Basis-Pose (>= 5 % Pixel).
      expect(pixelsDiffer(grids[0], grids[2]), `${def.id}: Basis vs. Variante`).toBeGreaterThanOrEqual(0.05);
      expect(pixelsDiffer(grids[1], grids[3]), `${def.id}: Basis-Bob vs. Variante-Bob`).toBeGreaterThanOrEqual(0.05);
      // Varianten-Posen stammen aus demselben Frame-Satz (gleiche Silhouette-Klasse).
      expect(silhouette(grids[2]), `${def.id}: Silhouette Pose 2`).toBe(silhouette(enemySpriteFrames(index)[2]));
      expect(silhouette(grids[3]), `${def.id}: Silhouette Pose 3`).toBe(silhouette(enemySpriteFrames(index)[3]));
    }
  });

  it("hält Palette + binäres Alpha in ALLEN registrierten Frames (Basis und Variante)", () => {
    for (const [index, def] of ENEMY_LIST.entries()) {
      [...enemyFrameGrids(index)].forEach((grid, fi) => {
        for (let y = 0; y < grid.length; y++) {
          for (let x = 0; x < grid[0].length; x++) {
            const c = grid[y][x];
            // binäres Alpha: nur null oder ganzzahliger Palettenindex
            if (c === null) continue;
            if (!Number.isInteger(c) || c < 0 || c >= PAL.length) {
              throw new Error(`${def.id} Frame ${fi}: Off-Palette-Pixel (${x},${y})=${c}`);
            }
          }
        }
      });
    }
  });

  it("Elite-Rim-Frames bleiben unveraendert (Rim aus Basis-Frame 0, Basis-Frame 0 unangetastet)", () => {
    for (const [index, def] of ENEMY_LIST.entries()) {
      // Rim-Key und Rim-Frame existieren und stammen aus der Basis-Ruhepose.
      expect(eliteRimFrameKey(index)).toBe(`${def.spriteKey}_rim`);
      expect(ELITE_RIM_FRAMES[`${def.id}_rim`]).toEqual([`${def.spriteKey}_rim`]);
      const rim = eliteRimFrame(index);
      const base0 = enemySpriteFrames(index)[0];
      // Rim = Vollumrandung der Basis-Silhouette: gleiche gefüllte Fläche.
      expect(silhouette(rim)).toBe(silhouette(base0));
      // Frame 0 im registrierten Satz ist weiterhin die Basis-Ruhepose.
      const grids = enemyFrameGrids(index);
      expect(grids[0]).toEqual(base0);
    }
  });

  it("Frame-Keys und Grids sind deterministisch (zweier Aufrufe identisch)", () => {
    for (const index of [0, 7, 15, 29]) {
      expect(enemyVariantColor(index)).toBe(enemyVariantColor(index));
      expect(enemyFrameGrids(index)).toEqual(enemyFrameGrids(index));
      expect(enemyVariantFrames(index)).toEqual(enemyVariantFrames(index));
    }
  });

  it("Instanz-Streuung: 200 Phasen zeigen im Frame >= 2 Keys je Typ (Basis UND Variante)", () => {
    // Wie im Spiel: framesForDef liefert 4 Keys, runFrameIndex wählt mit
    // zufälliger Spawn-Phase (Spawner.spawnAt: rng.next() * 2π). Ein 500er-
    // Frame streut die Instanzen über alle 4 Slots — hier als reine Funktion
    // mit festen Phasen nachgebildet (kein Phaser nötig).
    const t = 42.37; // fester Zeitpunkt
    for (const [index, def] of ENEMY_LIST.entries()) {
      const frames = enemyFrameKeys(index);
      const shown = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const phase = (i / 200) * Math.PI * 2;
        shown.add(frames[runFrameIndex(frames.length, t, phase)]);
      }
      // Abnahme: >= 2 unterscheidbare Texture-Keys je Typ im Frame.
      expect(shown.size, `${def.id}: Key-Vielfalt im Frame`).toBeGreaterThanOrEqual(2);
      // Basis-Ton (Slots 0/1) und Varianten-Ton (Slots 2/3) beide sichtbar.
      expect(shown.has(frames[0]) || shown.has(frames[1]), `${def.id}: Basis-Ton sichtbar`).toBe(true);
      expect(shown.has(frames[2]) || shown.has(frames[3]), `${def.id}: Varianten-Ton sichtbar`).toBe(true);
    }
  });
});
