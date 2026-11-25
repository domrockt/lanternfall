import Phaser from "phaser";
import { BOSSES } from "../data/bosses";
import { ENEMIES } from "../data/enemies";
import type { EnemyDef } from "../data/types";
import type { Rng } from "../logic/rng";
import { attacksFor, bossHpColorIndex, bossPhase, nextBossAttack } from "../logic/bosses";
import type { EnemyPool, EnemyRuntime } from "./EnemyPool";
import type { EnemyProjectilePool } from "./EnemyProjectiles";
import type { HazardSystem } from "./Hazards";
import type { Spawner } from "./Spawner";

interface PendingAction {
  timer: number;
  action: () => void;
}

interface BossAgent {
  enemy: EnemyRuntime;
  timer: number;
  pending: PendingAction[];
  phase: number;
}

export interface BossInfo {
  index: number;
  name: string;
  hp: number;
  maxHp: number;
  ratio: number;
  phase: number;
  color: number;
  alive: boolean;
}

const BOSS_RADIUS = [20, 16, 17, 20, 16, 19];
const BOSS_SPEED = [24, 20, 22, 14, 26, 20];
const BOSS_TOUCH_DAMAGE = [16, 18, 20, 24, 22, 28];
const BOSS_COLOR = [31, 10, 9, 8, 25, 12];

/** Synthetisches EnemyDef für den Boss-Pool (Kampf kommt aus dem BossSystem). */
export function bossEnemyDef(index: number): EnemyDef {
  const boss = BOSSES[index];
  return {
    id: "bogzombie",
    name: boss.name,
    archetype: "tank",
    tier: 4,
    hp: boss.hp,
    speed: BOSS_SPEED[index] ?? 20,
    damage: BOSS_TOUCH_DAMAGE[index] ?? 20,
    radius: BOSS_RADIUS[index] ?? 18,
    xp: 40 + index * 15,
    implemented: true,
    spriteKey: `boss_${boss.id}`,
    color: BOSS_COLOR[index] ?? 9,
  };
}

/**
 * Boss-Director: 6 Bosse mit telegraphierten Mechaniken, HP-Leiste, Warn-Banner
 * und Truhen-Drop über den normalen Gegner-Tod. Der Endboss (30:00) hat 3 Phasen.
 */
export class BossSystem {
  readonly bosses: BossAgent[] = [];
  private readonly scene: Phaser.Scene;
  private readonly pool: EnemyPool;
  private readonly spawner: Spawner;
  private readonly hazards: HazardSystem;
  private readonly shots: EnemyProjectilePool;
  private readonly rng: Rng;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;

  constructor(
    scene: Phaser.Scene, pool: EnemyPool, spawner: Spawner,
    hazards: HazardSystem, shots: EnemyProjectilePool, rng: Rng,
  ) {
    this.scene = scene;
    this.pool = pool;
    this.spawner = spawner;
    this.hazards = hazards;
    this.shots = shots;
    this.rng = rng;
    this.camera = scene.cameras.main;
  }

  spawn(index: number, playerX: number, playerY: number): EnemyRuntime {
    const boss = BOSSES[index];
    if (!boss) throw new RangeError(`Boss ${index} unbekannt`);
    const def = bossEnemyDef(index);
    const angle = this.rng.next() * Math.PI * 2;
    const distance = Math.max(this.camera.width, this.camera.height) * 0.4;
    const x = Phaser.Math.Clamp(playerX + Math.cos(angle) * distance, 30, 4096 - 30);
    const y = Phaser.Math.Clamp(playerY + Math.sin(angle) * distance, 30, 4096 - 30);
    const enemy = this.pool.spawn(def, x, y, 1, 1, this.rng.next() * Math.PI * 2, {
      bossIndex: index,
      radius: def.radius,
      speed: def.speed,
    }, this.rng);
    enemy.boss = true;
    enemy.bossIndex = index;
    enemy.bossPhase = 1;
    enemy.sprite.setScale(1);
    enemy.sprite.setDepth(9);
    enemy.aura.setVisible(false);
    this.bosses.push({ enemy, timer: 2.2, pending: [], phase: 1 });
    this.scene.events.emit("bossWarn", { index, name: boss.name });
    this.camera.shake(260, 0.004);
    return enemy;
  }

