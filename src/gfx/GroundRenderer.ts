import Phaser from "phaser";
import { CHUNK_SIZE, CHUNK_TILES, TILE, WORLD_SIZE } from "../config";
import { tileHash, valueNoise, paintDecor, paintEdges, paintTile, type DecorKind, type TileKind } from "./tiles";

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

  private tileKind(tx: number, ty: number): TileKind {
    const water = valueNoise(tx, ty, 11, this.seed + 3);
    if (water < 0.18) return "water";
    const mud = valueNoise(tx + 100, ty - 40, 7, this.seed + 5);
    if (mud < 0.24) return "mud";

    // gewundener Pfad durch die Weltmitte
    const centerTile = (WORLD_SIZE / TILE) / 2;
    const pathY = centerTile + Math.sin(tx * 0.055) * 18 + Math.sin(tx * 0.013) * 7;
    if (Math.abs(ty - pathY) < 1.3) return "path";
    const pathX = centerTile + Math.sin(ty * 0.05) * 14;
    if (Math.abs(tx - pathX) < 0.9) return "path";
    return "grass";
  }

  private decorAt(tx: number, ty: number, kind: TileKind): DecorKind | null {
    if (kind === "water" || kind === "path") return null;
    // Dekor in 2x2-Blöcken gruppiert, damit es nicht wie Rauschen wirkt.
    // Nur an der Block-Ecke platzieren, sonst wiederholt sich das Dekor im 2x2-Block.
    if (tx % 2 !== 0 || ty % 2 !== 0) return null;
    const bx = Math.floor(tx / 2);
    const by = Math.floor(ty / 2);
    const r = tileHash(bx, by, this.seed + 431);
    if (r > 0.965) return "tree";
    if (r > 0.95) return "grave";
    if (r > 0.935) return "stone";
    if (r > 0.926) return "ruin";
    if (r > 0.918) return "post";
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
    for (let ly = 0; ly < CHUNK_TILES; ly++) {
      for (let lx = 0; lx < CHUNK_TILES; lx++) {
        const tx = startTx + lx;
        const ty = startTy + ly;
        const px = lx * TILE;
        const py = ly * TILE;
        const kind = this.tileKind(tx, ty);
        paintTile(ctx, px, py, kind, tx, ty, this.seed);
        if (kind !== "grass") {
          paintEdges(ctx, px, py, kind, {
            up: this.tileKind(tx, ty - 1),
            down: this.tileKind(tx, ty + 1),
            left: this.tileKind(tx - 1, ty),
            right: this.tileKind(tx + 1, ty),
          }, tx, ty, this.seed);
        }
        const decor = this.decorAt(tx, ty, kind);
        if (decor) paintDecor(ctx, px, py, decor, tx, ty, this.seed);
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
