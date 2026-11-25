import Phaser from "phaser";
import type { EnemyDef } from "../data/types";
import { SPRITE_FRAMES } from "../gfx/textures";

export interface EnemyRuntime {
  sprite: Phaser.GameObjects.Sprite;
  /** Eindeutig pro Spawn (Pooling!), damit Projektile keine alte Referenz treffen. */
  uid: number;
  def: EnemyDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  damage: number;
  radius: number;
  speed: number;
  flash: number;
  phase: number;
  alive: boolean;
  bob: number;
}

/** Gegner-Pool: Sprites werden wiederverwendet, nie pro Spawn neu erzeugt. */
export class EnemyPool {
  active: EnemyRuntime[] = [];
  private readonly free: EnemyRuntime[] = [];
  private readonly scene: Phaser.Scene;
  private nextUid = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawn(def: EnemyDef, x: number, y: number, hpScale = 1, damageScale = 1, phase = 0): EnemyRuntime {
    const enemy = this.free.pop() ?? this.createRuntime();
    enemy.uid = this.nextUid++;
    enemy.def = def;
    enemy.x = x;
    enemy.y = y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.maxHp = Math.round(def.hp * hpScale);
    enemy.hp = enemy.maxHp;
    enemy.damage = Math.max(1, Math.round(def.damage * damageScale));
    enemy.radius = def.radius;
    enemy.speed = def.speed;
    enemy.flash = 0;
    enemy.phase = phase;
    enemy.alive = true;
    const frames = SPRITE_FRAMES[def.spriteKey];
    const texture = frames ? frames[0] : def.spriteKey;
    enemy.sprite.setTexture(texture);
    enemy.sprite.setVisible(true);
    enemy.sprite.setActive(true);
    enemy.sprite.setAlpha(1);
    enemy.sprite.clearTint();
    enemy.sprite.setDepth(8);
    enemy.sprite.setPosition(Math.round(x), Math.round(y));
    this.active.push(enemy);
    return enemy;
  }

  private createRuntime(): EnemyRuntime {
    const sprite = this.scene.add.sprite(0, 0, "enemy_bog_rat").setOrigin(0.5, 0.5).setDepth(8);
    return {
      sprite, uid: 0, def: {} as EnemyDef, x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0,
      damage: 0, radius: 6, speed: 0, flash: 0, phase: 0, alive: false, bob: 0,
    };
  }

  /** Entfernt tote Gegner (Swap-Remove, O(n)). */
  compact(onDeath?: (e: EnemyRuntime) => void): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (e.alive) continue;
      onDeath?.(e);
      e.sprite.setVisible(false);
      e.sprite.setActive(false);
      e.sprite.clearTint();
      this.active.splice(i, 1);
      this.free.push(e);
    }
  }

  releaseAll(): void {
    for (const e of this.active) {
      e.alive = false;
      e.sprite.setVisible(false).setActive(false);
      this.free.push(e);
    }
    this.active.length = 0;
  }

  get count(): number {
    return this.active.length;
  }
}
