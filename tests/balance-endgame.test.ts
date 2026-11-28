import { describe, expect, it } from "vitest";
import {
  LATE_GAME_ACTIVE_CAP,
  maxActiveEnemies,
  enemyHpScale,
  enemyDamageScale,
  spawnRateFactor,
} from "../src/logic/scaling";

/**
 * Lane m10-balance-endgame (Karte K2): der Endgame-Director-Hebel.
 * Reine Funktionen, deterministisch — kein Phaser, keine Zeitquelle.
 *
 * Zielmetrik der Lane (siehe docs/lanes/m10-balance-endgame.md): Endzeit aller
 * AutoPlay-Läufe in [25, 40] min, Streuung ≤ 4 min. Hebel: ab Minute 20 wird
 * der aktive Gegner-Deckel auf LATE_GAME_ACTIVE_CAP gesenkt; alles davor bleibt
 * bitgleich zur M6/M8-Balance.
 */

describe("M10 Endgame-Balance: maxActiveEnemies-Late-Deckel", () => {
  it("Minute 0–19 bleibt bitgleich zur alten Kurve (100 + 13/Minute, Deckel 360)", () => {
    for (const minute of [0, 1, 5, 10, 15, 19]) {
      const expected = Math.min(360, 100 + minute * 13);
      expect(maxActiveEnemies(minute * 60, 640, 360), `Minute ${minute}`).toBe(expected);
    }
    // Letzte Sekunde vor dem Late-Deckel: noch alter Wert.
    expect(maxActiveEnemies(19 * 60 + 59, 640, 360)).toBe(347);
  });

  it("ab Minute 20 deckelt LATE_GAME_ACTIVE_CAP (640x360-Referenz)", () => {
    expect(LATE_GAME_ACTIVE_CAP).toBe(260);
    for (const minute of [20, 21, 25, 29, 30]) {
      expect(maxActiveEnemies(minute * 60, 640, 360), `Minute ${minute}`).toBe(LATE_GAME_ACTIVE_CAP);
    }
    expect(maxActiveEnemies(20 * 60, 640, 360)).toBeLessThan(maxActiveEnemies(19 * 60, 640, 360));
  });

  it("View-Skalierung wirkt weiter, harte Obergrenze 500 bleibt respektiert", () => {
    // 960x540: viewAreaFactor 1,5 → 260*1,5 = 390 statt bisher 500 (−22 %).
    expect(maxActiveEnemies(30 * 60, 960, 540)).toBe(390);
    // 780x360: Faktor ~1,21875 → 317 statt bisher 439.
    expect(maxActiveEnemies(30 * 60, 780, 360)).toBe(317);
    // Extrem breit: viewAreaFactor deckelt auf 1,5, Ergebnis bleibt ≤ 500.
    expect(maxActiveEnemies(30 * 60, 1920, 1080)).toBe(390);
    expect(maxActiveEnemies(30 * 60, 1920, 1080)).toBeLessThanOrEqual(500);
  });

  it("Restliche Skalierungshebel sind unveraendert (Regression)", () => {
    // HP-/Schadenskurven und Spawnraten-Faktor bleiben bewusst unangetastet:
    // der Late-Deckel ist der einzige Hebel dieser Lane.
    expect(enemyHpScale(0, 0)).toBe(1);
    expect(enemyHpScale(20 * 60, 4)).toBeCloseTo(1 + 1200 / 480 + 0.4 + Math.pow(1200 / 900, 1.35) * 0.5, 10);
    expect(enemyDamageScale(30 * 60)).toBeCloseTo(1 + 1800 / 5000 + Math.pow(1800 / 5000, 2) * 0.35, 10);
    expect(spawnRateFactor(640, 360)).toBe(1);
    expect(spawnRateFactor(960, 540)).toBeCloseTo(Math.sqrt(1.5) * 0.85, 10);
  });
});
