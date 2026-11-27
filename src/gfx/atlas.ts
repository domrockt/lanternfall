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

// ---------------------------------------------------------------------------
// Baked Atlas-Seiten (K2 m10-atlas-pack) — reine Packungs-Logik.
//
// Zweite Stufe neben dem Runtime-Atlas: statische, kleine Canvas-Texturen
// (Props, Icons, Player-/Portrait-Frames, Glyphen) werden NACH dem Erzeugen
// in Atlas-Seiten <= 2048 px kopiert. Der urspruengliche Texture-Key bleibt
// erhalten: Er wird mit einer Texture re-registriert, deren Source dieselbe
// WebGL-Textur wie die Seite benutzt und deren __BASE-Frame auf die Zelle
// zeigt (siehe bakeAtlas.ts, der Phaser-ABI-Teil). Aufrufer (GroundRenderer-
// Props, UI-Icons, font.ts-Glyphen) aendern sich nicht, aber alle gepackten
// Keys teilen sich eine GL-Textur pro Seite -> weniger Texturwechsel.
//
// Diese Datei bleibt frei von Laufzeit-Phaser-Nutzung, damit Vitest die
// puren Funktionen ohne DOM importieren kann.
// ---------------------------------------------------------------------------

/** Maximale Kantenlaenge einer gebackenen Atlas-Seite (Dom: <= 2048 px). */
export const BAKED_PAGE_SIZE = 2048;
/**
 * Kantenlaenge inkrementeller Seiten (Glyphen): kleiner, damit der Refresh
 * (Neu-Upload bei jeder neuen Glyphe) billig bleibt. 512 px fassen ~2200
 * 5x7-Glyphen — mehrere Seitenaequivalente der vorkommenden Glyphen.
 */
export const BAKED_INCREMENTAL_SIZE = 512;
/** Mindestabstand zwischen zwei Zellen auf einer Seite. */
export const BAKED_GUTTER = 2;
/** Transparentes Padding um jede Zelle (1 px Rand gegen Bleeding). */
export const BAKED_PAD = 1;

/** Praefixe der statischen, kleinen Texturen, die gebacken werden. */
export const BAKE_PREFIXES = ["prop_", "icon_", "player_", "portrait_", "glyph_"];

export function shouldBakeKey(key: string): boolean {
  return BAKE_PREFIXES.some((p) => key.startsWith(p));
}

export interface PackedFrame {
  key: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PackPagesResult {
  pageSize: number;
  pages: { width: number; height: number; usedHeight: number }[];
  frames: PackedFrame[];
  /** Keys, die zu gross fuer eine Seite waren (bleiben Einzeltexturen). */
  overflow: string[];
}

/**
 * Reine, deterministische Shelf-Packung in Seiten <= pageSize.
 * Sortierung (Hoehe absteigend, dann Key) macht das Ergebnis unabhaengig von
 * der Eingabereihenfolge. Jede Zelle ist `frame + 2 * pad` gross, zwischen
 * Zellen liegt mindestens `gutter` px.
 */
export function packPages(
  sizes: readonly { key: string; w: number; h: number }[],
  pageSize: number = BAKED_PAGE_SIZE,
  gutter: number = BAKED_GUTTER,
  pad: number = BAKED_PAD,
): PackPagesResult {
  const ordered = [...sizes].sort((a, b) => (b.h - a.h) || (a.key < b.key ? -1 : 1));
  const frames: PackedFrame[] = [];
  const overflow: string[] = [];
  const pages: { width: number; height: number; usedHeight: number }[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const s of ordered) {
    const cellW = s.w + pad * 2;
    const cellH = s.h + pad * 2;
    if (cellW > pageSize || cellH > pageSize) {
      overflow.push(s.key);
      continue;
    }
    if (pages.length === 0) pages.push({ width: pageSize, height: pageSize, usedHeight: 0 });
    if (x + cellW > pageSize) {
      x = 0;
      y += rowH + gutter;
      rowH = 0;
    }
    if (y + cellH > pageSize) {
      pages.push({ width: pageSize, height: pageSize, usedHeight: 0 });
      x = 0;
      y = 0;
      rowH = 0;
    }
    frames.push({ key: s.key, page: pages.length - 1, x: x + pad, y: y + pad, w: s.w, h: s.h });
    x += cellW + gutter;
    rowH = Math.max(rowH, cellH);
    pages[pages.length - 1].usedHeight = Math.max(pages[pages.length - 1].usedHeight, y + rowH);
  }
  return { pageSize, pages, frames, overflow };
}
