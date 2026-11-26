/**
 * M8: View-Groesse ist dynamisch (logische Hoehe 360, Breite je Seitenverhaeltnis).
 * Die Exporte sind `let`-Bindings: importierende Module sehen Aenderungen live.
 * Gesetzt wird ausschliesslich ueber setGameView() aus main.ts.
 */
export let GAME_WIDTH = 640;
export let GAME_HEIGHT = 360;
/** Geraetepixel pro Spielpixel (n aus floor(geraeteHoehe/360), Fit-Rueckfall gebrochen). */
export let GAME_SCALE = 3;

export function setGameView(width: number, height: number, scale: number): void {
  GAME_WIDTH = Math.max(1, Math.round(width));
  GAME_HEIGHT = Math.max(1, Math.round(height));
  GAME_SCALE = Math.max(0.1, scale);
}

export const TILE = 16;
export const CHUNK_TILES = 16;
export const CHUNK_SIZE = TILE * CHUNK_TILES;
export const WORLD_TILES = 256;
export const WORLD_SIZE = TILE * WORLD_TILES;

export const MAX_WEAPON_SLOTS = 6;
export const MAX_PASSIVE_SLOTS = 6;
export const RUN_LENGTH = 30 * 60; // Sekunden
export const PLAYER_BASE_PICKUP_RADIUS = 22;
/** Maximaler Simulations-Teilschritt (s) gegen Tunnel-Kollisionen bei hoher Zeitskalierung. */
export const SIM_MAX_STEP = 1 / 20;
export const PLAYER_INVULN = 0.8;
