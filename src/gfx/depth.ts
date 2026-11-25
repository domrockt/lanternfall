/**
 * Verbindliche Zeichenreihenfolge (M5-Lesbarkeit):
 * Boden/Decals < XP-Kristalle < Spieler-VFX < Gegner-Silhouetten <
 * Warnflächen < Gegner-Projektile < Spieler < Licht/Vignette < UI.
 *
 * Gegner und ihre Projektile müssen in jedem Chaos über den Spieler-Effekten
 * liegen; Warnflächen bleiben unter Projektilen, aber über Gegnern? Nein:
 * Warnflächen gehören über die Silhouetten, damit man sie im Schwarm sieht.
 */
export const DEPTH = {
  decal: 4,
  gem: 5,
  trail: 6,
  fxLow: 7,
  death: 8,
  enemy: 9,
  boss: 10,
  enemyDeath: 11,
  player: 12,
  hazard: 13,
  enemyShot: 14,
  light: 20,
  dawn: 75,
  vignette: 80,
  ui: 90,
} as const;
