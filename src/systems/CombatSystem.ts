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
import { FxSystem, ParticleSystem } from "./FxSystem";
import { fxFrames } from "../gfx/gen-fx";
import { DEPTH } from "../gfx/depth";
import { DamageNumberSystem } from "./DamageNumbers";
import { deathClassFor, deathFxFor } from "../logic/death";
import { knockbackFor } from "../logic/feedback";
import { rollCrit, critDamage } from "../logic/damage-numbers";
import { lodFor, type LodState } from "../logic/lod";
import { getAudio } from "../audio/AudioSystem";
import { ProjectilePool } from "./ProjectilePool";
import type { SpatialHash } from "./SpatialHash";
import type { OwnedWeapon } from "./LevelUpSystem";

export type HitCallback = (enemy: EnemyRuntime, damage: number, weaponId: string, killed: boolean) => void;

/**
 * M6-Balance: Ein aktiver Boss im Umkreis von 320 px ist das Ziel des ersten
 * Projektils je Salve. Die übrigen Projektile bleiben auf dem nächsten Trash,
 * damit die Adds nicht außer Kontrolle geraten. Ohne diesen Boss-Fokus schwankt
 * die Bossdauer zwischen 13 und 99 s (Boss im Getümmel unverwundet).
 */
function bossNearby(enemies: readonly EnemyRuntime[], px: number, py: number): EnemyRuntime | null {
  for (const e of enemies) {
    if (!e.alive || e.hp <= 0 || !e.boss) continue;
    if ((e.x - px) ** 2 + (e.y - py) ** 2 <= 320 * 320) return e;
  }
  return null;
}

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
  halo?: Phaser.GameObjects.Image;
  phase: number;
}

