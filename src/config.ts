export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;
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
