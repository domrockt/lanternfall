import { WEAPONS } from "../data/weapons";
import type { WeaponId } from "../data/types";
import {
  effectiveCooldown, effectiveDamage, effectiveDuration, effectiveRadius,
  weaponLevel, type AggregateStats,
} from "../logic/stats";
import { knockbackVector } from "../logic/combat";
import type { EnemyRuntime } from "./EnemyPool";
import { ProjectilePool, type ProjectileRuntime } from "./ProjectilePool";
import type { SpatialHash } from "./SpatialHash";
import type { OwnedWeapon } from "./LevelUpSystem";

export type HitCallback = (enemy: EnemyRuntime, damage: number, weaponId: string, killed: boolean) => void;

/**
 * Generisches Waffen-/Projektil-Framework. M1 implementiert nur `ember`;
 * die übrigen Behaviors sind über `WeaponDef.behavior` vorbereitet.
 */
export class CombatSystem {
  readonly projectiles: ProjectilePool;

  constructor(scene: Phaser.Scene) {
    this.projectiles = new ProjectilePool(scene);
  }

  update(
    dt: number,
    playerX: number,
    playerY: number,
    weapons: OwnedWeapon[],
    enemies: readonly EnemyRuntime[],
    hash: SpatialHash<EnemyRuntime>,
    agg: AggregateStats,
    onHit: HitCallback,
  ): void {
    this.updateWeapons(dt, playerX, playerY, weapons, enemies, agg);
    this.updateProjectiles(dt, hash, onHit);
  }

  private updateWeapons(
    dt: number,
    playerX: number,
    playerY: number,
    weapons: OwnedWeapon[],
    enemies: readonly EnemyRuntime[],
    agg: AggregateStats,
  ): void {
    const alive = enemies.filter((e) => e.alive);
    for (const owned of weapons) {
      const def = WEAPONS[owned.id as WeaponId];
      if (!def || !def.implemented) continue;
      const stats = weaponLevel(def, owned.level);
      owned.timer -= dt;
      if (owned.timer > 0) continue;
      if (alive.length === 0) {
        owned.timer = 0;
        continue;
      }
      if (def.behavior === "ember") {
        this.fireEmber(owned, playerX, playerY, alive, stats, agg);
        owned.timer = effectiveCooldown(stats.cooldown, agg);
      } else {
        // M2: weitere Behaviors (flail/frost/thorn/storm/lantern)
        owned.timer = 0.5;
      }
    }
  }

  private fireEmber(
    owned: OwnedWeapon,
    px: number,
    py: number,
    enemies: EnemyRuntime[],
    stats: ReturnType<typeof weaponLevel>,
    agg: AggregateStats,
  ): void {
    const count = Math.max(1, stats.count ?? 1);
    const sorted = enemies
      .map((e) => ({ e, d: (e.x - px) ** 2 + (e.y - py) ** 2 }))
      .sort((a, b) => a.d - b.d);
    const targets = sorted.slice(0, count);
    const damage = effectiveDamage(stats.damage, agg);
    const speed = stats.speed ?? 200;

    const baseAngle = Math.atan2(sorted[0].e.y - py, sorted[0].e.x - px);
    for (let i = 0; i < count; i++) {
      const target = targets[i]?.e;
      const angle = target
        ? Math.atan2(target.y - py, target.x - px)
        : baseAngle + (i - (count - 1) / 2) * 0.16;
      const sx = px + Math.cos(angle) * 10;
      const sy = py + Math.sin(angle) * 10;
      this.projectiles.spawn({
        x: sx,
        y: sy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage,
        pierce: stats.pierce ?? 0,
        knockback: stats.knockback ?? 20,
        life: effectiveDuration(2.6, agg),
        weaponId: owned.id,
        texture: "projectile_ember",
        radius: effectiveRadius(4, agg),
        target: target ?? null,
      });
    }
  }

  private updateProjectiles(dt: number, hash: SpatialHash<EnemyRuntime>, onHit: HitCallback): void {
    const scratch: EnemyRuntime[] = [];
    for (const p of this.projectiles.active) {
      if (!p.active) continue;
      p.life -= dt;
      // sanftes Ziel-Homing des Glutunkens
      if (p.target && p.target.alive && p.target.uid === p.targetUid) {
        const desired = Math.atan2(p.target.y - p.y, p.target.x - p.x);
        const current = Math.atan2(p.vy, p.vx);
        let diff = desired - current;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.max(-5 * dt, Math.min(5 * dt, diff));
        const speed = Math.hypot(p.vx, p.vy);
        const angle = current + turn;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.sprite.setPosition(Math.round(p.x), Math.round(p.y));
      p.sprite.setRotation(Math.atan2(p.vy, p.vx));
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      hash.queryCircle(p.x, p.y, p.radius + 16, scratch);
      for (const e of scratch) {
        // hp <= 0: bereits im selben Frame getötet → keine weiteren Treffer/Pierce.
        if (!e.alive || e.hp <= 0 || p.hit.has(e.uid)) continue;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > (e.radius + p.radius) ** 2) continue;
        p.hit.add(e.uid);
        const wasAlive = e.hp > 0;
        e.hp -= p.damage;
        const killed = wasAlive && e.hp <= 0;
        const kb = knockbackVector(p.x, p.y, e.x, e.y, p.knockback);
        e.vx += kb.vx;
        e.vy += kb.vy;
        e.flash = 0.12;
        onHit(e, p.damage, p.weaponId, killed);
        if (p.pierce <= 0) {
          p.active = false;
          break;
        }
        p.pierce -= 1;
      }
    }
    this.projectiles.compact();
  }

  clear(): void {
    this.projectiles.releaseAll();
  }
}
