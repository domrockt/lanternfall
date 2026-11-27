/**
 * Dosiertes Feedback: Screen-Shake nie über ~6 px, Hit-Stop nur kurz.
 * Reine Funktionen, unit-getestet.
 *
 * M10-feedback-budget: Im 500-Gegner-Chaos treffen viele Projektile pro Frame.
 * Requests werden deshalb nicht summiert, sondern auf einen Maximalwert
 * zusammengefasst (Shake) bzw. waehrend eines laufenden Stops verworfen
 * (Hit-Stop). Rueckstoss wird pro Gegner und Substep auf eine Hoechst-
 * geschwindigkeit geklemmt, damit mehrere Treffer im selben Frame nicht
 * zum Teleport addieren.
 */
export interface ShakeSpec {
  durationMs: number;
  intensity: number;
  /** Pixel bei 480 px Breite (nur zur Dokumentation/Test). */
  pixels: number;
}

export const MAX_SHAKE_PX = 6;
export const SHAKE_PX_PER_INTENSITY = 480;
export const MAX_SHAKE_MS = 400;
/** Hit-Stop nie laenger als 120 ms; laufende Stops werden nicht verlaengert. */
export const MAX_HITSTOP_SECONDS = 0.12;
/** Maximale Rueckstoss-Geschwindigkeit eines Gegners in px/s (sichtbar, kein Teleport). */
export const MAX_KNOCKBACK_SPEED = 160;

/** Intensität (Phaser 0..1 relativ zur Kamerabreite) auf max. 6 px begrenzen. */
export function clampShake(intensity: number, durationMs: number): ShakeSpec {
  const px = Math.max(0, Math.min(MAX_SHAKE_PX, intensity * SHAKE_PX_PER_INTENSITY));
  return {
    durationMs: Math.max(0, Math.min(MAX_SHAKE_MS, Math.round(durationMs))),
    intensity: px / SHAKE_PX_PER_INTENSITY,
    pixels: Math.round(px * 10) / 10,
  };
}

/**
 * Fasst beliebig viele Shake-Anfragen eines Frames zusammen: der staerkste
 * Request gewinnt (Pixel-Limit), Dauern werden nie addiert.
 */
export function mergeShake(...requests: ShakeSpec[]): ShakeSpec {
  let best: ShakeSpec = { durationMs: 0, intensity: 0, pixels: 0 };
  for (const req of requests) {
    if (!req || !(req.pixels > best.pixels)) continue;
    best = {
      durationMs: Math.max(0, Math.min(MAX_SHAKE_MS, Math.round(req.durationMs))),
      intensity: Math.max(0, Math.min(MAX_SHAKE_PX / SHAKE_PX_PER_INTENSITY, req.intensity)),
      pixels: Math.max(0, Math.min(MAX_SHAKE_PX, Math.round(req.pixels * 10) / 10)),
    };
  }
  return best;
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
  return kind === "bossDeath" ? 0.12 : 0.06;
}

/**
 * Führt einen Hit-Stop-Request zusammen. Laeuft bereits einer, wird er NICHT
 * verlaengert oder aufaddiert (kein Dauerfreeze durch viele Anfragen im
 * selben Frame). Auch ein einzelner Request bleibt auf MAX_HITSTOP_SECONDS
 * gedeckelt.
 */
export function mergeHitStop(remainingSeconds: number, requestSeconds: number): number {
  const remaining = Math.max(0, Math.min(MAX_HITSTOP_SECONDS, Number.isFinite(remainingSeconds) ? remainingSeconds : 0));
  if (remaining > 0) return remaining;
  const request = Math.max(0, Math.min(MAX_HITSTOP_SECONDS, Number.isFinite(requestSeconds) ? requestSeconds : 0));
  return request;
}

/** Rückstoß skaliert mit Masse: schwere Gegner bewegen sich weniger, harte Obergrenze. */
export function knockbackFor(base: number, mass: number): number {
  const m = Math.max(0.25, mass);
  const value = Math.max(0, base / m);
  return Math.min(MAX_KNOCKBACK_SPEED, value);
}

/**
 * Klemmt die akkumulierte Rueckstoss-Geschwindigkeit eines Gegners auf die
 * Hoechstgeschwindigkeit. Mehrere Treffer im selben Substep addieren sich
 * damit nicht zu einem Sprung/Teleport.
 */
export function clampKnockbackSpeed(
  vx: number,
  vy: number,
  max = MAX_KNOCKBACK_SPEED,
): { vx: number; vy: number } {
  const limit = Math.max(0, max);
  const speed = Math.hypot(vx, vy);
  if (!Number.isFinite(speed) || speed <= limit || speed === 0) return { vx, vy };
  const scale = limit / speed;
  return { vx: vx * scale, vy: vy * scale };
}
