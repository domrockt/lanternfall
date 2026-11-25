import Phaser from "phaser";
import { CHUNK_SIZE, CHUNK_TILES, TILE, WORLD_SIZE } from "../config";
import { ownsPropBlock } from "../logic/autotile";
import { paintTerrain, terrainKindAt, tileHash, type TileKind } from "./tiles";

interface Ripple {
  img: Phaser.GameObjects.Image;
  phase: number;
  x: number;
  y: number;
}

interface ChunkEntry {
  image: Phaser.GameObjects.Image;
  key: string;
  props: Phaser.GameObjects.Image[];
  ripples: Ripple[];
}

/** Moor-Requisiten: Bild-Sprites statt 16-px-Kacheln (dürfen über Kacheln wachsen). */
const CLUSTER_PROPS: Record<string, Array<[string, number, number]>> = {
  grove: [
    ["prop_tree_a", 0, 4],
    ["prop_stump", -19, 10],
    ["prop_bones", 20, 11],
  ],
  groveTall: [
    ["prop_tree_b", 0, 6],
    ["prop_stump", 20, 13],
    ["prop_boulder", -20, 12],
  ],
  graveyard: [
    ["prop_grave", -14, 4],
    ["prop_cross", 10, 2],
    ["prop_bones", 0, 13],
    ["prop_grave", 23, 8],
  ],
  ruins: [
    ["prop_ruin", 0, 8],
    ["prop_column", -30, 6],
    ["prop_boulder", 28, 12],
  ],
  stones: [
    ["prop_boulder", 0, 6],
    ["prop_stump", -20, 9],
    ["prop_boulder", 21, 11],
  ],
  shrine: [
    ["prop_post", 0, 6],
    ["prop_grave", -20, 9],
    ["prop_bones", 15, 10],
  ],
  fungal: [
    ["prop_mushroom_ring", 0, 9],
    ["prop_boulder", -22, 12],
  ],
};

const PROP_KEYS = new Set([
  "prop_tree_a", "prop_tree_b", "prop_stump", "prop_boulder", "prop_grave",
  "prop_cross", "prop_ruin", "prop_column", "prop_post", "prop_mushroom_ring",
  "prop_bones", "prop_reeds", "prop_lilypad",
]);

/** Prozedurale Moor-Karte: 16-px-Chunks, Autotiling, Requisiten-Cluster. */
export class GroundRenderer {
  private readonly chunks = new Map<string, ChunkEntry>();
  private readonly scene: Phaser.Scene;
  private readonly seed: number;
  private readonly ripples: Ripple[] = [];
  private rippleTick = 0;
  private lastCx = Number.NaN;
  private lastCy = Number.NaN;

  constructor(scene: Phaser.Scene, seed: number) {
    this.scene = scene;
    this.seed = seed;
  }

  /** Vignette/Background bleibt dunkel, bis Chunks da sind. */
  update(camera: Phaser.Cameras.Scene2D.Camera, timeMs = 0): void {
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

    // Ferne Chunks freigeben (Textur + Bilder), gegen Speicherwachstum.
    for (const [key, entry] of this.chunks) {
      const [cxStr, cyStr] = key.split(",");
      const cx = Number(cxStr);
      const cy = Number(cyStr);
      if (cx < minCx - 1 || cx > maxCx + 1 || cy < minCy - 1 || cy > maxCy + 1) {
        entry.image.destroy();
        for (const p of entry.props) p.destroy();
        for (const r of entry.ripples) {
          const idx = this.ripples.indexOf(r);
          if (idx >= 0) this.ripples.splice(idx, 1);
          r.img.destroy();
        }
        this.scene.textures.remove(entry.key);
        this.chunks.delete(key);
      }
    }

    // Leichte Wellen-Animation: zwei Frames, 1-px-Drift, nur sichtbare Ripples.
    this.rippleTick = timeMs;
    for (const r of this.ripples) {
      const onScreen = r.x > camera.scrollX - 16 && r.x < camera.scrollX + camera.width + 16 &&
        r.y > camera.scrollY - 16 && r.y < camera.scrollY + camera.height + 16;
      r.img.setVisible(onScreen);
      if (!onScreen) continue;
      const frame = Math.floor((timeMs + r.phase) / 620) % 2;
      r.img.setTexture(frame === 0 ? "water_ripple_0" : "water_ripple_1");
      r.img.x = r.x + frame;
    }
    this.lastCx = minCx;
    this.lastCy = minCy;
  }

