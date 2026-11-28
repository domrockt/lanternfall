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
 * M10-Endgame-Balance (Lane m10-balance-endgame): eigene Mischung fuer Minute
 * 25–29 (Vorbereitung auf den Endboss). Der Tier-4-Standardmix enthält mit
 * `abom` (Splitter: teilt sich beim Tod) und `voidcaller` (Beschwörer: erzeugt
 * weitere Gegner) zwei Mengen-Vervielfacher — genau in der Phase, in der die
 * AutoPlay-Läufe vor Minute 25 starben bzw. kurz davor kippten. Die Late-Mix
 * ersetzt beide durch langsame/fernkämpfende Typen (knight/lich), alles andere
 * bleibt Tier-4-Charakter. TIER_MIXES selbst bleibt unveraendert (Minute 20–24
 * unveraendert, Wellen-Abdeckungs-Tests greifen weiter).
 */
export const LATE_GAME_MIX: Partial<Record<EnemyId, number>> = {
  horror: 2, centipede: 1, gargoyle: 2, reaper_bat: 2, knight: 1, lich: 1,
};

/** Spawnrate ab Minute 25: sanft weiterwachsend statt 1,88→2,12 (−1 % bis −10 %). */
export function lateGameSpawnRate(minute: number): number {
  return 1.86 + (minute - 25) * 0.015;
}

/** Minuten ab denen die Late-Game-Mischung/-Rate greift (Vorbereitung Endboss 30:00). */
export const LATE_GAME_MINUTE = 25;

/**
 * M10-Balance Spawn-Dämpfung Minute 18–24 (Lane m10-balance-spawn-damp, Befund B1 der
 * Verifikations-Lane m10-balance-band-verify): die Ankunftsrate wächst im Fenster
 * Minute 18–24 um +25 % (1,484 → 1,852/s), während die Kill-Rate durch den
 * XP_ENDGAME-Aufschlag (wirkt ab Level 28, erreicht ~Minute 18–20) sinkt. Der
 * Late-Deckel (maxActiveEnemies, 300 @ 960x540) begrenzt nur die Gleichzeitigkeit,
 * nicht die Ankunftsrate — mira/7 starb auf main bei 21,21 min (Level 30).
 *
 * Hebel: im Fenster wird der Anteil `SPAWN_DAMP_18_24` des Zuwachses seit Minute 18
 * entfernt. Rampe analog zum HP-Relief-Muster: Start Minute 18 (= 1080 s, dort 0),
 * 240 s bis voll — Minute 22–24 sind voll gedämpft. Minute 0–17 bleibt bitgleich,
 * Minute 25+ nutzt unverändert `lateGameSpawnRate` (Endboss-Korridor unangetastet).
 * Grenze: SPAWN_DAMP_18_24 ≤ 0,62 hält die Monotonie-Kriterien der Datentabellen
 * (strikt steigende spawnRate, tests/data.test.ts + tests/balance-endgame.test.ts).
 * Wert per Suchskript scripts/m10-balance-search-1824.mjs gesucht (festes
 * Iterationslimit, Ergebnis: shots/m10-balance-search-1824.json).
 */
export const SPAWN_DAMP_18_24 = 0.6;
/** Start der Spawn-Dämpfung: Minute 18 = 1080 s (dort Dämpfungsgrad 0). */
export const SPAWN_DAMP_18_24_START_MINUTE = 18;
/** Rampe auf den vollen Dämpfungsgrad: 240 s (voll ab Minute 22). */
export const SPAWN_DAMP_18_24_RAMP_S = 240;
/** Basisrate von Minute 18 (Anker des gedämpften Zuwachses, 1,484/s). */
export const SPAWN_DAMP_BASE_RATE = 0.38 + 18 * 0.06 + ((18 % 5) / 5) * 0.04;

/**
 * Dämpfungsgrad (0..1) der Basis-Spawnrate in Minute `minute`:
 * 0 außerhalb [18, 25), im Fenster linear auf `SPAWN_DAMP_18_24` rampend.
 */
export function spawnDamp1824(minute: number): number {
  const m = Math.floor(minute);
  if (m < SPAWN_DAMP_18_24_START_MINUTE || m >= LATE_GAME_MINUTE) return 0;
  const progress = Math.min(
    1,
    ((m - SPAWN_DAMP_18_24_START_MINUTE) * 60) / SPAWN_DAMP_18_24_RAMP_S,
  );
  return SPAWN_DAMP_18_24 * progress;
}

/** Basisrate vor Dämpfung (0,38 + 0,06·minute + tierProgress·0,04). */
export function baseSpawnRate(minute: number): number {
  return 0.38 + minute * 0.06 + ((minute % 5) / 5) * 0.04;
}

/**
 * 30 Wellen (eine pro Spielminute). Spawnrate wächst, Mischung wechselt alle 5 min,
 * Spezialwellen ab Minute 3, Elite-Pakete ab Minute 4.
 * Bosse erscheinen in Minute 5/10/15/20/25; der Endboss bei 30:00.
 * M10-Endgame: ab Minute 25 greifen LATE_GAME_MIX und lateGameSpawnRate.
 */
export const WAVES: WaveDef[] = Array.from({ length: 30 }, (_, minute) => {
  const tier = tierForMinute(minute);
  const tierProgress = (minute % 5) / 5;
  const baseRate = 0.38 + minute * 0.06 + tierProgress * 0.04;
  const late = minute >= LATE_GAME_MINUTE;
  // M10-Balance Spawn-Dämpfung Minute 18–24 (siehe spawnDamp1824): nur die
  // Basis-Wellen des Fensters; Minute 25+ bleibt lateGameSpawnRate.
  const damp = spawnDamp1824(minute);
  return {
    minute,
    spawnRate: late ? lateGameSpawnRate(minute) : baseRate - damp * (baseRate - SPAWN_DAMP_BASE_RATE),
    mix: late ? LATE_GAME_MIX : TIER_MIXES[tier],
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
