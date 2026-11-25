/**
 * Reine Separation-/Ausweich-Helfer für Gegner.
 *
 * Deckungsgleiche Gegner haben keinen natürlichen Richtungsvektor; statt (0,0)
 * wird eine deterministische Richtung aus der Spawn-UID abgeleitet (goldener
 * Winkel). Damit bleiben Stapel nicht stehen und Runs sind seed-stabil.
 */
export const GOLDEN_ANGLE = 2.399963;

export interface Vec2 {
  x: number;
  y: number;
}

/** Deterministische Ausweichrichtung für eine UID (kein Math.random). */
export function fallbackDir(uid: number): Vec2 {
  const angle = uid * GOLDEN_ANGLE;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** Richtung zum Spieler; bei exakt gleicher Position UID-Fallback. */
export function directionToPlayer(dx: number, dy: number, uid: number): Vec2 {
  const dist = Math.hypot(dx, dy);
  if (dist > 1e-6) return { x: dx / dist, y: dy / dist };
  return fallbackDir(uid);
}

/**
 * Push-Vektor, der `self` von `other` wegschiebt (null, wenn weit genug weg).
 * Bei (nahezu) identischer Position wird die UID-Richtung mit vollem Gewicht genutzt.
 */
export function separationPush(
  selfX: number,
  selfY: number,
  selfRadius: number,
  otherX: number,
  otherY: number,
  otherRadius: number,
  uid: number,
): Vec2 | null {
  const dx = selfX - otherX;
  const dy = selfY - otherY;
  const minDist = selfRadius + otherRadius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minDist * minDist) return null;
  if (d2 < 1e-8) return fallbackDir(uid);
  const d = Math.sqrt(d2);
  const push = (minDist - d) / minDist;
  return { x: (dx / d) * push, y: (dy / d) * push };
}
