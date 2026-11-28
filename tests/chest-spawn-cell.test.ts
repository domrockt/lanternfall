import { describe, expect, it, vi } from "vitest";
// ChestSystem importiert Phaser; die reine Spawn-Funktion braucht kein DOM.
vi.mock("phaser", () => ({ default: {} }));
import {
  CHEST_CELL_DENSITY_RADIUS_PX,
  CHEST_CELL_SEARCH_RADIUS_PX,
  CHEST_EDGE_MARGIN_PX,
  CHEST_SPAWN_TILE_PX,
  fairChestSpawn,
} from "../src/systems/ChestSystem";

const WORLD_SIZE = 16 * 256;
const nothingBlocked = () => false;

/** Dichte-Näherung: Gegner-Cluster im Radius r um (wx, wy). */
const clusterDensity = (wx: number, wy: number, r: number, n: number) =>
  (x: number, y: number): number => (Math.hypot(x - wx, y - wy) <= r ? n : 0);

/** Wasser-Disk um eine Position (Radius in px). */
const waterDisk = (wx: number, wy: number, radius: number) =>
  (x: number, y: number): boolean => Math.hypot(x - wx, y - wy) <= radius;

describe("M10 chest-spawn-cell: fairChestSpawn Dichte-Regel (r=64 px)", () => {
  it("Konstanten: Suchradius 64 px, Dichte-Radius 48 px, Raster 16 px", () => {
    expect(CHEST_CELL_SEARCH_RADIUS_PX).toBe(64);
    expect(CHEST_CELL_DENSITY_RADIUS_PX).toBe(48);
    expect(CHEST_CELL_SEARCH_RADIUS_PX % CHEST_SPAWN_TILE_PX).toBe(0);
  });

  it("Gegnermasse an der Spawn-Zelle: Zelle mit Dichte 0 in r=64 px gewinnt", () => {
    // Cluster (Dichte 5) im 32-px-Umfeld um (2000, 2000).
    const enemyCount = clusterDensity(2000, 2000, 32, 5);
    const r = fairChestSpawn(2000, 2000, { worldSize: WORLD_SIZE, isBlocked: nothingBlocked, enemyCount });
    expect(r.reason).toBe("cell");
    expect(r.density).toBe(0);
    expect(r.fromX).toBe(2000);
    expect(r.fromY).toBe(2000);
    // Suchen, nicht teleportieren: Bewegung <= Suchradius.
    expect(Math.hypot(r.x - 2000, r.y - 2000)).toBeLessThanOrEqual(CHEST_CELL_SEARCH_RADIUS_PX);
  });

  it("Gleichstand: naeherste Kandidaten-Zelle gewinnt", () => {
    // Dichte 0 links, 5 rechts vom Zentrum → naeherste Dichte-0-Zelle gewinnt.
    const enemyCount = (x: number, _y: number): number => (x < 2000 ? 0 : 5);
    const r = fairChestSpawn(2000, 2000, { worldSize: WORLD_SIZE, isBlocked: nothingBlocked, enemyCount });
    expect(r.reason).toBe("cell");
    expect(r.density).toBe(0);
    expect(r.x).toBe(2000 - CHEST_SPAWN_TILE_PX); // naeherste Dichte-0-Zelle: 16 px links
    expect(r.y).toBe(2000);
  });

  it("Fallback: kein Kandidat strikt besser (Dichte ueberall gleich) -> alte Position", () => {
    const enemyCount = () => 3;
    const r = fairChestSpawn(2000, 2000, { worldSize: WORLD_SIZE, isBlocked: nothingBlocked, enemyCount });
    expect(r.x).toBe(2000);
    expect(r.y).toBe(2000);
    expect(r.reason).toBe("free");
    expect(r.density).toBe(3);
  });

  it("Gleichstand mit Zentrum: Zentrum gewinnt (kein Move bei gleicher Dichte)", () => {
    // Alle Zellen (Zentrum + alle Kandidaten) haben Dichte 1 → keine strikte
    // Verbesserung, Position bleibt (Zentrum gewinnt den Gleichstand).
    const enemyCount = () => 1;
    const r = fairChestSpawn(2000, 2000, { worldSize: WORLD_SIZE, isBlocked: nothingBlocked, enemyCount });
    expect(r.reason).toBe("free");
  });

  it("Kreis-Filter: Kandidat jenseits von 64 px (Diagonale ~90 px) wird nicht gewählt", () => {
    // Dichte 0 NUR an der Quadratecke (dx=4, dy=4 → 90,5 px) — außerhalb des
    // Suchkreises. Die Regel darf dort nicht hinspringen (Box-Scan würde es).
    const enemyCount = (x: number, y: number): number =>
      (x === 2064 && y === 2064 ? 0 : 1);
    const r = fairChestSpawn(2000, 2000, { worldSize: WORLD_SIZE, isBlocked: nothingBlocked, enemyCount });
    expect(r.x).toBe(2000);
    expect(r.y).toBe(2000);
    expect(r.reason).toBe("free");
    expect(r.density).toBe(1);
  });

  it("ohne enemyCount: Verhalten bitgleich (density 0, reason free)", () => {
    const r = fairChestSpawn(2000, 2000, { worldSize: WORLD_SIZE, isBlocked: nothingBlocked });
    expect(r.x).toBe(2000);
    expect(r.y).toBe(2000);
    expect(r.reason).toBe("free");
    expect(r.density).toBe(0);
  });
});

