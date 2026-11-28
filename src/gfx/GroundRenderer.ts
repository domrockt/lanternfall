import Phaser from "phaser";
import { CHUNK_SIZE, CHUNK_TILES, TILE, WORLD_SIZE } from "../config";
import { ownsPropBlock } from "../logic/autotile";
import { WATER_ANIM_STEPS, areaHasWater, paintTerrain, terrainKindAt, tileHash, type TileKind } from "./tiles";
import { applyTexture } from "./atlas";
import { ambientBudgetFor, propDensityMaxTier } from "../logic/lod";
import { PROP_KEYS, PROP_LAYER_DEPTHS, batchLayerCount, propSideFor, propTierFor } from "./propLayers";
import {
  propVariantKeyFor, propShadowClassFor, propShadowFor,
  PROP_SHADOW_COLOR, PROP_SHADOW_OFFSET,
} from "./gen-props";
import { PAL } from "../palette";

/**
 * #4658: Sichtbarer Weltausschnitt der Kamera bei beliebigem ganzzahligen
 * Render-Teiler (Zoom 1/s + Viewport W/s x H/s, siehe enforceCameraProjection).
 * Phaser rendert Weltposition p (scrollFactor 1) bei
 *   screen = zoom * (p - scroll - origin * camSize/2) + origin * camSize/2,
 * der sichtbare Ausschnitt ist darum um den Viewport-Mittelpunkt zentriert und
 * camSize/zoom gross. Bei Teiler 1 (zoom 1) gilt left=scrollX, width=camW —
 * identisch zum bisherigen Verhalten.
 */
export function cameraWorldView(
  camW: number, camH: number, scrollX: number, scrollY: number, zoom: number,
): { left: number; top: number; width: number; height: number } {
  const w = camW / zoom;
  const h = camH / zoom;
  return {
    left: scrollX + camW / 2 - w / 2,
    top: scrollY + camH / 2 - h / 2,
    width: w,
    height: h,
  };
}

/**
 * #4658: Screen-verankerte Deko (scrollFactor 0, z. B. Nebel) wird unter Zoom
 * um den Viewport-Mittelpunkt verschoben/skaliert:
 *   screen = zoom * (p - camSize/2) + camSize/2.
 * Damit ein solches Objekt bei Teiler s an derselben Bildschirmposition steht
 * wie bei Teiler 1, muss die logische Position p diesen Pivot ausgleichen.
 * Bei zoom 1 Identitaet (p -> p). Achtung: Drift/Animation in SCREEN-Pixeln
 * erst NACH dieser Kompensation addieren — sie wuerde sonst mit 1/zoom
 * hochskaliert (Befund Reviewer, Karte #5362).
 */
export function screenAnchoredX(logicalX: number, camSize: number, zoom: number): number {
  return (logicalX - camSize / 2) / zoom + camSize / 2;
}

interface Ripple {
  img: Phaser.GameObjects.Image;
  phase: number;
  x: number;
  y: number;
}

/** Dauer einer Animationsstufe des Tile-Pfads (3 Stufen = 1,68-s-Zyklus). */
const WATER_ANIM_MS = 560;

interface ChunkEntry {
  image: Phaser.GameObjects.Image;
  key: string;
  props: Phaser.GameObjects.Image[];
  ripples: Ripple[];
  /** Animationsstufen in der Chunk-Textur (1 = Land, WATER_ANIM_STEPS = Wasser). */
  frames: number;
  /** Weltverankerter Phasen-Offset (0..2), damit Chunks nicht taktgleich pulsieren. */
  phase: number;
  /** Zuletzt angezeigte Stufe (setFrame nur bei Wechsel). */
  animStep: number;
}

