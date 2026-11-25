import Phaser from "phaser";
import type { EnemyRuntime } from "./EnemyPool";
import { DEPTH } from "../gfx/depth";

export interface ProjectileRuntime {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
  knockback: number;
  radius: number;
  life: number;
  weaponId: string;
  active: boolean;
  /** Getroffene Gegner per Spawn-UID (Pooling-sicher). */
  hit: Set<number>;
  /** Ember zielt schwach auf diesen Gegner (sanftes Homing). */
  target: EnemyRuntime | null;
  targetUid: number;
  /** Trail-Textur + Intervall (s), null = kein Trail. */
  trail: string | null;
  /** Animierte Trail-Frames (4–8) für Glut/Eis/Dorn. */
  trailFrames: string[];
  trailTimer: number;
  trailInterval: number;
  /** Additive Überblendung für magische Projektile. */
  blendAdd: boolean;
  /** Optionaler Flächen-Explosionsradius beim Treffer (Evolution). */
  explodeRadius: number;
}

/** Projektil-Pool. Textur frei wählbar (M2 nutzt dieselbe Infrastruktur). */
export class ProjectilePool {
  active: ProjectileRuntime[] = [];
  private readonly free: ProjectileRuntime[] = [];
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawn(opts: {
    x: number; y: number; vx: number; vy: number; damage: number;
    pierce: number; knockback: number; life?: number; weaponId?: string;
    texture?: string; radius?: number; target?: EnemyRuntime | null;
    trail?: string | null; trailFrames?: string[]; trailInterval?: number; blendAdd?: boolean; explodeRadius?: number;
    /** Darstellungsgröße (Hitbox bleibt radius). */ scale?: number;
  }): ProjectileRuntime {
    const p = this.free.pop() ?? this.createRuntime();
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx;
    p.vy = opts.vy;
    p.damage = opts.damage;
    p.pierce = opts.pierce;
    p.knockback = opts.knockback;
    p.radius = opts.radius ?? 4;
    p.life = opts.life ?? 2.4;
    p.weaponId = opts.weaponId ?? "ember";
    p.target = opts.target ?? null;
    p.targetUid = opts.target?.uid ?? 0;
    p.trail = opts.trail ?? null;
    p.trailFrames = opts.trailFrames ?? (p.trail ? [p.trail] : []);
    p.trailTimer = 0;
    p.trailInterval = opts.trailInterval ?? 0.045;
    p.blendAdd = opts.blendAdd ?? false;
    p.explodeRadius = opts.explodeRadius ?? 0;
    p.active = true;
    p.hit.clear();
    p.sprite.setTexture(opts.texture ?? "projectile_ember");
    p.sprite.setBlendMode(p.blendAdd ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    p.sprite.setVisible(true).setActive(true).setDepth(DEPTH.death);
    p.sprite.setPosition(Math.round(opts.x), Math.round(opts.y));
    p.sprite.setRotation(Math.atan2(opts.vy, opts.vx));
    p.sprite.setScale(opts.scale ?? 1);
    this.active.push(p);
    return p;
  }

  private createRuntime(): ProjectileRuntime {
    const sprite = this.scene.add.image(0, 0, "projectile_ember").setDepth(DEPTH.death);
    return {
      sprite, x: 0, y: 0, vx: 0, vy: 0, damage: 0, pierce: 0, knockback: 0,
      radius: 4, life: 0, weaponId: "ember", active: false, hit: new Set(), target: null, targetUid: 0,
      trail: null, trailFrames: [], trailTimer: 0, trailInterval: 0.045, blendAdd: false, explodeRadius: 0,
    };
  }

  compact(): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (p.active) continue;
      p.sprite.setVisible(false).setActive(false);
      this.active.splice(i, 1);
      this.free.push(p);
    }
  }

  releaseAll(): void {
    for (const p of this.active) {
      p.active = false;
      p.sprite.setVisible(false).setActive(false);
      this.free.push(p);
    }
    this.active.length = 0;
  }
}
