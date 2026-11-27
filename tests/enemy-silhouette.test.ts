import { describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));
import { ENEMY_LIST } from "../src/data/enemies";
import { enemySpriteFrames } from "../src/gfx/enemySprites";
import { PAL } from "../src/palette";
import { eliteMarkerSpec, eliteMarkerTint, NORMAL_MARKER_SPEC } from "../src/systems/EnemyPool";
import type { Grid } from "../src/gfx/enemySprites";

/**
 * Shape-Signatur eines Archetyps (K4). Bewusst mehrere, voneinander
 * unabhängige Dimensionen: Breite, Höhe, Füllgrad und Kantenprofil. Zwei
 * Archetypen gelten als unterscheidbar, wenn sie sich in mindestens zwei
 * Dimensionen messbar unterscheiden.
 */
interface ShapeSignature {
  width: number;
  height: number;
  fill: number;
  topWidth: number;
  bottomWidth: number;
  edgeRatio: number;
}

function luminance(i: number): number {
  const c = PAL[i];
  return 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
}

function shapeSignature(grid: Grid): ShapeSignature {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  let filled = 0;
  let boundary = 0;
  const filledAt = (x: number, y: number): boolean =>
    x >= 0 && x < w && y >= 0 && y < h && grid[y][x] !== null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] === null) continue;
      filled++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (!filledAt(x - 1, y) || !filledAt(x + 1, y) || !filledAt(x, y - 1) || !filledAt(x, y + 1)) {
        boundary++;
      }
    }
  }
  if (filled === 0) throw new Error("leere Silhouette");
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  let topWidth = 0;
  let bottomWidth = 0;
  for (let x = minX; x <= maxX; x++) {
    if (filledAt(x, minY)) topWidth++;
    if (filledAt(x, maxY)) bottomWidth++;
  }
  return {
    width,
    height,
    fill: filled / (width * height),
    topWidth,
    bottomWidth,
    edgeRatio: boundary / filled,
  };
}

function dimensionsDiffering(a: ShapeSignature, b: ShapeSignature): number {
  let n = 0;
  if (Math.abs(a.width - b.width) >= 1) n++;
  if (Math.abs(a.height - b.height) >= 1) n++;
  if (Math.abs(a.fill - b.fill) >= 0.02) n++;
  if (Math.abs(a.topWidth - b.topWidth) >= 1) n++;
  if (Math.abs(a.bottomWidth - b.bottomWidth) >= 1) n++;
  if (Math.abs(a.edgeRatio - b.edgeRatio) >= 0.02) n++;
  return n;
}

/**
 * Kantenkontrast: maximale Luminanzdifferenz der Randpixel gegen den dunklen
 * Moorboden (PAL 28) – belegt, dass jede Silhouette eine lesbare Lichtkante
 * besitzt – und mittlerer Kontrast gegen helles Moor (PAL 31).
 */
function edgeContrast(grid: Grid): { maxDark: number; meanLight: number } {
  const dark = luminance(28);
  const light = luminance(31);
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  let maxDark = 0;
  let sumLight = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] === null) continue;
      const lum = luminance(grid[y][x] as number);
      maxDark = Math.max(maxDark, Math.abs(lum - dark));
      sumLight += Math.abs(lum - light);
      n++;
    }
  }
  return { maxDark, meanLight: n === 0 ? 0 : sumLight / n };
}

/** Rim-Band-Metrik (Randpixel + 1 px innen) gegen dunklen Moorboden PAL 28. */
function rimStats(grid: Grid): { lightPct: number; belowPct: number } {
  const dark = luminance(28);
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const filled = (x: number, y: number): boolean =>
    x >= 0 && x < w && y >= 0 && y < h && grid[y][x] !== null;
  let light = 0;
  let below = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] === null) continue;
      const boundary = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
      const near = !boundary && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1));
      if (!boundary && !near) continue;
      n++;
      const lum = luminance(grid[y][x] as number);
      if (lum >= 70) light++;
      if (Math.abs(lum - dark) < 40) below++;
    }
  }
  return { lightPct: (100 * light) / (n || 1), belowPct: (100 * below) / (n || 1) };
}

