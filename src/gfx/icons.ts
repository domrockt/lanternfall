import Phaser from "phaser";
import { PAL } from "../palette";
import { isEvolutionWeapon } from "../data/weaponIds";

type Rect = readonly [x: number, y: number, w: number, h: number, color: number];

/**
 * 16x16-UI-Icons, gezeichnet als Paletten-Rechtecke (dunkle 1-px-Kontur,
 * klare Silhouette, Lichtkante). Keys: weapon_<id>, passive_<id>, evo_<id>.
 */
export const ICON_RECTS: Record<string, Rect[]> = {
  weapon_ember: [
    [6, 1, 4, 2, 0], [5, 3, 6, 3, 0], [4, 4, 8, 8, 0], [5, 12, 6, 3, 0], [6, 15, 4, 1, 0],
    [7, 2, 2, 1, 21], [6, 3, 4, 2, 20], [5, 5, 6, 4, 18], [6, 9, 4, 4, 17], [7, 13, 2, 2, 15],
    [8, 4, 2, 3, 22],
  ],
  weapon_flail: [
    [2, 2, 2, 2, 0], [4, 4, 2, 2, 0], [6, 6, 2, 2, 0], [8, 5, 8, 8, 0],
    [2, 2, 2, 2, 8], [4, 4, 2, 2, 7], [6, 6, 2, 2, 7],
    [9, 6, 6, 6, 6], [9, 6, 4, 4, 7], [10, 7, 2, 2, 9], [11, 8, 1, 1, 13],
    [8, 8, 1, 1, 8], [15, 9, 1, 2, 8], [12, 13, 1, 1, 8], [12, 5, 1, 1, 8],
  ],
  weapon_frost: [
    [6, 1, 4, 14, 0], [1, 6, 14, 4, 0],
    [7, 2, 2, 12, 8], [2, 7, 12, 2, 8],
    [4, 4, 2, 2, 9], [10, 4, 2, 2, 9], [4, 10, 2, 2, 9], [10, 10, 2, 2, 9],
    [6, 6, 4, 4, 12], [7, 7, 2, 2, 13],
  ],
  weapon_thorn: [
    [2, 6, 12, 8, 0], [3, 3, 2, 5, 0], [7, 2, 2, 6, 0], [11, 3, 2, 4, 0],
    [3, 7, 10, 6, 29], [4, 4, 1, 4, 31], [8, 3, 1, 5, 31], [12, 4, 1, 3, 30],
    [4, 12, 2, 2, 30], [8, 12, 2, 3, 31], [12, 11, 2, 3, 30], [7, 9, 2, 2, 28],
  ],
  weapon_storm: [
    [7, 1, 4, 5, 0], [5, 5, 5, 3, 0], [7, 7, 3, 2, 0], [4, 9, 6, 6, 0],
    [8, 2, 2, 3, 21], [6, 5, 4, 3, 21], [8, 8, 2, 1, 20], [6, 10, 3, 4, 21],
    [8, 2, 1, 2, 13],
  ],
  weapon_lantern: [
    [7, 1, 2, 2, 0], [4, 3, 8, 2, 0], [4, 5, 8, 8, 0], [5, 13, 6, 2, 0],
    [5, 5, 6, 7, 20], [6, 6, 4, 5, 22], [7, 7, 2, 3, 13], [5, 12, 6, 1, 6], [8, 2, 1, 1, 20],
  ],
  passive_boots: [
    [4, 2, 3, 12, 0], [6, 12, 8, 3, 0],
    [5, 3, 2, 8, 16], [5, 9, 3, 4, 16], [8, 11, 5, 2, 17], [5, 3, 1, 2, 20], [6, 13, 7, 1, 0],
  ],
  passive_tome: [
    [2, 3, 12, 11, 0], [3, 4, 10, 9, 6], [4, 5, 4, 6, 13], [8, 5, 4, 6, 13],
    [7, 5, 2, 7, 8], [4, 7, 3, 1, 8], [9, 7, 3, 1, 8], [4, 9, 3, 1, 7], [9, 9, 3, 1, 7],
  ],
  passive_heart: [
    [3, 4, 10, 7, 0], [4, 3, 4, 3, 0], [8, 3, 4, 3, 0], [4, 11, 8, 2, 0], [5, 10, 6, 2, 0], [6, 12, 4, 2, 0],
    [4, 4, 4, 4, 25], [8, 4, 4, 4, 25], [5, 8, 6, 3, 25], [6, 11, 4, 2, 24], [4, 4, 2, 2, 26],
  ],
  passive_charm: [
    [2, 2, 2, 4, 0], [4, 4, 2, 3, 0], [10, 2, 2, 4, 0], [10, 5, 2, 3, 0],
    [5, 6, 6, 7, 0], [6, 7, 4, 5, 20], [6, 8, 2, 2, 22], [8, 8, 2, 2, 13], [7, 10, 2, 1, 21],
  ],
  passive_whetstone: [
    [2, 8, 12, 6, 0], [3, 5, 4, 4, 0], [9, 5, 4, 4, 0],
    [3, 8, 10, 5, 5], [3, 9, 10, 2, 7], [4, 6, 3, 1, 8], [13, 4, 1, 3, 21],
    [10, 2, 2, 1, 13], [15, 7, 1, 1, 21], [2, 6, 1, 1, 21],
  ],
  passive_hourglass: [
    [4, 2, 8, 2, 0], [3, 4, 10, 3, 0], [6, 7, 4, 2, 0], [3, 9, 10, 3, 0], [4, 12, 8, 2, 0],
    [5, 3, 6, 1, 20], [4, 4, 8, 2, 21], [6, 7, 4, 1, 20], [4, 9, 8, 2, 21], [5, 12, 6, 1, 20],
    [7, 8, 2, 2, 22],
  ],
  evo_phoenix: [
    [2, 6, 12, 6, 0], [5, 3, 6, 3, 0], [10, 2, 4, 2, 0],
    [3, 7, 10, 4, 18], [6, 4, 4, 2, 20], [11, 3, 2, 1, 21],
    [2, 5, 3, 2, 19], [12, 6, 3, 3, 17], [7, 7, 1, 1, 13], [8, 3, 1, 1, 13],
  ],
  evo_wrath_pendulum: [
    [2, 2, 2, 2, 0], [4, 4, 2, 2, 0], [7, 6, 4, 4, 0],
    [2, 2, 2, 2, 8], [4, 4, 2, 2, 7],
    [7, 7, 3, 2, 25], [8, 8, 1, 1, 26], [8, 6, 2, 2, 0],
    [3, 3, 2, 2, 7], [11, 3, 2, 2, 7], [3, 11, 2, 2, 7], [11, 11, 2, 2, 7],
    [7, 2, 2, 1, 8], [7, 13, 2, 1, 8],
  ],
  evo_eternal_winter: [
    [2, 2, 12, 2, 0], [2, 12, 12, 2, 0], [2, 2, 2, 12, 0], [12, 2, 2, 12, 0],
    [5, 3, 6, 2, 9], [5, 11, 6, 2, 9], [3, 5, 2, 6, 9], [11, 5, 2, 6, 9],
    [7, 4, 2, 8, 12], [4, 7, 8, 2, 12], [6, 6, 4, 4, 13],
  ],
  evo_thorn_storm: [
    [3, 3, 10, 10, 0], [2, 7, 2, 2, 0], [12, 7, 2, 2, 0], [7, 2, 2, 2, 0], [7, 12, 2, 2, 0],
    [2, 7, 2, 2, 31], [12, 7, 2, 2, 31], [7, 2, 2, 2, 31], [7, 12, 2, 2, 31],
    [4, 4, 2, 2, 31], [10, 4, 2, 2, 31], [4, 10, 2, 2, 31], [10, 10, 2, 2, 31],
    [6, 6, 4, 4, 29], [7, 7, 2, 2, 28],
  ],
  evo_thunder_seal: [
    [3, 2, 10, 2, 0], [3, 12, 10, 2, 0], [2, 4, 2, 8, 0], [12, 4, 2, 8, 0],
    [3, 3, 10, 2, 21], [3, 11, 10, 2, 21], [3, 3, 2, 10, 21], [11, 3, 2, 10, 21],
    [7, 4, 2, 3, 13], [6, 6, 3, 2, 13], [8, 8, 2, 1, 13], [6, 9, 3, 3, 13],
  ],
  evo_soul_beacon: [
    [5, 1, 6, 3, 0], [3, 4, 10, 8, 0], [5, 12, 6, 3, 0],
    [4, 5, 8, 6, 8], [6, 6, 4, 4, 12], [7, 7, 2, 2, 13],
    [5, 2, 1, 1, 13], [10, 2, 1, 1, 12], [1, 7, 2, 2, 8], [13, 7, 2, 2, 8],
    [7, 11, 2, 1, 8],
  ],
};

