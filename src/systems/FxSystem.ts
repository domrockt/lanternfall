import Phaser from "phaser";
import { DEPTH } from "../gfx/depth";
import { FX_FRAME_COUNTS, fxFrames } from "../gfx/gen-fx";
import { applyTexture, currentFrame, makeImage } from "../gfx/atlas";

interface FxRuntime {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  scaleFrom: number;
  scaleTo: number;
  /** Seitenverhältnis-Multiplikator: scaleX = scale * aspect (Beams bleiben dünn). */
  aspect: number;
  alphaFrom: number;
  alphaTo: number;
  rotation: number;
  spin: number;
  frames: string[];
  frameRate: number;
  active: boolean;
}

export interface FxOptions {
  texture: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life?: number;
  scaleFrom?: number;
  scaleTo?: number;
  /** Optionaler Seitenverhältnis-Multiplikator (nur X); Beams nutzen das für dünne Linien. */
  aspect?: number;
  alphaFrom?: number;
  alphaTo?: number;
  rotation?: number;
  spin?: number;
  tint?: number;
  additive?: boolean;
  depth?: number;
  /** Frame-Animation (4–8 handgesetzte Frames); ohne Angabe statische Textur. */
  frames?: string[];
  /** Frames pro Sekunde der Animation (Default 18). */
  frameRate?: number;
}

/**
 * Gepoolter Effekt-Pool für Waffen-VFX, Ringe, Blitze und Ereignis-Inszenierung.
 * Bewusst ohne Phaser-Tweens (Massen-VFX bei 500 Gegnern), Update in festen Schritten.
 *
 * Zusätzlich gibt es einen eigenen Partikel-Pool (`ParticleSystem`) mit größerem
 * Cap: die 160er-Grenze gilt nur für große Effekt-Sprites, nicht für Funken.
 */
export class FxSystem {
  readonly active: FxRuntime[] = [];
  private readonly free: FxRuntime[] = [];
  private readonly scene: Phaser.Scene;
  /** Obergrenze für große Effekt-Sprites (LOD senkt sie bei Extremlast). */
  private maxActive = 220;
  /** Trails abschaltbar (LOD): spart Draw-Aufrufe bei > 400 Gegnern. */
  trailsEnabled = true;
  /** M6-Endgame-Dämpfung: Alpha-Faktor für alle neuen Effekte (1 = unverändert). */
  alphaScale = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Effekt-Alpha dämpfen (Endgame): 1 = voll, < 1 = transparenter. */
  setAlphaScale(scale: number): void {
    this.alphaScale = Math.max(0.2, Math.min(1, scale));
  }

  setMaxActive(max: number): void {
    this.maxActive = Math.max(24, Math.floor(max));
  }

  spawn(opts: FxOptions): FxRuntime | null {
    if (this.active.length >= this.maxActive) return null;
    const fx = this.free.pop() ?? this.createRuntime();
    fx.x = opts.x;
    fx.y = opts.y;
    fx.vx = opts.vx ?? 0;
    fx.vy = opts.vy ?? 0;
    fx.life = opts.life ?? 0.35;
    fx.maxLife = fx.life;
    fx.scaleFrom = opts.scaleFrom ?? 1;
    fx.scaleTo = opts.scaleTo ?? fx.scaleFrom;
    fx.aspect = opts.aspect ?? 1;
    fx.alphaFrom = (opts.alphaFrom ?? 0.9) * this.alphaScale;
    fx.alphaTo = opts.alphaTo ?? 0;
    fx.rotation = opts.rotation ?? 0;
    fx.spin = opts.spin ?? 0;
    fx.frames = opts.frames ?? [opts.texture];
    fx.frameRate = opts.frameRate ?? 18;
    fx.active = true;
    const sprite = fx.sprite;
    applyTexture(sprite, fx.frames[0]);
    sprite.setPosition(Math.round(fx.x), Math.round(fx.y));
    sprite.setScale(fx.scaleFrom * fx.aspect, fx.scaleFrom);
    sprite.setAlpha(fx.alphaFrom);
    sprite.setRotation(fx.rotation);
    sprite.setDepth(opts.depth ?? DEPTH.fxLow);
    sprite.setBlendMode(opts.additive === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
    if (opts.tint !== undefined) sprite.setTint(opts.tint);
    else sprite.clearTint();
    sprite.setVisible(true).setActive(true);
    this.active.push(fx);
    return fx;
  }

  /** Frame-Animation per Basis-Key (Frame-Anzahl aus FX_FRAME_COUNTS). */
  spawnAnim(base: string, x: number, y: number, opts: Partial<FxOptions> = {}): FxRuntime | null {
    const count = FX_FRAME_COUNTS[base] ?? 1;
    return this.spawn({
      ...(opts as FxOptions),
      texture: base,
      x,
      y,
      frames: opts.frames ?? fxFrames(base, count),
      frameRate: opts.frameRate ?? count / Math.max(0.05, opts.life ?? 0.35),
    });
  }

  /** Kurzer Partikel-Burst (Treffer/Tod), radial gestreut. */
  burst(texture: string, x: number, y: number, count: number, opts: Partial<FxOptions> = {}): void {
    const base = opts as FxOptions;
    const life = opts.life ?? 0.22;
    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2;
      const speed = 24 + this.rand() * 46;
      this.spawn({
        ...base,
        texture,
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: life * (0.7 + this.rand() * 0.6),
        scaleFrom: opts.scaleFrom ?? 1,
        scaleTo: opts.scaleTo ?? 0.2,
        alphaFrom: opts.alphaFrom ?? 0.9,
        alphaTo: 0,
      });
    }
  }

