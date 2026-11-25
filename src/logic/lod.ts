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
    return { enemies: n, fxCap: 60, particleCap: 100, trails: false, damageAggregate: true, gemCap: 90, level: "minimal" };
  }
  if (n > LOD_REDUCED_THRESHOLD) {
    return { enemies: n, fxCap: 90, particleCap: 140, trails: false, damageAggregate: true, gemCap: 140, level: "reduced" };
  }
  return { enemies: n, fxCap: 180, particleCap: 280, trails: true, damageAggregate: false, gemCap: 180, level: "full" };
}
