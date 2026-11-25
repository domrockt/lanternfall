import type { EnemyId, WaveDef } from "./types";

/** Gewichte pro Zeitstufe (0–5, 5–10, 10–15, 15–20, 20–30 min). */
export const TIER_MIXES: Record<number, Partial<Record<EnemyId, number>>> = {
  0: { bog_rat: 4, wisp: 3, bogzombie: 2, crow: 2, mudling: 1, toad: 1 },
  1: { skeleton: 3, bat: 3, ghoul: 2, witchling: 1, slime: 2, scarecrow: 1 },
  2: { wolf: 2, banshee: 2, golem: 1, spider: 3, cultist: 1, bomber: 2 },
  3: { knight: 2, harpy: 2, lich: 2, wraith: 2, treant: 1, imp: 2 },
  4: { horror: 2, centipede: 2, gargoyle: 2, reaper_bat: 3, abom: 1, voidcaller: 1 },
};

const tierForMinute = (minute: number): number =>
  Math.min(4, Math.floor(minute / 5));

/**
 * 30 Wellen (eine pro Spielminute). Spawnrate wächst, Mischung wechselt alle 5 min,
 * Spezialwellen ab Minute 3 (Ring-Einkesselung) und 6 (Schwarm-Ströme).
 * Bosse erscheinen in Minute 5/10/15/20/25; der Endboss bei 30:00 (Siegbedingung).
 */
export const WAVES: WaveDef[] = Array.from({ length: 30 }, (_, minute) => {
  const tier = tierForMinute(minute);
  const tierProgress = (minute % 5) / 5;
  return {
    minute,
    spawnRate: 0.9 + minute * 0.34 + tierProgress * 0.12,
    mix: TIER_MIXES[tier],
    special: minute >= 3 && minute % 3 === 0 ? "ring" : minute >= 6 && minute % 4 === 0 ? "stream" : null,
    bossIndex: minute === 5 ? 0 : minute === 10 ? 1 : minute === 15 ? 2 : minute === 20 ? 3 : minute === 25 ? 4 : undefined,
  };
});

/** Endboss-Minute (30:00). */
export const FINAL_BOSS_INDEX = 5;

export function waveForMinute(minute: number): WaveDef {
  return WAVES[Math.max(0, Math.min(WAVES.length - 1, Math.floor(minute)))];
}