  update(dt: number, playerX: number, playerY: number): void {
    for (let i = this.bosses.length - 1; i >= 0; i--) {
      const agent = this.bosses[i];
      const boss = agent.enemy;
      if (!boss.alive || boss.hp <= 0) {
        this.bosses.splice(i, 1);
        continue;
      }
      boss.age += dt;
      const ratio = Math.max(0, boss.hp / Math.max(1, boss.maxHp));
      const phase = boss.bossIndex === 5 ? bossPhase(ratio) : 1;
      if (phase !== agent.phase) {
        agent.phase = phase;
        boss.bossPhase = phase;
        this.scene.events.emit("bossPhase", { index: boss.bossIndex, phase });
      }

      for (let p = agent.pending.length - 1; p >= 0; p--) {
        const action = agent.pending[p];
        action.timer -= dt;
        if (action.timer <= 0) {
          action.action();
          agent.pending.splice(p, 1);
        }
      }

      // Bewegung: Abstand halten, nicht deckungsgleich auf dem Spieler stehen.
      const dx = playerX - boss.x;
      const dy = playerY - boss.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      let mx = 0;
      let my = 0;
      if (dist > 118) {
        mx = nx;
        my = ny;
      } else if (dist < 84) {
        mx = -nx;
        my = -ny;
      } else {
        mx = -ny * 0.6;
        my = nx * 0.6;
      }
      const speed = boss.speed * (boss.bossIndex === 5 && phase === 3 ? 1.25 : 1);
      boss.x += mx * speed * dt;
      boss.y += my * speed * dt;
      boss.x = Phaser.Math.Clamp(boss.x, 20, 4096 - 20);
      boss.y = Phaser.Math.Clamp(boss.y, 20, 4096 - 20);

      agent.timer -= dt;
      if (agent.timer <= 0) {
        agent.timer = this.launch(agent, playerX, playerY);
      }
    }
  }

