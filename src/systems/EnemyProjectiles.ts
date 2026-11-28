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

/** Sichtbarer Trail: gepoolte Bilder mit manuellem linearem Fade (wie der
 *  fruehere Tween: Alpha 0.25→0, Scale 0.7→0.2, 160 ms) — keine Allokationen
 *  mehr im Hot Path (M10-shot-path-budget K2). */
interface TrailFx {
  img: Phaser.GameObjects.Image;
  t: number;
}
const TRAIL_FADE_SECONDS = 0.16;
/** Trail-Fade in Schritten von ~2 Frames (identische Kurve, halbe Setter-Rate). */
const TRAIL_FADE_STEP_SECONDS = 1 / 30;
const TRAIL_POOL_CAP = 320;

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
  /** Verworfen, weil kein Telegraph-Sprite mehr frei war (Pool-Cap) — nie stumm feuern. */
  cancelledNoTelegraph: number;
  /** Schüsse mit Vorwarnung >= 0,3 s. */
  windupOk: number;
  active: number;
  pending: number;
}

const TELEGRAPH_ALPHA_START = 0.55;
const TELEGRAPH_ALPHA_END = 0.25;
const TELEGRAPH_POOL_CAP = 96;

/**
 * Aufgewertete Schuss-Optiken (M10-shot-clarity, Chaos 300/500): je Familie ein
 * eigener, farbdiskjunkter Palettblock, geschlossene 1-px-Inktenkontur und
 * monotone Groessenstaffel — Flaeche wächst mit dem Tier: spit 34 px (7x8) <
 * bone 44 px (8x7) < shadow 46 px (9x10) < fire 78 px (10x13).
 * Kein Near-White mehr (A7: r,g,b>=150 && r>=235): 13 lanternWhite und 22 glow
 * sind entfernt; hellste verwendete Farbe ist 26 hotRed (r=228). Farbblocks:
 *   spit   = Moor-Gruen {0,30,31}   | bone = Knochen {0,10,11}
 *   shadow = kalter Dunst {0,8,9}   | fire = Glut-Rot {0,24,25,26}
 * Spieler-Ember ist {0,17,18,20,21,13}: nur 0 (Inktenkontur) geteilt —
 * Gegner-Schuesse sind per Farbe vom Spieler-Projektil trennbar.
 * Ersetzt nur die Optik; Radius/Kollision/Trefferpfad unveraendert.
 */
