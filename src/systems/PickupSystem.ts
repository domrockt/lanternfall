import Phaser from "phaser";
import { GEMS, type GemSize } from "../logic/xp";

interface GemRuntime {
  sprite: Phaser.GameObjects.Image;
  size: GemSize;
  value: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  age: number;
}

/** XP-Kristalle (3 Größen) + Aufsammelradius/Magnet. */
export class PickupSystem {
  gems: GemRuntime[] = [];
  private readonly free: GemRuntime[] = [];
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  drop(x: number, y: number, size: GemSize, rng: { next(): number }): void {
    const gem = this.free.pop() ?? this.createRuntime();
    const meta = GEMS[size];
    gem.size = size;
    gem.value = meta.value;
    gem.x = x;
    gem.y = y;
    gem.vx = (rng.next() - 0.5) * 30;
    gem.vy = (rng.next() - 0.5) * 30;
    gem.active = true;
    gem.age = 0;
    gem.sprite.setTexture(`gem_${size}`);
    gem.sprite.setVisible(true).setActive(true).setDepth(7);
    gem.sprite.setPosition(Math.round(x), Math.round(y));
    this.gems.push(gem);
  }

  /** Größe gewichtet würfeln. */
  static rollSize(rng: { next(): number }): GemSize {
    const total = GEMS.small.weight + GEMS.medium.weight + GEMS.large.weight;
    const r = rng.next() * total;
    if (r < GEMS.small.weight) return "small";
    if (r < GEMS.small.weight + GEMS.medium.weight) return "medium";
    return "large";
  }

  private createRuntime(): GemRuntime {
    const sprite = this.scene.add.image(0, 0, "gem_small").setDepth(7);
    return { sprite, size: "small", value: 1, x: 0, y: 0, vx: 0, vy: 0, active: false, age: 0 };
  }

  update(
    dt: number,
    playerX: number,
    playerY: number,
    pickupRadius: number,
    onCollect: (value: number, size: GemSize) => void,
  ): void {
    const magnetRadius = pickupRadius * 2.2;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.age += dt;
      if (!g.active || g.age > 90) {
        g.sprite.setVisible(false).setActive(false);
        this.gems.splice(i, 1);
        this.free.push(g);
        continue;
      }
      const dx = playerX - g.x;
      const dy = playerY - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist < magnetRadius) {
        const pull = 260 + (magnetRadius - dist) * 4;
        g.vx += (dx / (dist || 1)) * pull * dt;
        g.vy += (dy / (dist || 1)) * pull * dt;
      }
      // Dämpfung frame-/substep-unabhängig (Basis: 60 Hz).
      const damping = Math.pow(0.96, dt * 60);
      g.vx *= damping;
      g.vy *= damping;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.sprite.setPosition(Math.round(g.x), Math.round(g.y));
      if (dist < 10) {
        onCollect(g.value, g.size);
        g.active = false;
        g.sprite.setVisible(false).setActive(false);
        this.gems.splice(i, 1);
        this.free.push(g);
      }
    }
  }

  get count(): number {
    return this.gems.length;
  }

  releaseAll(): void {
    for (const g of this.gems) {
      g.sprite.setVisible(false).setActive(false);
      this.free.push(g);
    }
    this.gems.length = 0;
  }
}