interface Swing {
  sprite: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  links: Phaser.GameObjects.Image[];
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
  /** Eigener Partikel-Pool (Funken/Splitter/Staub), nicht der Effekt-Cap. */
  readonly particles: ParticleSystem;
  readonly damageNumbers: DamageNumberSystem;
  private lod: LodState = lodFor(0);
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
    this.particles = new ParticleSystem(scene);
    this.damageNumbers = new DamageNumberSystem(scene);
  }

  setLod(lod: LodState): void {
    this.lod = lod;
    this.fx.setMaxActive(lod.fxCap);
    this.particles.setMaxActive(lod.particleCap);
    this.fx.trailsEnabled = lod.trails;
    this.damageNumbers.setLod(lod);
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
    this.particles.update(ctx.dt);
    this.damageNumbers.update(ctx.dt, this.scene.cameras.main);
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
      getAudio().playWeapon(owned.id);
    }
  }

  // ── Ember ─────────────────────────────────────────────────────
  private fireEmber(owned: OwnedWeapon, ctx: CombatContext, stats: ReturnType<typeof weaponLevel>, enemies: EnemyRuntime[]): void {
    const count = Math.max(1, stats.count ?? 1);
    const sorted = enemies
      .map((e) => ({ e, d: (e.x - ctx.playerX) ** 2 + (e.y - ctx.playerY) ** 2 }))
      .sort((a, b) => a.d - b.d);
    const bossTarget = bossNearby(enemies, ctx.playerX, ctx.playerY);
    const damage = effectiveDamage(stats.damage, ctx.agg);
    const speed = stats.speed ?? 200;
    const baseAngle = Math.atan2(sorted[0].e.y - ctx.playerY, sorted[0].e.x - ctx.playerX);
    for (let i = 0; i < count; i++) {
      const target = (i === 0 ? bossTarget : null) ?? sorted[i]?.e;
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
        trail: "fx_fire",
        trailFrames: fxFrames("fx_fire", 6),
        trailInterval: 0.05,
      });
      // Mündungsglut: kurzer weißer Kern + Halo.
      this.fx.spawnAnim("fx_fire", ctx.playerX + Math.cos(angle) * 10, ctx.playerY + Math.sin(angle) * 10, {
        life: 0.22, scaleFrom: 0.9, scaleTo: 0.2, alphaFrom: 0.95, alphaTo: 0, additive: true,
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
    const bossTarget = bossNearby(enemies, ctx.playerX, ctx.playerY);
    for (let i = 0; i < count; i++) {
      const target = (i === 0 ? bossTarget : null) ?? sorted[i % Math.max(1, sorted.length)]?.e ?? null;
      // Fächer: mehrere Vögel dürfen nicht exakt auf derselben Linie starten,
      // sonst überlappen sie zu einem einzigen Sprite und der "Schwarm" ist unsichtbar.
      const fan = (i - (count - 1) / 2) * 0.14;
      const angle = target
        ? Math.atan2(target.y - ctx.playerY, target.x - ctx.playerX) + fan
        : Math.atan2(ctx.facingY, ctx.facingX) + fan;
      const launch = 12 + i * 6;
      const birdSpeed = speed * (0.95 + i * 0.03);
      this.projectiles.spawn({
        x: ctx.playerX + Math.cos(angle) * launch,
        y: ctx.playerY + Math.sin(angle) * launch,
        vx: Math.cos(angle) * birdSpeed,
        vy: Math.sin(angle) * birdSpeed,
        damage,
        pierce: 0,
        knockback: stats.knockback ?? 32,
        life: 2.8,
        weaponId: owned.id,
        texture: "projectile_phoenix",
        radius: effectiveRadius(6, ctx.agg),
        target,
        trail: "fx_fire",
        trailFrames: fxFrames("fx_fire", 6),
        trailInterval: 0.04,
        // Normal-Blend, damit Flügel/Kontur des Feuervogels klar lesbar bleiben;
        // der Trail bleibt additiv (siehe updateProjectiles).
        blendAdd: false,
        explodeRadius: effectiveRadius(34, ctx.agg),
      });
    }
    this.fx.spawnAnim("fx_fire", ctx.playerX, ctx.playerY, {
      life: 0.30, scaleFrom: 1.4, scaleTo: 0.3, alphaFrom: 1, alphaTo: 0, additive: true,
    });
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
        .setDepth(DEPTH.fxLow)
        .setScale(1 + radius / 140)
        .setBlendMode(Phaser.BlendModes.NORMAL);
      const links: Phaser.GameObjects.Image[] = [];
      for (let li = 0; li < 8; li++) {
        links.push(this.scene.add.image(ctx.playerX, ctx.playerY, "chain_link")
          .setDepth(DEPTH.trail).setScale(1).setAlpha(0.85));
      }
      const halo = this.scene.add.image(ctx.playerX, ctx.playerY, "fx_halo")
        .setDepth(DEPTH.trail)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(evolved ? PAL[C.fogBlue] : PAL[C.boneLight])
        .setScale(radius / 18)
        .setAlpha(0.55);
      state.swings.push({
        sprite,
        halo,
        links,
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
    // Bewegungsunschärfe-Bogen (Smear-Frames): Metallbogen mit hellem Kern.
    this.fx.spawnAnim("fx_smear", ctx.playerX, ctx.playerY, {
      life: dur * 1.25, scaleFrom: radius / 20, scaleTo: radius / 19,
      alphaFrom: evolved ? 0.95 : 0.75, alphaTo: 0,
      rotation: base + Math.PI / 2,
      tint: evolved ? PAL[C.amber] : PAL[C.boneLight],
      additive: false,
    });
    if (evolved) {
      this.fx.spawnAnim("fx_halo", ctx.playerX, ctx.playerY, {
        life: 0.3, scaleFrom: radius / 12, scaleTo: radius / 9,
        alphaFrom: 0.8, alphaTo: 0, additive: true,
      });
    }
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
        s.halo.setPosition(Math.round(bx), Math.round(by));
        s.halo.setAlpha(0.35 + Math.sin(this.clock * 14) * 0.18);
        // Bewegungsunschärfe-Bogen direkt am Kugelkopf (deutlich sichtbar).
        if (this.fx.trailsEnabled && (Math.floor(s.t * 60) & 1) === 0) {
          this.fx.spawnAnim("fx_smear", bx, by, {
            life: 0.16, scaleFrom: 0.7, scaleTo: 1.0, alphaFrom: 0.95, alphaTo: 0,
            rotation: angle + Math.PI / 2,
            tint: s.weaponId === "wrath_pendulum" ? PAL[C.amber] : PAL[C.candleWhite],
            additive: false,
          });
        }
        // Echte Kettenglieder entlang einer leicht durchhängenden Linie (nicht gestreckt).
        const cdx = bx - ctx.playerX;
        const cdy = by - ctx.playerY;
        const clen = Math.hypot(cdx, cdy) || 1;
        const cang = Math.atan2(cdy, cdx) + Math.PI / 2;
        s.links.forEach((link, li) => {
          const t = (li + 1) / (s.links.length + 1);
          const sag = Math.sin(t * Math.PI) * 4;
          link.setPosition(
            Math.round(ctx.playerX + cdx * t - (cdy / clen) * sag),
            Math.round(ctx.playerY + cdy * t + (cdx / clen) * sag),
          );
          link.setRotation(cang);
          link.setAlpha(0.9);
        });
        this.fx.spawn({
          texture: "flail_ball", x: bx, y: by, life: 0.22,
          scaleFrom: 0.6, scaleTo: 0.25, alphaFrom: 0.8, alphaTo: 0,
          additive: false, tint: s.weaponId === "wrath_pendulum" ? PAL[C.amber] : PAL[C.blueGrey],
        });
        // Funken am Kugelkopf (nur jeder zweite Frame, spart Draw-Aufrufe).
        if ((Math.floor(s.t * 60) & 1) === 0) {
          this.particles.spawn({
            texture: "fx_star", x: bx, y: by, life: 0.14,
            scaleFrom: 0.7, scaleTo: 0.2, alphaFrom: 0.9, alphaTo: 0,
            additive: true, tint: s.weaponId === "wrath_pendulum" ? PAL[C.lantern] : PAL[C.boneLight],
            depth: DEPTH.fxLow,
          });
        }
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
          const mass = Math.max(0.6, Math.min(2.5, e.maxHp / 60));
          const kb = knockbackVector(ctx.playerX, ctx.playerY, e.x, e.y, knockbackFor(s.knockback, mass));
          e.vx += kb.vx;
          e.vy += kb.vy;
          const killed = this.hitEnemy(e, s.damage, ctx, s.weaponId);
          if (killed) this.killsFx(e);
          if (s.heal > 0) ctx.onHeal?.(s.heal);
        }
        if (p >= 1) {
          s.sprite.destroy();
          s.halo.destroy();
          for (const link of s.links) link.destroy();
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
      scaleFrom: 0.5, scaleTo: radius / 47, alphaFrom: 1, alphaTo: 0,
      // Normal-Blend: das Eis-Siegel soll blau-grau lesbar bleiben, nicht additiv ausbleichen.
      additive: false, tint: PAL[C.fogBlue],
    });
    // Eiskristalle/Splitter am Ring (keine Linienringe): 16 große Shards nach außen.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.particles.spawn({
        texture: "fx_ice",
        frames: fxFrames("fx_ice", 4),
        x: ctx.playerX + Math.cos(a) * radius * 0.70,
        y: ctx.playerY + Math.sin(a) * radius * 0.70,
        vx: Math.cos(a) * 24, vy: Math.sin(a) * 24,
        life: 0.7, scaleFrom: 1.5, scaleTo: 0.5,
        alphaFrom: 1, alphaTo: 0, rotation: a + Math.PI / 2,
        additive: false, tint: PAL[C.fogBlue], depth: DEPTH.fxLow,
      });
    }
    this.fx.spawnAnim("fx_halo", ctx.playerX, ctx.playerY, {
      life: 0.35, scaleFrom: radius / 14, scaleTo: radius / 11,
      alphaFrom: 0.8, alphaTo: 0, additive: true, tint: PAL[C.paleMist],
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
        scale: 1.6,
        trail: "fx_thorn",
        trailFrames: fxFrames("fx_thorn", 3),
        trailInterval: 0.06,
      });
      this.particles.spawn({
        texture: "fx_thorn", x: ctx.playerX + Math.cos(angle) * 9, y: ctx.playerY + Math.sin(angle) * 9,
        vx: Math.cos(angle) * 40, vy: Math.sin(angle) * 40, life: 0.2,
        scaleFrom: 0.7, scaleTo: 0.2, alphaFrom: 0.8, alphaTo: 0,
        additive: false, rotation: angle,
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
        scale: 1.7,
        trail: "fx_thorn",
        trailFrames: fxFrames("fx_thorn", 3),
        trailInterval: 0.05,
      });
    }
    this.fx.spawn({
      texture: "ring_burst", x: ctx.playerX, y: ctx.playerY, life: 0.25,
      scaleFrom: 0.3, scaleTo: 1.4, alphaFrom: 0.7, alphaTo: 0, additive: true,
    });
    this.fx.spawnAnim("fx_shock", ctx.playerX, ctx.playerY, {
      life: 0.36, scaleFrom: 0.5, scaleTo: 1.2, alphaFrom: 0.8, alphaTo: 0,
      tint: PAL[C.marshLight], additive: true,
    });
    // 16 große Dornen-Streaks nach außen: der Wirbel ist als Igelring lesbar.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + this.clock * 0.4;
      this.particles.spawn({
        texture: "fx_thorn", frames: fxFrames("fx_thorn", 3),
        x: ctx.playerX + Math.cos(a) * 16, y: ctx.playerY + Math.sin(a) * 16,
        vx: Math.cos(a) * 78, vy: Math.sin(a) * 78,
        life: 0.8, scaleFrom: 3.0, scaleTo: 0.8, alphaFrom: 1, alphaTo: 0,
        rotation: a + Math.PI / 2, additive: false, tint: PAL[C.amber],
      });
    }
  }

  // ── Gewittersiegel ───────────────────────────────────────────
  private fireThunderSeal(owned: OwnedWeapon, ctx: CombatContext, stats: ReturnType<typeof weaponLevel>): void {
    const count = Math.max(1, stats.count ?? 1);
    for (let i = 0; i < count; i++) {
      const angle = this.clock + (i / count) * Math.PI * 2;
      const x = ctx.playerX + Math.cos(angle) * 26;
      const y = ctx.playerY + Math.sin(angle) * 26;
      const sprite = this.scene.add.image(x, y, "fx_seal")
        .setDepth(DEPTH.decal)
        .setBlendMode(Phaser.BlendModes.NORMAL)
        .setAlpha(0.0)
        .setScale(1.8);
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
      const sealFrames = fxFrames("fx_seal", 5);
      const frame = sealFrames[Math.min(4, Math.floor(p * 5))];
      if (seal.sprite.texture.key !== frame) seal.sprite.setTexture(frame);
      seal.sprite.setAlpha(0.5 + p * 0.5);
      seal.sprite.setScale(1.9 + Math.sin(this.clock * 12) * 0.15);
      if (seal.timer > 0) continue;
      seal.sprite.destroy();
      this.seals.splice(i, 1);
      // Nachglühendes Siegel bleibt kurz stehen, damit der Einschlag lesbar ist.
      this.fx.spawnAnim("fx_seal", seal.x, seal.y, {
        life: 0.8, scaleFrom: 2.0, scaleTo: 2.6, alphaFrom: 0.9, alphaTo: 0,
        additive: false, tint: PAL[C.lanternWhite],
      });
      this.fx.spawnAnim("fx_halo", seal.x, seal.y, {
        life: 0.35, scaleFrom: 0.6, scaleTo: 1.4, alphaFrom: 0.9, alphaTo: 0, additive: true,
      });
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
        this.fx.bolt(last.x, last.y, next.x, next.y, { life: 0.5, tint: PAL[C.lanternWhite] });
        this.fx.spawnAnim("fx_seal", next.x, next.y, {
          life: 0.45, scaleFrom: 0.4, scaleTo: 1.0, alphaFrom: 1, alphaTo: 0,
          additive: false, tint: PAL[C.lantern],
        });
        this.particles.burst("fx_star", next.x, next.y, 4, {
          life: 0.22, scaleFrom: 0.8, scaleTo: 0.15, alphaFrom: 1, alphaTo: 0, tint: PAL[C.lanternWhite],
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
        scaleFrom: radius / 47, scaleTo: radius / 47, alphaFrom: 0.55, alphaTo: 0.2,
        additive: false,
      });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + this.clock * 0.3;
        this.particles.spawn({
          texture: "fx_ice", frames: fxFrames("fx_ice", 4),
          x: ctx.playerX + Math.cos(a) * radius * 0.82,
          y: ctx.playerY + Math.sin(a) * radius * 0.82,
          vx: Math.cos(a) * 18, vy: Math.sin(a) * 18,
          life: 0.6, scaleFrom: 1.3, scaleTo: 0.4, alphaFrom: 0.95, alphaTo: 0,
          rotation: a, additive: false, tint: PAL[C.fogBlue], depth: DEPTH.fxLow,
        });
      }
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
          trail: "fx_ice",
          trailFrames: fxFrames("fx_ice", 4),
          trailInterval: 0.06,
          blendAdd: true,
        });
      }
      this.fx.spawnAnim("fx_shock", ctx.playerX, ctx.playerY, {
        life: 0.4, scaleFrom: 0.4, scaleTo: 1.0, alphaFrom: 0.7, alphaTo: 0,
        tint: PAL[C.paleMist], additive: true,
      });
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
        this.fx.bolt(last.x, last.y, next.x, next.y, { life: 0.5, tint: PAL[C.lanternWhite] });
        this.strike(ctx, next, Math.round(damage * 0.75), owned.id);
        hit.add(next.uid);
        last = next;
        jumps++;
      }
    }
  }

  private strike(ctx: CombatContext, e: EnemyRuntime, damage: number, weaponId: string): void {
    // Gezackter, verzweigter Blitz vom Himmel + Einschlag-Funken.
    this.fx.bolt(e.x + (e.uid % 3 - 1) * 3, e.y - 78, e.x, e.y, { life: 0.6, tint: PAL[C.lanternWhite] });
    this.fx.bolt(e.x, e.y - 40, e.x + (e.uid % 2 === 0 ? 16 : -16), e.y - 20, {
      life: 0.4, scaleFrom: 0.6, scaleTo: 0.6, tint: PAL[C.glow],
    });
    this.fx.spawnAnim("fx_seal", e.x, e.y, {
      life: 0.45, scaleFrom: 0.1, scaleTo: 0.5, alphaFrom: 1, alphaTo: 0,
      additive: false, tint: PAL[C.amber],
    });
    this.fx.spawnAnim("fx_halo", e.x, e.y, {
      life: 0.3, scaleFrom: 0.6, scaleTo: 1.4, alphaFrom: 0.9, alphaTo: 0, additive: true,
    });
    this.particles.burst("fx_star", e.x, e.y, 9, {
      life: 0.34, scaleFrom: 2.0, scaleTo: 0.25, alphaFrom: 1, alphaTo: 0, tint: PAL[C.glow],
    });
    this.fx.spawnAnim("fx_shock", e.x, e.y + 2, {
      life: 0.3, scaleFrom: 0.25, scaleTo: 0.7, alphaFrom: 0.9, alphaTo: 0,
      additive: true, tint: PAL[C.amber],
    });
    const killed = this.hitEnemy(e, damage, ctx, weaponId);
    if (killed) this.killsFx(e);
  }

  // ── Lantern ───────────────────────────────────────────────────
  private fireLantern(owned: OwnedWeapon, ctx: CombatContext, stats: ReturnType<typeof weaponLevel>, state: WeaponState): void {
    const count = Math.max(1, stats.count ?? 1);
    const radius = effectiveRadius(stats.radius ?? 34, ctx.agg) + (owned.id === "soul_beacon" ? 14 : 0);
    state.orbTimeLeft = effectiveDuration(stats.duration ?? 2.4, ctx.agg);
    state.orbDamage = effectiveDamage(stats.damage, ctx.agg);
    state.orbRadius = radius;
    const evolved = owned.id === "soul_beacon";
    while (state.orbs.length < count) {
      const sprite = this.scene.add.image(ctx.playerX, ctx.playerY, evolved ? "orb_soul" : "orb_lantern")
        .setDepth(DEPTH.fxLow)
        .setScale(evolved ? 2 : 1)
        // Seele in Normal-Blend: das Blau bleibt eigenstaendig, kein Gold-Wash.
        .setBlendMode(evolved ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
      const halo = this.scene.add.image(ctx.playerX, ctx.playerY, evolved ? "fx_halo_cold" : "fx_halo")
        .setDepth(DEPTH.trail)
        .setScale(evolved ? 1.8 : 0.8)
        .setAlpha(evolved ? 0.09 : 0.55)
        .setBlendMode(Phaser.BlendModes.ADD);
      state.orbs.push({ sprite, halo, phase: (state.orbs.length / count) * Math.PI * 2 });
    }
    for (const orb of state.orbs) { orb.sprite.setVisible(true); orb.halo?.setVisible(true); }
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
          orb.halo?.setVisible(false);
          continue;
        }
        const angle = this.clock * (id === "soul_beacon" ? 2.6 : 2.1) + orb.phase;
        const ox = ctx.playerX + Math.cos(angle) * state.orbRadius;
        const oy = ctx.playerY + Math.sin(angle) * state.orbRadius;
        orb.sprite.setPosition(Math.round(ox), Math.round(oy));
        if (id === "soul_beacon") {
          const soulIdx = Math.floor(this.clock * 5 + orb.phase) % 3;
          const soulFrame = soulIdx === 0 ? "orb_soul" : soulIdx === 1 ? "orb_soul_2" : "orb_soul_3";
          if (orb.sprite.texture.key !== soulFrame) orb.sprite.setTexture(soulFrame);
        }
        orb.halo?.setPosition(Math.round(ox), Math.round(oy));
        orb.halo?.setAlpha(id === "soul_beacon" ? 0.09 : 0.4 + Math.sin(this.clock * 5 + orb.phase) * 0.2);
        orb.sprite.setAlpha(id === "soul_beacon" ? 1 : 0.65 + Math.sin(this.clock * 6 + orb.phase) * 0.25);
        // Laterne behält den additiven Orb-Trail; die Seele nutzt ihren Sprite-Schweif.
        if (id !== "soul_beacon" || (Math.floor(this.clock * 10) & 1) === 0) {
          if (id !== "soul_beacon") {
            this.fx.spawnAnim("fx_orb", ox, oy, {
              life: 0.2, scaleFrom: 0.7, scaleTo: 0.2,
              alphaFrom: 0.4, alphaTo: 0, additive: true,
              tint: PAL[C.amber],
            });
          }
        }
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
        // Feuervögel kurven sanfter, damit der Fächer als Schwarm sichtbar bleibt.
        const turnRate = p.weaponId === "phoenix" ? 3 : 6;
        const turn = Math.max(-turnRate * ctx.dt, Math.min(turnRate * ctx.dt, diff));
        const speed = Math.hypot(p.vx, p.vy);
        const angle = current + turn;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
      }
      p.x += p.vx * ctx.dt;
      p.y += p.vy * ctx.dt;
      p.sprite.setPosition(Math.round(p.x), Math.round(p.y));
      p.sprite.setRotation(Math.atan2(p.vy, p.vx));
      if (p.trail && this.fx.trailsEnabled) {
        p.trailTimer -= ctx.dt;
        if (p.trailTimer <= 0) {
          p.trailTimer = p.trailInterval;
          // Feuervogel-Trail bleibt warm und additiv, auch wenn das Projektil selbst
          // mit Normal-Blend (klare Flügel/Kontur) gerendert wird.
          const phoenixTrail = p.weaponId === "phoenix";
          this.fx.spawn({
            texture: p.trail,
            frames: p.trailFrames.length > 0 ? p.trailFrames : undefined,
            x: p.x, y: p.y, life: 0.22,
            scaleFrom: p.sprite.scaleX * 0.8, scaleTo: 0.15,
            alphaFrom: 0.45, alphaTo: 0, additive: p.blendAdd || phoenixTrail,
            tint: p.blendAdd || phoenixTrail ? undefined : PAL[C.emberOrange],
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
        const mass = Math.max(0.6, Math.min(2.5, e.maxHp / 60));
        const kb = knockbackVector(p.x, p.y, e.x, e.y, knockbackFor(p.knockback, mass));
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
    this.fx.spawnAnim("fx_shock", x, y, {
      life: 0.34, scaleFrom: radius / 30, scaleTo: radius / 22,
      alphaFrom: 0.75, alphaTo: 0, additive: true, tint: PAL[C.emberOrange],
    });
    this.fx.spawnAnim("fx_halo", x, y, {
      life: 0.26, scaleFrom: radius / 16, scaleTo: radius / 11,
      alphaFrom: 0.6, alphaTo: 0, additive: true, tint: PAL[C.amber],
    });
    this.fx.burst("fx_fire", x, y, 6, { life: 0.28, additive: true, scaleTo: 0.2 });
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
    // M6-Balance: Boss-Enrage. Ab 20 s Kampfdauer steigt der erlittene Schaden
    // um 10 %/s, damit ein Boss nicht durch Positionierungs-/Trash-Pech 60 s
    // überschreitet (beobachtete Ausreißer 88–99 s).
    const scaled = e.boss && e.age > 20 ? damage * (1 + (e.age - 20) * 0.1) : damage;
    const crit = rollCrit(ctx.rng.next());
    const finalDamage = crit ? critDamage(scaled) : scaled;
    e.hp -= finalDamage;
    e.flash = 0.12;
    // Crit ab 15 Schaden als eigene Feedback-Klasse sichtbar (weißer Blitz über Weiß-Kern).
    this.damageNumbers.report(e.uid, e.x, e.y, finalDamage, crit);
    const killed = wasAlive && e.hp <= 0;
    ctx.onHit(e, finalDamage, weaponId, killed);
    this.particles.burst("fx_star", e.x, e.y, crit ? 5 : 2, {
      life: 0.16, tint: crit ? PAL[C.lanternWhite] : PAL[C.emberOrange],
      scaleTo: 0.12, alphaFrom: 0.9, additive: true,
    });
    return killed;
  }

  private killsFx(e: EnemyRuntime): void {
    const tint = PAL[e.def.color] ?? PAL[C.flame];
    const cls = deathClassFor(e.def.archetype);
    const spec = deathFxFor(cls, e.boss);
    const count = e.boss ? spec.count : e.elite ? Math.round(spec.count * 1.4) : spec.count;
    // Vier klar unterscheidbare Tod-Klassen: zerfallen / platzen / verpuffen / stieben.
    // Shards behalten ihre Materialrampe (Knochen bleibt Knochen, Geist blau);
    // nur die leichte Staubschicht nimmt die Gegnerfarbe an.
    this.particles.shards(spec.shard, e.x, e.y, count, {
      life: e.boss ? 0.75 : 0.5,
      scaleFrom: e.boss ? 1.8 : e.elite ? 1.3 : 1.1,
      additive: spec.additive,
    });
    this.particles.shards(spec.dust, e.x, e.y, Math.max(3, Math.round(count / 2)), {
      life: 0.5, scaleFrom: e.boss ? 1.5 : 0.9, additive: false, tint,
      alphaFrom: 0.32, scaleTo: 0.2,
    });
    if (cls === "dissolve" || e.boss) {
      this.fx.spawnAnim("fx_halo", e.x, e.y, {
        life: 0.4, scaleFrom: 0.5, scaleTo: e.boss ? 2.4 : 1.1,
        alphaFrom: 0.8, alphaTo: 0, additive: true, tint,
      });
    }
  }

  // ── Brandflächen (Evolution) ─────────────────────────────────
  private burns: { x: number; y: number; r: number; life: number; tick: number; dps: number; weaponId: string; sprite: Phaser.GameObjects.Image }[] = [];

  addBurn(x: number, y: number, r: number, life: number, dps: number, weaponId: string): void {
    // Max. 10 Brandflächen: sonst überdecken Dutzende Glut-Ringe die Gegner.
    if (this.burns.length >= 10) {
      const old = this.burns.shift();
      old?.sprite.destroy();
    }
    const sprite = this.scene.add.image(x, y, "fx_fire")
      .setDepth(DEPTH.decal).setBlendMode(Phaser.BlendModes.NORMAL).setAlpha(0.5)
      .setScale((r / 22) * 1.4, (r / 22) * 1.0);
    this.burns.push({ x, y, r, life, tick: 0, dps, weaponId, sprite });
  }

  private updateBurns(ctx: CombatContext): void {
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      b.life -= ctx.dt;
      b.tick -= ctx.dt;
      const burnAlpha = this.lod.level === "minimal" ? 0.26 : 0.46;
      b.sprite.setAlpha(Math.max(0, Math.min(burnAlpha, b.life * 0.6)) * (0.8 + Math.sin(this.clock * 9) * 0.2));
      const burnFrames = fxFrames("fx_fire", 6);
      const bf = burnFrames[Math.floor(this.clock * 8 + b.x) % 6];
      if (b.sprite.texture.key !== bf) b.sprite.setTexture(bf);
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
    for (const s of state.swings) { s.sprite.destroy(); s.halo.destroy(); for (const link of s.links) link.destroy(); }
    for (const orb of state.orbs) { orb.sprite.destroy(); orb.halo?.destroy(); }
    this.states.delete(id);
  }

  clear(): void {
    for (const state of this.states.values()) {
      for (const s of state.swings) { s.sprite.destroy(); s.halo.destroy(); for (const link of s.links) link.destroy(); }
      for (const orb of state.orbs) { orb.sprite.destroy(); orb.halo?.destroy(); }
    }
    this.states.clear();
    for (const b of this.burns) b.sprite.destroy();
    this.burns.length = 0;
    for (const s of this.seals) s.sprite.destroy();
    this.seals.length = 0;
    this.projectiles.releaseAll();
    this.fx.clear();
    this.particles.clear();
  }
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}
