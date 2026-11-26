import Phaser from "phaser";
import { ALL_BOSS_FRAMES, ALL_ENEMY_FRAMES } from "./enemySprites";

/**
 * Laufzeit-Atlas für heiße Sprite-Klassen (Gegner, Gems, Projektile, Partikel,
 * Waffen-VFX). Vorher hatte jede Frame-Textur eigene WebGL-Textur; Phaser
 * musste dadurch zwischen bis zu ~20 Texturen pro Frame flushen. Mit einem
 * gemeinsamen Atlas bleiben Gegner/Gems/Effekte in wenigen Batches.
 *
 * Die Original-Texturen bleiben erhalten (Debug/Tileset/Abnahme-Skripte greifen
 * weiterhin auf ihre Keys zu); gerendert wird über Frame-Namen im Atlas.
 */
export const ATLAS_KEY = "runtime_atlas";

const atlased = new Set<string>();

/** Diese Präfixe landen im Atlas (kleine, massenhaft gezeichnete Sprites). */
const ATLAS_PREFIXES = [
  "enemy_", "boss_", "gem_", "fx_", "projectile_", "orb_",
  "enemy_shot_", "telegraph_", "ring_", "chest_", "arrow_chest",
  "elite_aura", "water_ripple_",
];

const ATLAS_DENY = new Set(["light_radius", "vignette", "shadow"]);

const KNOWN_FRAMES = new Set<string>([
  ...Object.values(ALL_ENEMY_FRAMES).flat(),
  ...Object.values(ALL_BOSS_FRAMES).flat(),
]);

function shouldAtlas(key: string): boolean {
  if (ATLAS_DENY.has(key) || key === ATLAS_KEY) return false;
  if (KNOWN_FRAMES.has(key)) return true;
  return ATLAS_PREFIXES.some((p) => key.startsWith(p));
}

interface Packed {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  source: CanvasImageSource;
}

/** Packt alle passenden Canvas-Texturen in einen 1024er-Shelf-Atlas. */
export function buildRuntimeAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS_KEY)) return;
  const keys = scene.textures.getTextureKeys().filter(shouldAtlas);
  const packed: Packed[] = [];
  for (const key of keys) {
    const texture = scene.textures.get(key);
    const source = texture.getSourceImage() as CanvasImageSource;
    const frame = texture.get();
    if (!source || !frame || frame.width <= 0 || frame.height <= 0) continue;
    packed.push({ key, x: 0, y: 0, w: frame.width, h: frame.height, source });
  }
  // Hohe Sprites zuerst, damit die Shelf-Packung wenig Leerraum lässt.
  packed.sort((a, b) => b.h - a.h);
  const width = 1024;
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const p of packed) {
    if (x + p.w > width) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    p.x = x;
    p.y = y;
    x += p.w + 1;
    rowH = Math.max(rowH, p.h);
  }
  const height = Math.max(1, y + rowH);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (const p of packed) {
    ctx.drawImage(p.source, p.x, p.y, p.w, p.h);
  }
  scene.textures.addCanvas(ATLAS_KEY, canvas);
  const atlas = scene.textures.get(ATLAS_KEY);
  for (const p of packed) {
    atlas.add(p.key, 0, p.x, p.y, p.w, p.h);
    atlased.add(p.key);
  }
}

/** Texture-Key, der zum Zeichnen benutzt werden soll (Atlas oder Original). */
export function atlasTextureKey(key: string): string {
  return atlased.has(key) ? ATLAS_KEY : key;
}

/** Setzt eine Textur korrekt, auch wenn ihr Frame im Atlas liegt. */
export function applyTexture(
  obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  key: string,
): void {
  if (atlased.has(key)) obj.setTexture(ATLAS_KEY, key);
  else obj.setTexture(key);
}

/** Aktueller Frame-/Textur-Name (für „nur bei Änderung setzen“-Vergleiche). */
export function currentFrame(obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image): string {
  return obj.frame?.name ?? obj.texture.key;
}

/** Erzeugt ein Image direkt mit Atlas-Frame (spart einen setTexture-Aufruf). */
export function makeImage(scene: Phaser.Scene, x: number, y: number, key: string): Phaser.GameObjects.Image {
  return atlased.has(key)
    ? scene.add.image(x, y, ATLAS_KEY, key)
    : scene.add.image(x, y, key);
}