export const ICON_TEXTURE_KEYS = Object.keys(ICON_RECTS).map((k) => `icon_${k}`);

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

/** Prüft zur Laufzeit 16x16-Grenzen, Kontur (Palettenindex 0) und Distinktheit. */
function validateIcons(): void {
  const signatures = new Set<string>();
  for (const [key, rects] of Object.entries(ICON_RECTS)) {
    let hasContour = false;
    for (const [x, y, w, h, color] of rects) {
      if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 16 || y + h > 16) {
        throw new Error(`icon ${key}: rect ausserhalb 16x16 (${x},${y},${w},${h})`);
      }
      if (color < 0 || color >= PAL.length) throw new Error(`icon ${key}: Palettenindex ${color} ungueltig`);
      if (color === 0) hasContour = true;
    }
    if (!hasContour) throw new Error(`icon ${key}: dunkle 1-px-Kontur fehlt`);
    const sig = rects.map((r) => r.join(",")).join("|");
    if (signatures.has(sig)) throw new Error(`icon ${key}: doppeltes Icon`);
    signatures.add(sig);
  }
  if (Object.keys(ICON_RECTS).length !== 18) {
    throw new Error(`icons: erwartet 18 (6 Waffen + 6 Powerups + 6 Evolutionen), erhalten ${Object.keys(ICON_RECTS).length}`);
  }
}

export function createIconTextures(scene: Phaser.Scene): void {
  validateIcons();
  for (const [key, rects] of Object.entries(ICON_RECTS)) {
    const textureKey = `icon_${key}`;
    if (scene.textures.exists(textureKey)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    for (const [x, y, w, h, color] of rects) {
      ctx.fillStyle = hex(color);
      ctx.fillRect(x, y, w, h);
    }
    scene.textures.addCanvas(textureKey, canvas);
  }
}