  /** Terrain an einer Weltposition (für Wasser-Slow und Spritzer). */
  kindAt(worldX: number, worldY: number): TileKind {
    return terrainKindAt(worldX, worldY, this.seed, WORLD_SIZE);
  }

  private createChunk(cx: number, cy: number, key: string): void {
    const textureKey = `chunk_${cx}_${cy}`;
    const texture = this.scene.textures.createCanvas(textureKey, CHUNK_SIZE, CHUNK_SIZE);
    if (!texture) return;
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    paintTerrain(ctx, cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, this.seed, WORLD_SIZE);
    texture.refresh();
    const image = this.scene.add.image(cx * CHUNK_SIZE, cy * CHUNK_SIZE, textureKey)
      .setOrigin(0, 0)
      .setDepth(-100);

    const props: Phaser.GameObjects.Image[] = [];
    const ripples: Ripple[] = [];
    this.placeProps(cx, cy, props);
    this.placeWaterDetails(cx, cy, props, ripples);
    this.chunks.set(key, { image, key: textureKey, props, ripples });
  }

  private kindsAround(wx: number, wy: number, radius: number): boolean {
    const k0 = this.kindAt(wx, wy);
    if (k0 === "water" || k0 === "path") return false;
    for (const [dx, dy] of [[-radius, 0], [radius, 0], [0, -radius], [0, radius]]) {
      if (this.kindAt(wx + dx, wy + dy) === "water") return true;
    }
    return false;
  }

