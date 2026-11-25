/** Reine Kampf-Helfer. */
export function knockbackVector(
  fromX: number, fromY: number, toX: number, toY: number, strength: number,
): { vx: number; vy: number } {
  let dx = toX - fromX;
  let dy = toY - fromY;
  const d = Math.hypot(dx, dy);
  if (d < 0.0001) return { vx: 0, vy: 0 };
  dx /= d;
  dy /= d;
  return { vx: dx * strength, vy: dy * strength };
}

export function damageAfterArmor(damage: number, armor: number): number {
  return Math.max(1, Math.round(damage - Math.max(0, armor)));
}

export function timeScaleClamped(n: number): number {
  return Math.max(1, Math.min(60, Number.isFinite(n) ? n : 1));
}
