import type { TouchSnapshot } from "./InputState";

/**
 * Zwischenspeicher zwischen `TouchControls` (schreibt pro Geste) und der
 * Eingabeschicht (liest pro Frame).
 *
 * Der Vektor `x`/`y` ist ein Rohvektor in [-1, 1] (dx/radius, dy/radius).
 * Totzone und Normierung passieren erst in `InputState`.
 */
const DEFAULT_SNAPSHOT: TouchSnapshot = { active: false, x: 0, y: 0, pause: false };

let current: TouchSnapshot = { ...DEFAULT_SNAPSHOT };

/** Setzt den Touch-Snapshot; Werte werden kopiert und auf [-1, 1] begrenzt. */
export function setTouchSnapshot(s: TouchSnapshot): void {
  current = {
    active: s.active === true,
    x: clampUnit(s.x),
    y: clampUnit(s.y),
    pause: s.pause === true,
  };
}

/** Liefert eine Kopie, damit Aufrufer den internen Zustand nicht mutieren können. */
export function getTouchSnapshot(): TouchSnapshot {
  return { ...current };
}

/** Setzt den Zustand auf den Initialwert zurück (z. B. bei Pause/Level-up). */
export function resetTouchSnapshot(): void {
  current = { ...DEFAULT_SNAPSHOT };
}

function clampUnit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