  private addProp(
    key: string, wx: number, wy: number, props: Phaser.GameObjects.Image[],
    tinted = false, flip = false,
  ): void {
    if (!PROP_KEYS.has(key) || !this.scene.textures.exists(key)) return;
    const img = this.scene.add.image(wx, wy, key).setOrigin(0.5, 1);
    img.setDepth(-90 + Math.min(0.9, wy / 100000));
    img.setFlipX(flip);
    if (tinted) img.setAlpha(0.92);
    props.push(img);
    // Laternenpfahl ist Lichtquelle: kleiner additiver warmer Warmschein (Overlay).
    if (key === "prop_post" && this.scene.textures.exists("light_radius")) {
      const glow = this.scene.add.image(wx, wy - 20, "light_radius")
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.42)
        .setAlpha(0.22)
        .setDepth(-89.5);
      props.push(glow);
    }
  }

  /** Requisiten gruppiert: 48-px-Blöcke mit 2-4 Objekten je Cluster. */
  private placeProps(cx: number, cy: number, props: Phaser.GameObjects.Image[]): void {
    const startX = cx * CHUNK_TILES;
    const startY = cy * CHUNK_TILES;
    const blocks = Math.ceil(CHUNK_TILES / 3);
    for (let by = 0; by < blocks; by++) {
      for (let bx = 0; bx < blocks; bx++) {
        const wbx = Math.floor(startX / 3) + bx;
        const wby = Math.floor(startY / 3) + by;
        // Besitz-Regel: ein 3-Tile-Block gehoert dem Chunk, der sein Start-Tile
        // enthaelt. Sonst wuerde derselbe Cluster an Chunk-Naehten doppelt
        // (und Laternen-Glow mehrfach) angelegt.
        if (!ownsPropBlock(wbx, wby, cx, cy, CHUNK_TILES)) continue;
        const clusterNoise = tileHash(wbx, wby, this.seed + 431);
        if (clusterNoise < 0.80) continue;
        const anchorX = (wbx * 3 + 1.5) * TILE + (tileHash(wbx, wby, this.seed + 441) - 0.5) * 20;
        const anchorY = (wby * 3 + 1.5) * TILE + (tileHash(wby, wbx, this.seed + 443) - 0.5) * 20;
        if (this.kindAt(anchorX, anchorY) === "water") continue;
        const pick = tileHash(wbx + 13, wby - 7, this.seed + 437);
        let layout: Array<[string, number, number]>;
        if (pick < 0.18) layout = CLUSTER_PROPS.groveTall;
        else if (pick < 0.36) layout = CLUSTER_PROPS.grove;
        else if (pick < 0.52) layout = CLUSTER_PROPS.graveyard;
        else if (pick < 0.67) layout = CLUSTER_PROPS.ruins;
        else if (pick < 0.80) layout = CLUSTER_PROPS.stones;
        else if (pick < 0.9) layout = CLUSTER_PROPS.shrine;
        else layout = CLUSTER_PROPS.fungal;
        // 3-4 statt 4 Objekte: ein Slot darf ausfallen (Cluster wirken natürlich).
        const skip = Math.floor(tileHash(wbx, wby, this.seed + 449) * layout.length);
        // Cluster spiegeln: bricht die Wiederholung identischer Grabstein-Reihen.
        const flip = tileHash(wbx - 5, wby + 11, this.seed + 457) > 0.5;
        for (let i = 0; i < layout.length; i++) {
          if (i === skip && layout.length > 3) continue;
          const [key, dx, dy] = layout[i];
          const px = anchorX + dx * (flip ? -1 : 1);
          const py = anchorY + dy;
          const kind = this.kindAt(px, py);
          // Große Requisiten nicht mitten auf den Weg stellen.
          if (kind === "water" || (kind === "path" && key !== "prop_bones")) continue;
          this.addProp(key, px, py, props, false, flip);
        }
      }
    }
    // Einzelner Findling auf Schlamm (selten, damit Schlamm nicht leer wirkt).
    for (let ly = 0; ly < CHUNK_TILES; ly++) {
      for (let lx = 0; lx < CHUNK_TILES; lx++) {
        const tx = startX + lx;
        const ty = startY + ly;
        if (this.kindAt(tx * TILE + 8, ty * TILE + 8) !== "mud") continue;
        if (tileHash(tx, ty, this.seed + 8) > 0.93) {
          this.addProp("prop_boulder", tx * TILE + 8, ty * TILE + 12, props);
        }
      }
    }
  }

  /** Schilf am Ufer, Seerosen im Wasser und animierte Wellen-Ripples. */
  private placeWaterDetails(
    cx: number, cy: number, props: Phaser.GameObjects.Image[], ripples: Ripple[],
  ): void {
    const startX = cx * CHUNK_TILES;
    const startY = cy * CHUNK_TILES;
    for (let ly = 0; ly < CHUNK_TILES; ly++) {
      for (let lx = 0; lx < CHUNK_TILES; lx++) {
        const tx = startX + lx;
        const ty = startY + ly;
        const wx = tx * TILE + 8;
        const wy = ty * TILE + 8;
        const kind = this.kindAt(wx, wy);
        if (kind === "water") {
          const r = tileHash(tx, ty, this.seed + 511);
          if (r > 0.90) {
            this.addProp("prop_lilypad", wx, wy, props);
          } else if (r > 0.48) {
            const img = this.scene.add.image(wx, wy, "water_ripple_0").setOrigin(0.5, 0.5);
            img.setDepth(-92);
            const ripple: Ripple = { img, phase: Math.floor(tileHash(tx + 3, ty + 5, this.seed + 517) * 620), x: wx, y: wy };
            ripples.push(ripple);
            this.ripples.push(ripple);
          }
        } else if (kind !== "path" && this.kindsAround(wx, wy, 14) && tileHash(tx, ty, this.seed + 521) > 0.82) {
          this.addProp("prop_reeds", wx + 2, wy + 4, props);
        }
      }
    }
  }

  /** Für Debug/Tests: aktuell geladene Chunks. */
  get loadedChunks(): number {
    return this.chunks.size;
  }

  destroy(): void {
    for (const entry of this.chunks.values()) {
      entry.image.destroy();
      for (const p of entry.props) p.destroy();
      for (const r of entry.ripples) r.img.destroy();
      this.scene.textures.remove(entry.key);
    }
    this.chunks.clear();
    this.ripples.length = 0;
  }

  get lastMinChunk(): { x: number; y: number } {
    return { x: this.lastCx, y: this.lastCy };
  }
}
