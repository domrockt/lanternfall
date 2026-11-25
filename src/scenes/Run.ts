import Phaser from "phaser";
import { C, PAL } from "../palette";
import { CHARACTERS } from "../data/characters";
import { PASSIVES } from "../data/passives";
import type { CharacterDef, CharacterId, EnemyId, PassiveId, WeaponAnyId, WeaponId } from "../data/types";
import {
  GAME_HEIGHT, GAME_WIDTH, PLAYER_BASE_PICKUP_RADIUS, PLAYER_INVULN,
  RUN_LENGTH, SIM_MAX_STEP, WORLD_SIZE,
} from "../config";
import { ENEMIES } from "../data/enemies";
import { BOSSES } from "../data/bosses";
import { SeededRng } from "../logic/rng";
import { directionToPlayer, separationPush } from "../logic/separation";
import {
  aggregateMods, effectiveMoveSpeed, effectivePickupRadius,
  type AggregateStats,
} from "../logic/stats";
import { applyXp, xpProgress, xpToNext, type XpState } from "../logic/xp";
import { damageAfterArmor, timeScaleClamped } from "../logic/combat";
import type { Offer } from "../logic/levelup";
import { GroundRenderer } from "../gfx/GroundRenderer";
import { SPRITE_FRAMES } from "../gfx/textures";
import { EnemyPool, type EnemyRuntime } from "../systems/EnemyPool";
import { SpatialHash } from "../systems/SpatialHash";
import { Spawner } from "../systems/Spawner";
import { CombatSystem } from "../systems/CombatSystem";
import { PickupSystem } from "../systems/PickupSystem";
import { LevelUpSystem, type OwnedWeapon } from "../systems/LevelUpSystem";
import { ChestSystem, type ChestRuntime } from "../systems/ChestSystem";
import { EnemyProjectilePool, enemyShotHitFx, shotTextureFor } from "../systems/EnemyProjectiles";
import { HazardSystem } from "../systems/Hazards";
import { BossSystem, type BossInfo } from "../systems/BossSystem";
import { shouldSplit, stepEnemyAi, type AiAction } from "../logic/enemy-ai";
import { FINAL_BOSS_AT, bossSpawnSecond, dawnFinished } from "../logic/scaling";
import { botDirection, chooseBestOffer } from "../logic/autoplay";
import { terrainSpeedFactor, type TerrainKind } from "../logic/terrain";
import { chestRewards, type ChestResult } from "../logic/evolution";
import { EVOLUTIONS } from "../data/evolutions";
import type { RunResult } from "./Results";

export interface RunData {
  character?: CharacterId;
  seed?: number;
  debug?: boolean;
}

export interface HudState {
  time: number;
  level: number;
  xp: number;
  xpNeed: number;
  xpRatio: number;
  hp: number;
  maxHp: number;
  kills: number;
  enemies: number;
  paused: boolean;
  levelUpOpen: boolean;
  chestOpen: boolean;
  offers: Offer[];
  weapons: OwnedWeapon[];
  passives: { id: string; level: number }[];
  fps: number;
  character: string;
  boss: BossInfo | null;
  dawn: boolean;
}

/** Core-Loop: Bewegung, Gegner, Waffen, XP, Level-ups, Tod/Sieg. */
export class Run extends Phaser.Scene {
  character!: CharacterDef;
  seed = 1;
  debug = false;

  elapsed = 0;
  timeScale = 1;
  godMode = false;
  autoPlay = false;
  paused = false;
  /** Pause-Zustand vor dem Öffnen einer Truhe (Debug kann pausiert öffnen). */
  chestPausedBefore = false;
  levelUpOpen = false;
  chestOpen = false;
  chestResult: ChestResult | null = null;
  bossesDefeated = 0;
  finished = false;
  invuln = 0;
  hitFlash = 0;
  kills = 0;
  /** Letzte Bewegungsrichtung (für gerichtete Waffen wie Flegel/Dornen). */
  facingX = 1;
  facingY = 0;
  hp = 1;
  maxHp = 1;
  /** Logische Position als Float. Der Container/`player.x` ist nur die
   *  gerundete Darstellung; Sub-Pixel-Bewegung (Wasser-Slow) bleibt erhalten. */
  posX = 0;
  posY = 0;
  private visualX = 0;
  private visualY = 0;
  damageByWeapon: Record<string, number> = {};
  currentOffers: Offer[] = [];
  xpState: XpState = { level: 1, xp: 0, pendingLevelUps: 0 };

  /** M3: Bosse, Gegner-Projektile, Warnflächen, Morgendämmerung. */
  bossesSpawned: { index: number; at: number }[] = [];
  chestsDropped = 0;
  explosions = 0;
  elitesSpawned = 0;
  splitsSpawned = 0;
  dawn = false;
  dawnTimer = 0;
  private dawnQueued = false;
  bossFlags: boolean[] = [false, false, false, false, false, false];

