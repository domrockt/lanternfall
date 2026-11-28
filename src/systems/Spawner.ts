import Phaser from "phaser";
import { ENEMIES, waveForMinute } from "../data";
import type { EnemyDef, EnemyId, WaveDef } from "../data/types";
import { WORLD_SIZE } from "../config";
import { advanceSpawnBudget, elitePackCount, pickEnemy, ringSpawnOffsets, SPAWN_FRAME_BUDGET, splitSpawnBurst, streamSpawnOffsets } from "../logic/waves";
import {
  createFrameBudget, eliteChance, enemyDamageScale, enemyHpScale, enemySpeedScale,
  frameBudgetTarget, maxActiveEnemies, pickRecycleIndex, recycleDistance, spawnRateFactor,
  spawnRingRadius, stepFrameBudget, type FrameBudgetState,
} from "../logic/scaling";
import type { Rng } from "../logic/rng";
import { EnemyPool, type EnemyRuntime, type EnemySpawnOptions } from "./EnemyPool";

/**
 * M10 (#7758): Burst-Allowance auf dt-Basis (reine Funktion, testbar).
 *
 * Altes Verhalten: `SPAWN_FRAME_BUDGET` Spawns je ECHTEM Frame — die
 * Abtragsrate eines Budget-Rueckstaus hing damit an der Echtzeit-FPS
 * (60 fps: 16 Spawns/Sim-s bei timeScale 30, 30 fps: 8/Sim-s), sodass zwei
 * Kontrolllaeufe mit gleichem Seed unterschiedliche Spawn-Marken hatten.
 *
 * Neues Verhalten: die Allowance waechst mit Sim-Zeit. Referenz ist das alte
 * 60-Hz-Verhalten: 8 Spawns je 1/60 s => 480 Spawns je Sim-Sekunde. Der
 * Akkumulator ist auf zwei Substep-Rationen gedeckelt (`SPAWN_ALLOWANCE_MAX`),
 * damit nach Kap-Druck oder langen Hitches kein unbegrenzter Burst
 * materialisiert wird; der Abtrag bleibt trotzdem rein simzeit-bestimmt.
 */
export const SPAWN_ALLOWANCE_PER_SECOND = SPAWN_FRAME_BUDGET * 60;
export const SPAWN_ALLOWANCE_MAX = SPAWN_FRAME_BUDGET * 2;

export function accrueSpawnAllowance(acc: number, dt: number): number {
  if (!Number.isFinite(acc)) return SPAWN_ALLOWANCE_MAX;
  return Math.min(acc + Math.max(0, dt) * SPAWN_ALLOWANCE_PER_SECOND, SPAWN_ALLOWANCE_MAX);
}

/**
 * Wellen-Director: Spawnrate/Mischung pro Minute aus `waves.ts`, Spezialwellen
 * (Ring-Einkesselung, Schwarm-Strom), Elite-Pakete, Gegner-Cap mit Recycling.
 * Alle 30 Gegner sind spielbar.
 */
