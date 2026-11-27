import type Phaser from "phaser";
import {
  BAKED_GUTTER,
  BAKED_PAD,
  BAKED_PAGE_SIZE,
  BAKED_INCREMENTAL_SIZE,
  ATLAS_KEY,
  packPages,
  shouldBakeKey,
  type PackedFrame,
} from "./atlas";

// ---------------------------------------------------------------------------
// Baked Atlas-Seiten (K2 m10-atlas-pack) — Phaser-ABI-Teil.
//
// Siehe atlas.ts (reine Packungs-Logik). Diese Datei registriert gepackte
// Keys im TextureManager: Der urspruengliche Key bleibt erhalten, seine
// Texture teilt sich die WebGL-Textur (WebGLTextureWrapper) der Seite und
// der __BASE-Frame zeigt auf die Zelle. Damit bleiben ALLE Aufrufer nicht
// veraendert (GroundRenderer-Props, UI-Icons, font.ts-Glyphen), aber alle
// gepackten Keys batchen ueber eine GL-Textur pro Seite.
// ---------------------------------------------------------------------------

interface BakedPage {
  key: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  rowH: number;
  /** Kantenlaenge der Seite (Shelf-Limit). */
  size: number;
  /** Inkrementelle Seiten nehmen lazily weiter Texturen auf (Glyphen). */
  incremental: boolean;
}

/** Seiten-Zustand; Glyphen kommen nach dem Boot lazily dazu. */
const bakedPages: BakedPage[] = [];

/**
 * Nach einem Neustart des Spiels sind alte Seiten-Zustaende ungueltig
 * (TextureManager geleert). Erkennen und zuruecksetzen.
 */
function ensurePagesValid(scene: Phaser.Scene): boolean {
  if (bakedPages.length > 0 && !scene.textures.exists(bakedPages[0].key)) {
    bakedPages.length = 0;
    staticBaked = false;
  }
  return bakedPages.length === 0;
}

/** Das statische Backen laeuft einmal pro Spiel (Glyphen-Seiten zaehlen nicht). */
let staticBaked = false;

function addPage(scene: Phaser.Scene, size: number, height: number, incremental: boolean): BakedPage {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const page: BakedPage = {
    key: `baked_page_${bakedPages.length}`,
    canvas,
    ctx,
    x: 0,
    y: 0,
    rowH: 0,
    size,
    incremental,
  };
  scene.textures.addCanvas(page.key, canvas);
  bakedPages.push(page);
  return page;
}

/** Registriert `key` neu: gleiche GL-Textur wie die Seite, __BASE = Zelle. */
function registerBaked(
  scene: Phaser.Scene,
  key: string,
  page: BakedPage,
  rect: { x: number; y: number; w: number; h: number },
  source: CanvasImageSource,
): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const pageTex = scene.textures.get(page.key);
  const gl = pageTex.source[0]?.glTexture as unknown;
  if (!gl) {
    // Fallback (Canvas-Renderer): Einzeltextur behalten.
    scene.textures.addCanvas(key, source as HTMLCanvasElement);
    return;
  }
  // TextureManager.create(key, gl, pageWidth, pageHeight) entspricht exakt dem
  // frueheren `new Phaser.Textures.Texture(...)` + manuellem list-Eintrag — mit
  // EXPLIZITEN Seitenmassen statt der Wrapper-Masse (addGLTexture liest die aus
  // dem GL-Wrapper, was an Glyphkanten 1px-UV-Abweichungen verursachte). Damit
  // bleibt die Datei frei von Phaser-Wert-Importen: Tests, die nur charIndex/
  // SPRITE_GRIDS aus textures.ts ziehen, laden kein window mehr (Node-Tests).
  const tex = scene.textures.create(key, gl as never, page.canvas.width, page.canvas.height);
  if (!tex) {
    scene.textures.addCanvas(key, source as HTMLCanvasElement);
    return;
  }
  tex.remove("__BASE");
  tex.add("__BASE", 0, rect.x, rect.y, rect.w, rect.h);
}

/**
 * Kopiert ein frisch erzeugtes Canvas in eine Atlas-Seite und registriert den
 * Key dort (Aufrufer-transparent). Fuer lazy erstellte Texturen (Glyphen).
 * Existiert der Key schon, passiert nichts (Aufrufer prueft vorher).
 */