const HD_PREFIX = "enemy_shot_hd_";
/** Fuer tests/shot-clarity.test.ts exportiert: Optik-Datenquelle der Gegner-Schuesse. */
export const HD_GRIDS: Record<string, string[]> = {
  // Moor-Gruen: Fuellung 31 (v), Schattenkante 30 (u), Kontur 0. Kleinstes
  // Projektil (7x8), Tropfen-Tail unten bleibt eigene Silhouette.
  spit: [
    ".000...",
    "0vvv0..",
    "0vvvv0.",
    "0vuvv0.",
    "0vuuv0.",
    ".0vv0..",
    "..0u0..",
    "...v...",
  ],
  // Knochenpaar (2 vertikale Knochen), 10 (a) Fuellung + 11 (b) 1-px-Lichtkante
  // nur oben-links (11 ist KEIN Near-White A7: r=217<235).
  bone: [
    ".00..00.",
    "0bb00ba0",
    "0ab00ba0",
    "0ab00ba0",
    ".0a00a0.",
    ".0a00a0.",
    ".00..00.",
  ],
  // Offener Halo (Luecke rechts), 2-px-Wand: 9 (paleMist) Fuellung, 8 (mist)
  // Schatten innen. Kein lanternWhite mehr.
  shadow: [
    "...000...",
    "..09990..",
    ".09990...",
    "09990....",
    "09890....",
    "09990....",
    "09990....",
    ".09990...",
    "..09990..",
    "...000...",
  ],
  // Glut-Rot-Flamme: Kern 26 (q, hotRed), Mitte 25 (p, crimson), Basis 24 (o,
  // blood) — weg vom warmen Spieler-Ember (17/18/20/21). Groesstes Projektil.
  fire: [
    "....0.....",
    "...0q0....",
    "...0q0....",
    "..0qp0....",
    "..0qp0....",
    ".0qpooqp0.",
    ".0qpooqp0.",
    "0qqppppqq0",
    "0qqqqqpqq0",
    "0oqqqqqqo0",
    ".0oqqqqo0.",
    "..0oooo0..",
    "...000....",
  ],
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
  private readonly pendingFree: PendingShot[] = [];
  private readonly free: EnemyShotRuntime[] = [];
  private readonly telegraphFree: Phaser.GameObjects.Image[] = [];
  private readonly trailPool: Phaser.GameObjects.Image[] = [];
  private readonly trails: TrailFx[] = [];
  private trailFadeAccum = 0;
  /** View-Probe: einmal pro spawn()/update() aufgefuellt (keine Allokation je Gate-Check). */
  private readonly viewProbe = { x: 0, y: 0, width: 0, height: 0 };
  private viewValid = false;
  private readonly scene: Phaser.Scene;
  private readonly stats: EnemyShotStats;
  private readonly debugHook = () => this.snapshot();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureHdShotTextures(scene);
    this.stats = {
      attempted: 0, fired: 0, hits: 0,
      offscreenAttempts: 0, offscreenFired: 0, offscreenHits: 0,
      cancelledShooterDeath: 0, cancelledOffscreen: 0, cancelledNoTelegraph: 0,
      windupOk: 0, active: 0, pending: 0,
    };
    // Debug-Hook für Sim-/Abnahme-Skripte (Run.ts bleibt unangetastet);
    // clear() räumt ihn wieder ab, damit kein Pool-Referenz leakt.
    (globalThis as unknown as Record<string, unknown>).__lfEnemyShots = this.debugHook;
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
    this.refreshView();
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
    if (!telegraph) {
      // Pool-Cap erreicht: lieber verwerfen als nach der Vorwarnung stumm zu feuern.
      this.stats.cancelledNoTelegraph += 1;
      return null;
    }
    telegraph.setPosition(Math.round(opts.x), Math.round(opts.y));
    telegraph.setScale(1);
    telegraph.setAlpha(TELEGRAPH_ALPHA_START);
    telegraph.setVisible(true).setActive(true);
    const p = this.pendingFree.pop() ?? ({} as PendingShot);
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx;
    p.vy = opts.vy;
    p.damage = Math.max(1, Math.round(opts.damage));
    p.radius = opts.radius ?? 4;
    p.life = opts.life ?? 3.2;
    p.texture = texture;
    p.elapsed = 0;
    p.duration = ENEMY_SHOT_WINDUP_SECONDS;
    p.telegraph = telegraph;
    this.pending.push(p);
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

  /** View einmal pro spawn()/update() in die Probe kopieren; kein Objekt je Check. */
  private refreshView(): void {
    const cam = this.scene.cameras?.main;
    const view = cam?.worldView;
    this.viewValid = !!view && view.width > 0 && view.height > 0;
    if (this.viewValid) {
      this.viewProbe.x = view.x;
      this.viewProbe.y = view.y;
      this.viewProbe.width = view.width;
      this.viewProbe.height = view.height;
    }
  }

  private isInView(x: number, y: number): boolean {
    // Ohne Kamera/ungueltigem View (Tests, Headless) gilt alles als sichtbar.
    if (!this.viewValid) return true;
    return isPointInView(x, y, this.viewProbe);
  }

  /** Lebt der Schütze noch nahe dem Ursprung? Verhindert Geisterschüsse. */
  private shooterAliveNear(x: number, y: number): boolean {
    const enemies = (this.scene as unknown as { enemies?: { active?: Array<{ x: number; y: number; alive: boolean }> } }).enemies;
    if (!enemies?.active) return true;
    for (const e of enemies.active) {
      if (!e.alive) continue;
      const dx = e.x - x;
      if (dx > 40 || dx < -40) continue;
      const dy = e.y - y;
      if (dy > 40 || dy < -40) continue;
      if (dx * dx + dy * dy <= 40 * 40) return true;
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
    img.setScale(1);
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
    this.refreshView();
    // Vorwarnungen zuerst: Projektil entsteht erst am Ende der Wind-up-Zeit.
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.elapsed += dt;
      if (p.telegraph) {
        // Pixel-Grid: Telegraph bleibt 1x (kein nichtganzzahliger Scale), pulsiert über Alpha.
        // Scale ist konstant 1 (gesetzt beim Acquire) → kein setScale je Frame.
        const t = p.elapsed >= p.duration ? 1 : p.elapsed / p.duration;
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
        this.pendingFree.push(p);
        continue;
      }
      this.launch(p);
      this.pendingFree.push(p);
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
      // Rotation/Scale bleiben konstant: v ist pro Schuss fix (Rotation beim
      // Launch gesetzt), Scale 1x-Grid → nur Position + Alpha-Puls je Frame.
      // Puls über Alpha statt Scale: ganzzahliges 1x-Grid, 1-px-Kontur bleibt scharf.
      shot.sprite.setAlpha(0.92 + Math.sin(shot.life * 18 + shot.radius) * 0.08);
      // Sichtbarer Trail (nicht additiv, damit Gegnerschüsse eigen bleiben).
      shot.trailTimer -= dt;
      if (shot.trailTimer <= 0) {
        shot.trailTimer = 0.07;
        this.emitTrail(shot);
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

    // Trail-Fade in ~30-Hz-Schritten (gleiche lineare Kurve wie der fruehere
    // Tween, halbe Setter-Rate im Chaos).
    this.trailFadeAccum += dt;
    if (this.trailFadeAccum >= TRAIL_FADE_STEP_SECONDS) {
      this.updateTrails(this.trailFadeAccum);
      this.trailFadeAccum = 0;
    }
  }

  /** Gepoolter Trail: gleiche lineare Kurve wie der fruehere Tween (0.25→0 / 0.7→0.2, 160 ms). */
  private emitTrail(shot: EnemyShotRuntime): void {
    const img = this.trailPool.pop()
      ?? (this.trails.length < TRAIL_POOL_CAP ? makeImage(this.scene, shot.x, shot.y, shot.texture) : null);
    if (!img) return;
    applyTexture(img, shot.texture);
    img.setDepth(DEPTH.hazard);
    img.setPosition(shot.x, shot.y);
    img.setScale(0.7);
    img.setAlpha(0.25);
    img.setVisible(true).setActive(true);
    this.trails.push({ img, t: 0 });
  }

  private updateTrails(dt: number): void {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const fx = this.trails[i];
      fx.t += dt;
      const k = fx.t / TRAIL_FADE_SECONDS;
      if (k >= 1) {
        fx.img.setVisible(false).setActive(false);
        this.trails.splice(i, 1);
        this.trailPool.push(fx.img);
        continue;
      }
      fx.img.setAlpha(0.25 * (1 - k));
      fx.img.setScale(0.7 + (0.2 - 0.7) * k);
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
    for (const fx of this.trails) {
      fx.img.setVisible(false).setActive(false);
      this.trailPool.push(fx.img);
    }
    this.trails.length = 0;
    // Debug-Hook nur abbauen, wenn er noch diesem Pool gehört (kein Leak).
    const g = globalThis as unknown as Record<string, unknown>;
    if (g.__lfEnemyShots === this.debugHook) delete g.__lfEnemyShots;
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