  private rng!: SeededRng;
  private levelSys!: LevelUpSystem;
  private agg!: AggregateStats;
  private hpFill!: Phaser.GameObjects.Rectangle;
  private hpBg!: Phaser.GameObjects.Rectangle;
  private player!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Image;
  private lantern?: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Image;
  private light!: Phaser.GameObjects.Image;
  private ground!: GroundRenderer;
  private enemies!: EnemyPool;
  private hash!: SpatialHash<EnemyRuntime>;
  private spawner!: Spawner;
  private combat!: CombatSystem;
  private pickups!: PickupSystem;
  private chests!: ChestSystem;
  private enemyShots!: EnemyProjectilePool;
  private hazards!: HazardSystem;
  private bosses!: BossSystem;
  private dawnRect?: Phaser.GameObjects.Rectangle;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private scratch: EnemyRuntime[] = [];
  private splashTimer = 0;
  private hurtMarker: { x: number; y: number; life: number } | null = null;

  constructor() { super("run"); }

  init(data: RunData): void {
    this.seed = data.seed ?? 1;
    this.debug = data.debug ?? false;
    this.character = CHARACTERS[data.character ?? "mira"] ?? CHARACTERS.mira;
  }

  create(): void {
    this.rng = new SeededRng(this.seed);
    this.elapsed = 0;
    this.timeScale = 1;
    this.godMode = false;
    this.autoPlay = false;
    this.paused = false;
    this.levelUpOpen = false;
    this.chestOpen = false;
    this.chestPausedBefore = false;
    this.chestResult = null;
    this.bossesDefeated = 0;
    this.bossesSpawned = [];
    this.chestsDropped = 0;
    this.explosions = 0;
    this.elitesSpawned = 0;
    this.splitsSpawned = 0;
    this.dawn = false;
    this.dawnTimer = 0;
    this.dawnQueued = false;
    this.registry.set("lf-final-state", null);
    this.bossFlags = [false, false, false, false, false, false];
    this.finished = false;
    this.invuln = 0;
    this.hitFlash = 0;
    this.kills = 0;
    this.facingX = 1;
    this.facingY = 0;
    this.damageByWeapon = {};
    this.currentOffers = [];
    this.xpState = { level: 1, xp: 0, pendingLevelUps: 0 };
    // Szenen-Objekte werden bei scene.start wiederverwendet → alte Referenzen löschen.
    this.lantern = undefined;
    this.maxHp = 0;
    this.hp = 0;

    this.cameras.main.setBackgroundColor(PAL[C.nightDeep]);
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.centerOn(WORLD_SIZE / 2, WORLD_SIZE / 2);

    this.ground = new GroundRenderer(this, this.seed);
    this.ground.update(this.cameras.main);

    const startX = WORLD_SIZE / 2;
    const startY = WORLD_SIZE / 2;
    this.posX = startX;
    this.posY = startY;
    this.visualX = startX;
    this.visualY = startY;
    this.player = this.add.container(startX, startY).setDepth(12);
    this.playerBody = this.add.image(0, 0, this.character.spriteKey).setOrigin(0.5, 0.5);
    this.player.add(this.playerBody);
    if (this.character.id === "mira") {
      this.lantern = this.add.image(9, -3, "lantern_small").setScale(1.5);
      this.player.add(this.lantern);
    }
    this.shadow = this.add.image(startX, startY + 7, "shadow").setDepth(11);

    this.light = this.add.image(startX, startY, "light_radius")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(20)
      .setScale(1.35)
      .setAlpha(0.85);
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "vignette")
      .setScrollFactor(0).setDepth(80).setAlpha(0.9);

    this.hpBg = this.add.rectangle(startX - 13, startY - 17, 26, 4, PAL[C.ink]).setOrigin(0, 0.5).setDepth(25);
    this.hpFill = this.add.rectangle(startX - 12, startY - 17, 24, 2, PAL[C.crimson]).setOrigin(0, 0.5).setDepth(26);

    this.cameras.main.startFollow(this.player, true, 0.18, 0.18);
    this.cameras.main.fadeIn(220, 6, 7, 12);

    const startWeapon: WeaponId = this.character.startWeapon;
    this.levelSys = new LevelUpSystem(startWeapon, 1);
    this.recomputeStats();
    this.hp = this.maxHp;

    this.enemies = new EnemyPool(this);
    this.hash = new SpatialHash<EnemyRuntime>(32);
    this.spawner = new Spawner(this, this.enemies, this.rng);
    this.combat = new CombatSystem(this);
    this.pickups = new PickupSystem(this);
    this.chests = new ChestSystem(this);
    this.enemyShots = new EnemyProjectilePool(this);
    this.hazards = new HazardSystem(this);
    this.bosses = new BossSystem(this, this.enemies, this.spawner, this.hazards, this.enemyShots, this.rng);

    this.keys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      up2: Phaser.Input.Keyboard.KeyCodes.UP,
      down2: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left2: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right2: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.keyboard!.on("keydown-ESC", () => this.togglePause());