  /** Startet einen Boss-Angriff; liefert die Pause bis zum nächsten Angriff. */
  private launch(agent: BossAgent, playerX: number, playerY: number): number {
    const boss = agent.enemy;
    const index = boss.bossIndex;
    const phase = agent.phase;
    const attack = nextBossAttack(index, phase, boss.attackCounter++);
    const damage = Math.max(4, Math.round(boss.damage * attack.damageMul));
    const r = attack.radius;
    boss.telegraph = attack.telegraph;
    switch (attack.kind) {
      case "jump_slam": {
        // Landepunkt vor dem Spieler markieren, Boss springt sichtbar dorthin.
        const lx = playerX + (boss.x - playerX) * 0.12;
        const ly = playerY + (boss.y - playerY) * 0.12;
        this.hazards.spawnCircle(lx, ly, {
          warn: attack.telegraph, linger: 0.12, damage, radius: r,
          source: `boss${index}:jump`, color: 25,
        });
        this.scene.tweens.add({
          targets: boss.sprite, y: boss.sprite.y - 24, duration: attack.telegraph * 1000 * 0.5,
          yoyo: true, ease: "Quad.Out",
        });
        break;
      }
      case "poison_puddles": {
        for (let i = 0; i < 3; i++) {
          const a = this.rng.next() * Math.PI * 2;
          const px = playerX + Math.cos(a) * (28 + i * 22);
          const py = playerY + Math.sin(a) * (28 + i * 22);
          this.hazards.spawnCircle(px, py, {
            warn: attack.telegraph, linger: 4.5, tick: 0.6, damage,
            radius: r, activeTexture: "puddle_poison", source: `boss${index}:poison`,
          });
        }
        break;
      }
      case "summon_ring": {
        this.hazards.spawnCircle(playerX, playerY, {
          warn: attack.telegraph, damage: 0, radius: 96, source: `boss${index}:summon`,
          onTrigger: () => {
            const id = index === 5 ? "wraith" : index === 1 ? "skeleton" : "bogzombie";
            const count = 8;
            for (let i = 0; i < count; i++) {
              const a = (i / count) * Math.PI * 2;
              const e = this.spawner.spawnAt(
                { ...this.enemyDefFor(id), hp: Math.round(this.enemyDefFor(id).hp * 0.85) },
                playerX + Math.cos(a) * 88,
                playerY + Math.sin(a) * 88,
              );
              e.boss = false;
            }
          },
        });
        break;
      }
      case "bone_boomerang": {
        this.hazards.spawnBeam(boss.x, boss.y, playerX, playerY, {
          warn: attack.telegraph, damage: 0, radius: 16, source: `boss${index}:boomerang`,
          onTrigger: () => this.fireFan(boss, playerX, playerY, 5, 0.34, "enemy_shot_bone", damage),
        });
        break;
      }
      case "summon_wolves": {
        this.hazards.spawnCircle(boss.x, boss.y, {
          warn: attack.telegraph, damage: 0, radius: 70, source: `boss${index}:wolves`,
          onTrigger: () => {
            for (let i = 0; i < 4; i++) {
              const a = this.rng.next() * Math.PI * 2;
              this.spawner.spawnAt(this.enemyDefFor("wolf"),
                playerX + Math.cos(a) * 92, playerY + Math.sin(a) * 92);
            }
          },
        });
        break;
      }
      case "scythe_sweep": {
        this.hazards.spawnCircle(boss.x, boss.y, {
          warn: attack.telegraph, linger: 0.1, damage, radius: r, source: `boss${index}:scythe`, color: 25,
        });
        break;
      }
      case "stomp": {
        this.hazards.spawnCircle(boss.x, boss.y, {
          warn: attack.telegraph, linger: 0.12, damage, radius: r, source: `boss${index}:stomp`, color: 25,
        });
        break;
      }
      case "stone_rain": {
        for (let i = 0; i < 5; i++) {
          const a = this.rng.next() * Math.PI * 2;
          const d = 20 + this.rng.next() * 95;
          this.hazards.spawnCircle(playerX + Math.cos(a) * d, playerY + Math.sin(a) * d, {
            warn: attack.telegraph, linger: 0.1, damage, radius: r, source: `boss${index}:stone`, color: 25,
          });
        }
        break;
      }
      case "teleport": {
        const angle = this.rng.next() * Math.PI * 2;
        const tx = Phaser.Math.Clamp(playerX + Math.cos(angle) * 105, 30, 4096 - 30);
        const ty = Phaser.Math.Clamp(playerY + Math.sin(angle) * 105, 30, 4096 - 30);
        this.hazards.spawnCircle(tx, ty, {
          warn: attack.telegraph, damage: 0, radius: 22, source: `boss${index}:teleport`,
          onTrigger: () => {
            boss.x = tx;
            boss.y = ty;
            boss.sprite.setAlpha(0.35);
            this.scene.tweens.add({ targets: boss.sprite, alpha: 1, duration: 180 });
          },
        });
        break;
      }
      case "fire_cross": {
        // Zwei rechtwinklige Strahlen durch den Spieler.
        const len = 420;
        const a = this.rng.next() * Math.PI;
        for (const off of [0, Math.PI / 2]) {
          const dx = Math.cos(a + off) * len;
          const dy = Math.sin(a + off) * len;
          this.hazards.spawnBeam(playerX - dx, playerY - dy, playerX + dx, playerY + dy, {
            warn: attack.telegraph, linger: 0.1, damage, radius: 18,
            source: `boss${index}:firecross`, color: 26,
          });
        }
        break;
      }
      case "thorn_ring": {
        const count = 8;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + this.rng.next() * 0.1;
          this.hazards.spawnCircle(playerX + Math.cos(a) * 98, playerY + Math.sin(a) * 98, {
            warn: attack.telegraph, linger: 0.3, damage, radius: r, source: `boss${index}:thornring`, color: 25,
          });
        }
        break;
      }
      case "thorn_burst": {
        const count = 7;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + this.rng.next() * 0.2;
          const dx = Math.cos(a) * 320;
          const dy = Math.sin(a) * 320;
          this.hazards.spawnBeam(boss.x, boss.y, boss.x + dx, boss.y + dy, {
            warn: attack.telegraph, linger: 0.08, damage, radius: 16,
            source: `boss${index}:thornburst`, color: 25,
          });
        }
        break;
      }
    }
    return attack.interval;
  }

  private fireFan(
    boss: EnemyRuntime, px: number, py: number,
    count: number, spread: number, texture: string, damage: number,
  ): void {
    const base = Math.atan2(py - boss.y, px - boss.x);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * spread;
      const speed = 130;
      this.shots.spawn({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        damage, radius: 5, texture, life: 2.4,
      });
    }
  }

  private enemyDefFor(id: "skeleton" | "wraith" | "wolf" | "bogzombie"): EnemyDef {
    return ENEMIES[id];
  }

  /** Alle lebenden Bosse (für Debug/Abnahme). */
  living(): EnemyRuntime[] {
    return this.bosses.map((b) => b.enemy).filter((e) => e.alive && e.hp > 0);
  }

  info(): BossInfo | null {
    const alive = this.living();
    if (alive.length === 0) return null;
    const boss = alive[alive.length - 1];
    const data = BOSSES[boss.bossIndex];
    const ratio = Math.max(0, boss.hp / Math.max(1, boss.maxHp));
    return {
      index: boss.bossIndex,
      name: data.name,
      hp: Math.max(0, Math.round(boss.hp)),
      maxHp: boss.maxHp,
      ratio,
      phase: boss.bossPhase,
      color: bossHpColorIndex(ratio),
      alive: true,
    };
  }

  clear(): void {
    for (const agent of this.bosses) agent.pending.length = 0;
    this.bosses.length = 0;
  }
}
