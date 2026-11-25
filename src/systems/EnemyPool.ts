import Phaser from "phaser";
import type { EnemyDef } from "../data/types";
import { SPRITE_FRAMES } from "../gfx/textures";
import { newAiState, type AiRng, type AiState } from "../logic/enemy-ai";

export interface EnemySpawnOptions {
  elite?: boolean;
  splitDepth?: number;
  bossIndex?: number;
  radius?: number;
  speed?: number;
  hpScale?: number;
}

export interface EnemyRuntime {
  sprite: Phaser.GameObjects.Sprite;
  /** Additiver Leuchtrand für Elite-Gegner. */
  aura: Phaser.GameObjects.Image;
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
  /** Basis-HP-Skalierung dieses Spawns (für Splitter-Kinder). */
  hpScale: number;
  flash: number;
  phase: number;
  alive: boolean;
  bob: number;
  /** Frost: Verlangsamungsfaktor 0..1. */
  slowFactor: number;
  slowTimer: number;
  /** Vollständiger Freeze in Sekunden. */
  freezeTimer: number;
  /** Platzhalter-Boss (M2): skaliert, droppt eine Truhe. */
  boss: boolean;
  /** Index 0..5, -1 = kein Boss. */
  bossIndex: number;
  /** Elite: Leuchtrand, mehr HP, garantierter großer XP-Kristall. */
  elite: boolean;
  /** 0 = normal, 1/2 = Splitter-Generation (max. 2). */
  splitDepth: number;
  /** Seit Spawn vergangene Zeit (s) für Recycling. */
  age: number;
  /** Vom Director recycelt (kein Kill, kein Drop). */
  recycled: boolean;
  /** KI-Zustand (reine Logik in logic/enemy-ai). */
  ai: AiState;
  /** Restliche Telegraph-/Wind-up-Zeit für die Darstellung. */
  telegraph: number;
  /** Boss-Angriffszähler. */
  attackCounter: number;
  /** Boss-Verlauf: Phase 1..3. */
  bossPhase: number;
  /** Kurzzeitiger Schadens-Cooldown am Spieler (Boss-Kontakt). */
  contactCooldown: number;
  /** Letzter Treffer durch Gegnerprojektil (nur Debug). */
  hitFlash: number;
  aiRng: AiRng;
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

  spawn(
    def: EnemyDef,
    x: number,
    y: number,
    hpScale = 1,
    damageScale = 1,
    phase = 0,
    options: EnemySpawnOptions = {},
    rng?: AiRng,
  ): EnemyRuntime {
    const enemy = this.free.pop() ?? this.createRuntime();
    enemy.uid = this.nextUid++;
    enemy.def = def;
    enemy.x = x;
    enemy.y = y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.hpScale = options.hpScale ?? hpScale;
    enemy.maxHp = Math.round(def.hp * enemy.hpScale);
    enemy.hp = enemy.maxHp;
    enemy.damage = Math.max(1, Math.round(def.damage * damageScale));
    enemy.radius = options.radius ?? def.radius;
    enemy.speed = options.speed ?? def.speed;
    enemy.flash = 0;
    enemy.phase = phase;
    enemy.alive = true;
    enemy.slowFactor = 0;
    enemy.slowTimer = 0;
    enemy.freezeTimer = 0;
    enemy.boss = options.bossIndex !== undefined && options.bossIndex >= 0;
    enemy.bossIndex = options.bossIndex ?? -1;
    enemy.elite = Boolean(options.elite);
    enemy.splitDepth = options.splitDepth ?? 0;
    enemy.age = 0;
    enemy.recycled = false;
    enemy.telegraph = 0;
    enemy.attackCounter = 0;
    enemy.bossPhase = 1;
    enemy.contactCooldown = 0;
    enemy.hitFlash = 0;
    enemy.aiRng = rng ?? { next: () => Math.random() };
    enemy.ai = newAiState(enemy.aiRng);
    enemy.sprite.setScale(enemy.boss ? 1 : enemy.elite ? 1.25 : enemy.splitDepth > 0 ? 0.72 : 1);
    const frames = SPRITE_FRAMES[def.spriteKey];
    const texture = frames ? frames[0] : def.spriteKey;
    enemy.sprite.setTexture(texture);
    enemy.sprite.setVisible(true);
    enemy.sprite.setActive(true);
    enemy.sprite.setAlpha(1);
    enemy.sprite.clearTint();
    enemy.sprite.setDepth(enemy.boss ? 9 : 8);
    enemy.sprite.setPosition(Math.round(x), Math.round(y));
    enemy.aura.setVisible(enemy.elite || enemy.boss);
    enemy.aura.setPosition(Math.round(x), Math.round(y));
    enemy.aura.setAlpha(enemy.elite ? 0.42 : 0.0);
    enemy.aura.setScale(enemy.elite ? 0.9 + enemy.radius / 32 : 1.2);
    this.active.push(enemy);
    return enemy;
  }

  private createRuntime(): EnemyRuntime {
    const sprite = this.scene.add.sprite(0, 0, "enemy_bog_rat").setOrigin(0.5, 0.5).setDepth(8);
    const aura = this.scene.add.image(0, 0, "elite_aura")
      .setDepth(7)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    return {
      sprite, aura, uid: 0, def: {} as EnemyDef, x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0,
      damage: 0, radius: 6, speed: 0, hpScale: 1, flash: 0, phase: 0, alive: false, bob: 0,
      slowFactor: 0, slowTimer: 0, freezeTimer: 0, boss: false, bossIndex: -1, elite: false,
      splitDepth: 0, age: 0, recycled: false, ai: newAiState({ next: () => 0.5 }), telegraph: 0,
      attackCounter: 0, bossPhase: 1, contactCooldown: 0, hitFlash: 0, aiRng: { next: () => 0.5 },
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
      e.aura.setVisible(false);
      this.active.splice(i, 1);
      this.free.push(e);
    }
  }

  /** Entfernt einen Gegner ohne Kill/Drop (Recycling bei Gegner-Cap). */
  despawn(e: EnemyRuntime): void {
    e.alive = false;
    e.recycled = true;
    e.sprite.setVisible(false).setActive(false);
    e.aura.setVisible(false);
  }

  releaseAll(): void {
    for (const e of this.active) {
      e.alive = false;
      e.sprite.setVisible(false).setActive(false);
      e.aura.setVisible(false);
      this.free.push(e);
    }
    this.active.length = 0;
  }

  get count(): number {
    return this.active.length;
  }
}
