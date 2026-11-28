import { describe, expect, it } from "vitest";
import {
  XP_ENDGAME_MULT,
  XP_ENDGAME_START_N,
  applyXp,
  levelForXp,
  totalXpForLevel,
  xpToNext,
} from "../src/logic/xp";

/**
 * Level-Ziel-Korridor (ACCEPTANCE A5): Level bei Minute 30 in [25, 40].
 * Referenz-XP-Profile sind physische Sammelbudgets (kurvenunabhängig):
 * - God-Modus-Obergrenze aus shots/m10-level-target-before.json (6 Läufe):
 *   XP in [totalAlt(L), totalAlt(L+1)) für L = 37/44/42/42/38/44.
 * - No-God-Korridor (Lane m10-balance-kael, 6/6 Level 27–30):
 *   XP in [totalAlt(27), totalAlt(31)).
 * - Alter A5-Ausreißer (Kael/101, "Level 47"): ~34k gesammelte XP.
 */

/** Alte Kurve (Stand vor XP_ENDGAME_MULT, Fix 7629b2f) — für Referenzprofile. */
function xpToNextAlt(level: number): number {
  const n = Math.max(1, level) - 1;
  const late = n > 24 ? 10 * (n - 24) * (n - 24) : 0;
  return 8 + Math.round(1.1 * n * n) + late;
}
function totalXpAlt(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.max(1, level); l++) total += xpToNextAlt(l);
  return total;
}

describe("xpToNext – Schwellen-Tabelle", () => {
  it("ist strikt monoton steigend über Level 1..80", () => {
    for (let l = 1; l < 80; l++) {
      expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
    }
  });

  it("hält Level 1..27 bitgleich gegenüber der Kurve vor der Lane (früher Fluss + 5-min-Boss)", () => {
    for (let l = 1; l <= 27; l++) {
      expect(xpToNext(l)).toBe(xpToNextAlt(l));
    }
  });

  it("setzt den Endgame-Aufschlag erst ab Level 28 und wächst quadratisch", () => {
    const term = (n: number) =>
      8 + Math.round(1.1 * n * n) + 10 * (n - 24) * (n - 24) + XP_ENDGAME_MULT * (n - 26) * (n - 26);
    expect(xpToNext(28)).toBe(term(27));
    expect(xpToNext(29)).toBe(term(28));
    expect(xpToNext(30) - xpToNext(29)).toBe(term(29) - term(28));
  });

  it("Konstanten: Aufschlag ab n=26 (Level 28)", () => {
    expect(XP_ENDGAME_START_N).toBe(26);
  });
});

describe("levelForXp / totalXpForLevel – Umkehrung", () => {
  it("levelForXp(totalXpForLevel(l)) ergibt l (1..60)", () => {
    for (let l = 1; l <= 60; l++) {
      expect(levelForXp(totalXpForLevel(l))).toBe(l);
    }
  });

  it("totalXpForLevel ist streng monoton steigend", () => {
    for (let l = 1; l < 60; l++) {
      expect(totalXpForLevel(l + 1)).toBeGreaterThan(totalXpForLevel(l));
    }
  });
});

describe("Level-Zielband [25, 40] für Referenz-XP-Profile", () => {
  // God-Modus-Obergrenzen (vor der Kurve erreichte Level + 1 Schwelle − 1 XP)
  const godProfiles = [37, 44, 42, 42, 38, 44].map((l) => totalXpAlt(l + 1) - 1);
  // No-God-Korridor (balance-kael: Level 27..30 unter der alten Kurve)
  const noGodProfiles = [27, 28, 29, 30].map((l) => totalXpAlt(l));
  // Alter A5-Ausreißer: ~34k gesammelte XP (war Level 47 vor Fix 7629b2f)
  const a5Profile = 34000;

  it("God-Profile (bis ~55k XP) landen in [25, 40]", () => {
    for (const xp of godProfiles) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(25);
      expect(level).toBeLessThanOrEqual(40);
    }
    // Obergrenze mit Puffer: selbst +15 % Sammelbudget bleibt ≤ 40
    const worst = Math.max(...godProfiles);
    expect(levelForXp(Math.round(worst * 1.15))).toBeLessThanOrEqual(40);
  });

  it("No-God-Profile (6,3k–10,2k XP) bleiben im Band und im Messkorridor", () => {
    for (const xp of noGodProfiles) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(25);
      expect(level).toBeLessThanOrEqual(40);
    }
    expect(levelForXp(noGodProfiles[0])).toBe(27); // Korridor-Unterkante stabil
    expect(levelForXp(noGodProfiles[3])).toBeLessThanOrEqual(30);
  });

  it("alter A5-Fall (34k XP) bleibt auf ≤ 40 gedeckelt", () => {
    expect(levelForXp(a5Profile)).toBeLessThanOrEqual(40);
  });

  it("applyXp deckelt einen Riesen-XP-Batch auf Level ≤ 40", () => {
    const result = applyXp({ level: 1, xp: 0, pendingLevelUps: 0 }, 60000);
    expect(result.level).toBeLessThanOrEqual(40);
    expect(result.pendingLevelUps).toBe(result.levelsGained);
  });
});
