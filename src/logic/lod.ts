/**
 * M5-LOD: Effekt-Dichte an Gegnerlast anpassen. Reine Funktion, unit-getestet.
 * Schwelle laut Brief: > 400 Gegner → Partikel-Cap, Trails aus, Damage-Summen.
 */
export interface LodState {
  enemies: number;
  fxCap: number;
  particleCap: number;
  trails: boolean;
  damageAggregate: boolean;
  gemCap: number;
  /** Anzeige in Debug/HUD. */
  level: "full" | "reduced" | "minimal";
}

export const LOD_THRESHOLD = 400;
export const LOD_REDUCED_THRESHOLD = 250;

export function lodFor(enemies: number): LodState {
  const n = Math.max(0, Math.floor(enemies));
  if (n > LOD_THRESHOLD) {
    return { enemies: n, fxCap: 90, particleCap: 160, trails: false, damageAggregate: true, gemCap: 110, level: "minimal" };
  }
  if (n > LOD_REDUCED_THRESHOLD) {
    return { enemies: n, fxCap: 150, particleCap: 240, trails: true, damageAggregate: false, gemCap: 170, level: "reduced" };
  }
  return { enemies: n, fxCap: 220, particleCap: 360, trails: true, damageAggregate: false, gemCap: 240, level: "full" };
}
