import Phaser from "phaser";
import { CHUNK_SIZE, CHUNK_TILES, TILE, WORLD_SIZE } from "../config";
import { ownsPropBlock } from "../logic/autotile";
import { paintTerrain, terrainKindAt, tileHash, type TileKind } from "./tiles";
import { applyTexture } from "./atlas";
import { PAL } from "../palette";

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

interface ChunkJob {
  cx: number;
  cy: number;
  key: string;
}

interface ReadyChunk {
  cx: number;
  cy: number;
  key: string;
  bitmap: ImageBitmap;
}

interface Firefly {
  img: Phaser.GameObjects.Image;
  baseX: number;
  baseY: number;
  phase: number;
  speed: number;
}

interface FogBank {
  img: Phaser.GameObjects.Image;
  baseX: number;
  baseY: number;
  phase: number;
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

  /** Asynchroner Chunk-Bau: Malen im Worker, Main-Thread fertigt nur an. */
  private worker: Worker | null = null;
  /** Keys, die angefragt/gemalt, aber noch nicht eingebaut sind. */
  private readonly requested = new Set<string>();
  /** Beim Worker in Arbeit (max. 2 parallel) mit Startzeit fuer Timeout. */
  private readonly inflight = new Map<string, number>();
  private readonly queue: ChunkJob[] = [];
  private readonly ready: ReadyChunk[] = [];
  /** Sync-Fallback (kein Worker): höchstens ein Chunk pro Frame. */
  private syncBudget = 1;
  private fireflies: Firefly[] = [];
  private fogBanks: FogBank[] = [];
  private ambientReady = false;

  constructor(scene: Phaser.Scene, seed: number) {
    this.scene = scene;
    this.seed = seed;
    try {
      if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
        const worker = new Worker(new URL("./terrainWorker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<{ cx: number; cy: number; bitmap: ImageBitmap | null }>) => {
          const { cx, cy, bitmap } = event.data;
          const key = `${cx},${cy}`;
          this.inflight.delete(key);
          if (!bitmap) {
            this.useSyncFallback();
            return;
          }
          this.ready.push({ cx, cy, key, bitmap });
        };
        worker.onerror = () => this.useSyncFallback();
        this.worker = worker;
      }
    } catch {
      this.worker = null;
    }
    this.ensureAmbient();
  }

  /** Worker-Start/-Lauf fehlgeschlagen → wieder synchron auf dem Main-Thread. */
  private useSyncFallback(): void {
    this.worker?.terminate();
    this.worker = null;
    while (this.ready.length > 0) this.ready.pop()?.bitmap.close();
    this.requested.clear();
    this.inflight.clear();
    this.queue.length = 0;
  }

