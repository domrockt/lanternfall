import { describe, expect, it } from "vitest";
import {
  BASE_VIEW_AREA, bossSpawnDistance, maxActiveEnemies, pickRecycleIndex,
  recycleDistance, shouldRecycle, spawnRateFactor, spawnRingRadius, viewAreaFactor,
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

  it("Spawnrate skaliert nur mit der Wurzel der Fläche", () => {
    expect(spawnRateFactor(640, 360)).toBe(1);
    expect(spawnRateFactor(780, 360)).toBeCloseTo(1.104, 3);
    expect(spawnRateFactor(480, 360)).toBeCloseTo(0.866, 3);
  });

  it("Gegner-Deckel skaliert mit der Fläche und bleibt <= 500", () => {
    expect(maxActiveEnemies(0, 640, 360)).toBe(100);
    expect(maxActiveEnemies(20 * 60)).toBe(360);
    expect(maxActiveEnemies(30 * 60, 780, 360)).toBe(439);
    expect(maxActiveEnemies(0, 480, 360)).toBe(75);
    expect(maxActiveEnemies(30 * 60, 1920, 1080)).toBe(500);
  });

  it("Recycle-Abstand liegt in jedem Winkel außerhalb der View", () => {
    for (const [w, h] of [[480, 360], [640, 360], [780, 360]]) {
      const d = recycleDistance(w, h);
      expect(d).toBeGreaterThan(Math.hypot(w, h) / 2);
      expect(d).toBeGreaterThan(w / 2);
      expect(d).toBeGreaterThan(h / 2);
    }
    expect(recycleDistance(1920, 1080)).toBeGreaterThan(1000);
    expect(recycleDistance(0, 0)).toBe(340);
  });

  it("Spawn-Ring ist in jedem Winkel außerhalb der View", () => {
    for (const [w, h] of [[480, 360], [640, 360], [780, 360], [860, 360]]) {
      const r = spawnRingRadius(w, h);
      expect(r).toBeGreaterThan(w / 2);
      expect(r).toBeGreaterThan(h / 2);
      // 720 Winkel: kein Spawnpunkt darf im Rechteck liegen.
      for (let i = 0; i < 720; i++) {
        const a = (i / 720) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        const outside = Math.abs(x) > w / 2 || Math.abs(y) > h / 2;
        expect(outside).toBe(true);
      }
      for (const off of ringSpawnOffsets(8, r)) {
        expect(Math.abs(off.x) > w / 2 || Math.abs(off.y) > h / 2).toBe(true);
      }
    }
  });

  it("Boss-Abstand ist sichtbar, aber nicht auf dem Spieler", () => {
    for (const w of [480, 640, 780]) {
      const d = bossSpawnDistance(w, 360);
      expect(d).toBeGreaterThan(100);
      expect(d).toBeLessThan(360 / 2); // vertikal noch im View -> sichtbar
    }
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
