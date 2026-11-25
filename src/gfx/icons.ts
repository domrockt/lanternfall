import Phaser from "phaser";
import { PAL } from "../palette";
import { isEvolutionWeapon } from "../data/weaponIds";
import { GEN_ICONS } from "./gen-icons";

type Rect = readonly [x: number, y: number, w: number, h: number, color: number];

/**
 * 16x16-UI-Icons, gezeichnet als Paletten-Rechtecke (dunkle 1-px-Kontur,
 * klare Silhouette, Lichtkante). Keys: weapon_<id>, passive_<id>, evo_<id>.
 */
/**
 * 16x16-UI-Icons aus der Python-Pipeline (scripts/art/gen_icons.py):
 * 1-px-Kontur, Lichtkante oben-links, Schatten unten-rechts. Keys:
 * weapon_<id>, passive_<id>, evo_<id>.
 */
export const ICON_GRIDS: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(GEN_ICONS).map(([key, def]) => [key, def.frames[0]]),
);

export const ICON_TEXTURE_KEYS = Object.keys(ICON_GRIDS).map((k) => `icon_${k}`);

export function iconTextureKey(kind: "weapon" | "passive" | "evolution", id: string): string {
  const prefix = kind === "evolution" ? "evo" : kind;
  return `icon_${prefix}_${id}`;
}

/** Icon-Key für eine angebotene Waffe/Powerup (Evolutionen laufen als Waffe). */
export function iconKeyForOffer(kind: "weapon" | "passive", id: string): string {
  return iconTextureKey(kind === "weapon" && isEvolutionWeapon(id) ? "evolution" : kind, id);
}

function hex(i: number): string {
  return "#" + PAL[i].toString(16).padStart(6, "0");
}

/** Prüft 16x16-Raster, Palettenindizes, Kontur (Index 0) und Distinktheit. */
function validateIcons(): void {
  const signatures = new Set<string>();
  for (const [key, rows] of Object.entries(ICON_GRIDS)) {
    if (rows.length !== 16 || rows.some((r) => r.length !== 16)) {
      throw new Error(`icon ${key}: Raster ist nicht 16x16`);
    }
    let hasContour = false;
    for (const ch of rows.join("")) {
      if (ch === ".") continue;
      const idx = ch >= "0" && ch <= "9" ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 87;
      if (idx < 0 || idx >= PAL.length) throw new Error(`icon ${key}: Palettenindex ${ch} ungueltig`);
      if (idx === 0) hasContour = true;
    }
    if (!hasContour) throw new Error(`icon ${key}: dunkle 1-px-Kontur fehlt`);
    if (signatures.has(rows.join("|"))) throw new Error(`icon ${key}: doppeltes Icon`);
    signatures.add(rows.join("|"));
  }
  if (Object.keys(ICON_GRIDS).length !== 18) {
    throw new Error(`icons: erwartet 18 (6 Waffen + 6 Powerups + 6 Evolutionen), erhalten ${Object.keys(ICON_GRIDS).length}`);
  }
}

export function createIconTextures(scene: Phaser.Scene): void {
  validateIcons();
  for (const [key, rows] of Object.entries(ICON_GRIDS)) {
    const textureKey = `icon_${key}`;
    if (scene.textures.exists(textureKey)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const ch = rows[y][x];
        if (ch === ".") continue;
        const idx = ch >= "0" && ch <= "9" ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 87;
        ctx.fillStyle = hex(idx);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    scene.textures.addCanvas(textureKey, canvas);
  }
}