  /** Vignette/Background bleibt dunkel, bis Chunks da sind. */
  update(camera: Phaser.Cameras.Scene2D.Camera, timeMs = 0): void {
    const marginChunks = 1;
    const minCx = Math.max(0, Math.floor((camera.scrollX - marginChunks * CHUNK_SIZE) / CHUNK_SIZE));
    const maxCx = Math.min(Math.ceil(WORLD_SIZE / CHUNK_SIZE) - 1, Math.floor((camera.scrollX + camera.width + marginChunks * CHUNK_SIZE) / CHUNK_SIZE));
    const minCy = Math.max(0, Math.floor((camera.scrollY - marginChunks * CHUNK_SIZE) / CHUNK_SIZE));
    const maxCy = Math.min(Math.ceil(WORLD_SIZE / CHUNK_SIZE) - 1, Math.floor((camera.scrollY + camera.height + marginChunks * CHUNK_SIZE) / CHUNK_SIZE));

    const centerX = camera.scrollX + camera.width / 2;
    const centerY = camera.scrollY + camera.height / 2;
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = `${cx},${cy}`;
        if (this.chunks.has(key) || this.requested.has(key)) continue;
        this.requested.add(key);
        this.queue.push({ cx, cy, key });
      }
    }
    this.dispatch(centerX, centerY);
    this.finalizeReady(centerX, centerY);

    // Sync-Fallback: höchstens einen Chunk pro Frame, damit kein Totalausfall.
    if (!this.worker) {
      while (this.syncBudget > 0 && this.queue.length > 0) {
        const job = this.queue.shift()!;
        this.syncBudget -= 1;
        const live = job.cx >= minCx && job.cx <= maxCx && job.cy >= minCy && job.cy <= maxCy;
        if (live && !this.chunks.has(job.key)) this.createChunk(job.cx, job.cy, job.key);
        this.requested.delete(job.key);
      }
      this.syncBudget = 1;
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
      applyTexture(r.img, frame === 0 ? "water_ripple_0" : "water_ripple_1");
      r.img.x = r.x + frame;
    }
    this.lastCx = minCx;
    this.lastCy = minCy;
    this.updatePropsDepth();
    this.updateAmbient(camera, timeMs);
  }

  private updatePropsDepth(): void {
    const player = (this.scene as unknown as { player?: Phaser.GameObjects.Container }).player;
    const py = player?.y;
    if (py === undefined) return;
    for (const entry of this.chunks.values()) {
      for (const p of entry.props) {
        if (p.getData("isShadow")) {
          p.setDepth(11.15);
          continue;
        }
        const footY = p.getData("footY") as number | undefined;
        if (footY === undefined) continue;
        const glow = p.getData("glow") ? 0.06 : 0;
        p.setDepth(footY < py ? 11.6 + glow : 12.4 + glow);
      }
    }
  }

  private ensureAmbient(): void {
    if (this.ambientReady) return;
    this.ambientReady = true;
    const tex = this.scene.textures;
    if (!tex.exists("m9_ambient_glow")) {
      const glowCanvas = tex.createCanvas("m9_ambient_glow", 11, 11);
      if (glowCanvas) {
        const ctx = glowCanvas.getContext();
        const g = ctx.createRadialGradient(5.5, 5.5, 0, 5.5, 5.5, 5.5);
        g.addColorStop(0, "rgba(255,238,176,1)");
        g.addColorStop(0.45, "rgba(255,215,122,0.55)");
        g.addColorStop(1, "rgba(255,215,122,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 11, 11);
        glowCanvas.refresh();
      }
    }
    if (!tex.exists("m9_ambient_fog")) {
      const fogCanvas = tex.createCanvas("m9_ambient_fog", 128, 64);
      if (fogCanvas) {
        const ctx = fogCanvas.getContext();
        const g = ctx.createRadialGradient(64, 32, 4, 64, 32, 62);
        g.addColorStop(0, "rgba(255,255,255,0.20)");
        g.addColorStop(0.6, "rgba(255,255,255,0.09)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 64);
        fogCanvas.refresh();
      }
    }

    for (let i = 0; i < 24; i++) {
      const img = this.scene.add.image(0, 0, "m9_ambient_glow")
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(PAL[21])
        .setDepth(-89.6)
        .setAlpha(0);
      img.setScale(0.7 + tileHash(i, 3, this.seed + 601) * 0.9);
      this.fireflies.push({
        img,
        baseX: tileHash(i, 7, this.seed + 603),
        baseY: tileHash(11, i, this.seed + 607),
        phase: tileHash(i, 13, this.seed + 611) * 6.28,
        speed: 0.6 + tileHash(i, 19, this.seed + 617) * 0.9,
      });
    }
    for (let i = 0; i < 3; i++) {
      const img = this.scene.add.image(0, 0, "m9_ambient_fog")
        .setScrollFactor(0)
        .setTint(PAL[6])
        .setDepth(-89.85)
        .setAlpha(0);
      img.setScale(2.2 + i * 0.55);
      this.fogBanks.push({
        img,
        baseX: 0.2 + i * 0.3,
        baseY: 0.55 + (i % 2) * 0.2,
        phase: i * 2.1,
      });
    }
  }

  /** Ambient je Frame: Glühwürmchen umisen, Nebel drif (bildschirmverankert). */
  private updateAmbient(camera: Phaser.Cameras.Scene2D.Camera, timeMs: number): void {
    const t = timeMs * 0.001;
    for (const f of this.fireflies) {
      const x = camera.scrollX + f.baseX * camera.width
        + Math.sin(t * f.speed * 0.55 + f.phase) * 14;
      const y = camera.scrollY + f.baseY * camera.height
        + Math.cos(t * f.speed * 0.7 + f.phase) * 9;
      f.img.setPosition(Math.round(x), Math.round(y));
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + f.phase * 3);
      f.img.setAlpha(0.16 + pulse * 0.34);
    }
    for (const b of this.fogBanks) {
      b.img.setPosition(
        Math.round(b.baseX * camera.width + Math.sin(t * 0.055 + b.phase) * 46),
        Math.round(b.baseY * camera.height + Math.cos(t * 0.04 + b.phase) * 8),
      );
      b.img.setAlpha(0.055 + 0.03 * Math.sin(t * 0.12 + b.phase));
    }
  }

  /** Terrain an einer Weltposition (für Wasser-Slow und Spritzer). */
  kindAt(worldX: number, worldY: number): TileKind {
    return terrainKindAt(worldX, worldY, this.seed, WORLD_SIZE);
  }

  /** Schickt faellige Chunk-Jobs an den Worker, naechstgelegene zuerst. */
  private dispatch(centerX: number, centerY: number): void {
    if (!this.worker) return;
    // Robustheit: eine verlorene Worker-Antwort wuerde sonst beide Slots
    // dauerhaft blockieren. Nach 2 s ohne Antwort auf Sync-Fallback wechseln.
    const now = Date.now();
    for (const startedAt of this.inflight.values()) {
      if (now - startedAt > 2000) {
        this.useSyncFallback();
        return;
      }
    }
    if (this.queue.length === 0) return;
    this.queue.sort((a, b) => {
      const da = (a.cx * CHUNK_SIZE + CHUNK_SIZE / 2 - centerX) ** 2 + (a.cy * CHUNK_SIZE + CHUNK_SIZE / 2 - centerY) ** 2;
      const db = (b.cx * CHUNK_SIZE + CHUNK_SIZE / 2 - centerX) ** 2 + (b.cy * CHUNK_SIZE + CHUNK_SIZE / 2 - centerY) ** 2;
      return da - db;
    });
    // Höchstens zwei parallele Aufträge: mehr Worker-Last bringt wenig und
    // verzoegert die Fertigstellung der sichtbaren Kanten.
    while (this.queue.length > 0 && this.inflight.size < 2) {
      const job = this.queue.shift()!;
      this.inflight.set(job.key, Date.now());
      this.worker.postMessage({ cx: job.cx, cy: job.cy, seed: this.seed });
    }
  }

  /** Fertige Worker-Bitmaps einbauen, hoechstens einen Chunk pro Frame. */
  private finalizeReady(centerX: number, centerY: number): void {
    if (this.ready.length === 0) return;
    this.ready.sort((a, b) => {
      const da = (a.cx * CHUNK_SIZE + CHUNK_SIZE / 2 - centerX) ** 2 + (a.cy * CHUNK_SIZE + CHUNK_SIZE / 2 - centerY) ** 2;
      const db = (b.cx * CHUNK_SIZE + CHUNK_SIZE / 2 - centerX) ** 2 + (b.cy * CHUNK_SIZE + CHUNK_SIZE / 2 - centerY) ** 2;
      return da - db;
    });
    const job = this.ready.shift()!;
    const textureKey = `chunk_${job.key.replace(",", "_")}`;
    const texture = this.scene.textures.createCanvas(textureKey, CHUNK_SIZE, CHUNK_SIZE);
    if (!texture) {
      job.bitmap.close();
      this.requested.delete(job.key);
      return;
    }
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(job.bitmap, 0, 0);
    job.bitmap.close();
    texture.refresh();
    this.buildChunk(job.cx, job.cy, job.key, textureKey);
    this.requested.delete(job.key);
  }

  private createChunk(cx: number, cy: number, key: string): void {
    const textureKey = `chunk_${key.replace(",", "_")}`;
    const texture = this.scene.textures.createCanvas(textureKey, CHUNK_SIZE, CHUNK_SIZE);
    if (!texture) {
      // Kein Canvas (Speicher/GPU-Limit): Chunk erneut anfragbar machen statt
      // ihn dauerhaft als "requested" zu blockieren (Loch ohne Retry).
      this.requested.delete(key);
      return;
    }
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    paintTerrain(ctx, cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, this.seed, WORLD_SIZE);
    texture.refresh();
    this.buildChunk(cx, cy, key, textureKey);
    this.requested.delete(key);
  }

  /** Bild + Requisiten/Wellen fuer einen fertig gemalten Chunk anlegen. */
  private buildChunk(cx: number, cy: number, key: string, textureKey: string): void {
    if (this.chunks.has(key)) {
      this.scene.textures.remove(textureKey);
      return;
    }
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
    img.setFlipX(flip);
    img.setData("footY", wy);
    // Weicher Bodenschatten am Fuss, Breite abhaengig von der Prop-Breite.
    if (this.scene.textures.exists("shadow")) {
      const sw = Math.max(0.7, Math.min(4, img.width / 16));
      const shadow = this.scene.add.image(wx, wy - 1, "shadow")
        .setOrigin(0.5, 0.5)
        .setScale(sw, 0.85)
        .setAlpha(0.62)
        .setDepth(-90.5 + Math.min(0.85, wy * 0.00002));
      shadow.setData("isShadow", true);
      props.push(shadow);
    }
    if (tinted) img.setAlpha(0.92);
    props.push(img);
    // Laternenpfahl ist Lichtquelle: kleiner additiver warmer Warmschein (Overlay).
    if (key === "prop_post" && this.scene.textures.exists("light_radius")) {
      const glow = this.scene.add.image(wx, wy - 20, "light_radius")
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.42)
        .setAlpha(0.22)
        .setDepth(-89.5);
      glow.setData("footY", wy);
      glow.setData("glow", true);
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
    this.worker?.terminate();
    this.worker = null;
    while (this.ready.length > 0) this.ready.pop()?.bitmap.close();
    this.requested.clear();
    this.inflight.clear();
    this.queue.length = 0;
    for (const entry of this.chunks.values()) {
      entry.image.destroy();
      for (const p of entry.props) p.destroy();
      for (const r of entry.ripples) r.img.destroy();
      this.scene.textures.remove(entry.key);
    }
    this.chunks.clear();
    this.ripples.length = 0;
    for (const f of this.fireflies) f.img.destroy();
    for (const b of this.fogBanks) b.img.destroy();
    this.fireflies.length = 0;
    this.fogBanks.length = 0;
  }

  get lastMinChunk(): { x: number; y: number } {
    return { x: this.lastCx, y: this.lastCy };
  }
}
