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

/** M6: Effekt-Alpha je LOD-Stufe (Endgame lesbar halten). */
export function fxAlphaFor(level: LodState["level"]): number {
  return level === "minimal" ? 0.5 : level === "reduced" ? 0.72 : 1;
}

export const LOD_THRESHOLD = 299;
export const LOD_REDUCED_THRESHOLD = 200;

/**
 * M10-Ambient: Glühwürmchen/Nebel sind bildschirmverankerte ADD/NORMAL-Sprites.
 * Im Endgame brechen sie das Batching (m10-perf-recovery, c0f56d5). Die Glow-Zahl
 * wird deshalb an die Gegnerlast gekoppelt; der Nebel bleibt als ruhiger Layer.
 */
export interface AmbientBudget {
  /** Sichtbare ADD-Glühwürmchen (max. 24). */
  glow: number;
  /** Sichtbare NORMAL-Nebelbänder (max. 3). */
  fog: number;
  /** Update-Rate der Ambient-Animation in Hz. */
  updateHz: number;
}

export const AMBIENT_GLOW_MAX = 24;
export const AMBIENT_FOG_MAX = 3;

export function ambientBudgetFor(enemies: number): AmbientBudget {
  const n = Math.max(0, Math.floor(enemies));
  if (n >= 360) return { glow: 0, fog: 1, updateHz: 15 };
  if (n >= 250) return { glow: 0, fog: 1, updateHz: 30 };
  return { glow: AMBIENT_GLOW_MAX, fog: AMBIENT_FOG_MAX, updateHz: 60 };
}

/** Anzahl Blend-Batches, die der Ambient-Layer im Idealfall kostet (Fog+NORMAL, Glow+ADD). */
export function ambientBatchCount(budget: AmbientBudget): number {
  return (budget.fog > 0 ? 1 : 0) + (budget.glow > 0 ? 1 : 0);
}

export function lodFor(enemies: number, pressure = false): LodState {
  const n = Math.max(0, Math.floor(enemies));
  // Endboss-Kampf: auch bei (kurzzeitig) wenigen Gegnern viele Evolutions-VFX,
  // Projektile und Warnflaechen. Eine Stufe hoeher halten die 55 FPS.
  const boost = pressure ? 1 : 0;
  if (n > LOD_THRESHOLD) {
    return { enemies: n, fxCap: 60, particleCap: 100, trails: false, damageAggregate: true, gemCap: 90, level: "minimal" };
  }
  if (n > LOD_REDUCED_THRESHOLD || boost > 0) {
    const minimal = n > LOD_REDUCED_THRESHOLD && boost > 0;
    return minimal
      ? { enemies: n, fxCap: 60, particleCap: 100, trails: false, damageAggregate: true, gemCap: 90, level: "minimal" }
      : { enemies: n, fxCap: 90, particleCap: 140, trails: false, damageAggregate: true, gemCap: 140, level: "reduced" };
  }
  return { enemies: n, fxCap: 180, particleCap: 280, trails: true, damageAggregate: false, gemCap: 180, level: "full" };
}