export function packCanvasTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  if (scene.textures.exists(key) || key === ATLAS_KEY) return;
  ensurePagesValid(scene);
  const cellW = canvas.width + BAKED_PAD * 2;
  const cellH = canvas.height + BAKED_PAD * 2;
  if (cellW > BAKED_PAGE_SIZE || cellH > BAKED_PAGE_SIZE) {
    scene.textures.addCanvas(key, canvas);
    return;
  }
  let page = bakedPages.find((p) => p.incremental);
  if (!page) page = addPage(scene, BAKED_INCREMENTAL_SIZE, BAKED_INCREMENTAL_SIZE, true);
  if (page.x + cellW > page.size) {
    page.x = 0;
    page.y += page.rowH + BAKED_GUTTER;
    page.rowH = 0;
  }
  if (page.y + cellH > page.size) {
    page = addPage(scene, BAKED_INCREMENTAL_SIZE, BAKED_INCREMENTAL_SIZE, true);
  }
  const rect = { x: page.x + BAKED_PAD, y: page.y + BAKED_PAD, w: canvas.width, h: canvas.height };
  page.ctx.drawImage(canvas, rect.x, rect.y);
  page.x += cellW + BAKED_GUTTER;
  page.rowH = Math.max(page.rowH, cellH);
  // WICHTIG: Canvas neu auf die GPU hochladen — die Seite wurde beim addCanvas
  // hochgeladen; ohne Refresh waeren spaeter kommende Glyphen unsichtbar.
  const pageTex = scene.textures.get(page.key) as Phaser.Textures.CanvasTexture | null;
  if (pageTex && typeof pageTex.refresh === "function") pageTex.refresh();
  registerBaked(scene, key, page, rect, canvas);
}

export interface BakeStaticResult {
  pages: number;
  frames: number;
  overflow: string[];
  keys: string[];
}

let bakeStats: BakeStaticResult | null = null;

/** Statistik des letzten Backlaufs (fuer Doku/Audit). */
export function getBakeStats(): BakeStaticResult | null {
  return bakeStats;
}

/**
 * Backt alle bereits erzeugten statischen Klein-Texturen (Props, Icons,
 * Player-/Portrait-Frames) in Atlas-Seiten <= 2048 px. Deterministisch und
 * idempotent: laeuft nur beim ersten Boot.
 */
export function bakeStaticAtlas(scene: Phaser.Scene): BakeStaticResult {
  ensurePagesValid(scene);
  if (staticBaked) {
    return bakeStats ?? { pages: 0, frames: 0, overflow: [], keys: [] };
  }
  staticBaked = true;
  const keys = scene.textures.getTextureKeys().filter(shouldBakeKey).sort();
  const sizes: { key: string; w: number; h: number }[] = [];
  const sources = new Map<string, CanvasImageSource>();
  for (const key of keys) {
    const texture = scene.textures.get(key);
    const frame = texture.get();
    const source = texture.getSourceImage() as CanvasImageSource | null;
    if (!source || !frame || frame.width <= 0 || frame.height <= 0) continue;
    // drawImage benoetigt ein echtes Canvas/Bild; alles andere bleibt unangetastet.
    if (!(source instanceof HTMLCanvasElement) && !(source instanceof HTMLImageElement)) continue;
    sources.set(key, source);
    sizes.push({ key, w: frame.width, h: frame.height });
  }
  const packed = packPages(sizes);
  const pageCanvases: HTMLCanvasElement[] = [];
  for (let i = 0; i < packed.pages.length; i++) {
    // Seitenhoehe = tatsaechlich benutzter Platz (spart VRAM).
    const height = Math.max(1, packed.pages[i].usedHeight);
    const canvas = document.createElement("canvas");
    canvas.width = packed.pageSize;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    pageCanvases.push(canvas);
  }
  for (const f of packed.frames) {
    pageCanvases[f.page].getContext("2d")!.drawImage(sources.get(f.key)!, f.x, f.y);
  }
  for (let i = 0; i < pageCanvases.length; i++) {
    const canvas = pageCanvases[i];
    const page: BakedPage = {
      key: `baked_page_${bakedPages.length}`,
      canvas,
      ctx: canvas.getContext("2d")!,
      x: 0,
      y: packed.pages[i].usedHeight,
      rowH: 0,
      size: packed.pageSize,
      incremental: false,
    };
    scene.textures.addCanvas(page.key, canvas);
    bakedPages.push(page);
    for (const f of packed.frames as PackedFrame[]) {
      if (f.page !== i) continue;
      registerBaked(scene, f.key, page, f, sources.get(f.key)!);
    }
  }
  bakeStats = {
    pages: packed.pages.length,
    frames: packed.frames.length,
    overflow: packed.overflow,
    keys: packed.frames.map((f) => f.key),
  };
  return bakeStats;
}
