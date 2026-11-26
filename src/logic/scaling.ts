/** Werte-Skalierung über die 30-Minuten-Run-Zeit + Director-Helfer. */

export function enemyHpScale(elapsedSeconds: number, tier: number): number {
  const t = Math.max(0, elapsedSeconds);
  // M6-Balance: flacherer Frühverlauf (Bot soll bis 20–28 min kommen), im
  // Endgame weiterhin deutlich skalierend.
  return 1 + t / 480 + tier * 0.10 + Math.pow(t / 900, 1.35) * 0.50;
}

export function enemyDamageScale(elapsedSeconds: number): number {
  const t = Math.max(0, elapsedSeconds);
  // M6-Balance: Kontaktschaden steigt langsamer; Gefahr kommt aus Masse,
  // Mechaniken und Projektilen, nicht aus frühem Chip-Schaden.
  return 1 + t / 5000 + Math.pow(t / 5000, 2) * 0.35;
}

/** Gegner werden im Lauf etwas flinker, aber gedeckelt (+12 %). */
export function enemySpeedScale(elapsedSeconds: number): number {
  const t = Math.max(0, elapsedSeconds);
  return 1 + Math.min(0.12, (t / 1800) * 0.12);
}

/** Elite-Chance pro normalem Spawn ab Minute 2, steigt bis 10 %. */
export function eliteChance(minute: number): number {
  if (minute < 2) return 0;
  return Math.min(0.1, 0.015 + (minute - 2) * 0.0035);
}

/** Gleichmäßig über die Run-Zeit wachsende Elite-Spawn-Welle: Minuten 4,10,16,22,28. */
export function isEliteMinute(minute: number): boolean {
  return minute >= 4 && minute % 6 === 4;
}

/**
 * Maximal gleichzeitig aktive Gegner (Performance-Deckel). Startet moderat,
 * steigt bis Minute 25 auf 500 (Original-Perf-Ziel) und bleibt dort.
 */
export function maxActiveEnemies(elapsedSeconds: number): number {
  const minute = Math.floor(Math.max(0, elapsedSeconds) / 60);
  // M6-Balance: gleichmäßigerer Anstieg; der Deckel bleibt bei 500, wird durch
  // die niedrigere Spawnrate aber erst spät erreicht (perf.mjs testet 500 separat).
  return Math.min(360, 100 + minute * 13);
}

/** Ferne, alte Gegner dürfen recycelt werden (kein Kill, kein Drop). */
export function shouldRecycle(
  ageSeconds: number,
  distanceToPlayer: number,
  elite: boolean,
  boss = false,
): boolean {
  return !elite && !boss && ageSeconds > 45 && distanceToPlayer > 340;
}

/** Ältesten fernen Gegner finden (für Cap-Recycling). */
export function pickRecycleIndex<
  T extends { age: number; x: number; y: number; elite: boolean; boss?: boolean },
>(list: readonly T[], playerX: number, playerY: number): number {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const d = Math.hypot(e.x - playerX, e.y - playerY);
    if (!shouldRecycle(e.age, d, e.elite, e.boss)) continue;
    const score = e.age + d / 40;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Boss erscheint bei 05:00/10:00/15:00/20:00/25:00 und 30:00 (Endboss). */
export function bossSpawnSecond(index: number): number {
  return (index + 1) * 5 * 60;
}

/** Dämmerungs-Overlay läuft 3,2 s, danach Results. */
export const DAWN_DURATION = 3.2;
export function dawnFinished(timerSeconds: number): boolean {
  return timerSeconds > DAWN_DURATION;
}

/** Endboss startet bei 30:00, der Run endet erst mit seinem Tod (Sieg). */
export const FINAL_BOSS_AT = 30 * 60;
