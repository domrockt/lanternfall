/**
 * M10 "menu-touch-targets": reine Geometrie fuer Touch-Hit-Zonen.
 * Jede Trefferflaeche ist mindestens 44x44 logische Pixel und bleibt
 * (wenn moeglich) vollstaendig innerhalb der View.
 */
export const MIN_TOUCH_SIZE = 44;

export interface TouchRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clampAxis(center: number, size: number, viewSize: number): number {
  if (size >= viewSize) return size / 2;
  const half = size / 2;
  return Math.min(viewSize - half, Math.max(half, center));
}

/** Zentriertes Treffer-Rechteck: mind. min x min, in der View gehalten. */
export function fitTouchRect(
  cx: number,
  cy: number,
  w: number,
  h: number,
  viewW: number,
  viewH: number,
  min = MIN_TOUCH_SIZE,
): TouchRect {
  const width = Math.max(min, w);
  const height = Math.max(min, h);
  const x = Math.round(clampAxis(cx, width, viewW));
  const y = Math.round(clampAxis(cy, height, viewH));
  return { x, y, w: Math.round(width), h: Math.round(height) };
}
