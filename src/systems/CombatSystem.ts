import Phaser from "phaser";
import { weaponDef as resolveWeaponDef } from "../data/weaponIds";
import type { WeaponDef } from "../data/types";
import { C, PAL } from "../palette";
import {
  effectiveCooldown, effectiveDamage, effectiveDuration, effectiveRadius,
  weaponLevel, type AggregateStats,
} from "../logic/stats";
import { knockbackVector } from "../logic/combat";
import type { Rng } from "../logic/rng";
import type { EnemyRuntime } from "./EnemyPool";
import { FxSystem } from "./FxSystem";
import { ProjectilePool } from "./ProjectilePool";
import type { SpatialHash } from "./SpatialHash";
import type { OwnedWeapon } from "./LevelUpSystem";

export type HitCallback = (enemy: EnemyRuntime, damage: number, weaponId: string, killed: boolean) => void;

export interface CombatContext {
  dt: number;
  playerX: number;
  playerY: number;
  facingX: number;
  facingY: number;
  weapons: OwnedWeapon[];
  enemies: readonly EnemyRuntime[];
  hash: SpatialHash<EnemyRuntime>;
  agg: AggregateStats;
  rng: Rng;
  onHit: HitCallback;
  onHeal?: (amount: number) => void;
}

interface Orb {
  sprite: Phaser.GameObjects.Image;
  phase: number;
}

interface Swing {
  sprite: Phaser.GameObjects.Image;
  weaponId: string;
  baseAngle: number;
  side: number;
  halfArc: number;
  radius: number;
  damage: number;
  knockback: number;
  hit: Set<number>;
  t: number;
  dur: number;
  heal: number;
}

interface WeaponState {
  swings: Swing[];
  orbs: Orb[];
  orbTimeLeft: number;
  orbDamage: number;
  orbRadius: number;
  orbHitAt: Map<number, number>;
  auraTick: number;
  spikeTimer: number;
}

interface PendingSeal {
  x: number;
  y: number;
  timer: number;
  damage: number;
  chain: number;
  weaponId: string;
  sprite: Phaser.GameObjects.Image;
}

/**
 * Ein gemeinsames Waffen-Framework für alle Behaviors: Cooldowns, Treffer,
 * Rückstoß, Statuseffekte und VFX laufen über dieselben Helfer. Die einzelnen
 * Waffen unterscheiden sich nur in ihrer Feuer-Routine und den Daten aus `weapons.ts`.
 */
export class CombatSystem {
  readonly projectiles: ProjectilePool;
  readonly fx: FxSystem;
  /** Von Seelenleuchtfeuer aktivierter Magnet-Bonus in px (0 = aus). */
  pickupBonus = 0;
  private readonly scene: Phaser.Scene;
  private readonly states = new Map<string, WeaponState>();
  private clock = 0;
  private readonly scratch: EnemyRuntime[] = [];
  private readonly seals: PendingSeal[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.projectiles = new ProjectilePool(scene);
    this.fx = new FxSystem(scene);
  }

  update(ctx: CombatContext): void {
    this.clock += ctx.dt;
    this.updateWeapons(ctx);
    this.updateSwings(ctx);
    this.updateOrbs(ctx);
    this.updateSeals(ctx);
    this.updateProjectiles(ctx);
    this.updateBurns(ctx);
    this.fx.update(ctx.dt);
  }

  private stateFor(id: string): WeaponState {
    let s = this.states.get(id);
    if (!s) {
      s = {
        swings: [], orbs: [], orbTimeLeft: 0, orbDamage: 0, orbRadius: 0,
        orbHitAt: new Map(), auraTick: 0, spikeTimer: 0,
      };
      this.states.set(id, s);
    }
    return s;
  }

  private weaponDef(id: string): WeaponDef | null {
    return resolveWeaponDef(id);
  }