  /** Deterministischer LCG statt Math.random (reproduzierbare VFX-Screenshots). */
  private seq = 0x9e3779b9;
  private rand(): number {
    this.seq = (this.seq * 1664525 + 1013904223) >>> 0;
    return this.seq / 0x100000000;
  }

  /** Linie (Blitz/Speer) als rotiertes Segment. */
  beam(texture: string, x1: number, y1: number, x2: number, y2: number, opts: Partial<FxOptions> = {}): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    // Nur in Y strecken: die Linie bleibt texW Pixel breit statt len/8-fach aufzublähen.
    const stretch = len / 8;
    this.spawn({
      ...(opts as FxOptions),
      texture,
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
      rotation: Math.atan2(dy, dx) + Math.PI / 2,
      scaleFrom: stretch,
      scaleTo: stretch,
      aspect: opts.aspect ?? 1 / stretch,
      life: opts.life ?? 0.18,
      alphaFrom: opts.alphaFrom ?? 1,
      alphaTo: 0,
      additive: opts.additive ?? true,
    });
  }

  /**
   * Gezackter, verzweigter Blitz aus 3–6 Segmenten. Jedes Segment behält die
   * volle Texturbreite (kein aspect-Stauch) und wird nur in Y gestreckt.
   */
  bolt(x1: number, y1: number, x2: number, y2: number, opts: Partial<FxOptions> = {}): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    const nx = -dy / len;
    const ny = dx / len;
    const segments = Math.max(3, Math.min(6, Math.ceil(len / 26)));
    const seed = Math.abs(Math.floor(x1 * 13 + y1 * 7 + x2 * 3 + y2 * 11));
    const life = opts.life ?? 0.3;
    const tint = opts.tint;
    const jitter = (i: number): number => (Math.sin(seed * 0.7 + i * 2.3) * 4.2 + Math.sin(seed + i * 5.1) * 1.8);
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const o0 = i === 0 ? 0 : jitter(i);
      const o1 = i === segments - 1 ? 0 : jitter(i + 1);
      const ax = x1 + dx * t0 + nx * o0;
      const ay = y1 + dy * t0 + ny * o0;
      const bx = x1 + dx * t1 + nx * o1;
      const by = y1 + dy * t1 + ny * o1;
      const segLen = Math.hypot(bx - ax, by - ay) || 1;
      this.spawnAnim("fx_bolt", (ax + bx) / 2, (ay + by) / 2, {
        ...(opts as FxOptions),
        rotation: Math.atan2(by - ay, bx - ax) + Math.PI / 2,
        scaleFrom: segLen / 16,
        scaleTo: segLen / 16,
        life, alphaFrom: opts.alphaFrom ?? 1, alphaTo: opts.alphaTo ?? 0,
        tint,
      });
    }
    // Zwei Seitenäste (verzweigt), nicht nur eine gerade Säule.
    for (let b = 0; b < 2; b++) {
      const t = 0.35 + b * 0.22;
      const ox = x1 + dx * t + nx * jitter(b + 2);
      const oy = y1 + dy * t + ny * jitter(b + 2);
      const side = (b === 0 ? 1 : -1) * (0.55 + (seed % 3) * 0.12);
      const bx = ox + Math.cos(ang + side) * 20;
      const by = oy + Math.sin(ang + side) * 20;
      this.spawnAnim("fx_bolt", (ox + bx) / 2, (oy + by) / 2, {
        ...(opts as FxOptions),
        rotation: Math.atan2(by - oy, bx - ox) + Math.PI / 2,
        scaleFrom: 0.9, scaleTo: 0.9,
        life: life * 0.75, alphaFrom: 0.85, alphaTo: 0, tint,
      });
    }
  }

  /** Boden-Decal (unter Gegnern, Normal-Blend). */
  decal(texture: string, x: number, y: number, opts: Partial<FxOptions> = {}): FxRuntime | null {
    return this.spawn({
      ...(opts as FxOptions),
      texture, x, y,
      depth: DEPTH.decal,
      additive: false,
      alphaFrom: opts.alphaFrom ?? 0.9,
      alphaTo: opts.alphaTo ?? 0,
      life: opts.life ?? 1.2,
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      if (!fx.active) continue;
      fx.life -= dt;
      if (fx.life <= 0) {
        fx.active = false;
        fx.sprite.setVisible(false).setActive(false);
        fx.sprite.clearTint();
        this.active.splice(i, 1);
        this.free.push(fx);
        continue;
      }
      const t = 1 - fx.life / fx.maxLife;
      fx.x += fx.vx * dt;
      fx.y += fx.vy * dt;
      fx.rotation += fx.spin * dt;
      const scale = fx.scaleFrom + (fx.scaleTo - fx.scaleFrom) * t;
      const frame = fx.frames[Math.min(fx.frames.length - 1, Math.floor(t * fx.frames.length))];
      if (frame && currentFrame(fx.sprite) !== frame) applyTexture(fx.sprite, frame);
      fx.sprite.setPosition(Math.round(fx.x), Math.round(fx.y));
      fx.sprite.setScale(scale * fx.aspect, scale);
      fx.sprite.setAlpha(Math.max(0, fx.alphaFrom + (fx.alphaTo - fx.alphaFrom) * t));
      fx.sprite.setRotation(fx.rotation);
    }
  }

  /** Effekt-Runtimes vor dem ersten Spawn anlegen (Peak-Allokation vermeiden). */
  prewarm(n: number): void {
    while (this.free.length < n) {
      const fx = this.createRuntime();
      fx.active = false;
      fx.sprite.setVisible(false).setActive(false);
      this.free.push(fx);
    }
  }

  private createRuntime(): FxRuntime {
    const sprite = makeImage(this.scene, 0, 0, "fx_spark").setDepth(DEPTH.fxLow);
    return {
      sprite, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      scaleFrom: 1, scaleTo: 1, aspect: 1, alphaFrom: 1, alphaTo: 0, rotation: 0, spin: 0,
      frames: ["fx_spark"], frameRate: 18, active: false,
    };
  }

  clear(): void {
    for (const fx of this.active) {
      fx.active = false;
      fx.sprite.setVisible(false).setActive(false);
      this.free.push(fx);
    }
    this.active.length = 0;
    this.seq = 0x9e3779b9;
  }

  get count(): number {
    return this.active.length;
  }

  /** Aktive Frame-Key-Liste (Debug/Abnahme). */
  get keys(): string[] {
    return [...new Set(this.active.map((f) => f.frames[0]))];
  }
}

