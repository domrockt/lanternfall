import Phaser from "phaser";
import { C, PAL } from "../palette";
import type { Archetype } from "../data/types";
import { DEPTH } from "../gfx/depth";
import { applyTexture, makeImage } from "../gfx/atlas";
import {
  ENEMY_SHOT_WINDUP_SECONDS,
  ENEMY_SHOT_VISUALS,
  canLaunchShot,
  isPointInView,
  shotTextureKeyFor,
} from "../logic/bosses";

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
  /** Wurde der Schuss innerhalb des sichtbaren View-Rechtecks abgefeuert? */
  fromVisible: boolean;
  /** Vorwarnzeit, die der Schuss am Schützen hatte (s). */
  windup: number;
}

interface PendingShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  life: number;
  texture: string;
  elapsed: number;
  duration: number;
  telegraph: Phaser.GameObjects.Image | null;
}

export interface EnemyShotStats {
  /** spawn()-Aufrufe der KI/Bosse (inkl. verworfener Offscreen-Schüsse). */
  attempted: number;
  /** Tatsächlich abgefeuerte Projektile (nach Vorwarnung, im View). */
  fired: number;
  /** Spielertreffer durch Gegnerschüsse. */
  hits: number;
  /** Schüsse, deren Ursprung beim Abfeuern außerhalb des View-Rechtecks lag. */
  offscreenAttempts: number;
  offscreenFired: number;
  offscreenHits: number;
  /** Vorwarnung abgebrochen: Schütze tot/recycelt bzw. Ursprung aus dem View. */
  cancelledShooterDeath: number;
  cancelledOffscreen: number;
  /** Schüsse mit Vorwarnung >= 0,3 s. */
  windupOk: number;
  active: number;
  pending: number;
}

const TELEGRAPH_SCALE_MIN = 0.34;
const TELEGRAPH_SCALE_MAX = 0.62;
const TELEGRAPH_POOL_CAP = 96;

/**
 * Eigener Pool für Gegner-Projektile. Bewusst getrennt vom Spieler-Pool:
 * andere Texturen (dunkle Kontur, kein ADD-Blend), eigene Kollision gegen den
 * Spieler und keine Verwechslung mit Waffen-Projektilen.
 *
 * Fairness (M10): Jeder Schuss hat am Schützen eine sichtbare Vorwarnung von
 * mindestens 0,3 s, bevor das Projektil entsteht. Stirbt/recycelt der Schütze
 * in dieser Zeit oder liegt sein Ursprung außerhalb des View-Rechtecks, wird
 * der Schuss abgebrochen – es gibt keinen Treffer aus einer Offscreen-Position.
 */