describe("M10 chest-spawn-cell: Randfälle (Wasser/Kante)", () => {
  it("Wasser an der Spawn-Zelle: Spiral-Fallback zuerst, Dichte-Regel danach", () => {
    const enemyCount = clusterDensity(2000, 2000, 32, 5);
    const r = fairChestSpawn(2000, 2000, {
      worldSize: WORLD_SIZE,
      isBlocked: waterDisk(2000, 2000, 24),
      enemyCount,
    });
    // Wasser verdrängt zuerst (Spiralsuche), dann Dichte 0 in r=64 px um die
    // freie Zelle.
    expect(r.reason).toBe("cell");
    expect(r.density).toBe(0);
    expect(Math.hypot(r.x - 2000, r.y - 2000)).toBeLessThanOrEqual(24 + CHEST_CELL_SEARCH_RADIUS_PX);
  });

  it("Kandidaten im Wasser werden nicht gewählt (Köder-Zelle blockiert)", () => {
    // Dichte 0 ONLY im Wasser — die Regel darf nicht ins Wasser ausweichen.
    const enemyCount = (x: number, y: number): number =>
      Math.hypot(x - 2032, y - 2000) <= 8 ? 0 : 1;
    const r = fairChestSpawn(2000, 2000, {
      worldSize: WORLD_SIZE,
      isBlocked: waterDisk(2032, 2000, 8),
      enemyCount,
    });
    expect(r.x).toBe(2000);
    expect(r.y).toBe(2000);
    expect(r.reason).toBe("free");
    expect(r.density).toBe(1);
  });

  it("Kante: Dichte-Ausweich bleibt im Kanten-Margin", () => {
    // Spawn exakt am Margin (48, 2000); Dichte hoch in einer 16-px-Schale um
    // den Margin, 0 dahinter → Ausweich bleibt im Kanten-Margin.
    const enemyCount = (x: number, _y: number): number =>
      x < CHEST_EDGE_MARGIN_PX + CHEST_SPAWN_TILE_PX ? 9 : 0;
    const r = fairChestSpawn(CHEST_EDGE_MARGIN_PX, 2000, {
      worldSize: WORLD_SIZE,
      isBlocked: nothingBlocked,
      enemyCount,
    });
    expect(r.density).toBe(0);
    expect(r.x).toBeGreaterThanOrEqual(CHEST_EDGE_MARGIN_PX);
    expect(r.reason).toBe("cell");
  });

  it("Kante ohne Gegner: Kanten-Klemme unverändert (reason edge)", () => {
    const r = fairChestSpawn(20, 2000, {
      worldSize: WORLD_SIZE,
      isBlocked: nothingBlocked,
      enemyCount: () => 0,
    });
    expect(r.x).toBe(CHEST_EDGE_MARGIN_PX);
    expect(r.y).toBe(2000);
    expect(r.reason).toBe("edge");
    expect(r.density).toBe(0);
  });

  it("Ecke: Dichte-Regel respektiert beide Margins", () => {
    const enemyCount = (x: number, y: number): number =>
      x < CHEST_EDGE_MARGIN_PX + 16 || y < CHEST_EDGE_MARGIN_PX + 16 ? 9 : 0;
    const r = fairChestSpawn(CHEST_EDGE_MARGIN_PX, CHEST_EDGE_MARGIN_PX, {
      worldSize: WORLD_SIZE,
      isBlocked: nothingBlocked,
      enemyCount,
    });
    expect(r.density).toBe(0);
    expect(r.x).toBeGreaterThanOrEqual(CHEST_EDGE_MARGIN_PX);
    expect(r.y).toBeGreaterThanOrEqual(CHEST_EDGE_MARGIN_PX);
  });
});