/** Eigener Partikel-Pool: Funken/Splitter/Staub, deutlich über dem Effekt-Cap. */
export class ParticleSystem {
  active: FxRuntime[] = [];
  private readonly free: FxRuntime[] = [];
  private readonly scene: Phaser.Scene;
  private maxActive = 360;
  /** M6-Endgame-Dämpfung: Alpha-Faktor für neue Partikel (1 = unverändert). */
  alphaScale = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setAlphaScale(scale: number): void {
    this.alphaScale = Math.max(0.2, Math.min(1, scale));
  }

  setMaxActive(max: number): void {
    this.maxActive = Math.max(40, Math.floor(max));
  }

  spawn(opts: FxOptions): FxRuntime | null {
    if (this.active.length >= this.maxActive) return null;
    const p = this.free.pop() ?? this.createRuntime();
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.life = opts.life ?? 0.3;
    p.maxLife = p.life;
    p.scaleFrom = opts.scaleFrom ?? 1;
    p.scaleTo = opts.scaleTo ?? 0.2;
    p.aspect = opts.aspect ?? 1;
    p.alphaFrom = (opts.alphaFrom ?? 0.95) * this.alphaScale;
    p.alphaTo = opts.alphaTo ?? 0;
    p.rotation = opts.rotation ?? 0;
    p.spin = opts.spin ?? 0;
    p.frames = opts.frames ?? [opts.texture];
    p.frameRate = opts.frameRate ?? 18;
    p.active = true;
    const s = p.sprite;
    applyTexture(s, p.frames[0]);
    s.setPosition(Math.round(p.x), Math.round(p.y));
    s.setScale(p.scaleFrom * p.aspect, p.scaleFrom);
    s.setAlpha(p.alphaFrom);
    s.setRotation(p.rotation);
    s.setDepth(opts.depth ?? DEPTH.fxLow);
    s.setBlendMode(opts.additive === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
    if (opts.tint !== undefined) s.setTint(opts.tint);
    else s.clearTint();
    s.setVisible(true).setActive(true);
    this.active.push(p);
    return p;
  }

  /** Radialer Burst mit optionaler Frame-Animation. */
  burst(texture: string, x: number, y: number, count: number, opts: Partial<FxOptions> = {}): void {
    for (let i = 0; i < count; i++) {
      const a = (i / Math.max(1, count)) * Math.PI * 2 + (opts.rotation ?? 0);
      const speed = (opts.vx ?? 33) + this.rand() * 42;
      this.spawn({
        ...(opts as FxOptions),
        texture, x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: (opts.life ?? 0.32) * (0.75 + this.rand() * 0.5),
      });
    }
  }

  /** Zerfalls-Splitter in eine Richtung (Todes-Effekt). */
  shards(texture: string, x: number, y: number, count: number, opts: Partial<FxOptions> = {}): void {
    for (let i = 0; i < count; i++) {
      const a = (i / Math.max(1, count)) * Math.PI * 2 + this.rand() * 0.5;
      const speed = 20 + this.rand() * 55;
      this.spawn({
        ...(opts as FxOptions),
        texture, x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: (opts.life ?? 0.4) * (0.7 + this.rand() * 0.6),
        scaleFrom: opts.scaleFrom ?? 1,
        scaleTo: 0.15,
        alphaFrom: opts.alphaFrom ?? 1,
        alphaTo: 0,
      });
    }
  }

  private seq = 0x1234567;
  private rand(): number {
    this.seq = (this.seq * 1103515245 + 12345) >>> 0;
    return this.seq / 0x100000000;
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.sprite.setVisible(false).setActive(false);
        p.sprite.clearTint();
        this.active.splice(i, 1);
        this.free.push(p);
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - dt * 2.2);
      p.vy *= Math.max(0, 1 - dt * 2.2);
      p.rotation += p.spin * dt;
      const scale = p.scaleFrom + (p.scaleTo - p.scaleFrom) * t;
      const frame = p.frames[Math.min(p.frames.length - 1, Math.floor(t * p.frames.length))];
      if (frame && currentFrame(p.sprite) !== frame) applyTexture(p.sprite, frame);
      p.sprite.setPosition(Math.round(p.x), Math.round(p.y));
      p.sprite.setScale(scale * p.aspect, scale);
      p.sprite.setAlpha(Math.max(0, p.alphaFrom + (p.alphaTo - p.alphaFrom) * t));
      p.sprite.setRotation(p.rotation);
    }
  }

  prewarm(n: number): void {
    while (this.free.length < n) {
      const p = this.createRuntime();
      p.active = false;
      p.sprite.setVisible(false).setActive(false);
      this.free.push(p);
    }
  }

  private createRuntime(): FxRuntime {
    const sprite = makeImage(this.scene, 0, 0, "fx_spark").setDepth(DEPTH.fxLow);
    return {
      sprite, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      scaleFrom: 1, scaleTo: 1, aspect: 1, alphaFrom: 1, alphaTo: 0, rotation: 0, spin: 0,
      frames: ["fx_spark"], frameRate: 18, active: false,
    };
  }

  clear(): void {
    for (const p of this.active) {
      p.active = false;
      p.sprite.setVisible(false).setActive(false);
      this.free.push(p);
    }
    this.active.length = 0;
  }

  get count(): number {
    return this.active.length;
  }
}