  private updateWeapons(ctx: CombatContext): void {
    this.pickupBonus = 0;
    const alive = ctx.enemies.filter((e) => e.alive && e.hp > 0);
    for (const owned of ctx.weapons) {
      const def = this.weaponDef(owned.id);
      if (!def || !def.implemented) continue;
      const stats = weaponLevel(def, owned.level);
      const state = this.stateFor(owned.id);
      owned.timer -= ctx.dt;
      if (state.orbTimeLeft > 0) {
        state.orbTimeLeft -= ctx.dt;
        if (owned.id === "soul_beacon") this.pickupBonus = 42;
      }
      // Ewiger Winter: dauerhafte Aura statt Cooldown-Schuss.
      if (def.behavior === "eternal_winter") {
        this.updateWinter(ctx, stats, state);
        owned.timer = 0;
        continue;
      }
      if (owned.timer > 0) continue;
      if (alive.length === 0) {
        owned.timer = 0;
        continue;
      }
      switch (def.behavior) {
        case "ember": this.fireEmber(owned, ctx, stats, alive); break;
        case "flail": this.fireFlail(owned, ctx, stats, state); break;
        case "frost": this.fireFrost(owned, ctx, stats); break;
        case "thorn": this.fireThorn(owned, ctx, stats); break;
        case "storm": this.fireStorm(owned, ctx, stats, alive); break;
        case "lantern": this.fireLantern(owned, ctx, stats, state); break;
        case "phoenix": this.firePhoenix(owned, ctx, stats, alive); break;
        case "wrath_pendulum": this.fireFlail(owned, ctx, stats, state); break;
        case "thorn_storm": this.fireThornStorm(owned, ctx, stats); break;
        case "thunder_seal": this.fireThunderSeal(owned, ctx, stats); break;
        case "soul_beacon": this.fireLantern(owned, ctx, stats, state); break;
        default: break;
      }
      owned.timer = effectiveCooldown(stats.cooldown, ctx.agg);
    }
  }

  // ── Ember ─────────────────────────────────────────────────────
  private fireEmber(owned: OwnedWeapon, ctx: CombatContext, stats: ReturnType<typeof weaponLevel>, enemies: EnemyRuntime[]): void {
    const count = Math.max(1, stats.count ?? 1);
    const sorted = enemies
      .map((e) => ({ e, d: (e.x - ctx.playerX) ** 2 + (e.y - ctx.playerY) ** 2 }))
      .sort((a, b) => a.d - b.d);
    const damage = effectiveDamage(stats.damage, ctx.agg);
    const speed = stats.speed ?? 200;
    const baseAngle = Math.atan2(sorted[0].e.y - ctx.playerY, sorted[0].e.x - ctx.playerX);
    for (let i = 0; i < count; i++) {
      const target = sorted[i]?.e;
      const angle = target
        ? Math.atan2(target.y - ctx.playerY, target.x - ctx.playerX)
        : baseAngle + (i - (count - 1) / 2) * 0.16;
      this.projectiles.spawn({
        x: ctx.playerX + Math.cos(angle) * 10,
        y: ctx.playerY + Math.sin(angle) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage,
        pierce: stats.pierce ?? 0,
        knockback: stats.knockback ?? 20,
        life: effectiveDuration(2.6, ctx.agg),
        weaponId: owned.id,
        texture: "projectile_ember",
        radius: effectiveRadius(4, ctx.agg),
        target: target ?? null,
        trail: "projectile_ember",
        trailInterval: 0.05,
      });
    }
  }

