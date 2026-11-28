import { describe, expect, it, vi } from "vitest";
// ChestSystem importiert Phaser (Szene/BlendModes); die reine Spawn-Funktion
// braucht kein DOM. Phaser wird wie in chest-arrow.test.ts gemockt.
vi.mock("phaser", () => ({ default: {} }));
import {
  CHEST_EDGE_MARGIN_PX,
  CHEST_SPAWN_SEARCH_TILES,
  CHEST_SPAWN_TILE_PX,
  fairChestSpawn,
} from "../src/systems/ChestSystem";

/** Weltgröße wie im Spiel (16 px × 256 Tiles). */
const WORLD_SIZE = 16 * 256;

/** Kein Hindernis: jede Zelle frei. */
const nothingBlocked = () => false;

/** Wasser-Disk um eine Position (Radius in px). */
const waterDisk = (wx: number, wy: number, radius: number) =>
  (x: number, y: number): boolean => Math.hypot(x - wx, y - wy) <= radius;

describe("M10 chest-spawn-fair: fairChestSpawn (reine Funktion)", () => {
  it("freie Zelle in der Feldmitte bleibt unverändert (reason free)", () => {
    const r = fairChestSpawn(2000, 1500, { worldSize: WORLD_SIZE, isBlocked: nothingBlocked });
    expect(r.x).toBe(2000);
    expect(r.y).toBe(1500);
    expect(r.reason).toBe("free");
  });

  it("Kantenabstand: Spawn an der Kante (20 px) wird auf den Margin geklemmt", () => {
    const r = fairChestSpawn(20, 2000, { worldSize: WORLD_SIZE, isBlocked: nothingBlocked });
    expect(r.x).toBe(CHEST_EDGE_MARGIN_PX);
    expect(r.y).toBe(2000);
    expect(r.reason).toBe("edge");
  });

  it("Ecke: beide Achsen werden auf den Margin geklemmt", () => {
    const r = fairChestSpawn(10, 10, { worldSize: WORLD_SIZE, isBlocked: nothingBlocked });
    expect(r.x).toBe(CHEST_EDGE_MARGIN_PX);
    expect(r.y).toBe(CHEST_EDGE_MARGIN_PX);
    expect(r.reason).toBe("edge");
    const far = fairChestSpawn(WORLD_SIZE - 12, WORLD_SIZE - 12, { worldSize: WORLD_SIZE, isBlocked: nothingBlocked });
    expect(far.x).toBe(WORLD_SIZE - CHEST_EDGE_MARGIN_PX);
    expect(far.y).toBe(WORLD_SIZE - CHEST_EDGE_MARGIN_PX);
  });

  it("Moorwasser auf der Primärzelle: nächste freie Zelle gewinnt (ein Tile entfernt)", () => {
    // Nur das 16-px-Umfeld der Primärzelle ist Wasser — Ring r=1 (16 px) ist frei.
    const r = fairChestSpawn(1000, 1000, { worldSize: WORLD_SIZE, isBlocked: waterDisk(1000, 1000, 8) });
    expect(r.reason).toBe("fallback");
    expect(r.x).toBe(1000 - CHEST_SPAWN_TILE_PX);
    expect(r.y).toBe(1000);
    expect(Math.hypot(r.x - r.fromX, r.y - r.fromY)).toBe(CHEST_SPAWN_TILE_PX);
  });

  it("großes Wasserfeld: Spiralsuche findet die EUCLID-nächste freie Zelle", () => {
    // Wasser-Radius 48 px: Ringe r=1..2 komplett blockiert, r=3 diagonal frei.
    // Euclid-nächster Treffer: 48/16 px versetzt (hypot ≈ 50,6 px, Gleichstand
    // mit 16/48 — Iteration wählt zuerst dx<0), nicht axial 64 px und nicht
    // die Diagonale 67,9 px.
    const r = fairChestSpawn(1000, 1000, { worldSize: WORLD_SIZE, isBlocked: waterDisk(1000, 1000, 48) });
    expect(r.reason).toBe("fallback");
    expect(r.x).toBe(1000 - 3 * CHEST_SPAWN_TILE_PX);
    expect(r.y).toBe(1000 - CHEST_SPAWN_TILE_PX);
    expect(Math.hypot(r.x - r.fromX, r.y - r.fromY)).toBeCloseTo(Math.hypot(16, 48), 6);
  });

  it("Notfall-Klemme: alles blockiert → geklemmte Primärzelle, niemals außerhalb des Margins", () => {
    const r = fairChestSpawn(20, 20, { worldSize: WORLD_SIZE, isBlocked: () => true });
    expect(r.x).toBe(CHEST_EDGE_MARGIN_PX);
    expect(r.y).toBe(CHEST_EDGE_MARGIN_PX);
    expect(r.reason).toBe("fallback");
  });

  it("fernes Wasser ändert eine freie Primärzelle nicht", () => {
    const r = fairChestSpawn(1000, 1000, { worldSize: WORLD_SIZE, isBlocked: waterDisk(300, 300, 200) });
    expect(r.reason).toBe("free");
    expect(r.x).toBe(1000);
    expect(r.y).toBe(1000);
  });

  it("rein und deterministisch: gleicher Input → gleiches Output (kein Zeit-/RNG-Bezug, Timing bleibt unberührt)", () => {
    const opts = { worldSize: WORLD_SIZE, isBlocked: waterDisk(1000, 1000, 48) };
    const a = fairChestSpawn(1010, 990, opts);
    const b = fairChestSpawn(1010, 990, opts);
    expect(a).toEqual(b);
    // Suchradius-Cap: Verschiebung bleibt <= Suchradius + Klemme begrenzbar.
    for (const [x, y] of [[5, 5], [WORLD_SIZE / 2, WORLD_SIZE / 2], [WORLD_SIZE - 5, WORLD_SIZE - 5]]) {
      const r = fairChestSpawn(x, y, opts);
      expect(r.x).toBeGreaterThanOrEqual(CHEST_EDGE_MARGIN_PX);
      expect(r.y).toBeGreaterThanOrEqual(CHEST_EDGE_MARGIN_PX);
      expect(r.x).toBeLessThanOrEqual(WORLD_SIZE - CHEST_EDGE_MARGIN_PX);
      expect(r.y).toBeLessThanOrEqual(WORLD_SIZE - CHEST_EDGE_MARGIN_PX);
      expect(Math.hypot(r.x - x, r.y - y)).toBeLessThanOrEqual(
        CHEST_SPAWN_SEARCH_TILES * CHEST_SPAWN_TILE_PX + CHEST_EDGE_MARGIN_PX * 2,
      );
    }
  });
});
