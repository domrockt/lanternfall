/**
 * M10-dpr-budget-cap: adaptiver Render-Massstab (fill-rate-Budget).
 *
 * RENDER_SCALE ist ein ganzzahliger TEILER der internen Renderbuffer-Kanten:
 *   1 = volle logische Aufloesung, 2 = halbe Kanten (1/4 der Pixel), 3 = Drittel.
 * Die CSS-Groesse bleibt unveraendert (image-rendering: pixelated Upscale) —
 * die logische Szene aendert sich nicht, nur die gerenderte Pixelmenge.
 */
export const RENDER_SCALE_MIN = 1;
export const RENDER_SCALE_MAX = 3;

/** Hysterese-Schwellen (FPS) und -zeiten (ms) fuer den Einbau. */
export const SCALE_LOW_FPS = 45;
export const SCALE_HIGH_FPS = 57;
export const SCALE_LOW_MS = 2000;
export const SCALE_HIGH_MS = 4000;

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Maximale Sinnvolle Teilerstufe aus dpr und View: Bei dpr 1 gibt es kein
 * Geraete-Pixel-Budget einzusparen (Canvas = Bildschirmreferenz), bei dpr 3
 * bis zu 3x; der Renderbuffer faellt nie unter 320x180.
 */
export function maxRenderScale(width: number, height: number, dpr: number): number {
  if (!(width > 0) || !(height > 0)) return RENDER_SCALE_MIN;
  const dprCap = Math.floor(Math.max(1, Number.isFinite(dpr) ? dpr : 1));
  const sizeCap = Math.floor(Math.min(width / 320, height / 180));
  return Math.max(RENDER_SCALE_MIN, Math.min(RENDER_SCALE_MAX, dprCap, sizeCap));
}

/**
 * Sofort-Ziel als reine Funktion: ganzzahliger Teiler in [1, maxRenderScale].
 * fpsEwma unter dem Frame-Budget (1000/budgetMs) erhoehen den Teiler so, dass
 * die gerenderte Pixelmenge (Teiler^2) die Luecke schliesst; unbekanntes/-
 * epsilon-FPS bleibt bei 1 (nicht schrumpfen ohne Beleg).
 */
export function chooseRenderScale(
  dpr: number,
  width: number,
  height: number,
  fpsEwma: number,
  budgetMs: number,
): number {
  if (!Number.isFinite(fpsEwma) || fpsEwma <= 0) return RENDER_SCALE_MIN;
  const budget = Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : 1000 / 60;
  const targetFps = 1000 / budget;
  if (fpsEwma >= targetFps) return RENDER_SCALE_MIN;
  const need = Math.ceil(targetFps / fpsEwma);
  return clampInt(need, RENDER_SCALE_MIN, maxRenderScale(width, height, dpr));
}

/** Zustand des Hysterese-Reglers (rein, ohne Uhr/Google). */
export interface RenderScaleState {
  /** Aktueller ganzzahliger Teiler. */
  scale: number;
  /** Verweilzeit unter SCALE_LOW_FPS (ms). */
  belowMs: number;
  /** Verweilzeit ab SCALE_HIGH_FPS (ms). */
  aboveMs: number;
}

/**
 * Ein Regler-Schritt: unter 45 FPS fuer 2 s senken nicht moeglich -> Teiler
 * erhoehen (bis cap); ab 57 FPS fuer 4 s heben -> Teiler senken. Zwischen den
 * Schwellen (totale Zone) bleiben die Timer zurueckgesetzt, der Teiler haelt.
 */
export function stepRenderScale(
  state: RenderScaleState,
  fpsEwma: number,
  dtMs: number,
  cap: number,
): RenderScaleState {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  const upperCap = Math.max(RENDER_SCALE_MIN, Math.min(RENDER_SCALE_MAX, Math.round(cap)));
  let { scale, belowMs, aboveMs } = state;
  if (Number.isFinite(fpsEwma) && fpsEwma > 0 && fpsEwma < SCALE_LOW_FPS) {
    belowMs += dt;
    aboveMs = 0;
    if (belowMs >= SCALE_LOW_MS && scale < upperCap) {
      scale += 1;
      belowMs = 0;
      aboveMs = 0;
    }
  } else if (Number.isFinite(fpsEwma) && fpsEwma >= SCALE_HIGH_FPS) {
    aboveMs += dt;
    belowMs = 0;
    if (aboveMs >= SCALE_HIGH_MS && scale > RENDER_SCALE_MIN) {
      scale -= 1;
      belowMs = 0;
      aboveMs = 0;
    }
  } else {
    belowMs = 0;
    aboveMs = 0;
  }
  scale = Math.max(RENDER_SCALE_MIN, Math.min(upperCap, scale));
  return { scale, belowMs, aboveMs };
}

/**
 * URL-Override fuer Messungen parsen: fehlender Parameter -> null (Regler
 * aktiv), 0 -> aus (Voller Renderbuffer), 1..3 -> fester Teiler. Achtung:
 * Number(null) ist 0 — deshalb wird der Parameter explizit auf null geprueft.
 */
export function parseRenderScaleOverride(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded >= RENDER_SCALE_MIN && rounded <= RENDER_SCALE_MAX) return rounded;
  return rounded === 0 ? 0 : null;
}

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