  // ── Phönixschwarm ────────────────────────────────────────────
  private firePhoenix(owned: OwnedWeapon, ctx: CombatContext, stats: ReturnType<typeof weaponLevel>, enemies: EnemyRuntime[]): void {
    const count = Math.max(1, stats.count ?? 2);
    const damage = effectiveDamage(stats.damage, ctx.agg);
    const speed = stats.speed ?? 210;
    const sorted = enemies
      .map((e) => ({ e, d: (e.x - ctx.playerX) ** 2 + (e.y - ctx.playerY) ** 2 }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < count; i++) {
      const target = sorted[i % Math.max(1, sorted.length)]?.e ?? null;
      const angle = target
        ? Math.atan2(target.y - ctx.playerY, target.x - ctx.playerX)
        : Math.atan2(ctx.facingY, ctx.facingX) + (i - (count - 1) / 2) * 0.25;
      this.projectiles.spawn({
        x: ctx.playerX + Math.cos(angle) * 12,
        y: ctx.playerY + Math.sin(angle) * 12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage,
        pierce: 0,
        knockback: stats.knockback ?? 32,
        life: 2.8,
        weaponId: owned.id,
        texture: "projectile_phoenix",
        radius: effectiveRadius(6, ctx.agg),
        target,
        trail: "projectile_phoenix",
        trailInterval: 0.04,
        // Normal-Blend, damit Flügel/Kontur des Feuervogels klar lesbar bleiben;
        // der Trail bleibt additiv (siehe updateProjectiles).
        blendAdd: false,
        explodeRadius: effectiveRadius(34, ctx.agg),
      });
    }
  }

  // ── Flail ─────────────────────────────────────────────────────
  private fireFlail(owned: OwnedWeapon, ctx: CombatContext, stats: ReturnType<typeof weaponLevel>, state: WeaponState): void {
    const damage = effectiveDamage(stats.damage, ctx.agg);
    const radius = effectiveRadius(stats.radius ?? 34, ctx.agg);
    const evolved = owned.id === "wrath_pendulum";
    const count = evolved ? 1 : Math.max(1, stats.count ?? 1);
    const base = Math.atan2(ctx.facingY, ctx.facingX);
    const dur = evolved ? 0.32 : 0.24;
    for (let i = 0; i < count; i++) {
      const side = i === 0 ? 1 : -1;
      const sprite = this.scene.add.image(ctx.playerX, ctx.playerY, "flail_ball")
        .setDepth(11)
        .setScale(1 + radius / 140)
        .setBlendMode(Phaser.BlendModes.NORMAL);
      state.swings.push({
        sprite,
        weaponId: owned.id,
        baseAngle: i === 0 ? base : base + Math.PI,
        side,
        halfArc: evolved ? Math.PI : Math.PI / 2.2,
        radius,
        damage,
        knockback: stats.knockback ?? 50,
        hit: new Set(),
        t: 0,
        dur,
        heal: evolved ? 2 : 0,
      });
    }
    this.fx.burst("fx_spark", ctx.playerX + Math.cos(base) * 12, ctx.playerY + Math.sin(base) * 12, 4, {
      tint: PAL[C.fog], life: 0.18, additive: false,
    });
  }

  private updateSwings(ctx: CombatContext): void {
    for (const state of this.states.values()) {
      for (let i = state.swings.length - 1; i >= 0; i--) {
        const s = state.swings[i];
        s.t += ctx.dt;
        const p = Math.min(1, s.t / s.dur);
        const eased = p * p * (3 - 2 * p);
        const angle = s.baseAngle + s.side * (-s.halfArc + eased * s.halfArc * 2);
        const bx = ctx.playerX + Math.cos(angle) * s.radius;
        const by = ctx.playerY + Math.sin(angle) * s.radius;
        s.sprite.setPosition(Math.round(bx), Math.round(by));
        s.sprite.setRotation(angle + this.clock * 7);
        this.fx.spawn({
          texture: "flail_ball", x: bx, y: by, life: 0.14,
          scaleFrom: 0.75, scaleTo: 0.2, alphaFrom: 0.55, alphaTo: 0,
          additive: false, tint: PAL[C.blueGrey],
        });
        // Treffer: ganzer Sektor, jeder Gegner nur einmal pro Schwung.
        this.scratch.length = 0;
        ctx.hash.queryCircle(ctx.playerX, ctx.playerY, s.radius + 12, this.scratch);
        for (const e of this.scratch) {
          if (!e.alive || e.hp <= 0 || s.hit.has(e.uid)) continue;
          const dx = e.x - ctx.playerX;
          const dy = e.y - ctx.playerY;
          if (Math.hypot(dx, dy) > s.radius + e.radius) continue;
          if (angleDiff(Math.atan2(dy, dx), s.baseAngle) > s.halfArc) continue;
          s.hit.add(e.uid);
          const kb = knockbackVector(ctx.playerX, ctx.playerY, e.x, e.y, s.knockback);
          e.vx += kb.vx;
          e.vy += kb.vy;
          const killed = this.hitEnemy(e, s.damage, ctx, s.weaponId);
          if (killed) this.killsFx(e);
          if (s.heal > 0) ctx.onHeal?.(s.heal);
        }
        if (p >= 1) {
          s.sprite.destroy();
          state.swings.splice(i, 1);
        }
      }
    }
  }

  // ── Frost ─────────────────────────────────────────────────────
  private fireFrost(owned: OwnedWeapon, ctx: CombatContext, stats: ReturnType<typeof weaponLevel>): void {
    const radius = effectiveRadius(stats.radius ?? 38, ctx.agg);
    const damage = effectiveDamage(stats.damage, ctx.agg);
    const slow = stats.slow ?? 0.3;
    const freeze = effectiveDuration(stats.freeze ?? 0.3, ctx.agg);
    for (const e of ctx.enemies) {
      if (!e.alive || e.hp <= 0) continue;
      const d = Math.hypot(e.x - ctx.playerX, e.y - ctx.playerY);
      if (d > radius + e.radius) continue;
      e.slowFactor = Math.max(e.slowFactor, slow);
      e.slowTimer = Math.max(e.slowTimer, 1.4);
      e.freezeTimer = Math.max(e.freezeTimer, freeze);
      const killed = this.hitEnemy(e, damage, ctx, owned.id);
      if (killed) this.killsFx(e);
    }
    this.fx.spawn({
      texture: "ring_frost", x: ctx.playerX, y: ctx.playerY, life: 0.5,
      scaleFrom: 0.35, scaleTo: radius / 42, alphaFrom: 0.9, alphaTo: 0,
      additive: true,
    });
    this.fx.burst("fx_spark", ctx.playerX, ctx.playerY, 10, {
      tint: PAL[C.paleMist], life: 0.4, additive: true, scaleTo: 0.3,
    });
  }

  // ── Thorn ─────────────────────────────────────────────────────
  private fireThorn(owned: OwnedWeapon, ctx: CombatContext, stats: ReturnType<typeof weaponLevel>): void {
    const count = Math.max(1, stats.count ?? 3);
    const damage = effectiveDamage(stats.damage, ctx.agg);
    const speed = stats.speed ?? 240;
    const base = Math.atan2(ctx.facingY, ctx.facingX);
    const spread = 0.85;
    for (let i = 0; i < count; i++) {
      const angle = base + (i - (count - 1) / 2) * (spread / Math.max(1, count - 1));
      this.projectiles.spawn({
        x: ctx.playerX + Math.cos(angle) * 9,
        y: ctx.playerY + Math.sin(angle) * 9,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage,
        pierce: stats.pierce ?? 0,
        knockback: stats.knockback ?? 12,
        life: effectiveDuration(1.2, ctx.agg),
        weaponId: owned.id,
        texture: "projectile_thorn",
        radius: effectiveRadius(4, ctx.agg),
        trail: "projectile_thorn",
        trailInterval: 0.06,
      });
    }
  }

  // ── Dornensturm ──────────────────────────────────────────────
  private fireThornStorm(owned: OwnedWeapon, ctx: CombatContext, stats: ReturnType<typeof weaponLevel>): void {
    const count = Math.max(1, stats.count ?? 12);
    const damage = effectiveDamage(stats.damage, ctx.agg);
    const speed = stats.speed ?? 260;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + this.clock * 0.4;
      this.projectiles.spawn({
        x: ctx.playerX + Math.cos(angle) * 9,
        y: ctx.playerY + Math.sin(angle) * 9,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage,
        pierce: 999,
        knockback: stats.knockback ?? 20,
        life: 1.5,
        weaponId: owned.id,
        texture: "projectile_thorn",
        radius: effectiveRadius(5, ctx.agg),
        trail: "projectile_thorn",
        trailInterval: 0.05,
      });
    }
    this.fx.spawn({
      texture: "ring_burst", x: ctx.playerX, y: ctx.playerY, life: 0.25,
      scaleFrom: 0.3, scaleTo: 1.4, alphaFrom: 0.7, alphaTo: 0, additive: true,
    });
  }

