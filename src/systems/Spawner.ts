import Phaser from "phaser";
import { ENEMIES, waveForMinute } from "../data";
import type { EnemyDef, EnemyId, WaveDef } from "../data/types";
import { WORLD_SIZE } from "../config";
import { advanceSpawnBudget, elitePackCount, ringSpawnOffsets, SPAWN_FRAME_BUDGET, splitSpawnBurst, streamSpawnOffsets } from "../logic/waves";
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

/**
 * M10 (#12090, m10-spawn-burst-alloc): geteilte Konstanten gegen Allokationen
 * im Burst-Pfad. `EMPTY_SPAWN_OPTIONS` ersetzt das `{}`-Default je Aufruf,
 * `ALL_ENEMY_DEFS` das `Object.values(ENEMIES)` je Fallback-Spawn (beide nur
 * lesend genutzt, nie mutiert).
 */
const EMPTY_SPAWN_OPTIONS: EnemySpawnOptions = Object.freeze({});
const ALL_ENEMY_DEFS: EnemyDef[] = Object.values(ENEMIES);

/** Kompilierte Gewichts-Mischung: statt `Object.entries(mix)` + `filter` je
 *  Spawn (2 Arrays + n Tupel + Closure) einmal je Wellen-Objekt kompilieren.
 *  Reihenfolge/Summe identisch zu `pickEnemy` (logic/waves.ts) — die Ziehung
 *  `roll = rng.next() * total; roll -= w; roll <= 0` ist bitgleich. */
interface CompiledMix {
  ids: EnemyId[];
  weights: number[];
  total: number;
}

export function accrueSpawnAllowance(acc: number, dt: number): number {
  if (!Number.isFinite(acc)) return SPAWN_ALLOWANCE_MAX;
  return Math.min(acc + Math.max(0, dt) * SPAWN_ALLOWANCE_PER_SECOND, SPAWN_ALLOWANCE_MAX);
}

/**
 * M10-frame-tail-batching (#11990): Obergrenze fuer den DEBUG-Spawn-Pfad
 * (`queueEnemyWave`, vom Mess-/Verify-Harness ueber `window.__lf.spawnEnemy`
 * genutzt). Der 50-ms-Top-up des Harness spawnte bis zu 300 Gegner in EINEM
 * Aufruf im rAF-Tick — der daraus folgende Frame lag am Geraet bei 33-58 ms
 * (Beleg: ~/games/.evidence/m10-frame-tail-batching/before-device-frames.json,
 * dt-Nachlauf nach Top-up-Gruppen 41,6/33,4/25 ms). Die Runtime-Spawns werden
 * jetzt ueber Frames verteilt; Positionen/RNG-Reihenfolge entstehen sofort und
 * sind identisch zum bisherigen Verhalten. Der natuerliche Director-Pfad
 * (update) ist unveraendert; kleine Spiel-Spawns (Dawn-Ereignis, Elite-Tier-
 * Aufnahmen) bleiben ueber spawnEnemy() sofort.
 */
export const SPAWN_DEBUG_BATCH_PER_FRAME = 30;

/** Ein in der Debug-Queue wartender Spawn (Position/Optionen bereits fest). */
export interface QueuedSpawn {
  def: EnemyDef;
  x: number;
  y: number;
  elite: boolean;
  hpScale: number;
}