export class EnemyProjectilePool {
  readonly active: EnemyShotRuntime[] = [];
  private readonly pending: PendingShot[] = [];
  private readonly free: EnemyShotRuntime[] = [];
  private readonly telegraphFree: Phaser.GameObjects.Image[] = [];
  private readonly scene: Phaser.Scene;
  private readonly stats: EnemyShotStats;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.stats = {
      attempted: 0, fired: 0, hits: 0,
      offscreenAttempts: 0, offscreenFired: 0, offscreenHits: 0,
      cancelledShooterDeath: 0, cancelledOffscreen: 0,
      windupOk: 0, active: 0, pending: 0,
    };
    // Debug-Hook für Sim-/Abnahme-Skripte (Run.ts bleibt unangetastet).
    (globalThis as unknown as Record<string, unknown>).__lfEnemyShots =
      () => this.snapshot();
  }

  statSnapshot(): EnemyShotStats {
    return this.snapshot();
  }

  private snapshot(): EnemyShotStats {
    return {
      ...this.stats,
      active: this.active.length,
      pending: this.pending.length,
    };
  }

  spawn(opts: {
    x: number; y: number; vx: number; vy: number; damage: number; radius?: number;
    texture: string; life?: number;
  }): EnemyShotRuntime | null {
    const texture = this.textureFor(opts.texture);
    this.stats.attempted += 1;
    const inView = this.isInView(opts.x, opts.y);
    if (!inView) {
      // Kein Projektil aus einer Offscreen-Position: sonst könnte ein Schuss
      // den Spieler treffen, ohne dass der Schütze je sichtbar war.
      this.stats.offscreenAttempts += 1;
      this.stats.cancelledOffscreen += 1;
      return null;
    }
    const telegraph = this.acquireTelegraph(texture);
    if (telegraph) {
      telegraph.setPosition(Math.round(opts.x), Math.round(opts.y));
      telegraph.setScale(TELEGRAPH_SCALE_MIN);
      telegraph.setAlpha(0.95);
      telegraph.setTint(PAL[ENEMY_SHOT_VISUALS[texture]?.spark ?? C.crimson]);
      telegraph.setVisible(true).setActive(true);
    }
    this.pending.push({
      x: opts.x,
      y: opts.y,
      vx: opts.vx,
      vy: opts.vy,
      damage: Math.max(1, Math.round(opts.damage)),
      radius: opts.radius ?? 4,
      life: opts.life ?? 3.2,
      texture,
      elapsed: 0,
      duration: ENEMY_SHOT_WINDUP_SECONDS,
      telegraph,
    });
    return null;
  }

  prewarm(n: number): void {
    while (this.free.length < n) {
      const shot = this.createRuntime();
      shot.sprite.setVisible(false).setActive(false);
      this.free.push(shot);
    }
  }

  private createRuntime(): EnemyShotRuntime {
    const sprite = makeImage(this.scene, 0, 0, "enemy_shot_spit").setDepth(DEPTH.enemyShot);
    return {
      sprite, x: 0, y: 0, vx: 0, vy: 0, damage: 0, radius: 4, life: 0,
      active: false, trailTimer: 0, texture: "enemy_shot_spit",
      fromVisible: true, windup: 0,
    };
  }

  private textureFor(requested: string): string {
    // Run.ts übergibt die Familien-Keys aus shotTextureFor(); die 4 Optiken
    // bleiben unverändert (keine neue Textur nötig, siehe Kontrastmessung).
    if (ENEMY_SHOT_VISUALS[requested]) return requested;
    return "enemy_shot_spit";
  }

  private isInView(x: number, y: number): boolean {
    const cam = this.scene.cameras?.main;
    if (!cam) return true;
    const view = cam.worldView;
    if (!view || view.width <= 0 || view.height <= 0) return true;
    return isPointInView(x, y, { x: view.x, y: view.y, width: view.width, height: view.height });
  }

  /** Lebt der Schütze noch nahe dem Ursprung? Verhindert Geisterschüsse. */
  private shooterAliveNear(x: number, y: number): boolean {
    const enemies = (this.scene as unknown as { enemies?: { active?: Array<{ x: number; y: number; alive: boolean }> } }).enemies;
    if (!enemies?.active) return true;
    for (const e of enemies.active) {
      if (!e.alive) continue;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 <= 40 * 40) return true;
    }
    return false;
  }

  private acquireTelegraph(texture: string): Phaser.GameObjects.Image | null {
    if (this.telegraphFree.length > 0) {
      return this.telegraphFree.pop()!;
    }
    if (this.telegraphUsed >= TELEGRAPH_POOL_CAP) return null;
    this.telegraphUsed += 1;
    const img = makeImage(this.scene, 0, 0, "telegraph_disc").setDepth(DEPTH.hazard);
    img.setBlendMode(Phaser.BlendModes.NORMAL);
    return img;
  }

  private telegraphUsed = 0;

  private releaseTelegraph(p: PendingShot): void {
    if (!p.telegraph) return;
    p.telegraph.setVisible(false).setActive(false).clearTint();
    this.telegraphFree.push(p.telegraph);
    p.telegraph = null;
  }

  private launch(p: PendingShot): void {
    const shot = this.free.pop() ?? this.createRuntime();
    shot.x = p.x;
    shot.y = p.y;
    shot.vx = p.vx;
    shot.vy = p.vy;
    shot.damage = p.damage;
    shot.radius = p.radius;
    shot.life = p.life;
    shot.trailTimer = 0;
    shot.texture = p.texture;
    shot.fromVisible = true;
    shot.windup = p.duration;
    shot.active = true;
    applyTexture(shot.sprite, p.texture);
    shot.sprite.setVisible(true).setActive(true).setDepth(DEPTH.enemyShot).setScale(1);
    shot.sprite.setBlendMode(Phaser.BlendModes.NORMAL);
    shot.sprite.setPosition(Math.round(p.x), Math.round(p.y));
    shot.sprite.setRotation(Math.atan2(p.vy, p.vx));
    this.active.push(shot);
    this.stats.fired += 1;
    if (p.duration >= 0.3) this.stats.windupOk += 1;
  }

  /** Bewegt Projektile, prüft Spielertreffer und entfernt abgelaufene. */
  update(
    dt: number,
    playerX: number,
    playerY: number,
    onPlayerHit: (damage: number, shot: EnemyShotRuntime) => void,
  ): void {
    // Vorwarnungen zuerst: Projektil entsteht erst am Ende der Wind-up-Zeit.
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.elapsed += dt;
      const t = Phaser.Math.Clamp(p.elapsed / p.duration, 0, 1);
      if (p.telegraph) {
        p.telegraph.setScale(TELEGRAPH_SCALE_MIN + (TELEGRAPH_SCALE_MAX - TELEGRAPH_SCALE_MIN) * t);
        p.telegraph.setAlpha(0.95 - 0.35 * t);
      }
      if (p.elapsed < p.duration) continue;
      const originInView = this.isInView(p.x, p.y);
      const gate = canLaunchShot({
        shooterAlive: this.shooterAliveNear(p.x, p.y),
        originInView,
        windupElapsed: p.elapsed,
        windupSeconds: p.duration,
      });
      this.releaseTelegraph(p);
      this.pending.splice(i, 1);
      if (!gate) {
        if (!originInView) this.stats.cancelledOffscreen += 1;
        else this.stats.cancelledShooterDeath += 1;
        continue;
      }
      this.launch(p);
    }

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
      // Rand-Puls: Gegnerschüsse bleiben im VFX-Chaos erkennbar.
      const pulse = 1 + Math.sin(shot.life * 18 + shot.radius) * 0.09;
      shot.sprite.setScale(pulse);
      // Sichtbarer Trail (nicht additiv, damit Gegnerschüsse eigen bleiben).
      shot.trailTimer -= dt;
      if (shot.trailTimer <= 0) {
        shot.trailTimer = 0.07;
        const fx = makeImage(this.scene, shot.x, shot.y, shot.texture)
          .setDepth(DEPTH.hazard)
          .setAlpha(0.25)
          .setScale(0.7);
        this.scene.tweens.add({
          targets: fx, alpha: 0, scale: 0.2, duration: 160, onComplete: () => fx.destroy(),
        });
      }
      if ((shot.x - playerX) ** 2 + (shot.y - playerY) ** 2 < (shot.radius + 6) ** 2) {
        this.stats.hits += 1;
        if (!shot.fromVisible) this.stats.offscreenHits += 1;
        onPlayerHit(shot.damage, shot);
        shot.active = false;
        shot.sprite.setVisible(false).setActive(false);
        this.active.splice(i, 1);
        this.free.push(shot);
      }
    }
  }

  clear(): void {
    for (const p of this.pending) {
      this.releaseTelegraph(p);
    }
    this.pending.length = 0;
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
  return shotTextureKeyFor(archetype, tier);
}

/** Kurzer Treffer-Blitz am Spieler (Palettenfarben, kein Additiv-Wash). */
export function enemyShotHitFx(scene: Phaser.Scene, x: number, y: number): void {
  for (let i = 0; i < 6; i++) {
    const spark = makeImage(scene, x, y, "fx_spark")
      .setTint(PAL[C.hotRed])
      .setDepth(DEPTH.enemyShot)
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
