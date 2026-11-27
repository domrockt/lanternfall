import { SPRITE_FRAMES } from "../gfx/textures";
import type { EnemyDef } from "../data/types";

/**
 * M10-enemy-frame-cadence: SPRITE_FRAMES ist nach Gegner-ID ("bog_rat") bzw.
 * Boss-ID ("moor_queen") verschluesselt (Spread von ALL_ENEMY_FRAMES /
 * ALL_BOSS_FRAMES), EnemyDef traegt aber einen spriteKey ("enemy_bog_rat",
 * Bosse "boss_moor_queen" aus BossSystem.bossEnemyDef). Vor dem Fix griff die
 * Suche nach spriteKey nur bei den 3 Legacy-2-Frame-Eintraegen — fuer die
 * anderen 27 Gegner und alle Bosse war das Ergebnis undefined, es lief keine
 * Frame-Animation. Hier wird zugeordnet, ohne Textur-/Atlas-Keys anzufassen:
 * - Bosse: spriteKey "boss_<id>" -> SPRITE_FRAMES["<id>"] (3 Frames, F2 = Wind-up)
 * - Gegner: erst ID (4 generierte Lauf-Frames), sonst Legacy-spriteKey (2 Frames)
 */
export function framesForDef(def: EnemyDef): string[] | undefined {
  if (def.spriteKey.startsWith("boss_")) {
    return SPRITE_FRAMES[def.spriteKey.slice("boss_".length)] ?? SPRITE_FRAMES[def.spriteKey];
  }
  return SPRITE_FRAMES[def.id] ?? SPRITE_FRAMES[def.spriteKey];
}

/** Lauf-Frame-Rate in fps (vorher Magic Number in Run.ts). */
export const RUN_FPS = 6;

/**
 * Lauf-Frame-Index: RUN_FPS Frames/s, zyklisch ueber ALLE verfuegbaren Frames.
 * Vorher begrenzte Run.ts den Modulo hart auf 2 (`% Math.min(2, frames.length)`),
 * wodurch F2/F3 der generierten 4-Frame-Sprites nie gezeigt wurden.
 * Reine Funktion, von Run.ts und tests/enemy-run-frames.test.ts genutzt.
 */
export function runFrameIndex(frameCount: number, t: number, phase: number): number {
  if (frameCount <= 0) return 0;
  return Math.floor(t * RUN_FPS + phase) % frameCount;
}
