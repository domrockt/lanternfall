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


const TELEGRAPH_ALPHA_START = 0.55;
const TELEGRAPH_ALPHA_END = 0.25;
const TELEGRAPH_POOL_CAP = 96;

/**
 * Aufgewertete Schuss-Optiken (M10-Lesbarkeit): je 1-px helle Kontur, eigene
 * Silhouette und Kernfarbe. Ersetzt nur die Optik der Gegnerschüsse, nicht
 * Radius/Kollision. Kontrastmessung: shots/m10-enemy-shots-contrast.json.
 */
const HD_PREFIX = "enemy_shot_hd_";
const HD_GRIDS: Record<string, string[]> = {
  // 3 Grüntöne (31 nur als 1-px Lichtkante oben-links) + 1-px Tropfen-Tail unten:
  // eigene Silhouette zu fire, unteres Randstück aufgehellt (kein 29 mehr an der Kante).
  spit: ["...000...", "..0dd0...", ".0dvvvd0.", "0dvvvvvd0", "0dvvvvvd0", "0dvvvvvd0", ".0dvvvd0.", "..0dvd0..", "...0v0...", "....v...."],
  // 9x7 Knochenpaar, asymmetrischer 1-px-Lichtpunkt (13 nur oben-links), 3 Stufen.
  bone: [".00...00.", "0db0.0bb0", "0baa0bbb0", ".0baaab0.", "0baa0baa0", "0ba0.0ba0", ".00...00."],
  // Offener Halo (Lücke rechts) statt runder Kugel: Form-IoU < 0,7 zu spit.
  // Alle Füllpixel 9/13 (paleMist/lanternWhite): kein blueGrey 5 mehr, das gegen
  // waterDeep/FogBlue fast verschwand; rechte Nase als sauberer C-Mund.
  shadow: ["...000...", "..0ddd0..", ".0dd0....", "0dd0.....", "0990.....", "0990.....", ".0990....", "..0ddd0..", "...000..."],
  // Warme 3-Stufen-Flamme (19/20/22), kein 17 emberOrange mehr (zu nah an Gras-Luminanz).
  fire: ["....0....", "...0j0...", "...0j0...", "..0jk0...", "..0jk0...", ".0jkmmk0.", ".0jkmmk0.", "0jjkkkkj0", "0jjjjjkj0", ".0jjjjj0.", "..0jjjj0.", "...000..."],
};

function addHdShotTexture(scene: Phaser.Scene, family: string, rows: readonly string[]): void {
  const key = HD_PREFIX + family;
  if (scene.textures.exists(key)) return;
  const h = rows.length;
  const w = rows[0].length;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const map = (ch: string): number => {
    if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
    if (ch >= "a" && ch <= "z") return ch.charCodeAt(0) - 97 + 10;
    return -1;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = map(rows[y][x]);
      if (i < 0) continue;
      ctx.fillStyle = "#" + PAL[i].toString(16).padStart(6, "0");
      ctx.fillRect(x, y, 1, 1);
    }
  }
  scene.textures.addCanvas(key, canvas);
}

function ensureHdShotTextures(scene: Phaser.Scene): void {
  for (const [family, rows] of Object.entries(HD_GRIDS)) addHdShotTexture(scene, family, rows);
}


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
    ensureHdShotTextures(scene);
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
      telegraph.setScale(1);
      telegraph.setAlpha(TELEGRAPH_ALPHA_START);
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
    const visual = ENEMY_SHOT_VISUALS[requested];
    const family = visual?.family ?? "spit";
    return HD_PREFIX + family;
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
    const img = this.telegraphFree.pop()
      ?? (this.telegraphUsed < TELEGRAPH_POOL_CAP
        ? (this.telegraphUsed += 1, makeImage(this.scene, 0, 0, texture))
        : null);
    if (!img) return null;
    // Vorwarnung zeigt die eigene Schuss-Silhouette (Familien bleiben unterscheidbar).
    applyTexture(img, texture);
    img.setDepth(DEPTH.hazard);
    img.setBlendMode(Phaser.BlendModes.NORMAL);
    img.clearTint();
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
        // Pixel-Grid: Telegraph bleibt 1x (kein nichtganzzahliger Scale), pulsiert über Alpha.
        p.telegraph.setScale(1);
        p.telegraph.setAlpha(TELEGRAPH_ALPHA_START - (TELEGRAPH_ALPHA_START - TELEGRAPH_ALPHA_END) * t);
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
      // Puls über Alpha statt Scale: ganzzahliges 1x-Grid, 1-px-Kontur bleibt scharf.
      shot.sprite.setScale(1);
      shot.sprite.setAlpha(0.92 + Math.sin(shot.life * 18 + shot.radius) * 0.08);
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
