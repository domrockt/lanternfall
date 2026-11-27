import Phaser from "phaser";
import type { EnemyDef } from "../data/types";
import { SPRITE_FRAMES } from "../gfx/textures";
import { baseEnemyDef, eliteFrameId, ELITE_RIM_FRAMES, eliteRimDef } from "../gfx/enemySprites";
import { newAiState, type AiRng, type AiState } from "../logic/enemy-ai";
import { ensureAiState } from "../logic/ai-state";
import { DEPTH } from "../gfx/depth";
import { applyTexture, currentFrame, makeImage } from "../gfx/atlas";
import { C, PAL } from "../palette";

/**
 * Deterministische Elite-Marker-Spezifikation (K3).
 *
 * Elite tragen einen exakt 1 px breiten Amber-Rim-Light (Palette 20), der als
 * leicht größere Kopie der Silhouette hinter dem Sprite liegt. Die Werte hängen
 * ausschließlich vom Gegnerradius ab – kein Zufall, keine Zeitabhängigkeit,
 * deshalb flackert der Marker nicht. Normale Gegner haben keinen Marker
 * (Alpha 0, keine Pixelbreite), Bosse behalten ihre eigene Inszenierung.
 */
export interface EliteMarkerSpec {
  /** Palettenindex der Rim-Light-Farbe (nur Palette). */
  color: number;
  /** Konstante Deckkraft des Markers. */
  alpha: number;
  /** Breite des Rim-Lights in Spielpixeln. */
  rimPx: number;
  /** Skalierungsfaktor der Aura-Kopie relativ zum Sprite. */
  scale: number;
}

export const ELITE_MARKER_COLOR = C.amber;
export const NORMAL_MARKER_SPEC: Readonly<EliteMarkerSpec> = Object.freeze({
  color: -1,
  alpha: 0,
  rimPx: 0,
  scale: 1,
});

export function eliteMarkerTint(): number {
  return PAL[ELITE_MARKER_COLOR];
}

export function eliteMarkerSpec(radius: number): EliteMarkerSpec {
  const r = Math.max(4, Math.round(Number.isFinite(radius) ? radius : 4));
  // 1 Spielpixel Rand: Aura = Sprite + 2 Quellpixel in jeder Achse.
  const srcPx = r * 2;
  return {
    color: ELITE_MARKER_COLOR,
    alpha: 0.92,
    rimPx: 1,
    scale: 1 + 2 / srcPx,
  };
}

export interface EnemySpawnOptions {
  elite?: boolean;
  splitDepth?: number;
  bossIndex?: number;
  radius?: number;
  speed?: number;
  hpScale?: number;
}

export interface EnemyRuntime {
  sprite: Phaser.GameObjects.Sprite;
  /** Additiver Leuchtrand für Elite-Gegner. */
  aura: Phaser.GameObjects.Image;
  /** Eindeutig pro Spawn (Pooling!), damit Projektile keine alte Referenz treffen. */
  uid: number;
  def: EnemyDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  damage: number;
  radius: number;
  speed: number;
  /** Basis-HP-Skalierung dieses Spawns (für Splitter-Kinder). */
  hpScale: number;
  flash: number;
  phase: number;
  alive: boolean;
  bob: number;
  /** Frost: Verlangsamungsfaktor 0..1. */
  slowFactor: number;
  slowTimer: number;
  /** Vollständiger Freeze in Sekunden. */
  freezeTimer: number;
  /** Platzhalter-Boss (M2): skaliert, droppt eine Truhe. */
  boss: boolean;
  /** Index 0..5, -1 = kein Boss. */
  bossIndex: number;
  /** Elite: Leuchtrand, mehr HP, garantierter großer XP-Kristall. */
  elite: boolean;
  /** 0 = normal, 1/2 = Splitter-Generation (max. 2). */
  splitDepth: number;
  /** Seit Spawn vergangene Zeit (s) für Recycling. */
  age: number;
  /** Vom Director recycelt (kein Kill, kein Drop). */
  recycled: boolean;
  /** KI-Zustand (reine Logik in logic/enemy-ai). */
  ai: AiState;
  /** AutoPlay-Gefahrengewicht (1 normal, 0.35 Boss, 1.8 Exploder) – vorab berechnet. */
  threat: number;
  /** Restliche Telegraph-/Wind-up-Zeit für die Darstellung. */
  telegraph: number;
  /** Boss-Angriffszähler. */
  attackCounter: number;
  /** Boss-Verlauf: Phase 1..3. */
  bossPhase: number;
  /** Kurzzeitiger Schadens-Cooldown am Spieler (Boss-Kontakt). */
  contactCooldown: number;
  /** Letzter Treffer durch Gegnerprojektil (nur Debug). */
  hitFlash: number;
  /** Zuletzt gesetzter Tint (vermeidet redundante Phaser-Aufrufe pro Frame). */
  tint: "none" | "red" | "freeze" | "slow" | "flash";
  /** Zuletzt gesetzte Deckkraft (0.45 während Hit-Flash, sonst 1). */
  alpha: number;
  aiRng: AiRng;
}

