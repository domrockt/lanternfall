import Phaser from "phaser";

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
  alphaFrom: number;
  alphaTo: number;
  rotation: number;
  spin: number;
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
  alphaFrom?: number;
  alphaTo?: number;
  rotation?: number;
  spin?: number;
  tint?: number;
  additive?: boolean;
  depth?: number;
}

/**
 * Kleiner, gepoolter Effekt-Pool für Trails, Treffer-Partikel, Ringe und Blitze.
 * Bewusst ohne Phaser-Tweens (Massen-VFX bei 500 Gegnern), Update in festen Schritten.
 */
export class FxSystem {
  readonly active: FxRuntime[] = [];
  private readonly free: FxRuntime[] = [];
  private readonly scene: Phaser.Scene;
  /** Obergrenze, damit VFX bei Extremlast nicht die Frame-Zeit dominieren. */
  private maxActive = 520;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
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
    fx.alphaFrom = opts.alphaFrom ?? 0.9;
    fx.alphaTo = opts.alphaTo ?? 0;
    fx.rotation = opts.rotation ?? 0;
    fx.spin = opts.spin ?? 0;
    fx.active = true;
    const sprite = fx.sprite;
    sprite.setTexture(opts.texture);
    sprite.setPosition(Math.round(fx.x), Math.round(fx.y));
    sprite.setScale(fx.scaleFrom);
    sprite.setAlpha(fx.alphaFrom);
    sprite.setRotation(fx.rotation);
    sprite.setDepth(opts.depth ?? 9);
    sprite.setBlendMode(opts.additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    if (opts.tint !== undefined) sprite.setTint(opts.tint);
    else sprite.clearTint();
    sprite.setVisible(true).setActive(true);
    this.active.push(fx);
    return fx;
  }

  /** Kurzer Partikel-Burst (Treffer/Tod), radial gestreut. */
  burst(texture: string, x: number, y: number, count: number, opts: Partial<FxOptions> = {}): void {
    const base = opts as FxOptions;
    const life = opts.life ?? 0.22;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 24 + Math.random() * 46;
      this.spawn({
        ...base,
        texture,
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: life * (0.7 + Math.random() * 0.6),
        scaleFrom: opts.scaleFrom ?? 1,
        scaleTo: opts.scaleTo ?? 0.2,
        alphaFrom: opts.alphaFrom ?? 0.9,
        alphaTo: 0,
      });
    }
  }

  /** Linie (Blitz/Speer) als rotiertes Segment. */
  beam(texture: string, x1: number, y1: number, x2: number, y2: number, opts: Partial<FxOptions> = {}): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    this.spawn({
      ...(opts as FxOptions),
      texture,
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
      rotation: Math.atan2(dy, dx) + Math.PI / 2,
      scaleFrom: len / 8,
      scaleTo: len / 8,
      life: opts.life ?? 0.18,
      alphaFrom: opts.alphaFrom ?? 1,
      alphaTo: 0,
      additive: opts.additive ?? true,
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
      fx.sprite.setPosition(Math.round(fx.x), Math.round(fx.y));
      fx.sprite.setScale(scale);
      fx.sprite.setAlpha(Math.max(0, fx.alphaFrom + (fx.alphaTo - fx.alphaFrom) * t));
      fx.sprite.setRotation(fx.rotation);
    }
  }

  private createRuntime(): FxRuntime {
    const sprite = this.scene.add.image(0, 0, "fx_spark").setDepth(9);
    return {
      sprite, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      scaleFrom: 1, scaleTo: 1, alphaFrom: 1, alphaTo: 0, rotation: 0, spin: 0, active: false,
    };
  }

  clear(): void {
    for (const fx of this.active) {
      fx.active = false;
      fx.sprite.setVisible(false).setActive(false);
      this.free.push(fx);
    }
    this.active.length = 0;
  }

  get count(): number {
    return this.active.length;
  }
}
