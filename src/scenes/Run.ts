import Phaser from "phaser";
import { C, PAL } from "../palette";
import { CHARACTERS } from "../data/characters";
import { WEAPONS } from "../data/weapons";
import { PASSIVES } from "../data/passives";
import type { CharacterDef, CharacterId, EnemyId, PassiveId, WeaponId } from "../data/types";
import {
  GAME_HEIGHT, GAME_WIDTH, PLAYER_BASE_PICKUP_RADIUS, PLAYER_INVULN,
  RUN_LENGTH, SIM_MAX_STEP, WORLD_SIZE,
} from "../config";
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
  offers: Offer[];
  weapons: OwnedWeapon[];
  passives: { id: string; level: number }[];
  fps: number;
  character: string;
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
  levelUpOpen = false;
  finished = false;
  invuln = 0;
  hitFlash = 0;
  kills = 0;
  hp = 1;
  maxHp = 1;
  damageByWeapon: Record<string, number> = {};
  currentOffers: Offer[] = [];
  xpState: XpState = { level: 1, xp: 0, pendingLevelUps: 0 };


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
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private scratch: EnemyRuntime[] = [];

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
    this.finished = false;
    this.invuln = 0;
    this.hitFlash = 0;
    this.kills = 0;
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

    // Startwaffe: Kael hat laut Spec den Kettenflegel; der ist erst ab M2 spielbar.
    let startWeapon: WeaponId = this.character.startWeapon;
    if (!WEAPONS[startWeapon].implemented) startWeapon = "ember";
    this.levelSys = new LevelUpSystem(startWeapon, 1);
    this.recomputeStats();
    this.hp = this.maxHp;

    this.enemies = new EnemyPool(this);
    this.hash = new SpatialHash<EnemyRuntime>(32);
    this.spawner = new Spawner(this, this.enemies, this.rng);
    this.combat = new CombatSystem(this);
    this.pickups = new PickupSystem(this);

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
    });
  }

  update(_time: number, delta: number): void {
    if (this.finished) return;
    const realDt = Math.min(0.05, delta / 1000);

    // AutoPlay wählt Level-Up-Angebote nach kurzer Anzeige (unbeaufsichtigter Run).
    if (this.levelUpOpen) {
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

    if (this.elapsed >= RUN_LENGTH) {
      this.endRun("dawn");
      return;
    }

    if (this.invuln > 0) this.invuln -= dt;
    if (this.agg.regen > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.agg.regen * dt);
    }

    this.movePlayer(dt);
    this.spawner.update(this.elapsed, dt, this.player.x, this.player.y);
    this.updateEnemies(dt);
    this.combat.update(
      dt, this.player.x, this.player.y, this.levelSys.weapons, this.enemies.active,
      this.hash, this.agg, (enemy, damage, weaponId) => {
        this.damageByWeapon[weaponId] = (this.damageByWeapon[weaponId] ?? 0) + damage;
      },
    );
    this.collectKills();
    this.touchDamage();
    if (this.finished) return;
    this.enemies.compact();

    this.pickups.update(dt, this.player.x, this.player.y, effectivePickupRadius(PLAYER_BASE_PICKUP_RADIUS, this.agg), (value) => {
      this.giveXpInternal(value);
    });
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
    const speed = effectiveMoveSpeed(this.character.speed, this.agg);
    this.player.x = Phaser.Math.Clamp(this.player.x + dx * speed * dt, 10, WORLD_SIZE - 10);
    this.player.y = Phaser.Math.Clamp(this.player.y + dy * speed * dt, 10, WORLD_SIZE - 10);
    this.playerBody.setFlipX(dx < 0);
    if (this.lantern) this.lantern.x = dx < 0 ? -9 : 9;
  }

  /** Einfacher Ausweich-Bot: weg vom nächsten Gegner + seitliche Komponente. */
  private autoDirection(): { x: number; y: number } {
    let nearest: EnemyRuntime | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const e of this.enemies.active) {
      if (!e.alive) continue;
      const d = (e.x - this.player.x) ** 2 + (e.y - this.player.y) ** 2;
      if (d < best) { best = d; nearest = e; }
    }

    let x = 0;
    let y = 0;
    // Kristalle einsammeln, solange kein Gegner direkt bedrohlich ist.
    let nearestGem: { x: number; y: number } | null = null;
    let bestGem = 260 * 260;
    for (const g of this.pickups.gems) {
      const d = (g.x - this.player.x) ** 2 + (g.y - this.player.y) ** 2;
      if (d < bestGem) { bestGem = d; nearestGem = g; }
    }
    if (nearestGem && (!nearest || best > 90 * 90)) {
      const gx = nearestGem.x - this.player.x;
      const gy = nearestGem.y - this.player.y;
      const gd = Math.hypot(gx, gy) || 1;
      x += (gx / gd) * 0.9;
      y += (gy / gd) * 0.9;
    }
    if (nearest && best < 240 * 240) {
      let ax = this.player.x - nearest.x;
      let ay = this.player.y - nearest.y;
      const d = Math.hypot(ax, ay) || 1;
      ax /= d; ay /= d;
      const tx = -ay;
      const ty = ax;
      const weight = best < 70 * 70 ? 1 : 0.5;
      x += (ax + tx * 0.75) * weight;
      y += (ay + ty * 0.75) * weight;
    }
    // Wandmeidung
    if (this.player.x < 80) x += 0.8;
    if (this.player.x > WORLD_SIZE - 80) x -= 0.8;
    if (this.player.y < 80) y += 0.8;
    if (this.player.y > WORLD_SIZE - 80) y -= 0.8;
    if (x !== 0 || y !== 0) {
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len };
    }
    return { x: Math.cos(this.elapsed * 0.5) * 0.5, y: Math.sin(this.elapsed * 0.4) * 0.5 };
  }

  // ── Gegner ───────────────────────────────────────────────────
  private updateEnemies(dt: number): void {
    this.hash.rebuild(this.enemies.active.filter((e) => e.alive));
    const px = this.player.x;
    const py = this.player.y;
    for (const e of this.enemies.active) {
      if (!e.alive) continue;
      const dx = px - e.x;
      const dy = py - e.y;
      const dir = directionToPlayer(dx, dy, e.uid);
      const dirx = dir.x;
      const diry = dir.y;
      const wobble = e.def.archetype === "swarm" ? 0.45 : 0.1;
      const wob = Math.sin(this.elapsed * 2.4 + e.phase) * wobble;
      let mx = dirx - diry * wob;
      let my = diry + dirx * wob;

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
      e.x += (mx * e.speed + e.vx + sx * e.speed * 1.2) * dt;
      e.y += (my * e.speed + e.vy + sy * e.speed * 1.2) * dt;
      e.x = Phaser.Math.Clamp(e.x, 10, WORLD_SIZE - 10);
      e.y = Phaser.Math.Clamp(e.y, 10, WORLD_SIZE - 10);
    }
  }

  private collectKills(): void {
    for (const e of this.enemies.active) {
      if (!e.alive || e.hp > 0) continue;
      e.alive = false;
      this.kills += 1;
      this.pickups.drop(e.x, e.y, PickupSystem.rollSize(this.rng), this.rng);
    }
  }

  private touchDamage(): void {
    if (this.invuln > 0) return;
    const px = this.player.x;
    const py = this.player.y;
    let hit: EnemyRuntime | null = null;
    for (const e of this.enemies.active) {
      if (!e.alive) continue;
      if ((e.x - px) ** 2 + (e.y - py) ** 2 < (e.radius + 6) ** 2) { hit = e; break; }
    }
    if (!hit) return;
    const armor = this.character.armor + this.agg.armorFlat;
    const dmg = damageAfterArmor(hit.damage, armor);
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = PLAYER_INVULN;
    this.hitFlash = 0.16;
    this.cameras.main.shake(70, 0.0022);
    if (this.hp <= 0) {
      if (this.godMode) this.hp = 1;
      else this.endRun("death");
    }
  }

  private updateVisuals(realDt: number): void {
    this.player.x = Math.round(this.player.x);
    this.player.y = Math.round(this.player.y);
    this.player.setPosition(this.player.x, this.player.y);
    this.shadow.setPosition(this.player.x, this.player.y + 7);
    this.light.setPosition(this.player.x, this.player.y);
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
      if (e.flash > 0) e.sprite.setTintFill(PAL[C.lanternWhite]);
      else e.sprite.clearTint();
      e.sprite.setPosition(Math.round(e.x), Math.round(e.y + Math.sin(t * 4 + e.phase) * 1.2));
      const frames = SPRITE_FRAMES[e.def.spriteKey];
      if (frames) {
        const frame = frames[Math.floor(t * 6 + e.phase) % frames.length];
        if (e.sprite.texture.key !== frame) e.sprite.setTexture(frame);
      }
    }
  }

  private updateHpBar(): void {
    const px = this.player.x;
    const py = this.player.y - 17;
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
    if (this.levelUpOpen || this.finished) return;
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

  setGod(value: boolean): void {
    this.godMode = value;
  }

  setAutoPlay(value: boolean): void {
    this.autoPlay = value;
  }

  debugAddWeapon(id: WeaponId, level: number): void {
    this.levelSys.addWeapon(id, level);
    this.recomputeStats();
  }

  debugAddPassive(id: PassiveId, level: number): void {
    this.levelSys.addPassive(id, level);
    this.recomputeStats();
    this.hp = Math.min(this.hp, this.maxHp);
  }

  debugSpawnEnemy(id: EnemyId, n: number): number {
    const out = this.spawner.spawnEnemy(id, n, this.player.x, this.player.y);
    return out.length;
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
      offers: this.currentOffers,
      weapons: this.levelSys?.weapons ?? [],
      passives: this.levelSys?.passives ?? [],
      fps: this.game.loop.actualFps,
      character: this.character.id,
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
      bossesDefeated: 0,
      fps: Math.round(this.game.loop.actualFps * 10) / 10,
      character: this.character.id,
      paused: this.paused,
      levelUpOpen: this.levelUpOpen,
      autoPlay: this.autoPlay,
      god: this.godMode,
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
    this.scene.stop("ui");
    this.scene.start("results", result);
  }
}


