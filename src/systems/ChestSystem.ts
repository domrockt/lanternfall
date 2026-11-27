import Phaser from "phaser";
import { C, PAL } from "../palette";
import { applyTexture, makeImage } from "../gfx/atlas";

export interface ChestRuntime {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  phase: number;
  age: number;
}

/**
 * Truhen-Drop mit Glanz-Animation und Bildschirmrand-Pfeil, solange die Truhe
 * außerhalb des Kamerabereichs liegt.
 */
export interface ChestSpawnRecord {
  x: number;
  y: number;
  /** Run-Zeit (Sekunden) zum Spawn-Zeitpunkt, aus `lf-elapsed`. */
  at: number;
}

export class ChestSystem {
  readonly chests: ChestRuntime[] = [];
  /** M10-Timing-Beleg: jede Spawn-Zeit wird mitgeschrieben (nur Diagnose). */
  readonly spawns: ChestSpawnRecord[] = [];
  private readonly scene: Phaser.Scene;
  private readonly arrow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.arrow = makeImage(scene, 0, 0, "arrow_chest")
      .setScrollFactor(0)
      .setDepth(92)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.lantern])
      .setScale(1.35)
      .setVisible(false);
  }

  spawn(x: number, y: number): ChestRuntime {
    const at = Number(this.scene.registry.get("lf-elapsed") ?? 0);
    this.spawns.push({ x: Math.round(x), y: Math.round(y), at: Math.round(at * 1000) / 1000 });
    const sprite = makeImage(this.scene, Math.round(x), Math.round(y), "chest_closed")
      .setDepth(7)
      .setScale(1);
    const glow = this.scene.add.image(Math.round(x), Math.round(y), "light_radius")
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.amber])
      .setScale(0.34)
      .setAlpha(0.55);
    const chest: ChestRuntime = { x, y, sprite, glow, phase: (this.chests.length % 7) * 0.9, age: 0 };
    this.chests.push(chest);
    return chest;
  }

  /** Glanz-Puls und Randpfeil zur nächstgelegenen Truhe. */
  update(dt: number, camera: Phaser.Cameras.Scene2D.Camera, playerX: number, playerY: number): void {
    if (this.chests.length === 0) {
      this.arrow.setVisible(false);
      return;
    }
    for (const chest of this.chests) {
      chest.age += dt;
      const pulse = 0.75 + Math.sin(chest.age * 3.4 + chest.phase) * 0.23;
      chest.glow.setAlpha(0.38 + pulse * 0.2);
      chest.glow.setScale(0.3 + pulse * 0.08);      chest.sprite.setY(Math.round(chest.y + Math.sin(chest.age * 2.2 + chest.phase) * 1.5));
    }
    // Pfeil nur, wenn die nächste Truhe außerhalb des Views liegt.
    let nearest = this.chests[0];
    let best = Number.POSITIVE_INFINITY;
    for (const chest of this.chests) {
      const d = (chest.x - playerX) ** 2 + (chest.y - playerY) ** 2;
      if (d < best) { best = d; nearest = chest; }
    }
    const sx = nearest.x - camera.worldView.x;
    const sy = nearest.y - camera.worldView.y;
    const inside = sx > 8 && sx < camera.width - 8 && sy > 8 && sy < camera.height - 8;
    if (inside) {
      this.arrow.setVisible(false);
      return;
    }
    const cx = camera.width / 2;
    const cy = camera.height / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    const margin = 24;
    const ax = Phaser.Math.Clamp(sx, margin, camera.width - margin);
    const ay = Phaser.Math.Clamp(sy, margin, camera.height - margin);
    this.arrow.setVisible(true)
      .setPosition(Math.round(ax), Math.round(ay))
      .setRotation(angle);
  }

  /** Nächstgelegene Truhe in Reichweite (px) oder null. */
  near(playerX: number, playerY: number, range = 16): ChestRuntime | null {
    let found: ChestRuntime | null = null;
    let best = range * range;
    for (const chest of this.chests) {
      const d = (chest.x - playerX) ** 2 + (chest.y - playerY) ** 2;
      if (d <= best) { best = d; found = chest; }
    }
    return found;
  }

  open(chest: ChestRuntime): void {
    applyTexture(chest.sprite, "chest_open");
    this.remove(chest);
  }

  remove(chest: ChestRuntime): void {
    const idx = this.chests.indexOf(chest);
    if (idx >= 0) this.chests.splice(idx, 1);
    chest.sprite.destroy();
    chest.glow.destroy();
    if (this.chests.length === 0) this.arrow.setVisible(false);
  }

  clear(): void {
    for (const chest of this.chests) {
      chest.sprite.destroy();
      chest.glow.destroy();
    }
    this.chests.length = 0;
    this.spawns.length = 0;
    this.arrow.setVisible(false);
  }

  get count(): number {
    return this.chests.length;
  }
}