describe("30 Gegner-Archetypen: Silhouetten im Chaos unterscheidbar", () => {
  it("hat 30 Archetypen als Testbasis", () => {
    expect(ENEMY_LIST).toHaveLength(30);
  });

  it("jede Silhouette hat >=2 unterscheidende Shape-Dimensionen zu jeder anderen", () => {
    const sigs = ENEMY_LIST.map((def, i) => ({ id: def.id, sig: shapeSignature(enemySpriteFrames(i)[0]) }));
    const failures: string[] = [];
    for (let i = 0; i < sigs.length; i++) {
      for (let j = i + 1; j < sigs.length; j++) {
        const dims = dimensionsDiffering(sigs[i].sig, sigs[j].sig);
        if (dims < 2) failures.push(`${sigs[i].id} vs ${sigs[j].id}: nur ${dims} Dimension(en)`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("Randkontrast jeder Silhouette > Schwelle 40 (Lichtkante dunkel, Mittel hell)", () => {
    const low: string[] = [];
    ENEMY_LIST.forEach((def, i) => {
      const c = edgeContrast(enemySpriteFrames(i)[0]);
      if (c.maxDark <= 40) low.push(`${def.id}: maxDark ${c.maxDark.toFixed(1)}`);
      if (c.meanLight <= 40) low.push(`${def.id}: meanLight ${c.meanLight.toFixed(1)}`);
    });
    expect(low, low.join("\n")).toEqual([]);
  });

  it("Elite-Marker-Spezifikation weicht messbar von Normal ab", () => {
    const elite = eliteMarkerSpec(8);
    const normal = NORMAL_MARKER_SPEC;
    expect(elite.alpha).toBeGreaterThan(normal.alpha + 0.5);
    expect(elite.rimPx).toBeGreaterThan(normal.rimPx);
    expect(elite.color).not.toBe(normal.color);
    expect(eliteMarkerTint()).toBe(PAL[elite.color]);
    // Nur Elite: Breite/Alpha deterministisch aus dem Radius, kein Flackern.
    expect(eliteMarkerSpec(8)).toEqual(eliteMarkerSpec(8));
    expect(elite.scale).toBeGreaterThan(1);
  });

  it("ist deterministisch: zwei Läufe liefern identische Signaturen", () => {
    const run = () => ENEMY_LIST.map((_def, i) => shapeSignature(enemySpriteFrames(i)[0]));
    expect(run()).toEqual(run());
  });

  it("art-director-Problemfälle 27.11.: treant/golem/bog_rat/wisp/imp/crow lesbar", () => {
    const find = (id: string) => rimStats(enemySpriteFrames(ENEMY_LIST.findIndex((e) => e.id === id))[0]);
    // treant: obere Kante hell (12) + Mitteltöne (17) → mittlerer Randkontrast > 40.
    expect(edgeContrast(enemySpriteFrames(ENEMY_LIST.findIndex((e) => e.id === "treant"))[0]).maxDark).toBeGreaterThan(40);
    // golem/bog_rat: Mitteltöne 7/8, Kontur PAL 0 → Rim > 50 % hell, < 45 % unter Schwelle.
    for (const id of ["golem", "bog_rat"]) {
      const r = find(id);
      expect(r.lightPct, id).toBeGreaterThan(50);
      expect(r.belowPct, id).toBeLessThan(45);
    }
    // wisp/imp/crow: Lichtkante über den gesamten oberen Bogen.
    for (const id of ["wisp", "imp", "crow"]) {
      expect(find(id).lightPct, id).toBeGreaterThan(40);
    }
    // Gesamtmittel: unter der Kontrastschwelle < 45 %.
    const all = ENEMY_LIST.map((_d, i) => rimStats(enemySpriteFrames(i)[0]));
    const below = all.reduce((a, r) => a + r.belowPct, 0) / all.length;
    expect(below).toBeLessThan(45);
  });
});
