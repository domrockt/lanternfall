/**
 * M10-chaos-fix-glow-runpath (B2/B5, Audit docs/lanes/m10-chaos-legibility.md):
 * ADD-Alpha-Boden/-Deckel und einheitlicher Scale-Cap fuer den Run-seitigen
 * Pfad — reine Funktionen in logic/ (testbar ohne Phaser, Run.ts bleibt duenn).
 * Alle direkten ADD-Bilder in Run.ts (Licht, Ereignis-FX, Dawn-Strahlen,
 * Splash) laufen ueber diese Helfer — Addierung ueber 0,8 rauscht im Chaos
 * gegen Weiß (Near-White-Kerne), nicht-uniforme Scales stretchen
 * Einzel-Partikel zu weissen Balken (B5: vertikaler weisser Strich im
 * 640-4x-Crop des Audits).
 */
/** Deckel fuer einzelne ADD-Sprites: effektiv nie voll weiss allein. */
export const RUN_ADD_ALPHA_CAP = 0.8;
/** Boden: kein negativer Alpha. Run-seitige Glows haben bewusst keinen
 *  Mindest-Alpha > 0 (ein Boden wuerde aufhellen; FxSystem hat ihn nur fuer
 *  Boss-FX-Sichtbarkeit). */
export const RUN_ADD_ALPHA_FLOOR = 0;
/** Einheitlicher Scale-Cap fuer Partikel-/Glow-Bilder (vor dem Bake-Pfad). */
export const RUN_PARTICLE_SCALE_CAP = 2.4;
/** Deckel fuer die additive Laternen-Lichtflaeche (war 0,85) — Hauptteil der
 *  Überstrahlung ueber dem Spieler im Endgame (Run.ts-Kommentar M5-LOD). */
export const RUN_LIGHT_ALPHA_MAX = 0.7;

/** ADD-Alpha deckeln: [RUN_ADD_ALPHA_FLOOR, RUN_ADD_ALPHA_CAP]. */
export function runAddAlpha(alpha: number): number {
  return Math.max(RUN_ADD_ALPHA_FLOOR, Math.min(RUN_ADD_ALPHA_CAP, alpha));
}

/**
 * Kein nicht-uniformes Strecken (B5): Scale wird auf das kleinere Ausmass
 * gezogen (Seitenverhältnis bleibt), dann auf den Cap gebracht. Die
 * Spieler-Schatten-Ellipse (setScale(2, 1), NORMAL-Blend) nutzt das bewusst
 * NICHT — sie ist kein Partikel.
 */
export function uniformScale(sx: number, sy: number, cap = RUN_PARTICLE_SCALE_CAP): { x: number; y: number } {
  const s = Math.min(Math.abs(sx), Math.abs(sy)) * Math.sign(sx || 1);
  const capped = Math.max(-cap, Math.min(cap, s));
  return { x: capped, y: capped };
}