/** Ein einziger Default-RNG statt einer Closure pro Spawn. */
const DEFAULT_AI_RNG: AiRng = { next: () => Math.random() };

/** Gegner-Pool: Sprites werden wiederverwendet, nie pro Spawn neu erzeugt. */
export class EnemyPool {
  active: EnemyRuntime[] = [];
  private readonly free: EnemyRuntime[] = [];
  private readonly scene: Phaser.Scene;
  private nextUid = 1;
  /**
   * M10-heap-sawtooth: Cache fuer Elite-Rim-Defs (eliteRimDef spreadet sonst
   * pro Elite-Spawn ein neues Objekt). Schluessel ist die Basis-ID; die Defs
   * kommen statisch aus der ENEMIES-Tabelle, daher ist ID → Werte eindeutig.
   */
  private readonly rimDefCache = new Map<string, EnemyDef>();
  /**
   * M10-heap-sawtooth: Cache fuer Elite-Marker-Specs je gerundetem Radius
   * (eliteMarkerSpec baut sonst pro Elite-Spawn ein neues Objekt).
   */
  private readonly markerSpecCache = new Map<number, EliteMarkerSpec>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawn(
    def: EnemyDef,
    x: number,
    y: number,
    hpScale = 1,
    damageScale = 1,
    phase = 0,
    options: EnemySpawnOptions = {},
    rng?: AiRng,
  ): EnemyRuntime {
    const enemy = this.free.pop() ?? this.createRuntime();
    enemy.uid = this.nextUid++;
    enemy.def = def;
    enemy.x = x;
    enemy.y = y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.hpScale = options.hpScale ?? hpScale;
    enemy.maxHp = Math.round(def.hp * enemy.hpScale);
    enemy.hp = enemy.maxHp;
    enemy.damage = Math.max(1, Math.round(def.damage * damageScale));
    enemy.radius = options.radius ?? def.radius;
    enemy.speed = options.speed ?? def.speed;
    enemy.flash = 0;
    enemy.phase = phase;
    enemy.alive = true;
    enemy.slowFactor = 0;
    enemy.slowTimer = 0;
    enemy.freezeTimer = 0;
    enemy.boss = options.bossIndex !== undefined && options.bossIndex >= 0;
    enemy.bossIndex = options.bossIndex ?? -1;
    enemy.elite = Boolean(options.elite);
    enemy.splitDepth = options.splitDepth ?? 0;
    enemy.age = 0;
    enemy.recycled = false;
    enemy.telegraph = 0;
    enemy.attackCounter = 0;
    enemy.bossPhase = 1;
    enemy.contactCooldown = 0;
    enemy.hitFlash = 0;
    enemy.tint = "none";
    enemy.alpha = 1;
    enemy.aiRng = rng ?? DEFAULT_AI_RNG;
    enemy.ai = ensureAiState(enemy.ai, enemy.aiRng);
    enemy.threat = enemy.boss ? 0.35 : def.archetype === "exploder" ? 1.8 : 1;
    enemy.sprite.setScale(enemy.boss ? 1 : enemy.elite ? 1.25 : enemy.splitDepth > 0 ? 0.72 : 1);
    const frames = SPRITE_FRAMES[def.spriteKey];
    applyTexture(enemy.sprite, frames ? frames[0] : def.spriteKey);
    // Elite-Rim-Light (A10): das vorgerenderte Rim-Frame (einziges zusaetzliches
    // Frame im Bestand, keine Laufzeit-Erzeugung) wird beim Elite-Spawn gesetzt.
    // Die Rim-Def ("<id>_rim") haelt den Frame auch gegenueber dem zyklischen
    // Lauf-Frame-Abruf in Run.ts stabil (framesForDef → SPRITE_FRAMES[def.id]).
    // Pool-Reuse unveraendert: dieselbe Sprite-/Aura-Instanz wird genutzt.
    if (enemy.elite) {
      const rimFrames = ELITE_RIM_FRAMES[eliteFrameId(def.id)];
      if (rimFrames) {
        enemy.def = this.rimDefFor(def);
        applyTexture(enemy.sprite, rimFrames[0]);
      }
    } else {
      // Splitter-Kinder erben die Def des Parents; ein Nicht-Elite-Spawn mit
      // Rim-Def restauriert die Basis-Def (kein Rim fuer Nicht-Elites).
      const base = baseEnemyDef(def);
      if (base) enemy.def = base;
    }
    enemy.sprite.setVisible(true);
    enemy.sprite.setActive(true);
    enemy.sprite.setAlpha(1);
    enemy.sprite.clearTint();
    enemy.sprite.setDepth(enemy.boss ? DEPTH.boss : DEPTH.enemy);
    enemy.sprite.setPosition(Math.round(x), Math.round(y));
    // Nur Elite tragen den Marker; Spezifikation ist deterministisch aus dem
    // Radius abgeleitet (K3). Normale Gegner und Bosse bleiben markerlos.
    if (enemy.elite) {
      const spec = this.markerSpecFor(enemy.radius);
      enemy.aura.setBlendMode(Phaser.BlendModes.NORMAL);
      enemy.aura.setTint(eliteMarkerTint());
      enemy.aura.setAlpha(spec.alpha);
      const sx = Number.isFinite(enemy.sprite.scaleX) && enemy.sprite.scaleX > 0 ? enemy.sprite.scaleX : 1;
      const sy = Number.isFinite(enemy.sprite.scaleY) && enemy.sprite.scaleY > 0 ? enemy.sprite.scaleY : 1;
      enemy.aura.setScale(sx * spec.scale, sy * spec.scale);
      enemy.aura.setVisible(true);
    } else {
      enemy.aura.setVisible(false);
      enemy.aura.setAlpha(0);
    }
    enemy.aura.setPosition(Math.round(x), Math.round(y));
    this.active.push(enemy);
    return enemy;
  }

