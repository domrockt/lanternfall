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

/** M8: Referenzfläche der M6-Balance (16:9 bei 360p). */
export const BASE_VIEW_AREA = 640 * 360;

/**
 * M8: Sichtflächen-Faktor gegenüber 640x360. Breite Formate (780x360 = 1,22x)
 * bekommen proportional mehr Gegner, damit sie nicht leerer wirken; schmale
 * 4:3-Formate bekommen etwas weniger. Gedeckelt auf 0,75..1,5.
 */
export function viewAreaFactor(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  return Math.max(0.75, Math.min(1.5, (width * height) / BASE_VIEW_AREA));
}

/**
 * Maximal gleichzeitig aktive Gegner für den normalen Run. M6-Balance:
 * gleichmäßiger Anstieg bis Deckel 360 (Minute ~20) auf 640x360; M8 skaliert
 * den Deckel mit der sichtbaren Fläche (780x360 ~ 439, harte Obergrenze 500).
 */
export function maxActiveEnemies(
  elapsedSeconds: number,
  width = 640,
  height = 360,
): number {
  const minute = Math.floor(Math.max(0, elapsedSeconds) / 60);
  const base = 100 + minute * 13;
  return Math.min(500, Math.round(Math.min(360, base) * viewAreaFactor(width, height)));
}

/** M8: Recycle-Abstand knapp außerhalb der View-Diagonale (mind. 340 px). */
export function recycleDistance(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 340;
  return Math.max(340, Math.hypot(width, height) * 0.8 / 2);
}

/** M8: Ring-/Stream-Spawnradius juste außerhalb der sichtbaren Fläche.
 *  Die laengere Kante bestimmt den Radius, damit auch bei 780x360 kein Gegner
 *  am linken/rechten Bildrand sichtbar aufploppt. */
export function spawnRingRadius(width: number, height: number, extra = 20): number {
  if (!(width > 0) || !(height > 0)) return 300;
  return Math.ceil(Math.max(width, height) / 2) + Math.max(0, extra);
}

/** M8: Boss erscheint sichtbar, aber nicht auf dem Spieler; mit der Höhe skaliert. */
export function bossSpawnDistance(width: number, height: number): number {
  const shorter = Math.min(width, height);
  return Math.max(130, Math.round(shorter * 0.55));
}

/** Ferne, alte Gegner dürfen recycelt werden (kein Kill, kein Drop). */
export function shouldRecycle(
  ageSeconds: number,
  distanceToPlayer: number,
  elite: boolean,
  boss = false,
  minDistance = 340,
): boolean {
  return !elite && !boss && ageSeconds > 45 && distanceToPlayer > minDistance;
}

/** Ältesten fernen Gegner finden (für Cap-Recycling). */
export function pickRecycleIndex<
  T extends { age: number; x: number; y: number; elite: boolean; boss?: boolean },
>(list: readonly T[], playerX: number, playerY: number, minDistance = 340): number {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const d = Math.hypot(e.x - playerX, e.y - playerY);
    if (!shouldRecycle(e.age, d, e.elite, e.boss, minDistance)) continue;
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
