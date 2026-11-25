/**
 * Dosiertes Feedback: Screen-Shake nie über ~6 px, Hit-Stop nur kurz.
 * Reine Funktionen, unit-getestet.
 */
export interface ShakeSpec {
  durationMs: number;
  intensity: number;
  /** Pixel bei 480 px Breite (nur zur Dokumentation/Test). */
  pixels: number;
}

export const MAX_SHAKE_PX = 6;
export const SHAKE_PX_PER_INTENSITY = 480;

/** Intensität (Phaser 0..1 relativ zur Kamerabreite) auf max. 6 px begrenzen. */
export function clampShake(intensity: number, durationMs: number): ShakeSpec {
  const px = Math.max(0, Math.min(MAX_SHAKE_PX, intensity * SHAKE_PX_PER_INTENSITY));
  return {
    durationMs: Math.max(0, Math.min(400, Math.round(durationMs))),
    intensity: px / SHAKE_PX_PER_INTENSITY,
    pixels: Math.round(px * 10) / 10,
  };
}

export function shakeFor(kind: "hit" | "bossHit" | "bossDeath" | "explosion", enabled = true): ShakeSpec {
  if (!enabled) return { durationMs: 0, intensity: 0, pixels: 0 };
  switch (kind) {
    case "hit": return clampShake(0.0022, 70);
    case "bossHit": return clampShake(0.0035, 90);
    case "bossDeath": return clampShake(0.0075, 320);
    case "explosion": return clampShake(0.0045, 140);
  }
}

/**
 * Hit-Stop nur bei Boss-Treffern/Tod: 60–120 ms, kein Dauerfreeze.
 * Boss-Tod bekommt den längeren Wert, normale Boss-Treffer den kürzeren.
 */
export function hitStopFor(kind: "bossHit" | "bossDeath"): number {
  return kind === "bossDeath" ? 0.12 : 0.07;
}

/** Rückstoß skaliert mit Masse: schwere Gegner bewegen sich weniger. */
export function knockbackFor(base: number, mass: number): number {
  const m = Math.max(0.25, mass);
  return Math.max(0, base / m);
}