  // ── Gewittersiegel ───────────────────────────────────────────
  private fireThunderSeal(owned: OwnedWeapon, ctx: CombatContext, stats: ReturnType<typeof weaponLevel>): void {
    const count = Math.max(1, stats.count ?? 1);
    for (let i = 0; i < count; i++) {
      const angle = this.clock + (i / count) * Math.PI * 2;
      const x = ctx.playerX + Math.cos(angle) * 26;
      const y = ctx.playerY + Math.sin(angle) * 26;
      const sprite = this.scene.add.image(x, y, "ring_seal")
        .setDepth(6)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.0)
        .setScale(1.4);
      this.seals.push({
        x, y, timer: 0.55, damage: effectiveDamage(stats.damage, ctx.agg),
        chain: stats.chain ?? 8, weaponId: owned.id, sprite,
      });
    }
  }

  private updateSeals(ctx: CombatContext): void {
    for (let i = this.seals.length - 1; i >= 0; i--) {
      const seal = this.seals[i];
      seal.timer -= ctx.dt;
      const p = 1 - Math.max(0, seal.timer) / 0.55;
      seal.sprite.setAlpha(0.25 + p * 0.65);
      seal.sprite.setScale(1.4 + Math.sin(this.clock * 12) * 0.15);
      if (seal.timer > 0) continue;
      seal.sprite.destroy();
      this.seals.splice(i, 1);
      // Kettenblitz ausgehend vom Siegel.
      const hit = new Set<number>();
      let last = { x: seal.x, y: seal.y };
      // Genau `chain` Ziele insgesamt (Initialziel + Sprünge), nicht chain+1.
      for (let jump = 0; jump < seal.chain; jump++) {
        let next: EnemyRuntime | null = null;
        let best = 150 * 150;
        for (const e of ctx.enemies) {
          if (!e.alive || e.hp <= 0 || hit.has(e.uid)) continue;
          const d = (e.x - last.x) ** 2 + (e.y - last.y) ** 2;
          if (d < best) { best = d; next = e; }
        }
        if (!next) break;
        this.fx.beam("bolt_seg", last.x, last.y, next.x, next.y, { life: 0.32, tint: PAL[C.lanternWhite] });
        this.fx.spawn({
          texture: "ring_seal", x: next.x, y: next.y, life: 0.3,
          scaleFrom: 0.1, scaleTo: 0.46, alphaFrom: 1, alphaTo: 0, additive: true,
        });
        const killed = this.hitEnemy(next, Math.round(seal.damage * (jump === 0 ? 1 : 0.7)), ctx, seal.weaponId);
        if (killed) this.killsFx(next);
        hit.add(next.uid);
        last = next;
      }
    }
  }

  // ── Ewiger Winter ────────────────────────────────────────────
  private updateWinter(ctx: CombatContext, stats: ReturnType<typeof weaponLevel>, state: WeaponState): void {
    const radius = effectiveRadius(stats.radius ?? 64, ctx.agg);
    state.auraTick -= ctx.dt;
    if (state.auraTick <= 0) {
      state.auraTick = 0.4;
      const tickDamage = effectiveDamage(Math.max(1, Math.round(stats.damage * 0.28)), ctx.agg);
      for (const e of ctx.enemies) {
        if (!e.alive || e.hp <= 0) continue;
        if ((e.x - ctx.playerX) ** 2 + (e.y - ctx.playerY) ** 2 > (radius + e.radius) ** 2) continue;
        e.slowFactor = Math.max(e.slowFactor, stats.slow ?? 0.5);
        e.slowTimer = Math.max(e.slowTimer, 1.0);
        e.freezeTimer = Math.max(e.freezeTimer, 0.18);
        const killed = this.hitEnemy(e, tickDamage, ctx, "eternal_winter");
        if (killed) this.killsFx(e);
      }
      this.fx.spawn({
        texture: "ring_frost", x: ctx.playerX, y: ctx.playerY, life: 0.45,
        scaleFrom: radius / 46, scaleTo: radius / 42, alphaFrom: 0.35, alphaTo: 0,
        additive: true,
      });
    }
    state.spikeTimer -= ctx.dt;
    if (state.spikeTimer <= 0) {
      state.spikeTimer = 1.35;
      const count = Math.max(6, stats.count ?? 10);
      const spikeDamage = effectiveDamage(stats.damage, ctx.agg);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + this.clock;
        this.projectiles.spawn({
          x: ctx.playerX + Math.cos(angle) * 14,
          y: ctx.playerY + Math.sin(angle) * 14,
          vx: Math.cos(angle) * 250,
          vy: Math.sin(angle) * 250,
          damage: spikeDamage,
          pierce: 2,
          knockback: 20,
          life: 1.1,
          weaponId: "eternal_winter",
          texture: "projectile_ice",
          radius: effectiveRadius(5, ctx.agg),
          trail: "projectile_ice",
          trailInterval: 0.06,
          blendAdd: true,
        });
      }
    }
  }

  // ── Storm ─────────────────────────────────────────────────────
  private fireStorm(owned: OwnedWeapon, ctx: CombatContext, stats: ReturnType<typeof weaponLevel>, enemies: EnemyRuntime[]): void {
    const visible = enemies.filter((e) =>
      Math.abs(e.x - ctx.playerX) < 290 && Math.abs(e.y - ctx.playerY) < 190);
    const pool = visible.length > 0 ? visible : enemies;
    const count = Math.max(1, stats.count ?? 1);
    const chain = stats.chain ?? 0;
    const damage = effectiveDamage(stats.damage, ctx.agg);
    for (let i = 0; i < count; i++) {
      const target = ctx.rng.pick(pool);
      if (!target || !target.alive || target.hp <= 0) continue;
      this.strike(ctx, target, damage, owned.id);
      let last = target;
      let jumps = 0;
      const hit = new Set<number>([target.uid]);
      while (jumps < chain && jumps < 8) {
        let next: EnemyRuntime | null = null;
        let best = 110 * 110;
        for (const e of enemies) {
          if (!e.alive || e.hp <= 0 || hit.has(e.uid)) continue;
          const d = (e.x - last.x) ** 2 + (e.y - last.y) ** 2;
          if (d < best) { best = d; next = e; }
        }
        if (!next) break;
        this.fx.beam("bolt_seg", last.x, last.y, next.x, next.y, { life: 0.3, tint: PAL[C.lanternWhite] });
        this.strike(ctx, next, Math.round(damage * 0.75), owned.id);
        hit.add(next.uid);
        last = next;
        jumps++;
      }
    }
  }

  private strike(ctx: CombatContext, e: EnemyRuntime, damage: number, weaponId: string): void {
    this.fx.beam("bolt_seg", e.x, e.y - 70, e.x, e.y, { life: 0.4, additive: true, tint: PAL[C.lanternWhite] });
    this.fx.spawn({
      texture: "ring_seal", x: e.x, y: e.y, life: 0.45,
      scaleFrom: 0.1, scaleTo: 0.5, alphaFrom: 1, alphaTo: 0, additive: true,
    });
    this.fx.spawn({
      texture: "orb_lantern", x: e.x, y: e.y, life: 0.45,
      scaleFrom: 0.4, scaleTo: 1.4, alphaFrom: 0.9, alphaTo: 0, additive: true,
    });
    this.fx.burst("fx_spark", e.x, e.y, 6, { tint: PAL[C.glow], life: 0.3, additive: true });
    const killed = this.hitEnemy(e, damage, ctx, weaponId);
    if (killed) this.killsFx(e);
  }

  // ── Lantern ───────────────────────────────────────────────────
  private fireLantern(owned: OwnedWeapon, ctx: CombatContext, stats: ReturnType<typeof weaponLevel>, state: WeaponState): void {
    const count = Math.max(1, stats.count ?? 1);
    const radius = effectiveRadius(stats.radius ?? 34, ctx.agg);
    state.orbTimeLeft = effectiveDuration(stats.duration ?? 2.4, ctx.agg);
    state.orbDamage = effectiveDamage(stats.damage, ctx.agg);
    state.orbRadius = radius;
    const evolved = owned.id === "soul_beacon";
    while (state.orbs.length < count) {
      const sprite = this.scene.add.image(ctx.playerX, ctx.playerY, evolved ? "orb_soul" : "orb_lantern")
        .setDepth(11)
        .setScale(evolved ? 1.25 : 1)
        .setBlendMode(Phaser.BlendModes.ADD);
      state.orbs.push({ sprite, phase: (state.orbs.length / count) * Math.PI * 2 });
    }
    for (const orb of state.orbs) orb.sprite.setVisible(true);
  }

  private updateOrbs(ctx: CombatContext): void {
    for (const [id, state] of this.states) {
      const active = state.orbTimeLeft > 0;
      // Abgelaufene Treffer-Cooldowns entfernen: UIDs werden nie wiederverwendet,
      // sonst wächst die Map in langen Runs unbegrenzt.
      if (state.orbHitAt.size > 256) {
        for (const [uid, until] of state.orbHitAt) {
          if (until < this.clock) state.orbHitAt.delete(uid);
        }
      }
      const count = state.orbs.length;
      for (let i = 0; i < count; i++) {
        const orb = state.orbs[i];
        if (!active) {
          orb.sprite.setVisible(false);
          continue;
        }
        const angle = this.clock * (id === "soul_beacon" ? 2.6 : 2.1) + orb.phase;
        const ox = ctx.playerX + Math.cos(angle) * state.orbRadius;
        const oy = ctx.playerY + Math.sin(angle) * state.orbRadius;
        orb.sprite.setPosition(Math.round(ox), Math.round(oy));
        orb.sprite.setAlpha(0.65 + Math.sin(this.clock * 6 + orb.phase) * 0.25);
        this.fx.spawn({
          texture: id === "soul_beacon" ? "orb_soul" : "orb_lantern",
          x: ox, y: oy, life: 0.2, scaleFrom: 0.6, scaleTo: 0.2,
          alphaFrom: 0.35, alphaTo: 0, additive: true,
        });
        for (const e of ctx.enemies) {
          if (!e.alive || e.hp <= 0) continue;
          if ((e.x - ox) ** 2 + (e.y - oy) ** 2 > (e.radius + 9) ** 2) continue;
          const next = state.orbHitAt.get(e.uid) ?? 0;
          if (this.clock < next) continue;
          state.orbHitAt.set(e.uid, this.clock + 0.3);
          const killed = this.hitEnemy(e, state.orbDamage, ctx, id);
          if (killed) this.killsFx(e);
        }
      }
    }
  }

  // ── Projektile ────────────────────────────────────────────────
  private updateProjectiles(ctx: CombatContext): void {
    for (const p of this.projectiles.active) {
      if (!p.active) continue;
      p.life -= ctx.dt;
      if (p.target && p.target.alive && p.target.uid === p.targetUid) {
        const desired = Math.atan2(p.target.y - p.y, p.target.x - p.x);
        const current = Math.atan2(p.vy, p.vx);
        let diff = desired - current;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.max(-6 * ctx.dt, Math.min(6 * ctx.dt, diff));
        const speed = Math.hypot(p.vx, p.vy);
        const angle = current + turn;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
      }
      p.x += p.vx * ctx.dt;
      p.y += p.vy * ctx.dt;
      p.sprite.setPosition(Math.round(p.x), Math.round(p.y));
      p.sprite.setRotation(Math.atan2(p.vy, p.vx));
      if (p.trail) {
        p.trailTimer -= ctx.dt;
        if (p.trailTimer <= 0) {
          p.trailTimer = p.trailInterval;
          // Feuervogel-Trail bleibt warm und additiv, auch wenn das Projektil selbst
          // mit Normal-Blend (klare Flügel/Kontur) gerendert wird.
          const phoenixTrail = p.weaponId === "phoenix";
          this.fx.spawn({
            texture: p.trail, x: p.x, y: p.y, life: 0.22,
            scaleFrom: p.sprite.scaleX * 0.8, scaleTo: 0.15,
            alphaFrom: 0.45, alphaTo: 0, additive: p.blendAdd || phoenixTrail,
            tint: p.blendAdd || phoenixTrail ? undefined : PAL[C.fog],
          });
        }
      }
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      this.scratch.length = 0;
      ctx.hash.queryCircle(p.x, p.y, p.radius + 16, this.scratch);
      for (const e of this.scratch) {
        if (!e.alive || e.hp <= 0 || p.hit.has(e.uid)) continue;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > (e.radius + p.radius) ** 2) continue;
        p.hit.add(e.uid);
        const kb = knockbackVector(p.x, p.y, e.x, e.y, p.knockback);
        e.vx += kb.vx;
        e.vy += kb.vy;
        const killed = this.hitEnemy(e, p.damage, ctx, p.weaponId);
        if (killed) this.killsFx(e);
        if (p.explodeRadius > 0) {
          this.explode(ctx, p.x, p.y, p.explodeRadius, Math.round(p.damage * 0.6), p.weaponId);
          p.active = false;
          break;
        }
        if (p.pierce <= 0) {
          p.active = false;
          break;
        }
        p.pierce -= 1;
      }
    }
    this.projectiles.compact();
  }

  private explode(ctx: CombatContext, x: number, y: number, radius: number, damage: number, weaponId: string): void {
    this.fx.spawn({
      texture: "ring_burst", x, y, life: 0.3, scaleFrom: 0.2, scaleTo: radius / 42,
      alphaFrom: 1, alphaTo: 0, additive: true,
    });
    this.fx.burst("projectile_ember", x, y, 8, { life: 0.3, additive: true });
    if (weaponId === "phoenix") this.addBurn(x, y, radius, 3.2, 18, weaponId);
    for (const e of ctx.enemies) {
      if (!e.alive || e.hp <= 0) continue;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 > (radius + e.radius) ** 2) continue;
      const killed = this.hitEnemy(e, damage, ctx, weaponId);
      if (killed) this.killsFx(e);
    }
  }

  private hitEnemy(e: EnemyRuntime, damage: number, ctx: CombatContext, weaponId: string): boolean {
    const wasAlive = e.hp > 0;
    e.hp -= damage;
    e.flash = 0.12;
    const killed = wasAlive && e.hp <= 0;
    ctx.onHit(e, damage, weaponId, killed);
    this.fx.burst("fx_spark", e.x, e.y, 2, { life: 0.14, tint: PAL[C.emberOrange], scaleTo: 0.12, alphaFrom: 0.7 });
    return killed;
  }

  private killsFx(e: EnemyRuntime): void {
    this.fx.burst("fx_spark", e.x, e.y, 5, { life: 0.26, tint: PAL[C.flame], scaleTo: 0.15, alphaFrom: 0.8 });
  }

  // ── Brandflächen (Evolution) ─────────────────────────────────
  private burns: { x: number; y: number; r: number; life: number; tick: number; dps: number; weaponId: string; sprite: Phaser.GameObjects.Image }[] = [];

  addBurn(x: number, y: number, r: number, life: number, dps: number, weaponId: string): void {
    const sprite = this.scene.add.image(x, y, "ring_burst")
      .setDepth(6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55)
      .setScale(r / 42);
    this.burns.push({ x, y, r, life, tick: 0, dps, weaponId, sprite });
  }

  private updateBurns(ctx: CombatContext): void {
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      b.life -= ctx.dt;
      b.tick -= ctx.dt;
      b.sprite.setAlpha(Math.max(0, Math.min(0.55, b.life)) * (0.7 + Math.sin(this.clock * 9) * 0.3));
      if (b.life <= 0) {
        b.sprite.destroy();
        this.burns.splice(i, 1);
        continue;
      }
      if (b.tick > 0) continue;
      b.tick = 0.25;
      for (const e of ctx.enemies) {
        if (!e.alive || e.hp <= 0) continue;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 > (b.r + e.radius) ** 2) continue;
        const killed = this.hitEnemy(e, Math.round(b.dps * 0.25), ctx, b.weaponId);
        if (killed) this.killsFx(e);
      }
    }
  }

  /**
   * Entfernt den Runtime-State einer Waffe, z. B. wenn eine Evolution die
   * Basiswaffe im Slot ersetzt. Ohne das würden alte Orbs/Swings weiterleben.
   */
  clearWeaponState(id: string): void {
    const state = this.states.get(id);
    if (!state) return;
    for (const s of state.swings) s.sprite.destroy();
    for (const orb of state.orbs) orb.sprite.destroy();
    this.states.delete(id);
  }

  clear(): void {
    for (const state of this.states.values()) {
      for (const s of state.swings) s.sprite.destroy();
      for (const orb of state.orbs) orb.sprite.destroy();
    }
    this.states.clear();
    for (const b of this.burns) b.sprite.destroy();
    this.burns.length = 0;
    for (const s of this.seals) s.sprite.destroy();
    this.seals.length = 0;
    this.projectiles.releaseAll();
    this.fx.clear();
  }
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}
