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
import { DEPTH } from "../gfx/depth";
import { PLAYER_FRAMES, type WalkDir } from "../gfx/chars";
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
import { lodFor, type LodState } from "../logic/lod";
import { shakeFor, hitStopFor } from "../logic/feedback";
import { deathClassFor } from "../logic/death";
import { getSettings } from "../audio/settings";
import { getAudio } from "../audio/AudioSystem";

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
  lod: LodState;
  hitStop: number;
  damageNumbers: number;
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
  /** M5: LOD-Zustand + kurzer Hit-Stop (nur Boss-Treffer/Tod). */
  lod: LodState = lodFor(0);
  hitStop = 0;
  private bossFeedbackCooldown = 0;
  /** M5: Zeitlupen-Sequenz bei Evolution. */
  private slowmoRemaining = 0;
  private slowmoRestore = 1;
  private lastEvolutionFxId = "";
  /** Abnahme-Harness: Ereignis-Overlays unterdrücken, Waffen-VFX bleiben. */
  suppressEventFx = false;
  /** Abnahme-Harness: Level-up-Dialog unterdrücken (Waffen-GIFs). */
  suppressLevelUps = false;

  private rng!: SeededRng;
  private levelSys!: LevelUpSystem;
  private agg!: AggregateStats;
  private hpFill!: Phaser.GameObjects.Rectangle;
  private hpBg!: Phaser.GameObjects.Rectangle;
  private player!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Image;
  private lantern?: Phaser.GameObjects.Image;
  /** Lauf-/Idle-Animation (32-px-Spielerframes). */
  private moving = false;
  private walkPhase = 0;
  private idlePhase = 0;
  private walkDir: WalkDir = "down";
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
    this.lod = lodFor(0);
    this.hitStop = 0;
    this.bossFeedbackCooldown = 0;
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
    this.playerBody = this.add.image(0, 0, this.character.spriteKey === "player_kael" ? "player_kael_down_idle_0" : "player_mira_down_idle_0").setOrigin(0.5, 0.5);
    this.player.add(this.playerBody);
    this.shadow = this.add.image(startX, startY + 14, "shadow").setScale(2, 1).setDepth(11);

    this.light = this.add.image(startX, startY, "light_radius")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(20)
      .setScale(1.35)
      .setAlpha(0.85);
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "vignette")
      .setScrollFactor(0).setDepth(80).setAlpha(0.9);

    this.hpBg = this.add.rectangle(startX - 13, startY - 23, 26, 5, PAL[C.ink]).setOrigin(0, 0.5).setDepth(25).setVisible(false);
    this.hpFill = this.add.rectangle(startX - 12, startY - 22, 24, 2, PAL[C.crimson]).setOrigin(0, 0.5).setDepth(26).setVisible(false);

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
    getAudio().setMusic("run");
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

  update(time: number, delta: number): void {
    if (this.finished) return;
    const realDt = Math.min(0.05, delta / 1000);

    // AutoPlay wählt Level-Up-Angebote nach kurzer Anzeige (unbeaufsichtigter Run).
    if (this.levelUpOpen || this.chestOpen) {
      this.paused = true;
      return;
    }
    if (this.paused) return;

    // Evolution-Zeitlupe (0,35–0,5 s) läuft in Echtzeit aus.
    if (this.slowmoRemaining > 0) {
      this.slowmoRemaining = Math.max(0, this.slowmoRemaining - realDt);
      if (this.slowmoRemaining === 0) this.timeScale = this.slowmoRestore;
    }

    // Hit-Stop: Welt kurz anhalten, aber VFX/Damage-Numbers weiter animieren.
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - realDt);
      this.combat?.fx.update(realDt);
      this.combat?.particles.update(realDt);
      this.combat?.damageNumbers.update(realDt, this.cameras.main);
      this.updateVisuals(realDt);
      this.updateHpBar();
      return;
    }

    const scaledDt = realDt * this.timeScale;
    this.ground.update(this.cameras.main, time);

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
    this.applyLod();
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
    if (this.bossFeedbackCooldown > 0) this.bossFeedbackCooldown = Math.max(0, this.bossFeedbackCooldown - dt);
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
      onHit: (enemy, damage, weaponId, killed) => {
        this.damageByWeapon[weaponId] = (this.damageByWeapon[weaponId] ?? 0) + damage;
        getAudio().play(killed ? "kill" : "hit");
        if (enemy.boss && !killed) this.bossHitFeedback();
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
    const cam = this.cameras.main;
    this.pickups.update(dt, this.posX, this.posY, pickupRadius, (value) => {
      this.giveXpInternal(value);
    }, {
      x0: cam.scrollX - 80, y0: cam.scrollY - 80,
      x1: cam.scrollX + cam.width + 80, y1: cam.scrollY + cam.height + 80,
    });
    const nearChest = this.chests.near(this.posX, this.posY, 15);
    if (nearChest) this.openChest(nearChest);
  }

  /** M5-LOD: Effekt-Caps/Trails/Damage-Summen an Gegnerlast anpassen. */
  private applyLod(): void {
    const lod = lodFor(this.enemies?.count ?? 0);
    if (lod.level !== this.lod.level) {
      this.lod = lod;
      this.combat?.setLod(lod);
      this.pickups?.setCap(lod.gemCap);
    }
  }

  /** Kurzer Boss-Treffer-Hit-Stop + dosierter Shake (max. ~6 px). */
  private bossHitFeedback(): void {
    if (this.bossFeedbackCooldown > 0) return;
    this.bossFeedbackCooldown = 1.2;
    this.hitStop = Math.max(this.hitStop, hitStopFor("bossHit"));
    const shake = shakeFor("bossHit", getSettings().shake);
    if (shake.durationMs > 0) this.cameras.main.shake(shake.durationMs, shake.intensity);
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
    this.playBossIntroFx(b.x, b.y, index);
    getAudio().play("bossWarn");
    getAudio().setMusic("boss");
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
    const hurtShake = shakeFor("hit", getSettings().shake);
    if (hurtShake.durationMs > 0) this.cameras.main.shake(hurtShake.durationMs, hurtShake.intensity);
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
    if (dx === 0 && dy === 0) {
      this.moving = false;
      return;
    }
    this.moving = true;
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    const terrain = terrainSpeedFactor(this.ground.kindAt(this.posX, this.posY) as TerrainKind);
    const speed = effectiveMoveSpeed(this.character.speed, this.agg) * terrain;
    this.facingX = dx;
    this.facingY = dy;
    // AutoPlay zielt auf den nächsten Gegner (Nahkampf-Flegel trifft sonst nur
    // in Laufrichtung, die beim Kiten vom Trupp wegzeigt). Nur die Blickrichtung,
    // nicht die Bewegung, wird gedreht; manuelle Steuerung bleibt unverändert.
    if (this.autoPlay) {
      let best: { x: number; y: number } | null = null;
      let bestD = 280 * 280;
      // Boss hat Zielpriorität: sonst bleibt er im Getümmel unverwundet und der
      // Bot kitet nur Trash. Nur die Blickrichtung zielt, die Bewegung bleibt.
      for (const e of this.enemies.active) {
        if (!e.alive || !e.boss) continue;
        const d = (e.x - this.posX) ** 2 + (e.y - this.posY) ** 2;
        if (d < 220 * 220) { best = e; bestD = d; break; }
      }
      if (!best) {
        for (const e of this.enemies.active) {
          if (!e.alive) continue;
          const d = (e.x - this.posX) ** 2 + (e.y - this.posY) ** 2;
          if (d < bestD) { bestD = d; best = e; }
        }
      }
      if (best) {
        const adx = best.x - this.posX;
        const ady = best.y - this.posY;
        const alen = Math.hypot(adx, ady) || 1;
        this.facingX = adx / alen;
        this.facingY = ady / alen;
      }
    }
    this.walkDir = Math.abs(dx) > Math.abs(dy) ? "side" : dy < 0 ? "up" : "down";
    this.posX = Phaser.Math.Clamp(this.posX + dx * speed * dt, 10, WORLD_SIZE - 10);
    this.posY = Phaser.Math.Clamp(this.posY + dy * speed * dt, 10, WORLD_SIZE - 10);
    this.playerBody.setFlipX(dx < 0 && this.walkDir === "side");
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
    const bossAgent = this.enemies.active.find((e) => e.alive && e.boss);
    return botDirection({
      playerX: this.posX,
      playerY: this.posY,
      worldSize: WORLD_SIZE,
      enemies,
      projectiles,
      hazards,
      gems,
      melee: (this.levelSys?.weapons ?? []).some((w) => w.id === "flail" || w.id === "wrath_pendulum"),
      boss: bossAgent ? { x: bossAgent.x, y: bossAgent.y, radius: bossAgent.radius } : undefined,
      chests: this.chests.chests.map((c) => ({ x: c.x, y: c.y })),
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
        const bossShake = shakeFor("bossDeath", getSettings().shake);
        if (bossShake.durationMs > 0) this.cameras.main.shake(bossShake.durationMs, bossShake.intensity);
        this.hitStop = Math.max(this.hitStop, hitStopFor("bossDeath"));
        this.playBossDeathFx(e.x, e.y, e.bossIndex);
        getAudio().play("bossDeath");
        if (e.bossIndex !== 5) getAudio().setMusic("run");
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

  /** Sieg: Morgendämmerung über der Arena, dann Results.
   *  `instant=false` (nur Debug-Abnahme) lässt die Gegner erst sichtbar
   *  nacheinander zerfallen, damit der GIF-Beleg lebende Gegner + Zerfall zeigt. */
  private startDawn(instant = true): void {
    if (this.dawn) return;
    this.dawn = true;
    this.dawnTimer = 0;
    const crumble = (e: EnemyRuntime, i: number): void => {
      this.combat.particles.shards(deathClassFor(e.def.archetype) === "burst" ? "fx_death_blob" : "fx_ash",
        e.x, e.y, 5, { life: 0.9, scaleFrom: 0.9, tint: PAL[e.def.color] ?? PAL[C.amber], additive: false });
      if (i % 3 === 0) this.combat.fx.spawnAnim("fx_dusk", e.x, e.y, {
        life: 0.7, scaleFrom: 0.4, scaleTo: 1.1, alphaFrom: 0.5, alphaTo: 0, additive: false,
      });
      e.alive = false;
      e.sprite.setVisible(false).setActive(false);
      e.aura.setVisible(false);
    };
    let crumbled = 0;
    const list = this.enemies.active.slice();
    if (instant) {
      for (const e of list) {
        if (e.bossIndex === 5) continue;
        if (crumbled < 60) { crumble(e, crumbled); crumbled++; }
        else { e.alive = false; e.sprite.setVisible(false).setActive(false); e.aura.setVisible(false); }
      }
    } else {
      // Gestaffelter Zerfall über ~0,9 s (Debug-VFX-Beleg).
      list.forEach((e, i) => {
        if (e.bossIndex === 5) return;
        this.time.delayedCall(i * 180, () => crumble(e, i));
      });
    }
    this.enemies.compact();
    this.hazards.clear();
    this.enemyShots.clear();
    const amber = PAL[C.amber];
    this.cameras.main.flash(150, (amber >> 16) & 255, (amber >> 8) & 255, amber & 255);
    // Farbverlauf über den Himmel: drei Palettenbänder, von Nacht zu Amber.
    this.dawnRect = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PAL[C.amber], 0)
      .setScrollFactor(0).setDepth(75);
    this.tweens.add({
      targets: this.dawnRect, fillAlpha: 0.18, duration: 2600, ease: "Sine.InOut",
    });
    const bands = [C.nightMid, C.emberDark, C.flame];
    bands.forEach((color, i) => {
      const band = this.add.rectangle(GAME_WIDTH / 2, 25 + i * 42, GAME_WIDTH, 46, PAL[color], 0)
        .setScrollFactor(0).setDepth(74);
      this.tweens.add({ targets: band, fillAlpha: 0.09 - i * 0.02, duration: 2400 + i * 300, ease: "Sine.InOut" });
    });
    // Lichtstrahlen vom Horizont.
    for (let i = 0; i < 7; i++) {
      const ray = this.add.image(60 + i * 60, GAME_HEIGHT, "fx_pillar")
        .setOrigin(0.5, 1).setScrollFactor(0).setDepth(76)
        .setBlendMode(Phaser.BlendModes.ADD).setTint(PAL[C.lantern])
        .setAlpha(0).setScale(2.4 + (i % 2) * 0.5, 3.2);
      this.tweens.add({ targets: ray, alpha: 0.09 + (i % 3) * 0.03, duration: 900 + i * 120, yoyo: true, repeat: 2 });
    }
    const sun = this.add.image(GAME_WIDTH / 2, 18, "light_radius")
      .setScrollFactor(0).setDepth(77).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.lantern]).setScale(2.2).setAlpha(0);
    this.tweens.add({ targets: sun, alpha: 0.6, scale: 2.8, duration: 2400, ease: "Sine.Out" });
    getAudio().play("victory");
    getAudio().stopMusic();
    this.time.delayedCall(160, () => this.events.emit("dawn"));
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
    this.shadow.setPosition(rx, ry + 14);
    this.light.setPosition(rx, ry);
    const pulse = 1.35 + Math.sin(this.elapsed * 2) * 0.04;
    this.light.setScale(pulse);
    const frames = PLAYER_FRAMES[this.character.id];
    let key: string;
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - realDt);
      key = frames.hit;
    } else if (this.moving) {
      this.walkPhase += realDt * 9;
      key = frames.walk[this.walkDir][Math.floor(this.walkPhase) % 4];
    } else {
      this.idlePhase += realDt * 2;
      key = frames.idle[this.walkDir][Math.floor(this.idlePhase) % 2];
    }
    if (this.playerBody.texture.key !== key) this.playerBody.setTexture(key);
    if (this.hitFlash > 0) this.playerBody.setTint(PAL[C.hotRed]);
    else this.playerBody.clearTint();
    if (this.invuln > 0 && this.hitFlash <= 0) this.playerBody.setAlpha(0.55);
    else this.playerBody.setAlpha(1);

    const t = this.elapsed;
    // Sichtbarkeits-Culling: Gegner weit ausserhalb des Viewports brauchen
    // keine Positions-/Animations-/Tint-Updates (bei 500+ Einheiten spuerbar).
    const cam = this.cameras.main;
    const vx0 = cam.scrollX - 120, vy0 = cam.scrollY - 120;
    const vx1 = cam.scrollX + cam.width + 120, vy1 = cam.scrollY + cam.height + 120;
    for (const e of this.enemies.active) {
      if (!e.alive) continue;
      e.flash = Math.max(0, e.flash - realDt);
      if (e.x < vx0 || e.x > vx1 || e.y < vy0 || e.y > vy1) {
        // Ausserhalb des Viewports auch aus dem Render-List nehmen: sichtbar
        // bleibende, aber nicht gezeichnete Sprites kosten weiter Draw-Aufrufe.
        if (e.sprite.visible) {
          e.sprite.setVisible(false);
          if (e.elite || e.boss) e.aura.setVisible(false);
        }
        continue;
      }
      if (!e.sprite.visible) {
        e.sprite.setVisible(true);
        if (e.elite || e.boss) e.aura.setVisible(true);
      }
      // Hit-Flash: heller weißer Frame (kurz), danach normale Silhouette.
      const alpha = e.flash > 0 ? 0.85 : 1;
      if (e.alpha !== alpha) {
        e.alpha = alpha;
        e.sprite.setAlpha(alpha);
      }
      const tint = e.flash > 0 ? "flash" : e.telegraph > 0 ? "red" : e.freezeTimer > 0 ? "freeze" : e.slowTimer > 0 ? "slow" : "none";
      if (e.tint !== tint) {
        e.tint = tint;
        if (tint === "flash") e.sprite.setTint(PAL[C.candleWhite]);
        else if (tint === "red") e.sprite.setTint(PAL[C.hotRed]);
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
        // Bosse: Wind-up-Frame während des Telegraphen, sonst Ruhe/Atmen.
        const windup = e.boss && e.telegraph > 0 && frames.length >= 3 ? frames[2] : null;
        const frame = windup ?? frames[Math.floor(t * 6 + e.phase) % Math.min(2, frames.length)];
        if (e.sprite.texture.key !== frame) e.sprite.setTexture(frame);
      }
    }
    this.chests.update(realDt, this.cameras.main, this.posX, this.posY);
  }

  private updateHpBar(): void {
    const px = this.posX;
    const py = this.posY - 23;
    const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));
    // Die schwebende Mini-Leiste entfällt; HP steht jetzt oben links im HUD.
    const hurt = false;
    this.hpBg.setVisible(hurt).setPosition(Math.round(px - 13), Math.round(py));
    this.hpFill.setVisible(hurt).setPosition(Math.round(px - 12), Math.round(py + 1));
    this.hpFill.setScale(Math.max(0.001, ratio), 1);
  }

  // ── XP / Level-up ────────────────────────────────────────────
  private giveXpInternal(amount: number): void {
    getAudio().play("xp");
    // M6-Balance: Charakter-XP-Mod (Kael levelt langsamer, dafür tanky).
    const gain = Math.max(0, amount * (1 + this.agg.xpPct / 100));
    const result = applyXp(this.xpState, gain);
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
    if (this.suppressLevelUps && this.xpState.pendingLevelUps > 0) this.xpState.pendingLevelUps = 0;
    if (this.levelUpOpen || this.xpState.pendingLevelUps <= 0 || this.finished) return;
    const offers = this.levelSys.offers(this.rng);
    if (offers.length === 0) {
      this.xpState.pendingLevelUps = 0;
      return;
    }
    this.currentOffers = offers;
    this.levelUpOpen = true;
    this.paused = true;
    getAudio().play("levelup");
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
        getAudio().play("levelup");
    this.events.emit("levelup", { offers, level: this.xpState.level });
        return;
      }
      this.xpState.pendingLevelUps = 0;
    }
    this.levelUpOpen = false;
    this.paused = false;
    this.currentOffers = [];
    this.playLevelUpFx();
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
    this.playChestFx(target.x, target.y);
    getAudio().play("chest");
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
      if (reward.kind === "evolution") this.playEvolutionFx(reward.id, reward.name);
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
      lod: this.lod,
      hitStop: Math.round(this.hitStop * 1000) / 1000,
      damageNumbers: this.combat?.damageNumbers?.count ?? 0,
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
      lod: this.lod,
      hitStop: Math.round(this.hitStop * 1000) / 1000,
      damageNumbers: this.combat?.damageNumbers?.count ?? 0,
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

  // ── Ereignis-Inszenierung (M5) ──────────────────────────────
  /** Level-up: Lichtsäule + aufsteigende Glut am Spieler. */
  playLevelUpFx(): void {
    if (this.suppressEventFx) return;
    const x = this.visualX || Math.round(this.posX);
    const y = this.visualY || Math.round(this.posY);
    const pillar = this.add.image(x, y + 12, "fx_pillar")
      .setOrigin(0.5, 1).setDepth(11).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.lantern]).setAlpha(0.95).setScale(1.4, 1.6);
    this.tweens.add({
      targets: pillar, alpha: 0, scaleX: 2.4, scaleY: 2.2, y: y - 70,
      duration: 950, ease: "Cubic.Out", onComplete: () => pillar.destroy(),
    });
    this.combat?.fx.spawnAnim("fx_halo", x, y, {
      life: 0.6, scaleFrom: 0.6, scaleTo: 2.2, alphaFrom: 0.9, alphaTo: 0, additive: true,
    });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.combat?.particles.spawn({
        texture: "fx_star", x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10,
        vx: Math.cos(a) * 26, vy: -30 - (i % 4) * 12,
        life: 0.7 + (i % 3) * 0.15, scaleFrom: 0.8, scaleTo: 0.15,
        alphaFrom: 1, alphaTo: 0, additive: true,
        tint: i % 3 === 0 ? PAL[C.lanternWhite] : PAL[C.amber],
      });
    }
    this.events.emit("eventFx", { kind: "levelup" });
  }

  /** Evolution: eigene Sequenz mit Zeitlupe (~0,45 s), Säule, Ringen, Funken. */
  playEvolutionFx(id: string, name?: string): void {
    if (this.suppressEventFx) return;
    this.lastEvolutionFxId = id;
    this.slowmoRestore = this.timeScale;
    this.timeScale = 0.45;
    this.slowmoRemaining = 0.9;
    const x = this.visualX || Math.round(this.posX);
    const y = this.visualY || Math.round(this.posY);
    const ring = this.add.image(x, y, "fx_shock")
      .setDepth(11).setBlendMode(Phaser.BlendModes.ADD).setTint(PAL[C.lantern])
      .setScale(0.4).setAlpha(1);
    this.tweens.add({ targets: ring, scale: 3.4, alpha: 0, duration: 900, ease: "Cubic.Out", onComplete: () => ring.destroy() });
    for (let k = 0; k < 3; k++) {
      this.time.delayedCall(k * 90, () => this.combat?.fx.spawnAnim("fx_shock", x, y, {
        life: 0.55, scaleFrom: 0.5 + k * 0.5, scaleTo: 2.2 + k * 0.5,
        alphaFrom: 0.9, alphaTo: 0, additive: true, tint: PAL[C.lantern],
      }));
    }
    this.playLevelUpFx();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      this.combat?.particles.shards("fx_fire", x, y, 1, {
        life: 0.8, scaleFrom: 1.1, tint: i % 2 ? PAL[C.amber] : PAL[C.lanternWhite], additive: true,
      });
      this.combat?.particles.spawn({
        texture: "fx_star", x, y, vx: Math.cos(a) * 45, vy: Math.sin(a) * 45,
        life: 0.85, scaleFrom: 1, scaleTo: 0.1, alphaFrom: 1, alphaTo: 0, additive: true,
        tint: PAL[C.lanternWhite],
      });
    }
    getAudio().play("evolution");
    this.events.emit("evolution", { id, name: name ?? id.toUpperCase() });
  }

  /** Truhe: Lichtstrahl + Glanz + Funken (Weltposition). */
  playChestFx(x: number, y: number): void {
    if (this.suppressEventFx) return;
    const beam = this.add.image(x, y - 4, "fx_pillar")
      .setOrigin(0.5, 1).setDepth(11).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.lantern]).setAlpha(0).setScale(0.9, 1.1);
    this.tweens.add({ targets: beam, alpha: 0.85, scaleX: 1.5, duration: 260, yoyo: true, hold: 260, onComplete: () => beam.destroy() });
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (i / 14 - 0.5) * 2.4;
      this.combat?.particles.spawn({
        texture: "fx_coin", x, y, vx: Math.cos(a) * (50 + i * 3), vy: Math.sin(a) * (60 + i * 2),
        life: 0.8, scaleFrom: 1.2, scaleTo: 0.2, alphaFrom: 1, alphaTo: 0, additive: false,
        depth: DEPTH.death,
      });
    }
  }

  /** Boss-Auftritt: Kern-Glut, Zoom-Puls, Bodenbeben. */
  playBossIntroFx(x: number, y: number, index: number): void {
    if (this.suppressEventFx) return;
    this.combat?.fx.spawnAnim("fx_boss_core", x, y, {
      life: 0.9, scaleFrom: 0.6, scaleTo: 2.4, alphaFrom: 1, alphaTo: 0,
      tint: PAL[index === 5 ? C.amber : index % 2 ? C.crimson : C.emberOrange], additive: true,
    });
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 90, () => this.combat?.fx.spawnAnim("fx_shock", x, y + 8, {
        life: 0.65, scaleFrom: 0.5 + i * 0.35, scaleTo: 1.8 + i * 0.5,
        alphaFrom: 0.85, alphaTo: 0, additive: true, tint: PAL[C.emberOrange],
      }));
    }
    const shake = shakeFor("bossHit", getSettings().shake);
    if (shake.durationMs > 0) this.cameras.main.shake(shake.durationMs + 120, shake.intensity);
    // Kamera-Zoom-Puls (kurz, kein Dauerzoom) über einen Tween statt zoomTo.
    const cam = this.cameras.main;
    this.tweens.add({ targets: cam, zoom: 1.14, duration: 170, ease: "Quad.Out" });
    this.time.delayedCall(320, () => {
      if (!this.finished && !this.dawn) {
        this.tweens.add({ targets: cam, zoom: 1, duration: 380, ease: "Quad.InOut" });
      }
    });
    this.events.emit("eventFx", { kind: "bossIntro", index });
  }

  /** Boss-Tod in Stufen: Kern → Ringe → Splitter → Nachglühen. */
  playBossDeathFx(x: number, y: number, index: number): void {
    if (this.suppressEventFx) return;
    const tint = PAL[index === 5 ? C.amber : index % 2 ? C.crimson : C.emberOrange];
    this.combat?.fx.spawnAnim("fx_boss_core", x, y, {
      life: 0.45, scaleFrom: 1.6, scaleTo: 3.6, alphaFrom: 1, alphaTo: 0, tint, additive: true,
    });
    this.cameras.main.flash(90, (PAL[C.amber] >> 16) & 255, (PAL[C.amber] >> 8) & 255, PAL[C.amber] & 255);
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(90 + i * 95, () => this.combat?.fx.spawnAnim("fx_shock", x, y, {
        life: 0.6, scaleFrom: 0.8 + i * 0.5, scaleTo: 2.6 + i * 0.7,
        alphaFrom: 1, alphaTo: 0, additive: true, tint: i === 0 ? PAL[C.lanternWhite] : tint,
      }));
    }
    this.time.delayedCall(260, () => {
      this.combat?.particles.shards("fx_death_bone", x, y, 26, {
        life: 0.9, scaleFrom: 1.35, additive: false, tint: PAL[C.bone],
      });
      this.combat?.particles.shards("fx_fire", x, y, 30, {
        life: 0.8, scaleFrom: 1.2, additive: true,
      });
    });
    this.time.delayedCall(620, () => {
      this.combat?.fx.spawnAnim("fx_halo", x, y, {
        life: 1.4, scaleFrom: 2.2, scaleTo: 4.6, alphaFrom: 0.7, alphaTo: 0, additive: true, tint,
      });
      this.combat?.fx.decal("fx_dusk", x, y, { life: 2.2, scaleFrom: 1.2, scaleTo: 2.6, alphaFrom: 0.5, alphaTo: 0 });
    });
    this.events.emit("eventFx", { kind: "bossDeath", index });
  }

  /** Debug/Abnahme: Ereignis-Overlays (Level-up-Säule etc.) unterdrücken. */
  debugSetSuppressFx(value: boolean): void {
    this.suppressEventFx = Boolean(value);
  }

  /** Debug/Abnahme: Level-up-Dialoge unterdrücken. */
  debugSetSuppressLevelUps(value: boolean): void {
    this.suppressLevelUps = Boolean(value);
  }

  /** Debug/Abnahme: Ereignis-Sequenz ohne echten Spielverlauf auslösen. */
  debugTriggerEvent(name: string): void {
    const x = this.posX;
    const y = this.posY;
    switch (name) {
      case "levelup": this.playLevelUpFx(); break;
      case "evolution": this.playEvolutionFx("phoenix", "PHÖNIXSCHWARM"); break;
      case "chest": {
        // Welt-Effekt mit lebenden Gegnern; Panel startet nach 900 ms für den GIF-Beleg.
        const chest = this.chests.spawn(x + 32, y - 8);
        this.playChestFx(chest.x, chest.y);
        this.time.delayedCall(900, () => { if (!this.chestOpen && !this.finished) this.openChest(chest); });
        break;
      }
      case "bossIntro": {
        const idx = this.bossesSpawned.length % 5;
        this.spawnBossAt(idx);
        break;
      }
      case "bossDeath": {
        const b = this.bosses.spawn(0, x, y);
        // Für den GIF-Beleg unter dem Banner positionieren (nicht am oberen Rand).
        b.x = x + 18;
        b.y = y + 62;
        b.sprite.setPosition(Math.round(b.x), Math.round(b.y));
        this.playBossDeathFx(b.x, b.y, 0);
        this.time.delayedCall(120, () => { b.hp = 0; });
        break;
      }
      case "dawn": {
        this.startDawn(false);
        // Beleg: frische Gegner stehen kurz sichtbar und zerfallen gestaffelt.
        const fresh = this.spawner.spawnEnemy("bog_rat", 8, x, y);
        const fresh2 = this.spawner.spawnEnemy("skeleton", 4, x, y);
        [...fresh, ...fresh2].forEach((e, i) => {
          this.time.delayedCall(700 + i * 160, () => {
            this.combat.particles.shards("fx_death_blob", e.x, e.y, 6, {
              life: 0.8, scaleFrom: 1, tint: PAL[e.def.color] ?? PAL[C.amber], additive: false,
            });
            e.alive = false;
            e.sprite.setVisible(false).setActive(false);
          });
        });
        break;
      }
      default: throw new Error(`triggerEvent: unbekanntes Ereignis "${name}"`);
    }
  }

  private endRun(reason: "death" | "dawn"): void {
    if (this.finished) return;
    if (reason === "death") getAudio().play("defeat");
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


