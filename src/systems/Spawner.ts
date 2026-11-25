import Phaser from "phaser";
import { ENEMIES, implementedEnemies, waveForMinute } from "../data";
import type { EnemyDef, EnemyId, WaveDef } from "../data/types";
import { WORLD_SIZE } from "../config";
import { advanceSpawnBudget, pickEnemy, ringSpawnOffsets } from "../logic/waves";
import type { Rng } from "../logic/rng";
import { EnemyPool, type EnemyRuntime } from "./EnemyPool";

/**
 * Wellen-Director-Grundgerüst: Spawnrate/Mischung pro Minute aus `waves.ts`,
 * Spawns im Ring außerhalb des sichtbaren Bereichs. Nicht-implementierte Gegner
 * werden in M1 auf die spielbaren Archetypen gemappt.
 */
export class Spawner {
  budget = 0;
  private lastMinute = -1;
  private readonly pool: EnemyPool;
  private readonly rng: Rng;
  private readonly fallback: EnemyDef[] = implementedEnemies();
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, pool: EnemyPool, rng: Rng) {
    this.scene = scene;
    this.pool = pool;
    this.rng = rng;
    this.camera = scene.cameras.main;
  }

  currentWave(elapsedSeconds: number): WaveDef {
    return waveForMinute(elapsedSeconds / 60);
  }

  update(elapsedSeconds: number, dt: number, playerX: number, playerY: number): EnemyRuntime[] {
    const spawned: EnemyRuntime[] = [];
    const wave = this.currentWave(elapsedSeconds);
    if (wave.minute !== this.lastMinute) {
      this.lastMinute = wave.minute;
      if (wave.special === "ring") this.spawnRing(wave, playerX, playerY, spawned, 10);
      // Bosse sind erst ab M4 implementiert; Wave-Flag bleibt als Hook erhalten.
    }

    const scaled = advanceSpawnBudget(this.budget, wave.spawnRate, dt);
    this.budget = scaled.budget;
    for (let i = 0; i < scaled.count; i++) {
      const id = pickEnemy(wave.mix, this.rng);
      const def = id ? ENEMIES[id] : null;
      const chosen = def?.implemented ? def : this.rng.pick(this.fallback);
      spawned.push(this.spawnOne(chosen.id, playerX, playerY));
    }
    return spawned;
  }

  spawnRing(wave: WaveDef, playerX: number, playerY: number, out: EnemyRuntime[], count: number): void {
    // Radius > Bildschirmdiagonale (sqrt(240² + 135²) ≈ 275), damit nichts sichtbar aufploppt.
    const ringRadius = Math.ceil(Math.hypot(this.camera.width, this.camera.height) / 2) + 20;
    const offsets = ringSpawnOffsets(count, ringRadius);
    const available = Object.keys(wave.mix) as EnemyId[];
    for (const off of offsets) {
      const id = pickEnemy(wave.mix, this.rng) ?? available[0] ?? "bog_rat";
      const def = ENEMIES[id];
      const chosen = def.implemented ? def : this.rng.pick(this.fallback);
      const baseAngle = Math.atan2(off.y, off.x);
      let x = playerX;
      let y = playerY;
      let placed = false;
      // Nahe der Weltgrenze ggf. 90°/180°/270° drehen, bis der Spawn außerhalb des Views liegt.
      for (let turn = 0; turn < 4 && !placed; turn++) {
        const angle = baseAngle + (turn * Math.PI) / 2;
        const cx = Phaser.Math.Clamp(playerX + Math.cos(angle) * ringRadius, 20, WORLD_SIZE - 20);
        const cy = Phaser.Math.Clamp(playerY + Math.sin(angle) * ringRadius, 20, WORLD_SIZE - 20);
        if (this.outsideView(cx, cy)) {
          x = cx;
          y = cy;
          placed = true;
        }
      }
      if (placed) out.push(this.spawnAt(chosen, x, y));
      else out.push(this.spawnOne(chosen.id, playerX, playerY));
    }
  }

  /** Liegt der Punkt sicher außerhalb des aktuellen Kamera-Views (inkl. Rand)? */
  private outsideView(x: number, y: number, margin = 16): boolean {
    const v = this.camera.worldView;
    return x < v.x - margin || x > v.right + margin || y < v.y - margin || y > v.bottom + margin;
  }

  /** Debug/Perf: `n` Gegner im Ring um den Spieler (leicht gestreut). */
  spawnEnemy(id: EnemyId, n: number, playerX: number, playerY: number): EnemyRuntime[] {
    const def = ENEMIES[id];
    if (!def) throw new Error(`spawnEnemy: unbekannter Gegner "${id}"`);
    if (!def.implemented) throw new Error(`spawnEnemy: "${id}" ist erst ab M3 spielbar`);
    const out: EnemyRuntime[] = [];
    for (let i = 0; i < n; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const radius = 160 + this.rng.next() * 120;
      out.push(this.spawnAt(def, playerX + Math.cos(angle) * radius, playerY + Math.sin(angle) * radius));
    }
    return out;
  }

  private spawnOne(id: EnemyId, playerX: number, playerY: number): EnemyRuntime {
    const def = ENEMIES[id];
    const cam = this.camera;
    const angle = this.rng.next() * Math.PI * 2;
    const radius = Math.max(cam.width, cam.height) * 0.62 + 24 + this.rng.next() * 40;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    // Erst clampen, dann prüfen: sonst kann ein geclampte Randspawn mitten im Bild landen.
    let x = Phaser.Math.Clamp(cx + Math.cos(angle) * radius, 20, WORLD_SIZE - 20);
    let y = Phaser.Math.Clamp(cy + Math.sin(angle) * radius, 20, WORLD_SIZE - 20);
    if (!this.outsideView(x, y)) {
      x = Phaser.Math.Clamp(cx - Math.cos(angle) * radius, 20, WORLD_SIZE - 20);
      y = Phaser.Math.Clamp(cy - Math.sin(angle) * radius, 20, WORLD_SIZE - 20);
      // An einer sehr engen Weltkante bleibt notfalls der nächstbeste Randpunkt.
    }
    return this.spawnAt(def, x, y);
  }

  private spawnAt(def: EnemyDef, x: number, y: number): EnemyRuntime {
    const elapsed = this.scene.registry.get("lf-elapsed") as number ?? 0;
    const hpScale = 1 + elapsed / 240 + def.tier * 0.12;
    const damageScale = 1 + elapsed / 600;
    const enemy = this.pool.spawn(
      def,
      Phaser.Math.Clamp(x, 20, WORLD_SIZE - 20),
      Phaser.Math.Clamp(y, 20, WORLD_SIZE - 20),
      hpScale,
      damageScale,
      this.rng.next() * Math.PI * 2,
    );
    return enemy;
  }
}