/** Rein/testbar: entnimmt bis zu `cap` Eintraege (Reihenfolge erhalten). */
export function drainSpawnQueue<T>(queue: T[], cap: number): { now: T[]; rest: T[] } {
  const n = Math.max(0, Math.min(cap, queue.length));
  return { now: queue.slice(0, n), rest: queue.slice(n) };
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
  /** M10-frame-tail-batching: Debug-Spawns, die noch verteilt werden. */
  private readonly debugQueue: QueuedSpawn[] = [];
  /**
   * M10 (#12090): Kompilierte Mischungen je Wellen-Objekt (WAVES ist statisch,
   * also max. 30 Eintraege) — der Burst-Pfad baut kein `Object.entries`-Array
   * mehr je Spawn.
   */
  private readonly mixCache = new Map<WaveDef, CompiledMix>();
  /**
   * M10 (#12090): wiederverwendete Spawn-Options statt Objekt-Literale je
   * Spawn. `pool.spawn` liest die Options nur synchron, behaelt sie nie —
   * Mutation zwischen zwei Aufrufen ist dadurch bitgleich (gleiche Werte).
   */
  private readonly spawnOpts: EnemySpawnOptions = {
    elite: false, splitDepth: 0, bossIndex: undefined, radius: undefined, speed: 0, hpScale: undefined,
  };
  private readonly eliteOpts: EnemySpawnOptions = { elite: true, hpScale: 0 };
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
    // M10-frame-tail-batching: wartende Debug-Spawns zuerst abtragen (vor der
    // Wave-Logik, damit die Positionen exakt in der angefragten Reihenfolge
    // materialisieren).
    this.drainDebugQueue();
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
      const id = this.pickEnemyCached(wave);
      const def = id ? ENEMIES[id] : this.rng.pick(ALL_ENEMY_DEFS);
      const elite = this.rng.next() < eliteChance(wave.minute);
      spawned.push(this.spawnOne(def, playerX, playerY, elite));
    }
    return spawned;
  }

  /**
   * M10 (#12090): gewichtete Gegnerwahl ueber die kompilierte Mischung.
   * Mathe und Ziehungsfolge bitgleich zu `pickEnemy` (logic/waves.ts):
   * gleiche Reihenfolge (Object.entries-Insertion-Order = Kompilier-Order),
   * gleiche Summe, gleiche `roll <= 0`-Abbrueche, genau ein `rng.next()`.
   */
  private pickEnemyCached(wave: WaveDef): EnemyId | null {
    let mix = this.mixCache.get(wave);
    if (!mix) {
      const ids: EnemyId[] = [];
      const weights: number[] = [];
      let total = 0;
      for (const [id, w] of Object.entries(wave.mix) as [EnemyId, number][]) {
        if ((w ?? 0) <= 0) continue;
        ids.push(id);
        weights.push(w);
        total += w;
      }
      mix = { ids, weights, total };
      this.mixCache.set(wave, mix);
    }
    if (mix.ids.length === 0) return null;
    let roll = this.rng.next() * mix.total;
    for (let i = 0; i < mix.ids.length; i++) {
      roll -= mix.weights[i];
      if (roll <= 0) return mix.ids[i];
    }
    return mix.ids[mix.ids.length - 1];
  }

  spawnRing(wave: WaveDef, playerX: number, playerY: number, out: EnemyRuntime[], count: number): void {
    // M8: Radius knapp ausserhalb der aktuellen Sichtfläche (nie 480x270-Annahme).
    const ringRadius = spawnRingRadius(this.camera.width, this.camera.height);
    const offsets = ringSpawnOffsets(count, ringRadius);
    for (const off of offsets) {
      const id = this.pickEnemyCached(wave) ?? "bog_rat";
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
      const id = this.pickEnemyCached(wave) ?? "bog_rat";
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
      const id = this.pickEnemyCached(wave) ?? "bogzombie";
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

  /**
   * M10-frame-tail-batching: Debug-/Mess-Spawns ueber Frames verteilen.
   * Berechnet ALLE Positionen sofort (gleiche RNG-Reihenfolge wie spawnEnemy:
   * Winkel, Radius, Clamp), legt sie in die Queue und materialisiert sie im
   * update() mit hoechstens SPAWN_DEBUG_BATCH_PER_FRAME je Frame. Rueckgabe =
   * angefragte Anzahl (Semantik von debugSpawnEnemy bleibt erhalten).
   * Nur fuer das Debug-Harness — nicht fuer Spielereignisse (dort spawnEnemy).
   */
  queueEnemyWave(id: EnemyId, n: number, playerX: number, playerY: number, elite = false): number {
    const def = ENEMIES[id];
    if (!def) throw new Error(`queueEnemyWave: unbekannter Gegner "${id}"`);
    const count = Math.max(0, Math.floor(n));
    const hpScale = this.hpScaleFor(this.elapsed()) * (elite ? 3 : 1);
    for (let i = 0; i < count; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      const radius = 90 + this.rng.next() * 90;
      const x = Phaser.Math.Clamp(playerX + Math.cos(angle) * radius, 20, WORLD_SIZE - 20);
      const y = Phaser.Math.Clamp(playerY + Math.sin(angle) * radius, 20, WORLD_SIZE - 20);
      this.debugQueue.push({ def, x, y, elite, hpScale });
    }
    return count;
  }

  /** Verteilt wartende Debug-Spawns auf den aktuellen Frame (Obergrenze fix). */
  private drainDebugQueue(): void {
    if (this.debugQueue.length === 0) return;
    const { now, rest } = drainSpawnQueue(this.debugQueue, SPAWN_DEBUG_BATCH_PER_FRAME);
    this.debugQueue.length = 0;
    for (const q of now) {
      this.spawnAt(q.def, q.x, q.y, { elite: q.elite, hpScale: q.hpScale });
    }
    this.debugQueue.push(...rest);
  }

  /** Direkter Spawn (Bosse, Splitter-Kinder, Summoner-Minions). */
  spawnAt(def: EnemyDef, x: number, y: number, options: EnemySpawnOptions = EMPTY_SPAWN_OPTIONS): EnemyRuntime {
    const elapsedSec = this.elapsed();
    const hpScale = options.hpScale ?? this.hpScaleFor(elapsedSec);
    const damageScale = enemyDamageScale(elapsedSec);
    // M10 (#12090): Scratch-Options mutieren statt Literal + Spread je Spawn.
    // `pool.spawn` liest synchron (`speed ??`, `bossIndex !== undefined`, ...),
    // behaelt das Objekt nicht — Werte sind identisch zum alten Literal.
    const opts = this.spawnOpts;
    opts.elite = options.elite ?? false;
    opts.splitDepth = options.splitDepth;
    opts.bossIndex = options.bossIndex;
    opts.radius = options.radius;
    opts.hpScale = options.hpScale;
    opts.speed = options.speed ?? def.speed * enemySpeedScale(elapsedSec);
    const runtime = this.pool.spawn(
      def,
      Phaser.Math.Clamp(x, 20, WORLD_SIZE - 20),
      Phaser.Math.Clamp(y, 20, WORLD_SIZE - 20),
      hpScale,
      damageScale,
      this.rng.next() * Math.PI * 2,
      opts,
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
    // M10 (#12090): Scratch-Options statt Literal je Spawn (elite) bzw.
    // geteiltes leeres Options-Objekt (normal).
    if (elite) {
      this.eliteOpts.elite = true;
      this.eliteOpts.hpScale = this.hpScaleFor(this.elapsed()) * 3;
      return this.spawnAt(def, x, y, this.eliteOpts);
    }
    return this.spawnAt(def, x, y);
  }
}

function tierOfWave(wave: WaveDef): number {
  return Math.min(4, Math.floor(wave.minute / 5));
}
