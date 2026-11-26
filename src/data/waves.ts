import type { EnemyId, WaveDef } from "./types";
import { isEliteMinute } from "../logic/scaling";

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
 * Spezialwellen: ab Minute 3 abwechselnd Einkesselungs-Ring und Schwarm-Strom.
 * Elite-Minuten (4/10/16/22/28) sind zusätzlich markiert.
 */
export function specialForMinute(minute: number): WaveDef["special"] {
  if (minute < 3) return null;
  return minute % 2 === 1 ? "ring" : "stream";
}

/**
 * 30 Wellen (eine pro Spielminute). Spawnrate wächst, Mischung wechselt alle 5 min,
 * Spezialwellen ab Minute 3, Elite-Pakete ab Minute 4.
 * Bosse erscheinen in Minute 5/10/15/20/25; der Endboss bei 30:00.
 */
export const WAVES: WaveDef[] = Array.from({ length: 30 }, (_, minute) => {
  const tier = tierForMinute(minute);
  const tierProgress = (minute % 5) / 5;
  return {
    minute,
    spawnRate: 0.38 + minute * 0.06 + tierProgress * 0.04,
    mix: TIER_MIXES[tier],
    special: specialForMinute(minute),
    elitePack: isEliteMinute(minute),
    bossIndex: minute === 5 ? 0 : minute === 10 ? 1 : minute === 15 ? 2 : minute === 20 ? 3 : minute === 25 ? 4 : undefined,
  };
});

/** Endboss-Minute (30:00). */
export const FINAL_BOSS_INDEX = 5;

export function waveForMinute(minute: number): WaveDef {
  return WAVES[Math.max(0, Math.min(WAVES.length - 1, Math.floor(minute)))];
}
