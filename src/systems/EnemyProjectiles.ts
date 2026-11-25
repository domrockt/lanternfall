import Phaser from "phaser";
import { C, PAL } from "../palette";
import type { Archetype } from "../data/types";

export interface EnemyShotRuntime {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  life: number;
  active: boolean;
  trailTimer: number;
  texture: string;
}

/**
 * Eigener Pool für Gegner-Projektile. Bewusst getrennt vom Spieler-Pool:
 * andere Texturen (dunkle Kontur, kein ADD-Blend), eigene Kollision gegen den
 * Spieler und keine Verwechslung mit Waffen-Projektilen.
 */
export class EnemyProjectilePool {
  readonly active: EnemyShotRuntime[] = [];
  private readonly free: EnemyShotRuntime[] = [];
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawn(opts: {
    x: number; y: number; vx: number; vy: number; damage: number; radius?: number;
    texture: string; life?: number;
  }): EnemyShotRuntime {
    const shot = this.free.pop() ?? this.createRuntime();
    shot.x = opts.x;
    shot.y = opts.y;
    shot.vx = opts.vx;
    shot.vy = opts.vy;
    shot.damage = Math.max(1, Math.round(opts.damage));
    shot.radius = opts.radius ?? 4;
    shot.life = opts.life ?? 3.2;
    shot.trailTimer = 0;
    shot.texture = opts.texture;
    shot.active = true;
    shot.sprite.setTexture(opts.texture);
    shot.sprite.setVisible(true).setActive(true).setDepth(10);
    shot.sprite.setBlendMode(Phaser.BlendModes.NORMAL);
    shot.sprite.setPosition(Math.round(opts.x), Math.round(opts.y));
    shot.sprite.setRotation(Math.atan2(opts.vy, opts.vx));
    this.active.push(shot);
    return shot;
  }

  private createRuntime(): EnemyShotRuntime {
    const sprite = this.scene.add.image(0, 0, "enemy_shot_spit").setDepth(10);
    return {
      sprite, x: 0, y: 0, vx: 0, vy: 0, damage: 0, radius: 4, life: 0,
      active: false, trailTimer: 0, texture: "enemy_shot_spit",
    };
  }

  /** Bewegt Projektile, prüft Spielertreffer und entfernt abgelaufene. */
  update(
    dt: number,
    playerX: number,
    playerY: number,
    onPlayerHit: (damage: number, shot: EnemyShotRuntime) => void,
  ): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const shot = this.active[i];
      if (!shot.active) continue;
      shot.life -= dt;
      if (shot.life <= 0) {
        shot.active = false;
        shot.sprite.setVisible(false).setActive(false);
        this.active.splice(i, 1);
        this.free.push(shot);
        continue;
      }
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.sprite.setPosition(Math.round(shot.x), Math.round(shot.y));
      shot.sprite.setRotation(Math.atan2(shot.vy, shot.vx));
      // Sichtbarer Trail (nicht additiv, damit Gegnerschüsse eigen bleiben).
      shot.trailTimer -= dt;
      if (shot.trailTimer <= 0) {
        shot.trailTimer = 0.07;
        const fx = this.scene.add.image(shot.x, shot.y, shot.texture)
          .setDepth(6)
          .setAlpha(0.25)
          .setScale(0.7);
        this.scene.tweens.add({
          targets: fx, alpha: 0, scale: 0.2, duration: 160, onComplete: () => fx.destroy(),
        });
      }
      if ((shot.x - playerX) ** 2 + (shot.y - playerY) ** 2 < (shot.radius + 6) ** 2) {
        onPlayerHit(shot.damage, shot);
        shot.active = false;
        shot.sprite.setVisible(false).setActive(false);
        this.active.splice(i, 1);
        this.free.push(shot);
      }
    }
  }

  clear(): void {
    for (const shot of this.active) {
      shot.active = false;
      shot.sprite.setVisible(false).setActive(false);
      this.free.push(shot);
    }
    this.active.length = 0;
  }

  get count(): number {
    return this.active.length;
  }
}

/** Welche Optik ein Archetyp verschießt (Farbe/Form je Gegnertyp). */
export function shotTextureFor(archetype: Archetype, tier: number): string {
  switch (archetype) {
    case "ranged":
      return tier >= 3 ? "enemy_shot_shadow" : tier >= 1 ? "enemy_shot_bone" : "enemy_shot_spit";
    case "summoner":
      return "enemy_shot_shadow";
    default:
      return tier >= 2 ? "enemy_shot_fire" : "enemy_shot_spit";
  }
}

/** Kurzer Treffer-Blitz am Spieler (Palettenfarben, kein Additiv-Wash). */
export function enemyShotHitFx(scene: Phaser.Scene, x: number, y: number): void {
  for (let i = 0; i < 6; i++) {
    const spark = scene.add.image(x, y, "fx_spark")
      .setTint(PAL[C.hotRed])
      .setDepth(12)
      .setScale(0.9);
    const angle = (i / 6) * Math.PI * 2;
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(angle) * 18,
      y: y + Math.sin(angle) * 18,
      alpha: 0,
      scale: 0.2,
      duration: 180,
      onComplete: () => spark.destroy(),
    });
  }
}
