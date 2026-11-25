/** Moorwasser: 40 % Tempoabzug für Spieler und Gegner (sichtbar durch Spritzer). */
export type TerrainKind = "grass" | "water" | "mud" | "path";

export const WATER_SLOW_FACTOR = 0.6;

export function terrainSpeedFactor(kind: TerrainKind): number {
  return kind === "water" ? WATER_SLOW_FACTOR : 1;
}

export function isWater(kind: TerrainKind): boolean {
  return kind === "water";
}

/** Nur auf Wasser entstehen Spritzer-Partikel. */
export function isSplashTerrain(kind: TerrainKind): boolean {
  return kind === "water";
}