export class Spawner {
  budget = 0;
  /** Abnahme-Beleg: zaehlt jeden tatsaechlichen Spawn je Gegner-ID (nur zaehlen). */
  readonly spawnCounts: Partial<Record<EnemyId, number>> = {};
  private lastMinute = -1;
  // M10: Frame-Budget-Regler. Greift nur bei anhaltender Ueberlast (>19,2 ms
  // fuer >1 s) und senkt das aktive Ziel gedrosselt; sonst bleibt der
  // bestehende maxActiveEnemies-Deckel unveraendert. Siehe logic/scaling.ts.
  private frameBudget: FrameBudgetState;
  private lastBudgetFrame = -1;
  // M10 (#7758): Spawn-Burst-Glaettung auf dt-Basis. Die Allowance waechst
  // mit SIM-Zeit (dt-Akkumulator, ganzzahliger Abgriff, Rest bleibt stehen)
  // statt je echtem Frame zurueckgesetzt zu werden — die Spawn-Phase haengt
  // damit nur noch von der Sim-Zeit ab, nicht von Echtzeit-Frame-Zeiten
  // (Beleg: shots/m10-spawnbudget-before.json, zwei Kontrolllaeufe gleicher
  // Seed divergieren im alten Verhalten). Ueberschuessige Spawns kehren ins
  // Restbudget zurueck und werden nachgeholt (Summe exakt erhalten, Mischung
  // naeherungsweise — siehe logic/waves.ts). Spezialwellen/Boss-Spawns
  // laufen nicht durch den Deckel.
  private spawnAllowance = 0;
  private readonly pool: EnemyPool;
  private readonly rng: Rng;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, pool: EnemyPool, rng: Rng) {
    this.scene = scene;
    this.pool = pool;
    this.rng = rng;
    this.camera = scene.cameras.main;
    this.frameBudget = createFrameBudget(maxActiveEnemies(0, this.camera.width, this.camera.height));
    // window.__lf.state() liest den Zaehler ohne Phaser-Referenz aus der Registry.
    this.scene.registry.set("lf-spawner", this);
  }

  currentWave(elapsedSeconds: number): WaveDef {
    return waveForMinute(elapsedSeconds / 60);
  }

  update(elapsedSeconds: number, dt: number, playerX: number, playerY: number): EnemyRuntime[] {
    const spawned: EnemyRuntime[] = [];
    const wave = this.currentWave(elapsedSeconds);
    if (wave.minute !== this.lastMinute) {
      this.lastMinute = wave.minute;
      if (wave.special === "ring") this.spawnRing(wave, playerX, playerY, spawned, 6 + Math.floor(wave.minute / 6));
      else if (wave.special === "stream") this.spawnStream(wave, playerX, playerY, spawned, 6 + Math.floor(wave.minute / 5));
      if (wave.elitePack) this.spawnElitePack(wave, playerX, playerY, spawned);
    }

    // Performance-Deckel: älteste/ferne Gegner recyceln statt beliebig zu wachsen.
    const cam = this.camera;
    const baseCap = maxActiveEnemies(elapsedSeconds, cam.width, cam.height);
    // M10: Regler einmal pro echtem Frame fuettern (nicht pro Simulations-Substep,
    // sonst wuerde timeScale 30 dieselbe Frame-Zeit mehrfach zaehlen).
    const frameId = this.scene.game.loop.frame;
    if (frameId !== this.lastBudgetFrame) {
      this.lastBudgetFrame = frameId;
      this.frameBudget = stepFrameBudget(
        this.frameBudget,
        this.scene.game.loop.delta,
        this.scene.game.loop.delta / 1000,
        baseCap,
      );
    }
    const cap = Math.min(baseCap, frameBudgetTarget(this.frameBudget));
    this.scene.registry.set("lf-frame-budget", this.frameBudget);
    let over = this.pool.count - cap;
    const recycle = recycleDistance(cam.width, cam.height);
    while (over > 0) {
      const idx = pickRecycleIndex(this.pool.active, playerX, playerY, recycle);
      if (idx < 0) break;
      this.pool.despawn(this.pool.active[idx]);
      over--;
    }

    // M8: Spawnrate mit der sichtbaren Fläche skalieren (breite Formate dichter).
    // Optionaler Debug-/Tuning-Faktor aus ?density=0.7 (nur Messläufe).
    const density = Number(this.scene.registry.get("lf-density") ?? 1);
    const rateScale = Number.isFinite(density) && density > 0 ? density : 1;
    const scaled = advanceSpawnBudget(
      this.budget,
      wave.spawnRate * spawnRateFactor(cam.width, cam.height) * rateScale,
      dt,
    );
    this.budget = scaled.budget;
    const room = Math.max(0, cap - this.pool.count);
    const toSpawn = Math.min(scaled.count, room);
    // M10 (#7758): Allowance aus dem dt-Akkumulator (ganzzahliger Abgriff,
    // ungenutzte ganze Allowance und Bruchteil bleiben stehen bzw. kehren
    // zurueck). Nicht mehr an scene.game.loop.frame gekoppelt — zwei Laeufe
    // mit gleichem Seed und gleicher Sim-Zeit materialisieren identische
    // Spawn-Marken, egal wie die Echtzeit-Frames fallen.
    this.spawnAllowance = accrueSpawnAllowance(this.spawnAllowance, dt);
    const allowance = Math.floor(this.spawnAllowance);
    this.spawnAllowance -= allowance;
    const split = splitSpawnBurst(toSpawn, allowance);
    this.spawnAllowance += split.allowanceLeft;
    if (split.deferred > 0) this.budget += split.deferred;
    for (let i = 0; i < split.now; i++) {
      const id = pickEnemy(wave.mix, this.rng);
      const def = id ? ENEMIES[id] : this.rng.pick(Object.values(ENEMIES));
      const elite = this.rng.next() < eliteChance(wave.minute);
      spawned.push(this.spawnOne(def, playerX, playerY, elite));
    }
    return spawned;
  }

  spawnRing(wave: WaveDef, playerX: number, playerY: number, out: EnemyRuntime[], count: number): void {
    // M8: Radius knapp ausserhalb der aktuellen Sichtfläche (nie 480x270-Annahme).
    const ringRadius = spawnRingRadius(this.camera.width, this.camera.height);
    const offsets = ringSpawnOffsets(count, ringRadius);
    for (const off of offsets) {
      const id = pickEnemy(wave.mix, this.rng) ?? "bog_rat";
      const def = ENEMIES[id];
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
      if (placed) out.push(this.spawnAt(def, x, y));
      else out.push(this.spawnOne(def, playerX, playerY, false));
    }
  }

  /** Schwarm-Strom: geschlossene Reihe läuft aus einer Richtung auf den Spieler. */
  spawnStream(wave: WaveDef, playerX: number, playerY: number, out: EnemyRuntime[], count: number): void {
    const radius = spawnRingRadius(this.camera.width, this.camera.height, 30);
    const angle = this.rng.next() * Math.PI * 2;
    const offsets = streamSpawnOffsets(count, radius, angle);
    for (const off of offsets) {
      const id = pickEnemy(wave.mix, this.rng) ?? "bog_rat";
      const def = ENEMIES[id];
      out.push(this.spawnAt(
        def,
        Phaser.Math.Clamp(playerX + off.x, 20, WORLD_SIZE - 20),
        Phaser.Math.Clamp(playerY + off.y, 20, WORLD_SIZE - 20),
      ));
    }
  }

  /** Elite-Paket: Leuchtrand, 3-fache HP, garantiert großer Kristall (Drop in Run). */
  spawnElitePack(wave: WaveDef, playerX: number, playerY: number, out: EnemyRuntime[]): void {
    const count = elitePackCount(wave.minute);
    for (let i = 0; i < count; i++) {
      const id = pickEnemy(wave.mix, this.rng) ?? "bogzombie";
      const angle = (i / count) * Math.PI * 2 + this.rng.next() * 0.4;
      const r = 120 + this.rng.next() * 60;
      const x = Phaser.Math.Clamp(playerX + Math.cos(angle) * r, 20, WORLD_SIZE - 20);
      const y = Phaser.Math.Clamp(playerY + Math.sin(angle) * r, 20, WORLD_SIZE - 20);
      out.push(this.spawnAt(ENEMIES[id], x, y, { elite: true, hpScale: this.hpScaleFor(this.elapsed()) * 3 }));
    }
  }

  /** Liegt der Punkt sicher außerhalb des aktuellen Kamera-Views (inkl. Rand)? */
  private outsideView(x: number, y: number, margin = 16): boolean {
    const v = this.camera.worldView;
    return x < v.x - margin || x > v.right + margin || y < v.y - margin || y > v.bottom + margin;
  }

  /** Debug/Perf: `n` Gegner im Ring um den Spieler (leicht gestreut, sichtbar). */
  spawnEnemy(id: EnemyId, n: number, playerX: number, playerY: number, elite = false): EnemyRuntime[] {
    const def = ENEMIES[id];
    if (!def) throw new Error(`spawnEnemy: unbekannter Gegner "${id}"`);
    const out: EnemyRuntime[] = [];
    for (let i = 0; i < n; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const radius = 90 + this.rng.next() * 90;
      const x = Phaser.Math.Clamp(playerX + Math.cos(angle) * radius, 20, WORLD_SIZE - 20);
      const y = Phaser.Math.Clamp(playerY + Math.sin(angle) * radius, 20, WORLD_SIZE - 20);
      out.push(this.spawnAt(def, x, y, {
        elite,
        hpScale: this.hpScaleFor(this.elapsed()) * (elite ? 3 : 1),
      }));
    }
    return out;
  }

  /** Direkter Spawn (Bosse, Splitter-Kinder, Summoner-Minions). */
  spawnAt(def: EnemyDef, x: number, y: number, options: EnemySpawnOptions = {}): EnemyRuntime {
    const elapsedSec = this.elapsed();
    const hpScale = options.hpScale ?? this.hpScaleFor(elapsedSec);
    const damageScale = enemyDamageScale(elapsedSec);
    const runtime = this.pool.spawn(
      def,
      Phaser.Math.Clamp(x, 20, WORLD_SIZE - 20),
      Phaser.Math.Clamp(y, 20, WORLD_SIZE - 20),
      hpScale,
      damageScale,
      this.rng.next() * Math.PI * 2,
      { speed: def.speed * enemySpeedScale(elapsedSec), ...options },
      this.rng,
    );
    if (def.id in ENEMIES) {
      const id = def.id as EnemyId;
      this.spawnCounts[id] = (this.spawnCounts[id] ?? 0) + 1;
    }
    return runtime;
  }

  private elapsed(): number {
    return (this.scene.registry.get("lf-elapsed") as number) ?? 0;
  }

  private hpScaleFor(elapsedSec: number): number {
    const def = this.currentWave(elapsedSec);
    return enemyHpScale(elapsedSec, tierOfWave(def));
  }

  private spawnOne(def: EnemyDef, playerX: number, playerY: number, elite: boolean): EnemyRuntime {
    const cam = this.camera;
    const angle = this.rng.next() * Math.PI * 2;
    // M8: halbe View-Diagonale + Rand -> Spawns sicher ausserhalb, unabhaengig
    // von der Breite (keine Max(width,height)-Verzerrung bei 780x360).
    const radius = spawnRingRadius(cam.width, cam.height) + 4 + this.rng.next() * 40;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    // Erst clampen, dann prüfen: sonst kann ein geclampte Randspawn mitten im Bild landen.
    let x = Phaser.Math.Clamp(cx + Math.cos(angle) * radius, 20, WORLD_SIZE - 20);
    let y = Phaser.Math.Clamp(cy + Math.sin(angle) * radius, 20, WORLD_SIZE - 20);
    if (!this.outsideView(x, y)) {
      x = Phaser.Math.Clamp(cx - Math.cos(angle) * radius, 20, WORLD_SIZE - 20);
      y = Phaser.Math.Clamp(cy - Math.sin(angle) * radius, 20, WORLD_SIZE - 20);
    }
    return this.spawnAt(def, x, y, elite ? { elite, hpScale: this.hpScaleFor(this.elapsed()) * 3 } : {});
  }
}

function tierOfWave(wave: WaveDef): number {
  return Math.min(4, Math.floor(wave.minute / 5));
}
