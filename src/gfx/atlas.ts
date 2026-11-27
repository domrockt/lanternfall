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

/**
 * Diese Präfixe landen im Atlas (kleine, massenhaft gezeichnete Sprites).
 * `flail_`/`chain_`/`bone_`/`puddle_` sind ebenfalls heisse Waffen-/Boss-VFX,
 * die vorher als Einzeltexturen zusätzliche Draw-Calls erzeugt haben.
 */
export const ATLAS_PREFIXES = [
  "enemy_", "boss_", "gem_", "fx_", "projectile_", "orb_",
  "enemy_shot_", "telegraph_", "ring_", "chest_", "arrow_chest",
  "elite_aura", "water_ripple_", "flail_", "chain_", "bone_", "puddle_",
];

export const ATLAS_DENY = new Set(["light_radius", "vignette", "shadow"]);

/** Atlasbreite und Sicherheitsabstände (Pixel). */
export const ATLAS_WIDTH = 1024;
/** Mindestabstand zwischen zwei Zellen im Atlas. */
export const ATLAS_GUTTER = 2;
/** Transparentes Padding um jeden Frame innerhalb seiner Zelle. */
export const ATLAS_PAD = 1;

export interface AtlasFrameRect {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasPackResult {
  width: number;
  height: number;
  frames: AtlasFrameRect[];
}

const KNOWN_FRAMES = new Set<string>([
  ...Object.values(ALL_ENEMY_FRAMES).flat(),
  ...Object.values(ALL_BOSS_FRAMES).flat(),
]);

export function shouldAtlasKey(key: string): boolean {
  if (ATLAS_DENY.has(key) || key === ATLAS_KEY) return false;
  if (KNOWN_FRAMES.has(key)) return true;
  return ATLAS_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Reine, deterministische Shelf-Packung. Jede Zelle ist `frame + 2 * ATLAS_PAD`
 * gross; zwischen Zellen liegt mindestens `gutter` px. Dadurch kann
 * GPU-Sampling weder die eigene Kante noch die Nachbarzelle treffen.
 * Gleiche Eingaben ergeben immer dieselbe Atlasgrösse und dieselben Rechtecke.
 */
export function packAtlas(
  sizes: readonly { key: string; w: number; h: number }[],
  width: number = ATLAS_WIDTH,
  gutter: number = ATLAS_GUTTER,
  pad: number = ATLAS_PAD,
): AtlasPackResult {
  const ordered = [...sizes].sort((a, b) => (b.h - a.h) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const frames: AtlasFrameRect[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const s of ordered) {
    const cellW = s.w + pad * 2;
    const cellH = s.h + pad * 2;
    if (cellW > width) throw new Error(`Atlas: Frame "${s.key}" (${s.w}px) passt nicht in ${width}px Breite`);
    if (x + cellW > width) {
      x = 0;
      y += rowH + gutter;
      rowH = 0;
    }
    frames.push({ key: s.key, x: x + pad, y: y + pad, w: s.w, h: s.h });
    x += cellW + gutter;
    rowH = Math.max(rowH, cellH);
  }
  return { width, height: Math.max(1, y + rowH), frames };
}

/** Packt alle passenden Canvas-Texturen in einen 1024er-Shelf-Atlas. */
export function buildRuntimeAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS_KEY)) return;
  const keys = scene.textures.getTextureKeys().filter(shouldAtlasKey);
  const sources = new Map<string, CanvasImageSource>();
  const sizes: { key: string; w: number; h: number }[] = [];
  for (const key of keys) {
    const texture = scene.textures.get(key);
    const source = texture.getSourceImage() as CanvasImageSource;
    const frame = texture.get();
    if (!source || !frame || frame.width <= 0 || frame.height <= 0) continue;
    sources.set(key, source);
    sizes.push({ key, w: frame.width, h: frame.height });
  }
  const packed = packAtlas(sizes);
  const canvas = document.createElement("canvas");
  canvas.width = packed.width;
  canvas.height = packed.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (const p of packed.frames) {
    ctx.drawImage(sources.get(p.key)!, p.x, p.y, p.w, p.h);
  }
  scene.textures.addCanvas(ATLAS_KEY, canvas);
  const atlas = scene.textures.get(ATLAS_KEY);
  for (const p of packed.frames) {
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