    this.scene.launch("ui");
    this.registry.set("lf-elapsed", 0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ground.destroy();
      this.combat.clear();
      this.enemies.releaseAll();
      this.pickups.releaseAll();
      this.chests.clear();
      this.enemyShots?.clear();
      this.hazards?.clear();
      this.bosses?.clear();
    });
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;
    const realDt = Math.min(0.05, delta / 1000);

    // AutoPlay wählt Level-Up-Angebote nach kurzer Anzeige (unbeaufsichtigter Run).
    if (this.levelUpOpen || this.chestOpen) {
      this.paused = true;
      return;
    }
    if (this.paused) return;

    const scaledDt = realDt * this.timeScale;
    this.ground.update(this.cameras.main);

    // Feste Teilschritte: bei hoher Zeitskalierung würden Projekte/Gegner sonst
    // ganze Bildschirmbreiten pro Frame springen und Kollisionen verpassen.
    let remaining = scaledDt;
    while (remaining > 0.0001 && !this.finished) {
      const dt = Math.min(SIM_MAX_STEP, remaining);
      remaining -= dt;
      this.simulate(dt);
      // Level-up/Pause kann mitten im Teilschritt-Loop öffnen → sofort anhalten.
      if (this.paused || this.levelUpOpen) break;
    }
    if (this.finished) return;

    this.updateVisuals(realDt);
    this.updateHpBar();
    this.maybeOpenLevelUp();
  }

  /** Ein fester Simulationsschritt (Bewegung, Spawns, Kampf, Pickups). */
  private simulate(dt: number): void {
    this.elapsed += dt;
    this.registry.set("lf-elapsed", this.elapsed);

    // Morgendämmerung läuft nach dem Endboss-Sieg kurz aus, dann Results.
    if (this.dawn) {
      this.dawnTimer += dt;
      if (dawnFinished(this.dawnTimer)) {
        this.endRun("dawn");
        return;
      }
    }

    // Endboss bei 30:00; danach läuft der Run bis zu seinem Tod weiter.
    if (!this.dawn) this.trySpawnScheduledBosses();

    if (this.invuln > 0) this.invuln -= dt;
    if (this.agg.regen > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.agg.regen * dt);
    }

    this.movePlayer(dt);
    const spawned = this.dawn ? [] : this.spawner.update(this.elapsed, dt, this.posX, this.posY);
    for (const e of spawned) if (e.elite) this.elitesSpawned += 1;
    this.updateEnemies(dt);
    this.bosses.update(dt, this.posX, this.posY);
    this.combat.update({
      dt,
      playerX: this.posX,
      playerY: this.posY,
      facingX: this.facingX,
      facingY: this.facingY,
      weapons: this.levelSys.weapons,
      enemies: this.enemies.active,
      hash: this.hash,
      agg: this.agg,
      rng: this.rng,
      onHit: (enemy, damage, weaponId) => {
        this.damageByWeapon[weaponId] = (this.damageByWeapon[weaponId] ?? 0) + damage;
      },
      onHeal: (amount) => {
        this.hp = Math.min(this.maxHp, this.hp + amount);
      },
    });
    this.collectKills();
    this.touchDamage();
    this.enemyShots.update(dt, this.posX, this.posY, (damage, shot) => {
      this.hurtPlayer(damage, shot.x, shot.y);
      enemyShotHitFx(this, shot.x, shot.y);
    });
    this.hazards.update(dt, this.posX, this.posY, (damage) => {
      this.hurtPlayer(damage, this.posX, this.posY);
    });
    if (this.finished) return;
    this.enemies.compact();
    this.maybeSplash(dt);

    const pickupRadius = effectivePickupRadius(PLAYER_BASE_PICKUP_RADIUS, this.agg) + this.combat.pickupBonus;
    this.pickups.update(dt, this.posX, this.posY, pickupRadius, (value) => {
      this.giveXpInternal(value);
    });
    const nearChest = this.chests.near(this.posX, this.posY, 15);
    if (nearChest) this.openChest(nearChest);
  }

  /** Spawnt fällige Bosse (05:00–25:00) und den Endboss (30:00). */
  private trySpawnScheduledBosses(): void {
    for (let i = 0; i < 5; i++) {
      if (this.bossFlags[i]) continue;
      if (this.elapsed >= bossSpawnSecond(i)) this.spawnBossAt(i);
    }
    if (!this.bossFlags[5] && !this.dawn && this.elapsed >= FINAL_BOSS_AT) this.spawnBossAt(5);
  }

  private spawnBossAt(index: number): void {
    const b = this.bosses.spawn(index, this.posX, this.posY);
    this.bossFlags[index] = true;
    this.bossesSpawned.push({ index, at: Math.round(this.elapsed * 10) / 10 });
    this.events.emit("bossSpawn", { index, name: BOSSES[index].name, hp: b.maxHp });
  }

  /** Treffer am Spieler zentral (Kontakt, Projektile, Flächen); respektiert God/Invuln. */
  private hurtPlayer(damage: number, x: number, y: number): void {
    if (this.invuln > 0 || this.finished) return;
    const armor = this.character.armor + this.agg.armorFlat;
    const dmg = damageAfterArmor(damage, armor);
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = PLAYER_INVULN;
    this.hitFlash = 0.16;
    this.cameras.main.shake(70, 0.0022);
    this.hurtMarker = { x, y, life: 0.25 };
    if (this.hp <= 0) {
      if (this.godMode) this.hp = 1;
      else this.endRun("death");
    }
  }

  /** Wasser-Spritzer unter Spieler/Gegnern auf Wasserflächen. */
  private maybeSplash(dt: number): void {
    this.splashTimer -= dt;
    if (this.splashTimer > 0) return;
    this.splashTimer = 0.14;
    const px = this.posX;
    const py = this.posY;
    if (this.ground.kindAt(px, py) === "water") this.spawnSplash(px, py + 5);
    for (const e of this.enemies.active) {
      if (!e.alive) continue;
      if (this.ground.kindAt(e.x, e.y) === "water" && Math.random() < 0.12) this.spawnSplash(e.x, e.y + 4);
    }
  }

  private spawnSplash(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const drop = this.add.image(Math.round(x + (i - 1) * 3), Math.round(y), "fx_spark")
        .setDepth(6).setTint(PAL[C.fogBlue]).setScale(0.6).setAlpha(0.8);
      this.tweens.add({
        targets: drop, y: y - 8 - i * 2, alpha: 0, scale: 0.2,
        duration: 240 + i * 30, onComplete: () => drop.destroy(),
      });
    }
  }

  // ── Spieler ──────────────────────────────────────────────────
  private movePlayer(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.autoPlay) {
      const dir = this.autoDirection();
      dx = dir.x;
      dy = dir.y;
    } else {
      if (this.keys.left.isDown || this.keys.left2.isDown) dx -= 1;
      if (this.keys.right.isDown || this.keys.right2.isDown) dx += 1;
      if (this.keys.up.isDown || this.keys.up2.isDown) dy -= 1;
      if (this.keys.down.isDown || this.keys.down2.isDown) dy += 1;
    }
    if (dx === 0 && dy === 0) return;
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    const terrain = terrainSpeedFactor(this.ground.kindAt(this.posX, this.posY) as TerrainKind);
    const speed = effectiveMoveSpeed(this.character.speed, this.agg) * terrain;
    this.facingX = dx;
    this.facingY = dy;
    this.posX = Phaser.Math.Clamp(this.posX + dx * speed * dt, 10, WORLD_SIZE - 10);
    this.posY = Phaser.Math.Clamp(this.posY + dy * speed * dt, 10, WORLD_SIZE - 10);
    this.playerBody.setFlipX(dx < 0);
    if (this.lantern) this.lantern.x = dx < 0 ? -9 : 9;
  }

  /** Bot: weicht Gegnern/Projektilen/Warnflächen aus und sammelt XP-Kristalle. */
  private autoDirection(): { x: number; y: number } {
    const enemies = this.enemies.active
      .filter((e) => e.alive)
      .map((e) => ({ x: e.x, y: e.y, radius: e.radius, threat: e.boss ? 0.35 : e.def.archetype === "exploder" ? 1.8 : 1 }));
    const projectiles = this.enemyShots.active.map((p) => ({
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, radius: p.radius, threat: 2.4,
    }));
    const hazards = this.hazards.threats().map((h) => ({ ...h, threat: 3.2 }));
    const gems = this.pickups.gems.map((g) => ({ x: g.x, y: g.y }));
    return botDirection({
      playerX: this.posX,
      playerY: this.posY,
      worldSize: WORLD_SIZE,
      enemies,
      projectiles,
      hazards,
      gems,
    });
  }

  // ── Gegner ───────────────────────────────────────────────────
  private updateEnemies(dt: number): void {
    this.hash.rebuild(this.enemies.active.filter((e) => e.alive));
    const px = this.posX;
    const py = this.posY;
    for (const e of this.enemies.active) {
      if (!e.alive) continue;
      if (e.freezeTimer > 0) e.freezeTimer -= dt;
      if (e.slowTimer > 0) e.slowTimer -= dt;
      else e.slowFactor = 0;
      if (e.telegraph > 0) e.telegraph = Math.max(0, e.telegraph - dt);
      if (e.def.archetype === "exploder") e.age += dt;

      // Bosse werden vom BossSystem bewegt/gesteuert (nur Status hier).
      if (e.boss) continue;
      e.age += dt;

      const statusMul = e.freezeTimer > 0 ? 0 : Math.max(0.15, 1 - e.slowFactor);
      const ai = stepEnemyAi(
        e.ai,
        {
          archetype: e.def.archetype,
          tier: e.def.tier,
          x: e.x,
          y: e.y,
          playerX: px,
          playerY: py,
          speed: e.speed,
        },
        dt,
        e.aiRng,
        e.uid,
      );
      e.ai = ai.state;
      for (const action of ai.actions) this.applyAiAction(e, action, px, py);

      let mx = ai.moveX;
      let my = ai.moveY;
      if (e.def.archetype === "swarm") {
        const wob = Math.sin(this.elapsed * 2.4 + e.phase) * 0.45;
        const nx = mx - my * wob;
        const ny = my + mx * wob;
        mx = nx;
        my = ny;
      }

      // Separation: Gegner stapeln sich nicht auf einem Pixel.
      let sx = 0;
      let sy = 0;
      this.hash.queryCircle(e.x, e.y, e.radius + 10, this.scratch);
      for (const n of this.scratch) {
        if (n === e || !n.alive) continue;
        const push = separationPush(e.x, e.y, e.radius, n.x, n.y, n.radius, e.uid);
        if (push) {
          sx += push.x;
          sy += push.y;
        }
      }

      const decay = Math.max(0, 1 - 7 * dt);
      e.vx *= decay;
      e.vy *= decay;
      const terrain = terrainSpeedFactor(this.ground.kindAt(e.x, e.y) as TerrainKind);
      const speed = e.speed * statusMul * ai.speedMul * terrain;
      e.x += (mx * speed + e.vx + sx * speed * 1.2) * dt;
      e.y += (my * speed + e.vy + sy * speed * 1.2) * dt;
      e.x = Phaser.Math.Clamp(e.x, 10, WORLD_SIZE - 10);
      e.y = Phaser.Math.Clamp(e.y, 10, WORLD_SIZE - 10);
    }
  }

  /** Führt eine KI-Aktion aus (Schuss, Beschwörung, Blinzeln, Explosion). */
  private applyAiAction(e: EnemyRuntime, action: AiAction, px: number, py: number): void {
    switch (action.type) {
      case "windup":
      case "charge":
        e.telegraph = Math.max(e.telegraph, action.duration);
        break;
      case "shoot": {
        const damage = Math.max(2, Math.round(e.damage * 0.55));
        this.enemyShots.spawn({
          x: e.x, y: e.y, vx: action.vx, vy: action.vy,
          damage, radius: 4, texture: shotTextureFor(e.def.archetype, e.def.tier), life: 3.4,
        });
        break;
      }
      case "summon": {
        for (let i = 0; i < action.count; i++) {
          const a = (i / action.count) * Math.PI * 2 + this.rng.next() * 0.4;
          this.spawner.spawnAt(
            ENEMIES[action.minion],
            e.x + Math.cos(a) * 26,
            e.y + Math.sin(a) * 26,
            { hpScale: Math.max(0.6, e.hpScale * 0.55) },
          );
        }
        break;
      }
      case "blink": {
        e.x = Phaser.Math.Clamp(action.x, 10, WORLD_SIZE - 10);
        e.y = Phaser.Math.Clamp(action.y, 10, WORLD_SIZE - 10);
        e.sprite.setAlpha(0.3);
        this.tweens.add({ targets: e.sprite, alpha: 1, duration: 180 });
        break;
      }
      case "explode": {
        this.explosions += 1;
        this.hazards.spawnCircle(e.x, e.y, {
          warn: 0.16, linger: 0.1, damage: Math.max(4, Math.round(e.damage * 1.6)),
          radius: action.radius, source: "exploder", color: 18,
        });
        e.hp = 0;
        break;
      }
    }
  }

  private collectKills(): void {
    const splits: EnemyRuntime[] = [];
    for (const e of this.enemies.active) {
      if (!e.alive || e.hp > 0) continue;
      e.alive = false;
      if (e.recycled) continue;
      if (e.def.archetype === "splitter" && shouldSplit(e.splitDepth) && !e.boss) splits.push(e);
      this.kills += 1;
      this.pickups.drop(e.x, e.y, PickupSystem.rollSize(this.rng), this.rng);
      // Elite garantieren zusätzlich große Kristalle (Leuchtrand-Belohnung).
      if (e.elite) {
        for (let i = 0; i < 2; i++) this.pickups.drop(e.x, e.y, "large", this.rng);
      }
      if (e.boss) {
        this.bossesDefeated += 1;
        this.chests.spawn(e.x, e.y);
        this.chestsDropped += 1;
        this.cameras.main.shake(220, 0.005);
        this.events.emit("bossDefeated", { index: e.bossIndex, name: BOSSES[e.bossIndex]?.name ?? "Boss" });
        // Dawn erst nach der Schleife starten: startDawn() kompaktiert das
        // Array, über das hier noch iteriert wird.
        if (e.bossIndex === 5) this.dawnQueued = true;
      }
    }
    // Splitter teilen sich in zwei kleinere Exemplare (max. 2 Generationen);
    // während der Morgendämmerung zerfällt alles, keine neuen Kinder.
    if (!this.dawn && !this.dawnQueued) for (const parent of splits) {
      for (let i = 0; i < 2; i++) {
        const a = (i / 2) * Math.PI * 2 + this.rng.next() * 0.7;
        const child = this.spawner.spawnAt(
          parent.def,
          parent.x + Math.cos(a) * 16,
          parent.y + Math.sin(a) * 16,
          { splitDepth: parent.splitDepth + 1, hpScale: Math.max(0.3, parent.hpScale * 0.5) },
        );
        child.radius = Math.max(4, Math.round(parent.radius * 0.7));
        this.splitsSpawned += 1;
      }
    }
    if (this.dawnQueued && !this.dawn) this.startDawn();
  }

  /** Sieg: Morgendämmerung über der Arena, dann Results. */
  private startDawn(): void {
    if (this.dawn) return;
    this.dawn = true;
    this.dawnTimer = 0;
    // Alle verbliebenen Gegner zerfallen, Gefahren/Projektile verschwinden.
    for (const e of this.enemies.active) {
      if (e.bossIndex === 5) continue;
      e.alive = false;
      e.sprite.setVisible(false).setActive(false);
      e.aura.setVisible(false);
    }
    this.enemies.compact();
    this.hazards.clear();
    this.enemyShots.clear();
    const amber = PAL[C.amber];
    this.cameras.main.flash(900, (amber >> 16) & 255, (amber >> 8) & 255, amber & 255);
    this.dawnRect = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PAL[C.amber], 0)
      .setScrollFactor(0).setDepth(75);
    this.tweens.add({
      targets: this.dawnRect, fillAlpha: 0.55, duration: 2600, ease: "Sine.InOut",
    });
    this.events.emit("dawn");
  }

  private touchDamage(): void {
    if (this.invuln > 0) return;
    const px = this.posX;
    const py = this.posY;
    let hit: EnemyRuntime | null = null;
    for (const e of this.enemies.active) {
      if (!e.alive) continue;
      if ((e.x - px) ** 2 + (e.y - py) ** 2 < (e.radius + 6) ** 2) { hit = e; break; }
    }
    if (!hit) return;
    this.hurtPlayer(hit.damage, hit.x, hit.y);
  }

  private updateVisuals(realDt: number): void {
    // Externe Teleports (Debug-Skripte setzen `player.x/y`) übernehmen, ohne
    // die Float-Position bei normaler Darstellung zu verändern.
    if (this.player.x !== this.visualX || this.player.y !== this.visualY) {
      this.posX = this.player.x;
      this.posY = this.player.y;
    }
    // Nur die Darstellung runden; posX/posY bleibt float (Sub-Pixel-Speed).
    const rx = Math.round(this.posX);
    const ry = Math.round(this.posY);
    this.visualX = rx;
    this.visualY = ry;
    this.player.setPosition(rx, ry);
    this.shadow.setPosition(rx, ry + 7);
    this.light.setPosition(rx, ry);
    const pulse = 1.35 + Math.sin(this.elapsed * 2) * 0.04;
    this.light.setScale(pulse);
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - realDt);
      this.playerBody.setTintFill(PAL[C.hotRed]);
    }
    else this.playerBody.clearTint();
    if (this.invuln > 0 && this.hitFlash <= 0) this.playerBody.setAlpha(0.55);
    else this.playerBody.setAlpha(1);

    const t = this.elapsed;
    for (const e of this.enemies.active) {
      if (!e.alive) continue;
      e.flash = Math.max(0, e.flash - realDt);
      // Hit-Flash als Blinzeln: Silhouette/Farbe bleibt lesbar (kein Weiß-Wash).
      const alpha = e.flash > 0 ? 0.45 : 1;
      if (e.alpha !== alpha) {
        e.alpha = alpha;
        e.sprite.setAlpha(alpha);
      }
      const tint = e.telegraph > 0 ? "red" : e.freezeTimer > 0 ? "freeze" : e.slowTimer > 0 ? "slow" : "none";
      if (e.tint !== tint) {
        e.tint = tint;
        if (tint === "red") e.sprite.setTint(PAL[C.hotRed]);
        else if (tint === "freeze") e.sprite.setTint(PAL[C.paleMist]);
        else if (tint === "slow") e.sprite.setTint(PAL[C.fogBlue]);
        else e.sprite.clearTint();
      }
      // Nur Elite/Bosse tragen eine Aura; der Aufruf für alle Gegner kostet
      // bei 500+ Einheiten spürbar Frame-Zeit.
      if (e.elite || e.boss) e.aura.setPosition(Math.round(e.x), Math.round(e.y));
      e.sprite.setPosition(Math.round(e.x), Math.round(e.y + Math.sin(t * 4 + e.phase) * 1.2));
      const frames = SPRITE_FRAMES[e.def.spriteKey];
      if (frames) {
        const frame = frames[Math.floor(t * 6 + e.phase) % frames.length];
        if (e.sprite.texture.key !== frame) e.sprite.setTexture(frame);
      }
    }
    this.chests.update(realDt, this.cameras.main, this.posX, this.posY);
  }

  private updateHpBar(): void {
    const px = this.posX;
    const py = this.posY - 17;
    const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));
    this.hpBg.setPosition(Math.round(px - 13), Math.round(py));
    this.hpFill.setPosition(Math.round(px - 12), Math.round(py));
    this.hpFill.setScale(Math.max(0.001, ratio), 1);
  }

  // ── XP / Level-up ────────────────────────────────────────────
  private giveXpInternal(amount: number): void {
    const result = applyXp(this.xpState, amount);
    this.xpState = {
      level: result.level,
      xp: result.xp,
      pendingLevelUps: result.pendingLevelUps,
    };
    this.maybeOpenLevelUp();
  }

  giveXp(amount: number): void {
    this.giveXpInternal(amount);
  }

  private maybeOpenLevelUp(): void {
    if (this.levelUpOpen || this.xpState.pendingLevelUps <= 0 || this.finished) return;
    const offers = this.levelSys.offers(this.rng);
    if (offers.length === 0) {
      this.xpState.pendingLevelUps = 0;
      return;
    }
    this.currentOffers = offers;
    this.levelUpOpen = true;
    this.paused = true;
    this.events.emit("levelup", { offers, level: this.xpState.level });
  }

  pickLevelUp(index: number): void {
    if (!this.levelUpOpen) throw new Error("pickLevelUp: kein Level-Up aktiv");
    const offer = this.currentOffers[index];
    if (!offer) throw new RangeError(`pickLevelUp: Index ${index} ungueltig`);
    this.levelSys.applyOffer(offer);
    this.recomputeStats();
    this.xpState.pendingLevelUps = Math.max(0, this.xpState.pendingLevelUps - 1);
    if (this.xpState.pendingLevelUps > 0) {
      const offers = this.levelSys.offers(this.rng);
      if (offers.length > 0) {
        this.currentOffers = offers;
        this.events.emit("levelup", { offers, level: this.xpState.level });
        return;
      }
      this.xpState.pendingLevelUps = 0;
    }
    this.levelUpOpen = false;
    this.paused = false;
    this.currentOffers = [];
    this.events.emit("levelupClosed");
  }

  private recomputeStats(): void {
    const charMods = this.character.mods;
    const passiveMods = this.levelSys.passives.map(
      (p) => PASSIVES[p.id as PassiveId]?.levels[p.level - 1]?.mods ?? {},
    );
    this.agg = aggregateMods([charMods, ...passiveMods]);
    const newMax = Math.round(this.character.hp * (1 + this.agg.maxHpPct / 100)) + this.agg.maxHpFlat;
    if (newMax > this.maxHp) this.hp += newMax - this.maxHp;
    this.maxHp = newMax;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }

  private togglePause(): void {
    if (this.levelUpOpen || this.chestOpen || this.finished) return;
    this.paused = !this.paused;
    this.events.emit("pauseChanged", this.paused);
  }

  // ── Debug-API ────────────────────────────────────────────────
  setTimeScale(n: number): void {
    this.timeScale = timeScaleClamped(n);
  }

  skipTo(seconds: number): void {
    this.elapsed = Math.max(0, Math.min(RUN_LENGTH, seconds));
    this.registry.set("lf-elapsed", this.elapsed);
    this.spawner.budget = 0;
  }

  /** Debug/Abnahme: logische Float-Position setzen (Darstellung folgt). */
  teleport(x: number, y: number): void {
    this.posX = Phaser.Math.Clamp(x, 10, WORLD_SIZE - 10);
    this.posY = Phaser.Math.Clamp(y, 10, WORLD_SIZE - 10);
    this.visualX = Math.round(this.posX);
    this.visualY = Math.round(this.posY);
    this.player.setPosition(this.visualX, this.visualY);
    this.cameras.main.centerOn(this.visualX, this.visualY);
  }

  setGod(value: boolean): void {
    this.godMode = value;
  }

  setAutoPlay(value: boolean): void {
    this.autoPlay = value;
  }

  debugAddWeapon(id: WeaponAnyId, level: number): void {
    // Debug kann eine Evolution direkt setzen: Basis-State trotzdem aufräumen.
    const evo = EVOLUTIONS.find((e) => e.id === id);
    if (evo) this.combat.clearWeaponState(evo.baseWeapon);
    this.levelSys.addWeapon(id, level);
    this.recomputeStats();
  }

  debugAddPassive(id: PassiveId, level: number): void {
    this.levelSys.addPassive(id, level);
    this.recomputeStats();
    this.hp = Math.min(this.hp, this.maxHp);
  }

  debugSpawnEnemy(id: EnemyId, n: number): number {
    const out = this.spawner.spawnEnemy(id, n, this.posX, this.posY);
    return out.length;
  }

  /** M3: spawnt einen echten Boss mit Mechaniken (Debug/Abnahme). */
  debugSpawnBoss(index: number): number {
    if (!Number.isFinite(index) || index < 0 || index > 5) {
      throw new RangeError(`spawnBoss: Index ${index} ungueltig (0..5)`);
    }
    const slot = Math.floor(index);
    this.spawnBossAt(slot);
    return 1;
  }

  /** Öffnet eine Truhe (Debug oder bei Berührung) und pausiert den Run. */
  openChest(chest?: ChestRuntime): void {
    if (this.chestOpen || this.levelUpOpen || this.finished) return;
    const target = chest ?? this.chests.near(this.posX, this.posY, 200) ?? this.chests.spawn(this.posX, this.posY - 22);
    const result = chestRewards(this.levelSys.weapons, this.levelSys.passives, this.elapsed, this.rng);
    this.chestResult = result;
    this.chestOpen = true;
    this.chestPausedBefore = this.paused;
    this.paused = true;
    this.chests.open(target);
    this.events.emit("chestOpen", result);
  }

  /** Debug: Truhe direkt vor dem Spieler spawnen und öffnen. */
  debugOpenChest(): void {
    if (this.chestOpen || this.levelUpOpen) throw new Error("openChest: Es ist bereits eine Truhe/ein Level-Up offen");
    const chest = this.chests.spawn(this.posX + 26, this.posY);
    this.openChest(chest);
  }

  /** Wird von der UI am Ende der Öffnungs-Sequenz aufgerufen. */
  finishChest(): void {
    if (!this.chestOpen || !this.chestResult) return;
    for (const reward of this.chestResult.rewards) {
      // Evolution ersetzt die Basiswaffe: deren Runtime-State (z. B. Laternen-Orbs)
      // muss verschwinden, sonst wirkt die Basiswaffe unsichtbar weiter.
      if (reward.kind === "evolution") {
        const base = EVOLUTIONS.find((e) => e.id === reward.id)?.baseWeapon;
        if (base) this.combat.clearWeaponState(base);
      }
      this.levelSys.applyChestReward(reward);
    }
    this.recomputeStats();
    this.chestOpen = false;
    this.chestResult = null;
    this.paused = this.chestPausedBefore;
    this.events.emit("chestClosed");
  }

  getHudState(): HudState {
    return {
      time: this.elapsed,
      level: this.xpState.level,
      xp: this.xpState.xp,
      xpNeed: xpToNext(this.xpState.level),
      xpRatio: xpProgress(this.xpState),
      hp: this.hp,
      maxHp: this.maxHp,
      kills: this.kills,
      enemies: this.enemies?.count ?? 0,
      paused: this.paused,
      levelUpOpen: this.levelUpOpen,
      chestOpen: this.chestOpen,
      offers: this.currentOffers,
      weapons: this.levelSys?.weapons ?? [],
      passives: this.levelSys?.passives ?? [],
      fps: this.game.loop.actualFps,
      character: this.character.id,
      boss: this.bosses?.info() ?? null,
      dawn: this.dawn,
    };
  }

  getDebugState(): Record<string, unknown> {
    return {
      scene: "run",
      time: Math.round(this.elapsed * 10) / 10,
      level: this.xpState.level,
      xp: this.xpState.xp,
      xpNeed: xpToNext(this.xpState.level),
      xpRatio: xpProgress(this.xpState),
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      kills: this.kills,
      enemies: this.enemies?.count ?? 0,
      weapons: this.levelSys?.weapons.map((w) => ({ id: w.id, level: w.level })) ?? [],
      passives: this.levelSys?.passives.map((p) => ({ id: p.id, level: p.level })) ?? [],
      bossesDefeated: this.bossesDefeated,
      boss: this.bosses?.info() ?? null,
      bossesSpawned: this.bossesSpawned.slice(),
      bossFlags: this.bossFlags.slice(),
      chestsDropped: this.chestsDropped,
      explosions: this.explosions,
      elitesSpawned: this.elitesSpawned,
      splitsSpawned: this.splitsSpawned,
      dawn: this.dawn,
      enemyShots: this.enemyShots?.count ?? 0,
      hazards: this.hazards?.count ?? 0,
      enemyList: this.enemies?.active.filter((e) => e.alive).map((e) => ({
        uid: e.uid,
        id: e.def.id,
        name: e.def.name,
        archetype: e.def.archetype,
        tier: e.def.tier,
        x: Math.round(e.x),
        y: Math.round(e.y),
        hp: Math.round(Math.max(0, e.hp)),
        maxHp: e.maxHp,
        boss: e.boss,
        bossIndex: e.bossIndex,
        elite: e.elite,
        splitDepth: e.splitDepth,
        radius: e.radius,
        speed: Math.round(e.speed * 10) / 10,
        slowFactor: Math.round(e.slowFactor * 100) / 100,
        telegraph: Math.round(e.telegraph * 100) / 100,
        mode: e.ai.mode,
        blinks: e.ai.blinks,
        attacks: e.ai.attacks,
        fuse: Math.round(e.ai.fuse * 100) / 100,
        age: Math.round(e.age * 10) / 10,
      })) ?? [],
      fps: Math.round(this.game.loop.actualFps * 10) / 10,
      character: this.character.id,
      damageByWeapon: { ...this.damageByWeapon },
      stats: this.agg ? { ...this.agg } : {},
      pickupRadius: this.agg ? effectivePickupRadius(PLAYER_BASE_PICKUP_RADIUS, this.agg) : 0,
      paused: this.paused,
      levelUpOpen: this.levelUpOpen,
      chestOpen: this.chestOpen,
      chests: this.chests?.count ?? 0,
      autoPlay: this.autoPlay,
      god: this.godMode,
      player: {
        x: Math.round(this.posX * 100) / 100,
        y: Math.round(this.posY * 100) / 100,
        terrain: this.ground?.kindAt(this.posX, this.posY) ?? "grass",
      },
    };
  }

  private endRun(reason: "death" | "dawn"): void {
    if (this.finished) return;
    this.finished = true;
    this.paused = true;
    const result: RunResult = {
      reason,
      elapsed: this.elapsed,
      kills: this.kills,
      level: this.xpState.level,
      character: this.character.id,
      damageByWeapon: { ...this.damageByWeapon },
      god: this.godMode,
      seed: this.seed,
      debug: this.debug,
    };
    // Endzustand konservieren (nach dem Szenenwechsel ist er nicht mehr abfragbar).
    this.registry.set("lf-final-state", this.getDebugState());
    this.scene.stop("ui");
    this.scene.start("results", result);
  }
}