/** Debug-Zaehler (nur aktiv, wenn ein Messskript sie einschaltet). */
export interface GroundDebugStats {
  updateCalls: number;
  chunkBuilds: number;
  chunkRebuilds: number;
  workerPosted: number;
  workerReceived: number;
  readyInstalled: number;
  propDepthSets: number;
  rippleTextureSets: number;
  sumVisibleChunks: number;
  sumVisibleProps: number;
  sumVisibleRipples: number;
  sumVisibleAmbient: number;
  sumVisiblePropTextures: number;
  loadedChunks: number;
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
  bitmaps: ImageBitmap[];
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

/**
 * Kleine Dekor-Props kosteten im dichten Endgame viele eigene Draw-Calls.
 * Seit m10-prop-density-lod steuert das gestufte Dichte-LOD
 * (propTierFor/propDensityMaxTier, Schwellwerte N1=250/N2=300 in logic/lod.ts)
 * ueber Prop-Tiers (0 Landmarke, 1 gross, 2 Deko); dieses Set ist ersetzt.
 */

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

// Prop-Batching-Helfer (feste Layer-Tiefen, Seitenwahl, Batch-Zaehlung, Prop-Keys) —
// rein und phaserfrei in propLayers.ts, damit Vitest sie ohne jsdom pruefen kann.
export { PROP_KEYS, PROP_LAYER_DEPTHS, batchLayerCount, propSideFor, visibleBatchCount } from "./propLayers";
export type { PropSide } from "./propLayers";

/** Ein Container-Paar (hinter/vor dem Spieler) fuer eine Textur oder Glows. */
interface PropLayers {
  behind: Phaser.GameObjects.Container;
  front: Phaser.GameObjects.Container;
}

/**
 * Prozedurale Moor-Karte: 16-px-Chunks, Autotiling, Requisiten-Cluster.
 */
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
  /** Feste Ambient-Layer: ADD-Glow und NORMAL-Nebel bleiben zusammen, kein Depth-Interleave. */
  private glowLayer?: Phaser.GameObjects.Container;
  private fogLayer?: Phaser.GameObjects.Container;
  private ambientLastTick = Number.NEGATIVE_INFINITY;
  /** Aktuell hoechster sichtbarer Prop-Tier (Dichte-LOD, 2 = alles sichtbar). */
  private propLodMaxTier: 0 | 1 | 2 = 2;
  /** Feste Batch-Layer je Prop-Textur (hinter/vor Spieler), lazy in ensureBatchLayers(). */
  private readonly propLayers = new Map<string, PropLayers>();
  /** Kontakt-Schatten-Atlas-Textur (lazy, null = Fallback "shadow"). Bewusst
   *  nicht in destroy() entfernt: deterministisch und seed-unabhaengig, wird
   *  ueber textures.exists() wiederverwendet. */
  private propShadowTexture: string | null | undefined;
  private shadowLayer?: Phaser.GameObjects.Container;
  private rippleLayer?: Phaser.GameObjects.Container;
  private glowLayers?: PropLayers;
  /** Debug-Zaehler fuer die M10-Messung; null = aus (kein Produktions-Overhead). */
  private counters: GroundDebugStats | null = null;