  /** Pools vorwaermen: Runtime-Objekte/Sprites beim Run-Start statt im Peak anlegen. */
  prewarm(n: number): void {
    while (this.free.length < n) {
      const e = this.createRuntime();
      e.sprite.setVisible(false).setActive(false);
      e.aura.setVisible(false);
      this.free.push(e);
    }
  }

  /** Rim-Def gecacht (kein `{...def}`-Objekt pro Elite-Spawn). */
  private rimDefFor(def: EnemyDef): EnemyDef {
    const key = def.id as string;
    let rim = this.rimDefCache.get(key);
    if (!rim) {
      rim = eliteRimDef(def);
      this.rimDefCache.set(key, rim);
    }
    return rim;
  }

  /** Marker-Spec gecacht; Spec haengt nur vom gerundeten Radius ab. */
  private markerSpecFor(radius: number): EliteMarkerSpec {
    const key = Math.max(4, Math.round(Number.isFinite(radius) ? radius : 4));
    let spec = this.markerSpecCache.get(key);
    if (!spec) {
      spec = eliteMarkerSpec(radius);
      this.markerSpecCache.set(key, spec);
    }
    return spec;
  }

  private createRuntime(): EnemyRuntime {
    const sprite = this.scene.add.sprite(0, 0, "enemy_bog_rat").setOrigin(0.5, 0.5).setDepth(DEPTH.enemy);
    // Starttextur spaeter per applyTexture (Atlas-Frame) setzen.
    const aura = makeImage(this.scene, 0, 0, "elite_aura")
      .setDepth(DEPTH.death)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    return {
      sprite, aura, uid: 0, def: {} as EnemyDef, x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0,
      damage: 0, radius: 6, speed: 0, hpScale: 1, flash: 0, phase: 0, alive: false, bob: 0,
      slowFactor: 0, slowTimer: 0, freezeTimer: 0, boss: false, bossIndex: -1, elite: false,
      splitDepth: 0, age: 0, recycled: false, ai: newAiState(DEFAULT_AI_RNG), threat: 1, telegraph: 0,
      attackCounter: 0, bossPhase: 1, contactCooldown: 0, hitFlash: 0, tint: "none", alpha: 1,
      aiRng: DEFAULT_AI_RNG,
    };
  }

  /**
   * Entfernt tote Gegner (in-place, Reihenfolge erhaltend).
   * M10-heap-sawtooth: `splice` alloziert pro Tod ein Ergebnis-Array (Churn in
   * Todeswellen) — stattdessen in-place nach vorne schieben und Länge kappen.
   */
  compact(onDeath?: (e: EnemyRuntime) => void): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (e.alive) continue;
      onDeath?.(e);
      e.sprite.setVisible(false);
      e.sprite.setActive(false);
      e.sprite.clearTint();
      e.aura.setVisible(false);
      for (let j = i; j < this.active.length - 1; j++) this.active[j] = this.active[j + 1];
      this.active.length--;
      this.free.push(e);
    }
  }

  /** Entfernt einen Gegner ohne Kill/Drop (Recycling bei Gegner-Cap). */
  despawn(e: EnemyRuntime): void {
    e.alive = false;
    e.recycled = true;
    e.sprite.setVisible(false).setActive(false);
    e.aura.setVisible(false);
  }

  releaseAll(): void {
    for (const e of this.active) {
      e.alive = false;
      e.sprite.setVisible(false).setActive(false);
      e.aura.setVisible(false);
      this.free.push(e);
    }
    this.active.length = 0;
  }

  get count(): number {
    return this.active.length;
  }
}
