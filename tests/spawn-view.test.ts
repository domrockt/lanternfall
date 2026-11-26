import { describe, expect, it } from "vitest";
import {
  BASE_VIEW_AREA, bossSpawnDistance, maxActiveEnemies, pickRecycleIndex,
  recycleDistance, shouldRecycle, spawnRingRadius, viewAreaFactor,
} from "../src/logic/scaling";
import { ringSpawnOffsets } from "../src/logic/waves";

describe("M8 Spawn/Recycling relativ zur sichtbaren Fläche", () => {
  it("Sichtflächen-Faktor: 640x360 = 1, breite Formate dichter, 4:3 etwas dünner", () => {
    expect(BASE_VIEW_AREA).toBe(640 * 360);
    expect(viewAreaFactor(640, 360)).toBe(1);
    expect(viewAreaFactor(780, 360)).toBeCloseTo(1.219, 3);
    expect(viewAreaFactor(480, 360)).toBe(0.75);
    expect(viewAreaFactor(3840, 2160)).toBe(1.5);
    expect(viewAreaFactor(0, 360)).toBe(1);
  });

  it("Gegner-Deckel skaliert mit der Fläche und bleibt <= 500", () => {
    expect(maxActiveEnemies(0, 640, 360)).toBe(100);
    expect(maxActiveEnemies(20 * 60)).toBe(360);
    expect(maxActiveEnemies(30 * 60, 780, 360)).toBe(439);
    expect(maxActiveEnemies(0, 480, 360)).toBe(75);
    expect(maxActiveEnemies(30 * 60, 1920, 1080)).toBe(500);
  });

  it("Recycle-Abstand liegt knapp außerhalb der View-Diagonale", () => {
    expect(recycleDistance(640, 360)).toBe(340);
    expect(recycleDistance(780, 360)).toBeGreaterThan(340);
    expect(recycleDistance(1920, 1080)).toBeGreaterThan(800);
    expect(recycleDistance(0, 0)).toBe(340);
  });

  it("Spawn-Ring ist an der längeren Kante außerhalb der View", () => {
    for (const [w, h] of [[480, 360], [640, 360], [780, 360], [860, 360]]) {
      const r = spawnRingRadius(w, h);
      expect(r).toBeGreaterThan(w / 2);
      expect(r).toBeGreaterThan(h / 2);
      // Alle 8 Ringpositionen liegen außerhalb des Rechtecks (mit Rand).
      for (const off of ringSpawnOffsets(8, r)) {
        const outside = Math.abs(off.x) > w / 2 || Math.abs(off.y) > h / 2;
        expect(outside).toBe(true);
      }
    }
  });

  it("Boss-Abstand ist sichtbar, aber nicht auf dem Spieler", () => {
    expect(bossSpawnDistance(640, 360)).toBe(198);
    expect(bossSpawnDistance(780, 360)).toBe(198);
    expect(bossSpawnDistance(480, 360)).toBe(198);
    expect(bossSpawnDistance(200, 100)).toBe(130);
  });

  it("Recycling nutzt den übergebenen View-Abstand", () => {
    expect(shouldRecycle(60, 350, false)).toBe(true);
    expect(shouldRecycle(60, 350, false, false, 400)).toBe(false);
    const list = [
      { age: 60, x: 0, y: 0, elite: false },
      { age: 50, x: 500, y: 0, elite: false },
      { age: 90, x: 0, y: 0, elite: true },
    ];
    expect(pickRecycleIndex(list, 0, 0, 400)).toBe(1);
  });
});
