import Phaser from "phaser";
import { CHUNK_SIZE, CHUNK_TILES, TILE, WORLD_SIZE } from "../config";
import { paintDecor, paintTerrain, terrainKindAt, tileHash, type DecorKind, type TileKind } from "./tiles";

interface ChunkEntry {
  image: Phaser.GameObjects.Image;
  key: string;
}

/** Prozedurale Platzhalter-Karte: 16x16-Tiles in 256px-Chunks, lazy gerendert. */
export class GroundRenderer {
  private readonly chunks = new Map<string, ChunkEntry>();
  private readonly scene: Phaser.Scene;
  private readonly seed: number;
  private lastCx = Number.NaN;
  private lastCy = Number.NaN;

  constructor(scene: Phaser.Scene, seed: number) {
    this.scene = scene;
    this.seed = seed;
  }

  /** Vignette/Background bleibt dunkel, bis Chunks da sind. */
  update(camera: Phaser.Cameras.Scene2D.Camera): void {
    const marginChunks = 1;
    const minCx = Math.max(0, Math.floor((camera.scrollX - marginChunks * CHUNK_SIZE) / CHUNK_SIZE));
    const maxCx = Math.min(Math.ceil(WORLD_SIZE / CHUNK_SIZE) - 1, Math.floor((camera.scrollX + camera.width + marginChunks * CHUNK_SIZE) / CHUNK_SIZE));
    const minCy = Math.max(0, Math.floor((camera.scrollY - marginChunks * CHUNK_SIZE) / CHUNK_SIZE));
    const maxCy = Math.min(Math.ceil(WORLD_SIZE / CHUNK_SIZE) - 1, Math.floor((camera.scrollY + camera.height + marginChunks * CHUNK_SIZE) / CHUNK_SIZE));

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = `${cx},${cy}`;
        if (!this.chunks.has(key)) this.createChunk(cx, cy, key);
      }
    }

    // Ferne Chunks freigeben (Textur + Image), gegen Speicherwachstum.
    for (const [key, entry] of this.chunks) {
      const [cxStr, cyStr] = key.split(",");
      const cx = Number(cxStr);
      const cy = Number(cyStr);
      if (cx < minCx - 1 || cx > maxCx + 1 || cy < minCy - 1 || cy > maxCy + 1) {
        entry.image.destroy();
        this.scene.textures.remove(entry.key);
        this.chunks.delete(key);
      }
    }
    this.lastCx = minCx;
    this.lastCy = minCy;
  }

  /** Terrain an einer Weltposition (für Wasser-Slow und Spritzer). */
  kindAt(worldX: number, worldY: number): TileKind {
    return terrainKindAt(worldX, worldY, this.seed, WORLD_SIZE);
  }

  private tileKind(tx: number, ty: number): TileKind {
    return terrainKindAt(tx * TILE + TILE / 2, ty * TILE + TILE / 2, this.seed, WORLD_SIZE);
  }

  private decorAt(tx: number, ty: number, kind: TileKind): DecorKind | null {
    if (kind === "water" || kind === "path") return null;
    const bx = Math.floor(tx / 2);
    const by = Math.floor(ty / 2);
    // Dekor-Cluster: wenn ein 2x2-Block ausloest, tragen 3-4 seiner Zellen
    // Objekte (Stein/Grab/Post/Ruine) -> Gruppe innerhalb 32 px statt Einzelstueck.
    const cluster = tileHash(bx, by, this.seed + 431);
    if (cluster > 0.9) {
      const cell = tileHash(tx, ty, this.seed + 433);
      if (cell < 0.12) return null;            // 3-4 statt 4 Objekte
      const pick = tileHash(tx + 7, ty + 3, this.seed + 437);
      if (pick > 0.72) return "stone";
      if (pick > 0.5) return "post";
      if (pick > 0.32) return "grave";
      return "ruin";
    }
    if (kind === "mud" && tileHash(tx, ty, this.seed + 8) > 0.85) return "stone";
    return null;
  }

  private createChunk(cx: number, cy: number, key: string): void {
    const textureKey = `chunk_${cx}_${cy}`;
    const texture = this.scene.textures.createCanvas(textureKey, CHUNK_SIZE, CHUNK_SIZE);
    if (!texture) return;
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    const startTx = cx * CHUNK_TILES;
    const startTy = cy * CHUNK_TILES;
    // Pixelgenaues Terrain: keine 16-px-Kachelstufen an Wasser-/Wegraendern.
    paintTerrain(ctx, cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, this.seed, WORLD_SIZE);
    // Dekor bleibt an 16-px-Rasterzellen verankert (gruppiert in 2x2-Bloecken).
    for (let ly = 0; ly < CHUNK_TILES; ly++) {
      for (let lx = 0; lx < CHUNK_TILES; lx++) {
        const tx = startTx + lx;
        const ty = startTy + ly;
        const kind = this.tileKind(tx, ty);
        const decor = this.decorAt(tx, ty, kind);
        if (decor) paintDecor(ctx, lx * TILE, ly * TILE, decor, tx, ty, this.seed);
      }
    }
    texture.refresh();
    const image = this.scene.add.image(cx * CHUNK_SIZE, cy * CHUNK_SIZE, textureKey)
      .setOrigin(0, 0)
      .setDepth(-100);
    this.chunks.set(key, { image, key: textureKey });
  }

  /** Für Debug/Tests: aktuell geladene Chunks. */
  get loadedChunks(): number {
    return this.chunks.size;
  }

  destroy(): void {
    for (const entry of this.chunks.values()) {
      entry.image.destroy();
      this.scene.textures.remove(entry.key);
    }
    this.chunks.clear();
  }

  get lastMinChunk(): { x: number; y: number } {
    return { x: this.lastCx, y: this.lastCy };
  }
}