  constructor(scene: Phaser.Scene, seed: number) {
    this.scene = scene;
    this.seed = seed;
    try {
      if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
        const worker = new Worker(new URL("./terrainWorker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<{ cx: number; cy: number; bitmaps: ImageBitmap[] | null }>) => {
          const { cx, cy, bitmaps } = event.data;
          const key = `${cx},${cy}`;
          this.inflight.delete(key);
          if (this.counters) this.counters.workerReceived++;
          if (!bitmaps) {
            this.useSyncFallback();
            return;
          }
          this.ready.push({ cx, cy, key, bitmaps });
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
    while (this.ready.length > 0) {
      for (const b of this.ready.pop()!.bitmaps) b.close();
    }
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
    // #4658: Cull gegen den TATSAECHLICH sichtbaren Weltausschnitt (bei Teiler
    // s ist camera.width = W/s; der Ausschnitt bleibt aber W breit und um den
    // Viewport-Mittelpunkt zentriert). Alter Ausdruck scrollX + camera.width
    // cullte bei Teiler 2 die rechte Bildschirmhaelfte (Popping am Rand).
    const view = cameraWorldView(
      camera.width, camera.height, camera.scrollX, camera.scrollY, camera.zoom,
    );
    for (const r of this.ripples) {
      const onScreen = r.x > view.left - 16 && r.x < view.left + view.width + 16 &&
        r.y > view.top - 16 && r.y < view.top + view.height + 16;
      r.img.setVisible(onScreen);
      if (!onScreen) continue;
      const frame = Math.floor((timeMs + r.phase) / 620) % 2;
      applyTexture(r.img, frame === 0 ? "water_ripple_0" : "water_ripple_1");
      if (this.counters) this.counters.rippleTextureSets++;
      r.img.x = r.x + frame;
    }
    // Animationsstufen des Tile-Pfads: Wasser-Chunks schalten pro Stufe ihr
    // Frame weiter (Wellen-Drift, Schaum-Puls, Glisser). setFrame nur beim
    // Wechsel; Textur bleibt dieselbe (ein Batch, kein Rebind).
    const animBase = Math.floor(timeMs / WATER_ANIM_MS);
    for (const entry of this.chunks.values()) {
      if (entry.frames <= 1) continue;
      const step = (animBase + entry.phase) % entry.frames;
      if (step !== entry.animStep) {
        entry.animStep = step;
        entry.image.setFrame(`f${step}`);
      }
    }
    if (this.counters) {
      const c = this.counters;
      c.updateCalls++;
      let chunks = 0;
      let props = 0;
      let ripples = 0;
      const tex = new Set<string>();
      for (const entry of this.chunks.values()) {
        if (entry.image.visible) chunks++;
        for (const p of entry.props) {
          if (p.visible) {
            props++;
            const k = p.frame?.name ?? p.texture.key;
            if (!tex.has(k)) tex.add(k);
          }
        }
      }
      for (const r of this.ripples) if (r.img.visible) ripples++;
      let ambient = 0;
      for (const f of this.fireflies) if (f.img.visible) ambient++;
      for (const b of this.fogBanks) if (b.img.visible) ambient++;
      c.sumVisibleChunks += chunks;
      c.sumVisibleProps += props;
      c.sumVisibleRipples += ripples;
      c.sumVisibleAmbient += ambient;
      c.sumVisiblePropTextures += tex.size;
      c.loadedChunks = this.chunks.size;
    }
    this.lastCx = minCx;
    this.lastCy = minCy;
    this.updatePropsDepth();
    this.updateAmbient(camera, timeMs);
  }

  /** Layer-Paar fuer eine Prop-Textur, lazy angelegt (feste Tiefen, nie umsortiert). */
  private propLayerFor(key: string): PropLayers {
    let layers = this.propLayers.get(key);
    if (!layers) {
      this.ensureBatchLayers();
      layers = {
        behind: this.scene.add.container(0, 0).setDepth(PROP_LAYER_DEPTHS.propBehind),
        front: this.scene.add.container(0, 0).setDepth(PROP_LAYER_DEPTHS.propFront),
      };
      this.propLayers.set(key, layers);
    }
    return layers;
  }

  /** Feste Grund-Layer (Schatten, Ripples, Glows) einmalig anlegen. */
  private ensureBatchLayers(): void {
    if (this.shadowLayer) return;
    this.shadowLayer = this.scene.add.container(0, 0).setDepth(PROP_LAYER_DEPTHS.shadow);
    this.rippleLayer = this.scene.add.container(0, 0).setDepth(PROP_LAYER_DEPTHS.ripple);
    this.glowLayers = {
      behind: this.scene.add.container(0, 0).setDepth(PROP_LAYER_DEPTHS.glowBehind),
      front: this.scene.add.container(0, 0).setDepth(PROP_LAYER_DEPTHS.glowFront),
    };
  }

  /**
   * Kontakt-Schatten-Atlas (m10-prop-contact-shadow): alle Prop-Klassen in EINER
   * Canvas-Textur (Frames `ps_<Klasse>`) — alle Schatten teilen sich damit
   * weiterhin genau einen Batch. Pixel kommen aus propShadowFor() (Palette 0,
   * halbtransparent, elliptisch); kein weicher Canvas-Gradient mehr.
   */
  private ensurePropShadowTexture(): void {
    if (this.propShadowTexture !== undefined) return;
    this.propShadowTexture = null;
    if (this.scene.textures.exists("prop_contact_shadow")) {
      this.propShadowTexture = "prop_contact_shadow";
      return;
    }
    const classes = [...PROP_KEYS].map((k) => propShadowClassFor(k));
    const shadows = classes.map((k) => propShadowFor(k));
    const gap = 2;
    const width = shadows.reduce((sum, s) => sum + s.w + gap, gap);
    const height = Math.max(...shadows.map((s) => s.h));
    const texture = this.scene.textures.createCanvas("prop_contact_shadow", width, height);
    if (!texture) return;
    const ctx = texture.getContext();
    const r = (PAL[PROP_SHADOW_COLOR] >> 16) & 0xff;
    const g = (PAL[PROP_SHADOW_COLOR] >> 8) & 0xff;
    const b = PAL[PROP_SHADOW_COLOR] & 0xff;
    let x = gap;
    classes.forEach((cls, i) => {
      const s = shadows[i];
      for (let py = 0; py < s.h; py++) {
        for (let px = 0; px < s.w; px++) {
          const a = s.alpha[py * s.w + px];
          if (a <= 0) continue;
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx.fillRect(x + px, py, 1, 1);
        }
      }
      if (!texture.has(`ps_${cls}`)) texture.add(`ps_${cls}`, 0, x, 0, s.w, s.h);
      x += s.w + gap;
    });
    texture.refresh();
    this.propShadowTexture = "prop_contact_shadow";
  }

  /** Ziel-Container-Paar eines Props (Glow, sonst Textur-Layer); null = fest gelistet. */
  private propTargetLayers(p: Phaser.GameObjects.Image): PropLayers | null {
    if (p.getData("isShadow")) return null; // Schatten bleiben fest im Schatten-Layer
    if (p.getData("glow")) return this.glowLayers ?? null;
    const key = p.texture?.key;
    return (key && this.propLayers.get(key)) || null;
  }

  /**
   * Props auf hinter/vor dem Spieler verteilen. Kosten nur noch bei Seitenwechsel
   * (Container-Mitgliedschaft aendern) statt setDepth auf alle Props pro Frame —
   * vorher hat jeder der ~800 setDepth-Aufrufe die gesamte Szenenliste neu sortiert.
   */
  private updatePropsDepth(): void {
    const player = (this.scene as unknown as { player?: Phaser.GameObjects.Container }).player;
    const py = player?.y;
    if (py === undefined) return;
    for (const entry of this.chunks.values()) {
      for (const p of entry.props) {
        const layers = this.propTargetLayers(p);
        if (!layers) continue;
        const footY = p.getData("footY") as number | undefined;
        if (footY === undefined) continue;
        const side = propSideFor(footY, py);
        if (p.getData("batchSide") === side) continue;
        const target = side === "front" ? layers.front : layers.behind;
        if (p.parentContainer && p.parentContainer !== target) p.parentContainer.remove(p);
        target.add(p);
        p.setData("batchSide", side);
        if (this.counters) this.counters.propDepthSets++;
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

    // Ein Layer je Blend-Modus, feste Tiefen unter allen Props/Laternen-Glows.
    // Damit stehen alle ADD-Glows und alle NORMAL-Nebel zusammen im Batch und
    // werden nicht pro Bild zwischen andere Tiefen sortiert.
    this.glowLayer = this.scene.add.container(0, 0).setDepth(-89.8);
    this.fogLayer = this.scene.add.container(0, 0).setDepth(-89.9).setScrollFactor(0);
    for (let i = 0; i < 24; i++) {
      const img = this.scene.add.image(0, 0, "m9_ambient_glow")
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(PAL[21])
        .setAlpha(0);
      img.setScale(0.7 + tileHash(i, 3, this.seed + 601) * 0.9);
      this.glowLayer.add(img);
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
        .setTint(PAL[6])
        .setAlpha(0);
      img.setScale(2.2 + i * 0.55);
      this.fogLayer.add(img);
      this.fogBanks.push({
        img,
        baseX: 0.2 + i * 0.3,
        baseY: 0.55 + (i % 2) * 0.2,
        phase: i * 2.1,
      });
    }
  }

  /** Ambient: Glühwürmchen umisen, Nebel drift, Zahl an Gegnerlast gekoppelt. */
  private updateAmbient(camera: Phaser.Cameras.Scene2D.Camera, timeMs: number): void {
    const enemies = (this.scene as unknown as { enemies?: { count?: number } }).enemies?.count ?? 0;
    const budget = ambientBudgetFor(enemies);
    const stepMs = 1000 / budget.updateHz;
    if (timeMs - this.ambientLastTick < stepMs) return;
    this.ambientLastTick = timeMs;

    // Dichte-LOD für Props: gestufte Tiers (N1 = Deko aus, N2 = nur Laternen).
    // Nur bei Stufenwechsel anwenden; neue Chunks filtern sich in addProp() selbst.
    const maxTier = propDensityMaxTier(enemies);
    if (maxTier !== this.propLodMaxTier) {
      this.applyPropTier(maxTier);
      this.propLodMaxTier = maxTier;
    }

    const t = timeMs * 0.001;
    // #4658: Gluehwuermchen sind weltverankert (scrollFactor 1) und sollen die
    // volle SICHTBARE Weltbreite/-hoehe ueberstreichen — camera.width ist bei
    // Teiler s nur W/s, der Ausschnitt bleibt W breit (siehe cameraWorldView).
    const view = cameraWorldView(
      camera.width, camera.height, camera.scrollX, camera.scrollY, camera.zoom,
    );
    for (let i = 0; i < this.fireflies.length; i++) {
      const f = this.fireflies[i];
      const visible = i < budget.glow;
      f.img.setVisible(visible);
      if (!visible) continue;
      const x = view.left + f.baseX * view.width
        + Math.sin(t * f.speed * 0.55 + f.phase) * 14;
      const y = view.top + f.baseY * view.height
        + Math.cos(t * f.speed * 0.7 + f.phase) * 9;
      f.img.setPosition(Math.round(x), Math.round(y));
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + f.phase * 3);
      f.img.setAlpha(0.16 + pulse * 0.34);
    }
    for (let i = 0; i < this.fogBanks.length; i++) {
      const b = this.fogBanks[i];
      const visible = i < budget.fog;
      b.img.setVisible(visible);
      if (!visible) continue;
      // #4658: Nebel ist screen-verankert (scrollFactor 0) und wird unter Zoom
      // um den Viewport-Mittelpunkt verschoben — logische Position daher ueber
      // screenAnchoredX puffern. Der Drift ist SCREEN-Pixel und wird erst NACH
      // der Kompensation addiert (sonst CSS-Drift 46*s statt 46 px —
      // Reviewer-Befund); bei Teiler 1 beides Identitaet.
      b.img.setPosition(
        Math.round(screenAnchoredX(b.baseX * camera.width, camera.width, camera.zoom)
          + Math.sin(t * 0.055 + b.phase) * 46),
        Math.round(screenAnchoredX(b.baseY * camera.height, camera.height, camera.zoom)
          + Math.cos(t * 0.04 + b.phase) * 8),
      );
      b.img.setAlpha(0.055 + 0.03 * Math.sin(t * 0.12 + b.phase));
    }
  }

  /** Terrain an einer Weltposition (für Wasser-Slow und Spritzer). */
  kindAt(worldX: number, worldY: number): TileKind {
    return terrainKindAt(worldX, worldY, this.seed, WORLD_SIZE);
  }

  /** Dichte-LOD: Sichtbarkeit aller Props/Schatten/Glows nach Prop-Tier setzen
   *  (nur bei Stufenwechsel aufgerufen). Glows haengen an Laternen (Tier 0)
   *  und bleiben sichtbar; Schatten folgen ihrem Prop. Klassifikation ueber
   *  ownerKey (= Prop-Klasse) — Varianten-Texturen sind nicht in PROP_TIERS
   *  und wuerden sonst von ihrem Schatten abweichen (Review-Befund K4). */
  private applyPropTier(maxTier: 0 | 1 | 2): void {
    for (const entry of this.chunks.values()) {
      for (const p of entry.props) {
        const tier = p.getData("glow")
          ? 0
          : propTierFor((p.getData("ownerKey") as string | undefined) ?? p.texture?.key);
        p.setVisible(tier <= maxTier);
      }
    }
  }

  /** Schickt faellige Chunk-Jobs an den Worker, naechstgelegene zuerst. */  private dispatch(centerX: number, centerY: number): void {
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
      if (this.counters) this.counters.workerPosted++;
      // Der Worker entscheidet selbst (areaHasWater dort kostenfrei), ob er
      // alle Animationsstufen malt — kein Main-Thread-Sampling im Dispatch.
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
    if (this.counters) this.counters.readyInstalled++;
    const textureKey = `chunk_${job.key.replace(",", "_")}`;
    if (this.buildChunkTexture(textureKey, job.bitmaps, job.cx, job.cy)) {
      this.buildChunk(job.cx, job.cy, job.key, textureKey);
    }
    this.requested.delete(job.key);
  }

  /**
   * Chunk-Textur mit allen Animationsstufen: ein Canvas der Hoehe
   * CHUNK_SIZE * frames, Stufe f liegt bei y = f * CHUNK_SIZE (Frames f0..).
   * Ein drawImage je Stufe, dann schaltet setFrame ohne Texturwechsel um.
   */
  private buildChunkTexture(textureKey: string, bitmaps: ImageBitmap[], cx: number, cy: number): boolean {
    const frames = Math.max(1, bitmaps.length);
    const texture = this.scene.textures.createCanvas(textureKey, CHUNK_SIZE, CHUNK_SIZE * frames);
    if (!texture) {
      for (const b of bitmaps) b.close();
      return false;
    }
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    for (let f = 0; f < frames; f++) {
      const b = bitmaps[f];
      if (b) ctx.drawImage(b, 0, f * CHUNK_SIZE);
      b?.close();
    }
    texture.refresh();
    for (let f = 0; f < frames; f++) {
      if (!texture.has(`f${f}`)) texture.add(`f${f}`, 0, 0, f * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE);
    }
    return true;
  }

  /** Sync-Fallback (kein Worker): alle Stufen direkt auf dem Main-Thread malen. */
  private createChunk(cx: number, cy: number, key: string): void {
    const textureKey = `chunk_${key.replace(",", "_")}`;
    const frames = areaHasWater(cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, this.seed, WORLD_SIZE)
      ? WATER_ANIM_STEPS : 1;
    const texture = this.scene.textures.createCanvas(textureKey, CHUNK_SIZE, CHUNK_SIZE * frames);
    if (!texture) {
      // Kein Canvas (Speicher/GPU-Limit): Chunk erneut anfragbar machen statt
      // ihn dauerhaft als "requested" zu blockieren (Loch ohne Retry).
      this.requested.delete(key);
      return;
    }
    const ctx = texture.getContext();
    ctx.imageSmoothingEnabled = false;
    for (let f = 0; f < frames; f++) {
      ctx.save();
      ctx.translate(0, f * CHUNK_SIZE);
      paintTerrain(ctx, cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, this.seed, WORLD_SIZE, f, f * CHUNK_SIZE);
      ctx.restore();
    }
    texture.refresh();
    for (let f = 0; f < frames; f++) {
      if (!texture.has(`f${f}`)) texture.add(`f${f}`, 0, 0, f * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE);
    }
    this.buildChunk(cx, cy, key, textureKey);
    this.requested.delete(key);
  }

  /** Bild + Requisiten/Wellen fuer einen fertig gemalten Chunk anlegen. */
  private buildChunk(cx: number, cy: number, key: string, textureKey: string): void {
    if (this.chunks.has(key)) {
      if (this.counters) this.counters.chunkRebuilds++;
      this.scene.textures.remove(textureKey);
      return;
    }
    if (this.counters) this.counters.chunkBuilds++;
    this.ensureBatchLayers();
    const image = this.scene.add.image(cx * CHUNK_SIZE, cy * CHUNK_SIZE, textureKey)
      .setOrigin(0, 0)
      .setDepth(-100);
    const texture = this.scene.textures.get(textureKey);
    const frames = texture ? texture.frameTotal - 1 : 1;
    if (frames > 1) image.setFrame("f0");

    const props: Phaser.GameObjects.Image[] = [];
    const ripples: Ripple[] = [];
    this.placeProps(cx, cy, props);
    this.placeWaterDetails(cx, cy, props, ripples);
    this.chunks.set(key, {
      image, key: textureKey, props, ripples, frames,
      phase: Math.floor(tileHash(cx, cy, this.seed + 541) * WATER_ANIM_STEPS),
      animStep: frames > 1 ? 0 : -1,
    });
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
    // Prop-Vielfalt (m10-props-variety): deterministische Variantenwahl pro
    // Position — nur die Textur variiert, Platzierung/LOD/Batching bleiben
    // klassenbasiert. Fallback auf die Basis-Textur, falls eine Variante
    // (noch) nicht gebacken ist.
    const variantKey = propVariantKeyFor(key, tileHash(Math.round(wx), Math.round(wy), this.seed + 463));
    const texKey = this.scene.textures.exists(variantKey) ? variantKey : key;
    this.ensureBatchLayers();
    const img = this.scene.add.image(wx, wy, texKey).setOrigin(0.5, 1);
    img.setFlipX(flip);
    img.setData("footY", wy);
    // Dichte-LOD: Props klassifizieren ueber ihren Klassen-Key (Basis), nicht
    // ueber die Varianten-Textur — sonst faellt prop_post_b (unbekannt in
    // PROP_TIERS) auf Tier 2 und der Schatten (ownerKey = Basis, Tier 0)
    // wuerde sichtbar bleiben, waehrend die Laterne versteckt wird.
    img.setData("ownerKey", key);
    // Kontakt-Schatten (m10-prop-contact-shadow): palettetreue Pixel-Ellipse
    // (Palette 0, α0,35 Kern/α0,18 Rand) aus dem Shadow-Atlas, 1 px unter dem
    // Fusspunkt und leicht versetzt. Alle Schatten teilen sich eine Textur
    // (1 Batch); Variante -> Basis-Klasse, kein weicher Canvas-Gradient mehr.
    let shadow: Phaser.GameObjects.Image | undefined;
    this.ensurePropShadowTexture();
    const shadowCls = propShadowClassFor(texKey);
    const shadowTex = this.propShadowTexture ? this.scene.textures.get(this.propShadowTexture) : null;
    const shadowFrame = shadowTex && shadowTex.has(`ps_${shadowCls}`) ? `ps_${shadowCls}` : null;
    if (shadowFrame && this.propShadowTexture) {
      shadow = this.scene.add.image(
        wx + PROP_SHADOW_OFFSET.x, wy + PROP_SHADOW_OFFSET.y,
        this.propShadowTexture, shadowFrame,
      ).setOrigin(0.5, 0.5);
    } else if (this.scene.textures.exists("shadow")) {
      // Fallback (Atlas ohne Shadow-Frame): alter weicher Bodenschatten.
      const sw = Math.max(0.7, Math.min(4, img.width / 16));
      shadow = this.scene.add.image(wx, wy - 1, "shadow")
        .setOrigin(0.5, 0.5)
        .setScale(sw, 0.85)
        .setAlpha(0.62);
    }
    if (shadow) {
      shadow.setData("isShadow", true);
      shadow.setData("ownerKey", key); // Dichte-LOD: Schatten folgt seinem Prop
      this.shadowLayer!.add(shadow); // feste Tiefe: alle Schatten = 1 Batch
      props.push(shadow);
    }
    if (tinted) img.setAlpha(0.92);
    // Startseite "hinter dem Spieler"; updatePropsDepth() sortiert um, sobald
    // der Spieler existiert (nur bei Seitenwechsel, nicht mehr pro Frame).
    this.propLayerFor(texKey).behind.add(img);
    img.setData("batchSide", "behind");
    props.push(img);
    // Dichte-LOD: neu gebaute Chunks erben sofort den aktuellen Tier-Zustand
    // (Sonst waeren waehrend dichter Phase kurzzeitig alle Props sichtbar).
    if (propTierFor(key) > this.propLodMaxTier) {
      img.setVisible(false);
      shadow?.setVisible(false);
    }
    // Laternenpfahl ist Lichtquelle: kleiner additiver warmer Warmschein (Overlay).
    if (texKey === "prop_post" && this.scene.textures.exists("light_radius")) {
      const glow = this.scene.add.image(wx, wy - 20, "light_radius")
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.42)
        .setAlpha(0.22);
      glow.setData("footY", wy);
      glow.setData("glow", true);
      this.glowLayers!.behind.add(glow);
      glow.setData("batchSide", "behind");
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
            this.rippleLayer!.add(img); // feste Tiefe: alle Ripples in einem Layer
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
    while (this.ready.length > 0) {
      for (const b of this.ready.pop()!.bitmaps) b.close();
    }
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
    this.glowLayer?.destroy(true);
    this.fogLayer?.destroy(true);
    this.glowLayer = undefined;
    this.fogLayer = undefined;
    for (const layers of this.propLayers.values()) {
      layers.behind.destroy(true);
      layers.front.destroy(true);
    }
    this.propLayers.clear();
    this.shadowLayer?.destroy(true);
    this.rippleLayer?.destroy(true);
    this.glowLayers?.behind.destroy(true);
    this.glowLayers?.front.destroy(true);
    this.shadowLayer = undefined;
    this.rippleLayer = undefined;
    this.glowLayers = undefined;
    this.fireflies.length = 0;
    this.fogBanks.length = 0;
  }

  /** Debug/Messung: Zaehler einschalten (nur fuer Messlaeufe, kein Spielverhalten). */
  debugEnableCounters(): void {
    this.counters = {
      updateCalls: 0,
      chunkBuilds: 0,
      chunkRebuilds: 0,
      workerPosted: 0,
      workerReceived: 0,
      readyInstalled: 0,
      propDepthSets: 0,
      rippleTextureSets: 0,
      sumVisibleChunks: 0,
      sumVisibleProps: 0,
      sumVisibleRipples: 0,
      sumVisibleAmbient: 0,
      sumVisiblePropTextures: 0,
      loadedChunks: this.chunks.size,
    };
  }

  /** Debug/Messung: Batch-Layer- und Batches-Zahl (Layer mit sichtbarem Kind). */
  debugBatchStats(): {
    layerCount: number;
    propBatches: number;
    shadowBatches: number;
    glowBatches: number;
    rippleBatches: number;
    visibleProps: number;
    visibleRipples: number;
  } {
    const lit = (c?: Phaser.GameObjects.Container) => {
      if (!c) return 0;
      for (const child of c.list) if ((child as Phaser.GameObjects.Image).visible) return 1;
      return 0;
    };
    let propBatches = 0;
    for (const layers of this.propLayers.values()) {
      propBatches += lit(layers.behind) + lit(layers.front);
    }
    let visibleProps = 0;
    for (const entry of this.chunks.values()) {
      for (const p of entry.props) if (p.visible) visibleProps++;
    }
    return {
      layerCount: batchLayerCount(this.propLayers.size),
      propBatches,
      shadowBatches: lit(this.shadowLayer),
      glowBatches: lit(this.glowLayers?.behind) + lit(this.glowLayers?.front),
      rippleBatches: lit(this.rippleLayer),
      visibleProps,
      visibleRipples: this.ripples.filter((r) => r.img.visible).length,
    };
  }

  /** Debug/Messung: Zaehlerstand kopieren. */
  debugStats(): GroundDebugStats | null {
    return this.counters ? { ...this.counters } : null;
  }

  get lastMinChunk(): { x: number; y: number } {
    return { x: this.lastCx, y: this.lastCy };
  }
}
