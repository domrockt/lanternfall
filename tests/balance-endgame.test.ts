import { describe, expect, it } from "vitest";
import {
  HP_RELIEF_MAX,
  HP_RELIEF_RAMP_S,
  HP_RELIEF_START_S,
  LATE_GAME_ACTIVE_CAP,
  LATE_GAME_START_MINUTE,
  maxActiveEnemies,
  enemyHpScale,
  enemyDamageScale,
  spawnRateFactor,
} from "../src/logic/scaling";
import { LATE_GAME_MINUTE, LATE_GAME_MIX, lateGameSpawnRate, WAVES, waveForMinute } from "../src/data/waves";
import { ENEMIES } from "../src/data/enemies";
import type { EnemyId } from "../src/data/types";

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
  it("Minute 0–17 bleibt bitgleich zur alten Kurve (100 + 13/Minute, Deckel 360)", () => {
    for (const minute of [0, 1, 5, 10, 15, 17]) {
      const expected = Math.min(360, 100 + minute * 13);
      expect(maxActiveEnemies(minute * 60, 640, 360), `Minute ${minute}`).toBe(expected);
    }
    // Letzte Sekunde vor dem Late-Deckel: noch alter Wert.
    expect(maxActiveEnemies(17 * 60 + 59, 640, 360)).toBe(321);
  });

  it("ab Minute 18 deckelt LATE_GAME_ACTIVE_CAP (640x360-Referenz)", () => {
    expect(LATE_GAME_ACTIVE_CAP).toBe(200);
    expect(LATE_GAME_START_MINUTE).toBe(18);
    for (const minute of [18, 19, 20, 21, 25, 29, 30]) {
      expect(maxActiveEnemies(minute * 60, 640, 360), `Minute ${minute}`).toBe(LATE_GAME_ACTIVE_CAP);
    }
    expect(maxActiveEnemies(18 * 60, 640, 360)).toBeLessThan(maxActiveEnemies(17 * 60, 640, 360));
  });

  it("View-Skalierung wirkt weiter, harte Obergrenze 500 bleibt respektiert", () => {
    // 960x540: viewAreaFactor 1,5 → 200*1,5 = 300 statt bisher 500 (−40 %).
    expect(maxActiveEnemies(30 * 60, 960, 540)).toBe(300);
    // 780x360: Faktor ~1,21875 → 244 statt bisher 439.
    expect(maxActiveEnemies(30 * 60, 780, 360)).toBe(244);
    // Extrem breit: viewAreaFactor deckelt auf 1,5, Ergebnis bleibt ≤ 500.
    expect(maxActiveEnemies(30 * 60, 1920, 1080)).toBe(300);
    expect(maxActiveEnemies(30 * 60, 1920, 1080)).toBeLessThanOrEqual(500);
  });

  it("Restliche Skalierungshebel sind unveraendert (Regression)", () => {
    // Schadenskurve und Spawnraten-Faktor bleiben bewusst unangetastet.
    expect(enemyDamageScale(30 * 60)).toBeCloseTo(1 + 1800 / 5000 + Math.pow(1800 / 5000, 2) * 0.35, 10);
    expect(spawnRateFactor(640, 360)).toBe(1);
    expect(spawnRateFactor(960, 540)).toBeCloseTo(Math.sqrt(1.5) * 0.85, 10);
  });
});

describe("M10 Endgame-Balance: enemyHpScale-Late-Relief", () => {
  const baseHp = (t: number, tier: number) => 1 + t / 480 + tier * 0.10 + Math.pow(t / 900, 1.35) * 0.5;

  it("Minute 0–18 bleibt bitgleich zur M6-Kurve (Relief startet exakt bei t=1080 mit 0)", () => {
    for (const t of [0, 300, 600, 900, 1079]) {
      expect(enemyHpScale(t, 4), `t=${t}`).toBeCloseTo(baseHp(t, 4), 10);
    }
    expect(enemyHpScale(1080, 4)).toBeCloseTo(baseHp(1080, 4), 10);
    expect(HP_RELIEF_START_S).toBe(1080);
  });

  it("Rampe 240 s auf −25 %, danach konstant (deterministisch)", () => {
    expect(HP_RELIEF_MAX).toBe(0.25);
    expect(HP_RELIEF_RAMP_S).toBe(240);
    // Mitte der Rampe (Minute 20): −12,5 %.
    expect(enemyHpScale(1200, 4)).toBeCloseTo(baseHp(1200, 4) * 0.875, 10);
    // Volles Relief ab Minute 22.
    for (const t of [1320, 1500, 1800]) {
      expect(enemyHpScale(t, 4), `t=${t}`).toBeCloseTo(baseHp(t, 4) * 0.75, 10);
    }
    // Relief korrigiert nur nach unten: nie ueber der Basis, nie unter Basis·(1−HP_RELIEF_MAX).
    for (let t = 0; t <= 1800; t += 7) {
      const hp = enemyHpScale(t, 4);
      expect(hp).toBeLessThanOrEqual(baseHp(t, 4) + 1e-9);
      expect(hp).toBeGreaterThanOrEqual(baseHp(t, 4) * (1 - HP_RELIEF_MAX) - 1e-9);
    }
  });
});

/**
 * Karte K3: Minuten-Mischung 25–30 (LATE_GAME_MIX + lateGameSpawnRate).
 * Reine Datentabellen, deterministisch pruefbar.
 */
describe("M10 Endgame-Balance: Minuten-Mischung 25–30", () => {
  it("Minute 0–24 bleibt unveraendert (TIER_MIXES + alte Rate)", () => {
    for (let minute = 0; minute < LATE_GAME_MINUTE; minute++) {
      const wave = waveForMinute(minute);
      expect(wave.mix).toBe(WAVES[minute].mix);
      expect(wave.spawnRate, `Minute ${minute}`).toBeCloseTo(0.38 + minute * 0.06 + ((minute % 5) / 5) * 0.04, 10);
    }
  });

  it("Minute 25–29 nutzt LATE_GAME_MIX ohne Mengen-Vervielfacher (splitter/summoner)", () => {
    for (let minute = LATE_GAME_MINUTE; minute <= 29; minute++) {
      const wave = waveForMinute(minute);
      expect(wave.mix).toBe(LATE_GAME_MIX);
      for (const [id, weight] of Object.entries(wave.mix)) {
        expect(weight ?? 0, `${id} in Minute ${minute}`).toBeGreaterThan(0);
        const archetype = ENEMIES[id as EnemyId].archetype;
        expect(archetype, `${id} (Minute ${minute})`).not.toBe("splitter");
        expect(archetype, `${id} (Minute ${minute})`).not.toBe("summoner");
      }
    }
  });

  it("Late-Spawnrate wächst weiter (Monotonie-Kriterium der Datentabellen) und ist gedämpft", () => {
    // Monoton steigend ueber alle 30 Minuten (Kriterium aus tests/data.test.ts).
    for (let minute = 1; minute < WAVES.length; minute++) {
      expect(WAVES[minute].spawnRate).toBeGreaterThan(WAVES[minute - 1].spawnRate);
    }
    // Ab Minute 25 deutlich unter der alten Formel (1,88 bis 2,12).
    for (let minute = LATE_GAME_MINUTE; minute <= 29; minute++) {
      const oldRate = 0.38 + minute * 0.06 + ((minute % 5) / 5) * 0.04;
      expect(lateGameSpawnRate(minute)).toBeLessThan(oldRate);
      expect(waveForMinute(minute).spawnRate).toBe(lateGameSpawnRate(minute));
    }
    expect(waveForMinute(29).spawnRate).toBeCloseTo(1.92, 10);
  });
});
