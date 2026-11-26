import { describe, expect, it } from "vitest";
import { levelForXp, totalXpForLevel, xpToNext } from "../src/logic/xp";

/** Alte M6-Kurve (Referenz für Level 1–25). */
function legacyXpToNext(level: number): number {
  const n = Math.max(1, level) - 1;
  return 8 + Math.round(1.1 * n * n);
}

describe("M10-Balance: XP-Kurve", () => {
  it("ist monoton steigend", () => {
    for (let level = 1; level < 80; level++) {
      expect(xpToNext(level + 1)).toBeGreaterThan(xpToNext(level));
    }
  });

  it("hat keine Sprünge (Zuwachs bleibt kleiner als die Schwelle selbst)", () => {
    for (let level = 10; level < 80; level++) {
      const jump = xpToNext(level + 1) - xpToNext(level);
      expect(jump).toBeLessThan(xpToNext(level));
      // Ab Level 10 darf keine Stufe mehr als 50 % teurer werden.
      expect(xpToNext(level + 1) / xpToNext(level)).toBeLessThan(1.5);
    }
  });

  it("Level 1–25 und damit der frühe Spielfluss bleiben unverändert", () => {
    for (let level = 1; level <= 25; level++) {
      expect(xpToNext(level)).toBe(legacyXpToNext(level));
    }
    // Level 1–10 exakt als Regressionstabelle.
    expect([...Array(10)].map((_, i) => xpToNext(i + 1))).toEqual([
      8, 9, 12, 18, 26, 36, 48, 62, 78, 97,
    ]);
    expect(totalXpForLevel(25)).toBe(4949);
  });

  it("30-min-Budget (gemessen 9.652 XP) landet bei Level 25–40", () => {
    const measured = levelForXp(9652);
    expect(measured).toBeGreaterThanOrEqual(25);
    expect(measured).toBeLessThanOrEqual(40);
  });

  it("voll eingesammeltes Kill-Budget (29.347 / 34.366 XP) bleibt ≤ Level 40", () => {
    // Kael/606: 9.982 Kills × 3,92 Ø-Gem × 0,75 XP-Mod = 29.347 Roh-XP.
    expect(levelForXp(29347)).toBeLessThanOrEqual(40);
    // Alter A5-Ausreißer Kael/101: 11.689 Kills → 34.366 Roh-XP (Level 47 vor dem Fix).
    expect(levelForXp(34366)).toBeLessThanOrEqual(40);
    expect(levelForXp(34366)).toBeGreaterThanOrEqual(35);
  });
});
