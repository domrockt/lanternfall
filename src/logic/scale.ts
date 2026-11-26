/** Ganzzahlige Canvas-Skalierung: nie weiche Bruchteile, nie < 1. */
export function integerScale(
  innerWidth: number,
  innerHeight: number,
  baseWidth: number,
  baseHeight: number,
): number {
  if (!(innerWidth > 0) || !(innerHeight > 0) || !(baseWidth > 0) || !(baseHeight > 0)) return 1;
  return Math.max(1, Math.floor(Math.min(innerWidth / baseWidth, innerHeight / baseHeight)));
}
