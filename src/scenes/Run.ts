import Phaser from "phaser";
import { C, PAL } from "../palette";
import { CHARACTERS } from "../data/characters";
import { PASSIVES } from "../data/passives";
import type { CharacterDef, CharacterId, EnemyId, PassiveId, WeaponAnyId, WeaponId } from "../data/types";
import {
  GAME_HEIGHT, GAME_WIDTH, PLAYER_BASE_PICKUP_RADIUS, PLAYER_INVULN,
  RUN_LENGTH, SIM_MAX_STEP, WORLD_SIZE, WORLD_TILES,
} from "../config";
import { ENEMIES } from "../data/enemies";
import { BOSSES } from "../data/bosses";
import { SeededRng, hasFlag, mulberry32 } from "../logic/rng";
import { directionToPlayer, resolvePlayerGap, separationPush } from "../logic/separation";
import {
  aggregateMods, effectiveMoveSpeed, effectivePickupRadius,
  type AggregateStats,
} from "../logic/stats";
import { applyXp, xpProgress, xpToNext, type XpState } from "../logic/xp";
import { damageAfterArmor, timeScaleClamped } from "../logic/combat";
import type { Offer } from "../logic/levelup";
import { GroundRenderer } from "../gfx/GroundRenderer";
import { framesForDef, runFrameIndex } from "../logic/enemy-frames";
import { applyTexture, currentFrame, makeImage } from "../gfx/atlas";
import { DEPTH } from "../gfx/depth";
import { PLAYER_FRAMES, type WalkDir } from "../gfx/chars";
import { EnemyPool, type EnemyRuntime } from "../systems/EnemyPool";
import { SpatialHash } from "../systems/SpatialHash";
import { Spawner } from "../systems/Spawner";
import { CombatSystem, type CombatContext } from "../systems/CombatSystem";
import type { EnemyShotRuntime } from "../systems/EnemyProjectiles";
import { PickupSystem } from "../systems/PickupSystem";
import { LevelUpSystem, type OwnedWeapon } from "../systems/LevelUpSystem";
import { ChestSystem, type ChestRuntime } from "../systems/ChestSystem";
import { EnemyProjectilePool, enemyShotHitFx, shotTextureFor } from "../systems/EnemyProjectiles";
import { HazardSystem } from "../systems/Hazards";
import {
  BossSystem, BOSS_HUD_CLEARANCE, bossHudRects, bossSpriteScreenRect, rectsOverlap, type BossInfo,
} from "../systems/BossSystem";
import { attachEnemyAiStream, resetAiState } from "../logic/ai-state";
import { shouldSplit, stepEnemyAi, type AiAction, type AiParams, type AiRng } from "../logic/enemy-ai";
import { FINAL_BOSS_AT, bossSpawnSecond, dawnFinished, weaponRangeFactor } from "../logic/scaling";
import { botDirection, chooseBestOffer, type BotPoint, type BotThreat } from "../logic/autoplay";
import { terrainSpeedFactor, type TerrainKind } from "../logic/terrain";
import { chestRewards, type ChestResult } from "../logic/evolution";
import { EVOLUTIONS } from "../data/evolutions";
import type { RunResult } from "./Results";
import { lodFor, fxAlphaFor, type LodState } from "../logic/lod";
import { shouldAggregateDamage } from "../logic/damage-numbers";
import { shakeFor, hitStopFor, mergeHitStop, clampKnockbackSpeed, MAX_HITSTOP_SECONDS } from "../logic/feedback";
import { deathClassFor } from "../logic/death";
import { getSettings } from "../audio/settings";
import { getAudio } from "../audio/AudioSystem";
import {
  escToggleAllowed,
  InputState,
  padToggleEvent,
  type EscToggleEvent,
  type Vec2,
} from "../input/InputState";
import { readSceneGamepad } from "../input/Gamepad";
import { getTouchSnapshot, resetTouchSnapshot } from "../input/TouchState";
import {
  RUN_LIGHT_ALPHA_MAX,
  pillarBakeLevel,
  runAddAlpha,
  uniformScale,
} from "../logic/fx-caps";

/**
 * M10-chaos-fix-glow-runpath (B1-Teil): fx_pillar-Ziel-Pixelgroesse Run-seitig
 * backen. Die Level-1-Frames liegen als Einzeltexturen vor (gen-fx.ts addFrames:
 * `fx_pillar`, `fx_pillar_2`..`fx_pillar_5`, 26x72); jede Bake-Stufe L ist ein
 * nearest-Hochskalieren der Level-1-Textur auf 26L x 72L, damit der Draw-Scale
 * Scale/L <= 1 bleibt (1-px-Raster im 4x-Zoom). Idempotent (textures.exists),
 * lazy beim ersten Ereignis-FX gebacken — Level-1 bleibt unveraendert.
 */
const PILLAR_FRAME_KEYS = ["fx_pillar", "fx_pillar_2", "fx_pillar_3", "fx_pillar_4", "fx_pillar_5"];

function ensurePillarBake(scene: Phaser.Scene, level: number): string[] {
  if (level <= 1) return PILLAR_FRAME_KEYS;
  return PILLAR_FRAME_KEYS.map((baseKey, i) => {
    const key = `fx_pillar_bake${level}_${i}`;
    if (scene.textures.exists(key)) return key;
    const src = scene.textures.get(baseKey).getSourceImage() as CanvasImageSource & { width: number; height: number };
    const canvas = document.createElement("canvas");
    canvas.width = src.width * level;
    canvas.height = src.height * level;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, canvas.width, canvas.height);
    scene.textures.addCanvas(key, canvas);
    return key;
  });
}

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
  /**
   * m10-run-determinism-fix: nicht simulierte Rest-Sim-Zeit (Sekunden) aus
   * scaledDt. Nur volle SIM_MAX_STEP-Einheiten werden simuliert, der Rest
   * bleibt hier liegen und wird im nächsten Frame verbraucht — die Phase
   * aller Tick-Zyklen (Waffen-Cooldowns, Spawn-Timer, Regen) ist dadurch
   * unabhängig vom Echtzeit-Frame-Raster deterministisch.
   */
  simCarry = 0;
  /**
   * m10-run-determinism-fix: eigene KI-RNG (aus dem Run-Seed abgeleitet, bewusst
   * NICHT das Run-RNG — Kampff-/Spawn-Ziehungen bleiben unveraendert). Vorher
   * nutzte die Gegner-KI den Math.random-Default des EnemyPool → zwei Laeufe
   * mit gleichem Seed divergierten (Blink-Winkel, Timer, orbitDir).
   */
  aiRng: AiRng = { next: () => 0 };
  godMode = false;
  autoPlay = false;
  paused = false;
  /**
   * m10-loading-screen K3: Start-Gate. Während des Fade-ins (CharSelect → Run)
   * steht der Sim (freezeGate friert Timer/Tweens im update(), kein Sim-Schritt),
   * damit der erste sichtbare Run-Frame ein fertig aufgebautes, stehendes Bild
   * zeigt (Timer 00:00, 0 Gegner). FADE_IN_COMPLETE öffnet das Gate. detstart
   * (Mess-Harness) setzt das Gate bewusst NICHT — dort steuert resumeRun() den
   * Start. Bewusst NICHT über `paused`: die UI blendet das Pause-Panel direkt
   * an `paused` ein — das Gate soll kein Pause-UI aufblitzen.
   */
  startGate = false;
  /**
   * M10-esc-pause-fix: timeStamp des zuletzt akzeptierten ESC-Keydowns
   * (Dedup pro physischem Press, siehe escToggleAllowed in InputState).
   */
  private lastEscToggleTs: number | null = null;
  /**
   * M10-pause-freeze: letzter angewendeter Freeze-Zustand des Update-Gates
   * (nur bei Wechsel anwenden, nicht pro Frame).
   */
  private freezeGate = false;
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
  /** m10-run-determinism-fix: Sim-Zeit, bei der die Zeitlupe endet. */
  private slowmoUntil = 0;
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
  /** M8: Vignette folgt der aktuellen View-Groesse (Resize/Rotation). */
  private vignette?: Phaser.GameObjects.Image;
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
  /** M8-input: proengefuehrte Bewegung (Tastatur/Touch/Gamepad),  pro Frame. */
  private inputState = new InputState();
  private moveInput: Vec2 = { x: 0, y: 0 };
  private scratch: EnemyRuntime[] = [];
  /**
   * m10-run-cpu-budget K3 (Allocation-Hoisting): Der update-Loop erzeugte vorher
   * pro Sim-Schritt ein KI-Param-Objekt JE GEGNER (~30 000 Objekte/s bei 500
   * Gegnern, young-gen GC-Druck -> CPU-ms-p95-Spitzen) plus Combat-Kontext,
   * 4 Closures, Pickup-View und Gap-Optionen je Schritt. Alle Konsumenten
   * (stepEnemyAi, combat.update, enemyShots/hazards/pickups.update,
   * resolvePlayerGap) lesen synchron und behalten keine Referenz — Wiederver-
   *wendung ist daher verhaltens-bitgleich (run-determinism-Guard + K4-Test).
   */
  private aiParams: AiParams = {
    archetype: "chaser",
    tier: 1,
    x: 0,
    y: 0,
    playerX: 0,
    playerY: 0,
    speed: 0,
  };
  /** Wiederverwendeter Combat-Kontext; onHit/onHeal als Instanz-Closures (1x). */
  private combatCtx: CombatContext = {
    dt: 0,
    playerX: 0,
    playerY: 0,
    facingX: 1,
    facingY: 0,
    weapons: [],
    enemies: [],
    hash: null as unknown as SpatialHash<EnemyRuntime>,
    agg: null as unknown as AggregateStats,
    rng: null as unknown as SeededRng,
    onHit: (enemy: EnemyRuntime, damage: number, weaponId: string, killed: boolean): void => {
      this.damageByWeapon[weaponId] = (this.damageByWeapon[weaponId] ?? 0) + damage;
      getAudio().play(killed ? "kill" : "hit");
      if (enemy.boss && !killed) this.bossHitFeedback();
      // M10: Evolutions-Signatur am getroffenen Gegner (rein visuell, Throttle im FxSystem).
      this.combat.fx.spawnEvolution(weaponId, killed ? "death" : "hit", enemy.x, enemy.y);
    },
    onHeal: (amount: number): void => {
      this.hp = Math.min(this.maxHp, this.hp + amount);
    },
  };
  private onEnemyShotHit = (damage: number, shot: EnemyShotRuntime): void => {
    this.hurtPlayer(damage, shot.x, shot.y);
    enemyShotHitFx(this, shot.x, shot.y);
  };
  private onHazardHit = (damage: number): void => {
    this.hurtPlayer(damage, this.posX, this.posY);
  };
  private onCollect = (value: number): void => {
    this.giveXpInternal(value);
  };
  /** Sichtfenster fuer Pickup-Culling, pro Schritt neu befuellt. */
  private pickupView = { x0: 0, y0: 0, x1: 0, y1: 0 };
  /** Konstante Optionen fuer den Spieler-Abstoss-Ring (Closure 1x statt je Schritt). */
  private gapOpts = { ignore: (e: EnemyRuntime): boolean => e.boss };
  /** Scratch-Liste fuer Splitter-Kinder statt frischem Array je Schritt. */
  private splitsScratch: EnemyRuntime[] = [];
  /** Terrain-Faktor-Cache pro 16-px-Tile: kindAt() ist Noise-teuer und wurde
   *  vorher fuer jeden Gegner in jedem Frame aufgerufen. 0 = unbekannt,
   *  1 = Gras, 2 = Wasser. Feste Groesse (256×256 Tiles) statt wachsender Map. */
  private terrainCache = new Uint8Array(WORLD_TILES * WORLD_TILES);
  private terrainCacheFilled = 0;
  /** Wiederverwendete Bot-Arrays: vermeidet ~700 Objekte/Frames Allokation. */
  private botEnemies: BotThreat[] = [];
  private botProjectiles: BotThreat[] = [];
  private botHazards: BotThreat[] = [];
  private botGems: BotPoint[] = [];
  private botHazardPool: BotThreat[] = [];
  private botProjectilePool: BotThreat[] = [];
  private botEnemyPool: BotThreat[] = [];
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
    // m10-run-determinism-fix: abgeleiteter Seed fuer die Gegner-KI (deterministisch).
    this.aiRng = { next: mulberry32(((this.seed ^ 0x9e3779b9) >>> 0) + 0x6d2b79f5) };
    this.elapsed = 0;
    this.timeScale = 1;
    this.godMode = false;
    this.autoPlay = false;
    this.paused = false;
    this.freezeGate = false;
    // m10-run-determinism-fix: ?detstart=1 startet den Run PAUSIERT — bewusst
    // NACH dem Reset-Block oben (sonst ueberschreibt paused=false das Gate).
    // Mess-Harness (scripts/m10-run-determinism.mjs) setzt dann Trace/autoPlay/
    // timeScale, BEVOR der erste Sim-Schritt laeuft, und ruft resumeRun(). Ohne
    // dieses Gate war die Start-Phase ein Wall-Clock-Rennen: je nachdem, in
    // welchem Sim-Schritt das Debug-Eval landete, bewegte der Bot den Spieler
    // frueher/spaeter — zwei Laeufe mit gleichem Seed divergierten ab Schritt 1
    // (Probe-Beleg: rep0 posX 20495500 vs rep1 20480000 nach Schritt 1).
    if (hasFlag("detstart")) this.paused = true;
    // m10-loading-screen K3: Run-Start-Gate (siehe startGate). Nach dem synchronen
    // Aufbau in create() bleibt der Sim stehen, bis der Fade-in komplett ist —
    // der Spieler sieht nie einen halbfertigen oder schon laufenden Run.
    // Bewusst NICHT ueber `paused`: die UI-Szene blendet das Pause-Panel direkt
    // an `paused` ein (UI.ts pauseVisible) — das Gate friert stattdessen ueber
    // die freezeGate-Logik im update() (Timer/Tweens stehen, kein Sim-Schritt),
    // ohne dass das Pause-UI aufblitzt.
    if (!hasFlag("detstart")) {
      this.startGate = true;
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
        this.startGate = false;
      });
    }
    this.time.paused = false;
    this.tweens.resumeAll();
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
    this.fxRestore = 0;
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
    this.terrainCache.fill(0);
    this.terrainCacheFilled = 0;
    this.botEnemies.length = 0;
    this.botProjectiles.length = 0;
    this.botHazards.length = 0;
    this.botGems.length = 0;
    this.botHazardPool.length = 0;
    this.botProjectilePool.length = 0;
    this.botEnemyPool.length = 0;
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
      .setAlpha(RUN_LIGHT_ALPHA_MAX);
    this.vignette = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "vignette")
      .setScrollFactor(0).setDepth(80).setAlpha(0.9);
    this.vignette.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onViewResize, this);

    this.hpBg = this.add.rectangle(startX - 13, startY - 23, 26, 5, PAL[C.ink]).setOrigin(0, 0.5).setDepth(25).setVisible(false);
    this.hpFill = this.add.rectangle(startX - 12, startY - 22, 24, 2, PAL[C.crimson]).setOrigin(0, 0.5).setDepth(26).setVisible(false);

    this.cameras.main.startFollow(this.player, true, 0.18, 0.18);
    this.cameras.main.fadeIn(220, 6, 7, 12);

    const startWeapon: WeaponId = this.character.startWeapon;
    this.levelSys = new LevelUpSystem(startWeapon, 1);
    this.recomputeStats();
    this.hp = this.maxHp;

    // m10-ai-rng-seed: Run-Seed an den Pool weitergeben, damit der Fallback-KI-RNG
    // aus dem gesäten Quell gespeist wird (statt Math.random).
    this.enemies = new EnemyPool(this, this.seed);
    this.hash = new SpatialHash<EnemyRuntime>(32);
    this.spawner = new Spawner(this, this.enemies, this.rng);
    this.combat = new CombatSystem(this);
    this.combat.setRangeScale(weaponRangeFactor(GAME_WIDTH, GAME_HEIGHT));
    this.pickups = new PickupSystem(this);
    this.chests = new ChestSystem(this);
    this.enemyShots = new EnemyProjectilePool(this);
    this.hazards = new HazardSystem(this);
    this.bosses = new BossSystem(this, this.enemies, this.spawner, this.hazards, this.enemyShots, this.rng);
    // Pools vor dem ersten Frame vorwaermen: verhindert Peak-Allokationen und
    // haelt den Retained-Heap ueber den Run stabil.
    this.enemies.prewarm(520);
    this.pickups.prewarm(180);
    this.enemyShots.prewarm(64);
    this.combat.prewarm();

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

    this.input.keyboard!.removeAllListeners("keydown-ESC");

    this.inputState.reset();
    this.lastEscToggleTs = null;
    this.moveInput = { x: 0, y: 0 };
    resetTouchSnapshot();

    this.scene.launch("ui");
    this.registry.set("lf-elapsed", 0);
    getAudio().setMusic("run");
    // M10 frame-cadence: Sicht-Beleg (GIF/Log) liest die tatsaechlich am
    // Sprite stehenden Gegner-Frames; nur mit ?debug=1, Muster wie __lfEnemyShots.
    if (hasFlag("debug")) {
      (globalThis as unknown as Record<string, unknown>).__lfEnemyFrames = () =>
        this.enemies.active
          .filter((e) => e.alive && Math.abs(e.x - this.posX) < 260 && Math.abs(e.y - this.posY) < 220)
          .slice(0, 12)
          .map((e) => {
            const cam = this.cameras.main;
            return {
              id: e.def.id,
              frame: currentFrame(e.sprite),
              sx: Math.round(e.x - cam.scrollX),
              sy: Math.round(e.y - cam.scrollY),
            };
          });
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      delete (globalThis as unknown as Record<string, undefined>).__lfEnemyFrames;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onViewResize, this);
      this.inputState.reset();
      resetTouchSnapshot();
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
    this.combat?.damageNumbers.setEnabled(getSettings().damageNumbers);
    if (this.finished) return;
    const realDt = Math.min(0.05, delta / 1000);

    // M8-input: Tastatur + Touch + Gamepad werden einmal pro echtem Frame zu einem
    // Bewegungsvektor (Länge 0..1) und flankengetriggerten Aktionen vereint.
    const frame = this.inputState.update({
      keyboard: {
        up: this.keys.up.isDown || this.keys.up2.isDown,
        down: this.keys.down.isDown || this.keys.down2.isDown,
        left: this.keys.left.isDown || this.keys.left2.isDown,
        right: this.keys.right.isDown || this.keys.right2.isDown,
      },
      gamepad: readSceneGamepad(this),
      touch: getTouchSnapshot(),
    });
    this.moveInput = frame.move;
    // Start/Pause nicht durchschlagen lassen, wenn das Optionsmenue offen ist
    // (dort schliesst B/ESC das Menue, statt den Run fortzusetzen).
    if (frame.actions.pause && !this.levelUpOpen && !this.chestOpen
      && !this.registry.get("lf-options-open")) {
      // M10-pad-start-pause: Pad-Start (Button 9) und Touch-Pause-Puls laufen
      // als ESC-Aequivalent durch denselben Dedup-Pfad (escToggleAllowed) —
      // eine TV-Fernbedienung hat kein ESC. Primärer Schutz gegen Mehrfach-
      // Toggle ist die Edge-Triggerung in InputState (genau eine pause-Edge pro
      // Press); der Dedup ist die zweite Verteidigung. Zeitquelle ist die
      // Wanduhr (ms-Floor), nicht die Szenen-Clock (stand beim Fortsetzen aus
      // der Pause still): Doppel-Dispatch im selben Frame = gleicher timeStamp
      // -> genau ein Toggle; zwei echte Presses liegen weit ueber 1 ms auseinander.
      this.togglePause(padToggleEvent(Math.floor(performance.now())));
    }

    // AutoPlay wählt Level-Up-Angebote nach kurzer Anzeige (unbeaufsichtigter Run).
    if (this.levelUpOpen || this.chestOpen) {
      this.paused = true;
      return;
    }
    // M10-pause-freeze (#7506): Szenen-Clock und Tweens sind wall-clock-getrieben
    // und laufen weiter, obwohl update() bei paused früh zurückkehrt. Ohne dieses
    // Gate fressen/gebarben sie Pausenzeit (Beleg shots/m10-pause-freeze-before.json):
    //   - Timer-Ketten über denselben delayedCall-Mechanismus wie Run.ts
    //     (Boss-Tod -> hp=0+Truhe, Truhe-Autoöffnung, Morgendämmerung, Banner-Retry)
    //     feuerten mitten in der Pause und mutierten den Sim-Zustand,
    //   - FX-Tweens (Splash/Blink, Run.ts 711/995/1097) animierten im Pausenbild.
    // Gate: nur bei Wechsel anwenden (freezeGate), nicht pro Frame.
    const frozen = this.paused || this.startGate;
    if (this.freezeGate !== frozen) {
      this.freezeGate = frozen;
      this.time.paused = frozen;
      if (frozen) this.tweens.pauseAll();
      else this.tweens.resumeAll();
    }
    if (this.paused || this.startGate) return;

    // Feedback-Debounce laeuft in Echtzeit (nicht in Sim-Zeit): bei timeScale 30
    // wuerde ein 1,2-s-Boss-Cooldown sonst alle 40 ms Wandzeit erneut feuern und
    // Shake/Hit-Stop dauerhaft neu starten (Rumble/Dauerfreeze).
    if (this.bossFeedbackCooldown > 0) this.bossFeedbackCooldown = Math.max(0, this.bossFeedbackCooldown - realDt);
    // Harte Obergrenze: kein aufaddierter/verlaengerter Stop ueber das Budget hinaus.
    this.hitStop = Math.min(this.hitStop, MAX_HITSTOP_SECONDS);

    // Evolution-Zeitlupe (0,35–0,5 s) läuft in Echtzeit aus.
    // m10-run-determinism-fix: ENDE der Zeitlupe an Sim-Zeit gekoppelt
    // (slowmoUntil), nicht an Wanduhr-Frames — sonst hing die Anzahl der
    // Zeitschritte während der Zeitlupe am Echtzeit-Frame-Raster. Mittelwert
    // unverändert: 0,9 s Wandzeit bei timeScale 0,45 = 0,405 s Sim-Zeit.
    if (this.slowmoRemaining > 0) {
      if (this.elapsed >= this.slowmoUntil) {
        this.slowmoRemaining = 0;
        this.timeScale = this.slowmoRestore;
      }
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
    // m10-run-determinism-fix: NUR volle SIM_MAX_STEP-Einheiten simulieren;
    // der Rest bleibt als Carry-over (this.simCarry) für den nächsten Frame
    // liegen. Vorher wurde der Rest als variabler Partial-Schritt ausgeführt —
    // die Tick-Phase aller Zyklen war damit frame-abhängig und zwei Läufe mit
    // gleichem Seed divergierten ab Sim-Sekunde 1 in elapsed/px
    // (Beleg shots/m10-run-det-verdict.json, deterministic:false).
    // Bound: realDt ist auf 0,05 s geclampt, timeScale auf 60 → pro Frame
    // maximal 3,0 s scaledDt; simCarry kann daher nie über 3,05 s wachsen
    // (Pause/Hit-Stop akkumulieren nicht), ein separates Cap ist nicht nötig.
    this.simCarry += scaledDt;
    while (this.simCarry + 1e-9 >= SIM_MAX_STEP && !this.finished) {
      this.simCarry -= SIM_MAX_STEP;
      this.simulate(SIM_MAX_STEP);
      // Level-up-Pruefung PRO Schritt (statt einmal am Frame-Ende): bei 30x
      // laufen sonst bis zu 10 Schritte pro Frame, und der Punkt, an dem der
      // Dialog oeffnet, waere vom Frame-Raster abhaengig.
      this.maybeOpenLevelUp();
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
    // m10-run-determinism-fix: Kamera-Anker PRO Sim-Schritt aus der SIM-Position
    // (posX/posY, nicht das gerundete visualX). Spawner.spawnOne positioniert
    // Spawns relativ zum Kamera-Zentrum (cam.scrollX + width/2) und entscheidet
    // outsideView() mit denselben Werten — der Lerp-Follow (0,18) glättete
    // scrollX aber pro Echtzeit-Frame, sodass Spawn-Positionen frame-abhängig
    // waren (Probe-Beleg: Spawn-Position bei bitgleichem RNG-Ziehungsstand um
    // ~1 px unterschiedlich; Kamerazentrum um 8/23 px). Der Anker gilt exakt
    // während des Schritts; das Rendering folgt danach weiter dem Phaser-Lerp.
    const detCam = this.cameras.main;
    detCam.scrollX = this.posX - detCam.width / 2;
    detCam.scrollY = this.posY - detCam.height / 2;
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
    if (this.agg.regen > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.agg.regen * dt);
    }

    this.movePlayer(dt);
    let spawned: EnemyRuntime[] = [];
    if (this.dawn) {
      // m10-frame-tail-followup (#12288): während der Morgendämmerung läuft
      // Spawner.update() nicht — der Debug-Queue-Drain hier hält die
      // Batching-Obergrenze (30 je Substep) ein, ohne die Wave-Logik zu
      // starten; gequeuete Debug-Spawns materialisieren verteilt statt nie.
      this.spawner.drainDebugQueue();
    } else {
      spawned = this.spawner.update(this.elapsed, dt, this.posX, this.posY);
    }
    for (const e of spawned) {
      if (e.elite) this.elitesSpawned += 1;
      this.attachAiRng(e);
    }
    this.updateEnemies(dt);
    this.bosses.update(dt, this.posX, this.posY);
    // m10-run-cpu-budget K3: Kontextobjekt wiederverwenden statt Literal je Schritt.
    const ctx = this.combatCtx;
    ctx.dt = dt;
    ctx.playerX = this.posX;
    ctx.playerY = this.posY;
    ctx.facingX = this.facingX;
    ctx.facingY = this.facingY;
    ctx.weapons = this.levelSys.weapons;
    ctx.enemies = this.enemies.active;
    ctx.hash = this.hash;
    ctx.agg = this.agg;
    ctx.rng = this.rng;
    this.combat.update(ctx);
    this.collectKills();
    this.touchDamage();
    this.enemyShots.update(dt, this.posX, this.posY, this.onEnemyShotHit);
    this.hazards.update(dt, this.posX, this.posY, this.onHazardHit);
    if (this.finished) return;
    this.enemies.compact();
    this.maybeSplash(dt);

    const pickupRadius = (effectivePickupRadius(PLAYER_BASE_PICKUP_RADIUS, this.agg) + this.combat.pickupBonus)
      * weaponRangeFactor(GAME_WIDTH, GAME_HEIGHT);
    const cam = this.cameras.main;
    const view = this.pickupView;
    view.x0 = cam.scrollX - 80;
    view.y0 = cam.scrollY - 80;
    view.x1 = cam.scrollX + cam.width + 80;
    view.y1 = cam.scrollY + cam.height + 80;
    this.pickups.update(dt, this.posX, this.posY, pickupRadius, this.onCollect, view);
    const nearChest = this.chests.near(this.posX, this.posY, 15);
    if (nearChest) this.openChest(nearChest);
  }

  /** M6: Endgame-Effekt-Dämpfung; Debug-Abnahme kann sie für Vorher-Shots aus. */
  private fxDampingEnabled = true;

  /**
   * M10-vfx-restore: Stufenweise Ruecknahme der A7-Daempfung (Lane m10-vfx-restore).
   * Die Alpha-Konstanten (0,5/0,72) liegen in `logic/lod.ts` (fremd geclaimed:
   * m10-prop-density-lod), die Glow-dpr-Alpha in `gfx/gen-fx.ts` (fremd geclaimed:
   * m10-boss-fx-contrast). Die Stufe wirkt daher nur auf die Run.ts-eigenen Hebel:
   * FX-/Partikel-Pool (public `setAlphaScale`) und das additive Laternenlicht.
   * Stufe 1 = 0,65 im minimal-LOD (A7: 0,5) — bewusst unter der 0,7-Schwelle des
   * FxSystem, damit additive Glows NORMAL bleiben (kein Batch-/Blend-Rueckschritt).
   * Stufe 2 (Glows +0,1) braucht gen-fx.ts -> Anfrage in .dispatch/requests.md.
   */
  static readonly FX_RESTORE_ALPHA = 0.65;
  private fxRestore = 0;

  /** Abnahme/Mess-Skript: Ruecknahme-Stufe setzen (0 = A7-Daempfung, 1 = 0,65). */
  setFxRestore(stage: number): void {
    const next = Math.max(0, Math.min(1, Math.floor(stage)));
    if (next === this.fxRestore) return;
    this.fxRestore = next;
    this.applyFxRestore();
  }

  /**
   * Ruecknahme anwenden. Nur im minimal-LOD mit aktiver Daempfung; reduced/full
   * behalten fxAlphaFor unverändert. Idempotent (setAlphaScale early-returnt bei
   * gleichem Wert), darum darf applyLod sie jeden Frame aufrufen.
   */
  private applyFxRestore(): void {
    const active = this.fxDampingEnabled && this.fxRestore > 0 && this.lod.level === "minimal";
    const a = active ? Run.FX_RESTORE_ALPHA : this.fxDampingEnabled ? fxAlphaFor(this.lod.level) : 1;
    this.combat?.fx.setAlphaScale(a);
    this.combat?.particles.setAlphaScale(a);
    this.light?.setAlpha(RUN_LIGHT_ALPHA_MAX * (this.fxDampingEnabled ? a : 1));
  }

  setFxDamping(enabled: boolean): void {
    this.fxDampingEnabled = enabled;
    this.combat?.setFxDamping(enabled);
    this.applyFxRestore();
  }

  /** M5-LOD: Effekt-Caps/Trails/Damage-Summen an Gegnerlast anpassen. */
  private applyLod(): void {
    const bossFight = this.bosses?.hasAliveBoss() ?? false;
    const lod = lodFor(this.enemies?.count ?? 0, bossFight);
    if (lod.level !== this.lod.level) {
      this.lod = lod;
      this.combat?.setLod(lod);
      this.pickups?.setCap(lod.gemCap);
      // Auch die additive Laternen-Lichtfläche dämpfen: sie liegt über den
      // Gegnern und ist im Endgame ein Hauptteil der Überstrahlung.
      this.light?.setAlpha(RUN_LIGHT_ALPHA_MAX * (this.fxDampingEnabled ? fxAlphaFor(lod.level) : 1));
    }
    // M10-vfx-restore: Ruecknahme-Stufe nach dem LOD-Update sicherstellen
    // (idempotent; greift nur im minimal-LOD).
    this.applyFxRestore();
  }

  /** Kurzer Boss-Treffer-Hit-Stop + dosierter Shake (max. ~6 px). */
  private bossHitFeedback(): void {
    if (this.bossFeedbackCooldown > 0) return;
    this.bossFeedbackCooldown = 1.2;
    this.hitStop = mergeHitStop(this.hitStop, hitStopFor("bossHit"));
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
    this.showBossBannerWhenVisible(index, b);
  }

  /**
   * M10 A10: Das Intro-Banner (UI-Szene, feste Position y=68..116) darf erst
   * erscheinen, wenn das Boss-Frame vollstaendig unter HP-Leiste und Banner
   * steht. Der Spawn selbst ist bereits komponiert; dieser Guard prueft die
   * tatsaechliche Screen-Lage (Kamera-Zoom/Shake) und verschiebt den
   * Banner-Start nur minimal. Ist der Boss nicht sichtbar, wird das Banner
   * ausgelassen statt es ueber ihn zu legen. Die Banner-Dauer bleibt in der
   * UI unveraendert (AutoPlay/God-Pfad unberuehrt).
   */
  private showBossBannerWhenVisible(index: number, boss: EnemyRuntime): void {
    const tryShow = (attempt: number): void => {
      if (!boss.alive || this.finished || this.dawn) return;
      const cam = this.cameras.main;
      const rect = bossSpriteScreenRect(
        boss.x, boss.y, index, cam.scrollX, cam.scrollY, cam.zoom,
        GAME_WIDTH, GAME_HEIGHT,
      );
      // Merge K6: Guard prueft gegen banner.bottom + 6 (starkere Bedingung,
      // da das Banner fest unter der HP-Leiste haengt) — der Intro-Zoom-Puls
      // (1.14) hebt die Sprite-Oberkante im Screen-Raum, die Komposition in
      // BossSystem haelt sie trotzdem frei; der Guard ist zweite Sicherung.
      const { banner } = bossHudRects(GAME_WIDTH);
      const clear = rect.y >= banner.y + banner.h + BOSS_HUD_CLEARANCE && !rectsOverlap(rect, banner);
      if (clear) {
        this.events.emit("bossSpawn", { index, name: BOSSES[index].name, hp: boss.maxHp });
        return;
      }
      if (attempt >= 12) return;
      this.time.delayedCall(80, () => tryShow(attempt + 1));
    };
    tryShow(0);
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
    if (this.isWaterAt(px, py)) this.spawnSplash(px, py + 5);
    for (const e of this.enemies.active) {
      if (!e.alive) continue;
      const dx = e.x - px;
      const dy = e.y - py;
      if (dx * dx + dy * dy > 340 * 340) continue;
      if (this.isWaterAt(e.x, e.y) && Math.random() < 0.12) this.spawnSplash(e.x, e.y + 4);
    }
  }

  private spawnSplash(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const drop = makeImage(this, Math.round(x + (i - 1) * 3), Math.round(y), "fx_spark")
        .setDepth(6).setTint(PAL[C.fogBlue]).setScale(0.6).setAlpha(runAddAlpha(0.8));
      this.tweens.add({
        targets: drop, y: y - 8 - i * 2, alpha: 0, scale: 0.2,
        duration: 240 + i * 30, onComplete: () => drop.destroy(),
      });
    }
  }

  /**
   * Terrain-Faktor einer Weltposition, pro 16-px-Tile gecacht. Referenzpunkt
   * ist die Tile-Mitte: dadurch ist das Ergebnis unabhaengig davon, wer zuerst
   * fragt (vorher wurde der erste Pixel eines Tiles gespeichert). Fuer die
   * Splash-Entscheidung wird weiterhin exakt klassifiziert.
   */
  private terrainFactorAt(x: number, y: number): number {
    const tx = Math.floor(x / 16);
    const ty = Math.floor(y / 16);
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return 1;
    const key = tx * WORLD_TILES + ty;
    const cached = this.terrainCache[key];
    if (cached !== 0) return cached / 100;
    const factor = terrainSpeedFactor(this.ground.kindAt(tx * 16 + 8, ty * 16 + 8) as TerrainKind);
    this.terrainCache[key] = Math.round(factor * 100);
    this.terrainCacheFilled += 1;
    return factor;
  }

  /** Exakte Wasserabfrage fuer Spritzer (nicht gecacht, ~10 Hz statt 60 Hz). */
  private isWaterAt(x: number, y: number): boolean {
    return this.ground.kindAt(x, y) === "water";
  }

  // ── Spieler ──────────────────────────────────────────────────
  /**
   * m10-run-determinism-fix: KI-RNG + KI-Zustand eines frisch gespawnten
   * Gegners deterministisch aus dem Run-Seed ableiten. Der EnemyPool setzt
   * sonst den Math.random-Default (frame-/wallclock-abhaengige Blink-Winkel,
   * Timer, orbitDir) — das war der zweite Nichtdeterminismus-Layer.
   */
  private attachAiRng(e: EnemyRuntime): void {
    // m10-ai-stream-cadence-r2: pro Gegner eigener KI-RNG-Stream aus
    // (Run-Seed, UID) statt EINES gemeinsamen Streams — der KI-Zug zieht
    // damit nicht mehr zeichenzahlabhängig (AI-Stagger-/Kadenz-Verschiebungen
    // ändern keine Ziehungsfolgen mehr). resetAiState zieht den
    // Initialzustand aus DEMSELBEN pro-Gegner-Stream.
    e.aiRng = attachEnemyAiStream(e, this.seed, e.uid);
    if (e.ai) resetAiState(e.ai, e.aiRng);
  }

  private movePlayer(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.autoPlay) {
      const dir = this.autoDirection();
      dx = dir.x;
      dy = dir.y;
    } else {
      // Analoger Vektor aus InputState (Tastatur digital, Touch/Stick stufenlos).
      dx = this.moveInput.x;
      dy = this.moveInput.y;
    }
    const len = Math.hypot(dx, dy);
    if (len < 0.001) {
      this.moving = false;
      return;
    }
    // Blickrichtung aus der ungeklemmten Laenge, danach Sicherheitsklemme.
    // So bleibt facing auch bei (theoretisch) >1 langen Vektoren ein Einheitsvektor.
    const lookX = dx / len;
    const lookY = dy / len;
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.moving = true;
    const terrain = this.terrainFactorAt(this.posX, this.posY);
    const speed = effectiveMoveSpeed(this.character.speed, this.agg) * terrain;
    this.facingX = lookX;
    this.facingY = lookY;
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
    const enemies = this.botEnemies;
    enemies.length = 0;
    let ei = 0;
    for (const e of this.enemies.active) {
      if (!e.alive) continue;
      let entry = this.botEnemyPool[ei];
      if (!entry) {
        entry = { x: 0, y: 0, radius: 0, threat: 1 };
        this.botEnemyPool[ei] = entry;
      }
      entry.x = e.x;
      entry.y = e.y;
      entry.radius = e.radius;
      entry.threat = e.boss ? 0.35 : e.def.archetype === "exploder" ? 1.8 : 1;
      enemies.push(entry);
      ei += 1;
    }
    const bossAgent = this.enemies.active.find((e) => e.alive && e.boss);

    const projectiles = this.botProjectiles;
    projectiles.length = 0;
    let pi = 0;
    for (const p of this.enemyShots.active) {
      let entry = this.botProjectilePool[pi];
      if (!entry) {
        entry = { x: 0, y: 0, radius: 0, vx: 0, vy: 0, threat: 2.4 };
        this.botProjectilePool[pi] = entry;
      }
      entry.x = p.x;
      entry.y = p.y;
      entry.vx = p.vx;
      entry.vy = p.vy;
      entry.radius = p.radius;
      projectiles.push(entry);
      pi += 1;
    }

    const hazards = this.botHazards;
    hazards.length = 0;
    let hi = 0;
    for (const h of this.hazards.active) {
      if (h.warn <= 0) continue;
      let entry = this.botHazardPool[hi];
      if (!entry) {
        entry = { x: 0, y: 0, radius: 0, threat: 3.2 };
        this.botHazardPool[hi] = entry;
      }
      entry.x = (h.x + h.x2) / 2;
      entry.y = (h.y + h.y2) / 2;
      entry.radius = h.kind === "beam" ? h.width : h.radius;
      hazards.push(entry);
      hi += 1;
    }

    const gems = this.botGems;
    gems.length = 0;
    for (const g of this.pickups.gems) gems.push(g);

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
    this.hash.clear();
    for (const e of this.enemies.active) if (e.alive) this.hash.insert(e);
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
      // m10-run-cpu-budget K3: Param-Objekt wiederverwenden (vorher je Gegner
      // je Schritt ~1 Objekt; stepEnemyAi liest synchron, keine Retention).
      const p = this.aiParams;
      p.archetype = e.def.archetype;
      p.tier = e.def.tier;
      p.x = e.x;
      p.y = e.y;
      p.playerX = px;
      p.playerY = py;
      p.speed = e.speed;
      const ai = stepEnemyAi(e.ai, p, dt, e.aiRng, e.uid);
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

      // Separation: Gegner stapeln sich nicht auf einem Pixel. Weit ausserhalb
      // des Views (LOD) entfaellt die Nachbarsuche: sie ist teuer und fuer die
      // Darstellung/Kollision am Spieler irrelevant.
      let sx = 0;
      let sy = 0;
      const ddx = e.x - px;
      const ddy = e.y - py;
      if (ddx * ddx + ddy * ddy < 460 * 460) {
        this.hash.queryCircle(e.x, e.y, e.radius + 10, this.scratch);
        for (const n of this.scratch) {
          if (n === e || !n.alive) continue;
          const push = separationPush(e.x, e.y, e.radius, n.x, n.y, n.radius, e.uid);
          if (push) {
            sx += push.x;
            sy += push.y;
          }
        }
      }

      const decay = Math.max(0, 1 - 7 * dt);
      e.vx *= decay;
      e.vy *= decay;
      // Mehrere Treffer im selben Substep duerfen sich nicht zu einem Sprung
      // addieren: Rueckstoss bleibt sichtbar, aber unter der Hoechstgeschwindigkeit.
      const kb = clampKnockbackSpeed(e.vx, e.vy);
      e.vx = kb.vx;
      e.vy = kb.vy;
      const terrain = this.terrainFactorAt(e.x, e.y);
      const speed = e.speed * statusMul * ai.speedMul * terrain;
      e.x += (mx * speed + e.vx + sx * speed * 1.2) * dt;
      e.y += (my * speed + e.vy + sy * speed * 1.2) * dt;
      e.x = Phaser.Math.Clamp(e.x, 10, WORLD_SIZE - 10);
      e.y = Phaser.Math.Clamp(e.y, 10, WORLD_SIZE - 10);
    }

    // Spieler-Abstoß-Ring (m10-player-swarm-gap): Mindest-Kantenabstand der
    // Kleingegner zum Spieler — reine Positionskorrektur am Frame-Ende, ändert
    // weder KI, Tempo, Schaden noch die Gegner-Gegner-Separation. Bosse bleiben
    // ausgenommen (BossSystem-Verhalten unberührt). Wiring-Genehmigung über
    // .dispatch/requests.md notiert (Datei laut Lane-Briefing eigentlich
    // gesperrt; ohne diese 3 Zeilen wäre die Akzeptanz unerreichbar).
    // m10-run-cpu-budget K3: Gap-Optionen als Instanz-Feld (Closure 1x).
    resolvePlayerGap(this.enemies.active, px, py, this.gapOpts, this.hash);
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
          const minion = this.spawner.spawnAt(
            ENEMIES[action.minion],
            e.x + Math.cos(a) * 26,
            e.y + Math.sin(a) * 26,
            { hpScale: Math.max(0.6, e.hpScale * 0.55) },
          );
          this.attachAiRng(minion);
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
    // m10-run-cpu-budget K3: Scratch-Liste statt frischem Array je Schritt.
    const splits = this.splitsScratch;
    splits.length = 0;
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
        this.attachChestTap(this.chests.spawn(e.x, e.y));
        this.chestsDropped += 1;
        const bossShake = shakeFor("bossDeath", getSettings().shake);
        if (bossShake.durationMs > 0) this.cameras.main.shake(bossShake.durationMs, bossShake.intensity);
        this.hitStop = mergeHitStop(this.hitStop, hitStopFor("bossDeath"));
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
        this.attachAiRng(child);
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
    // m10-frame-tail-followup (#12288): Während der Morgendämmerung läuft
    // Spawner.update() nicht (simulate: `this.dawn ? [] : this.spawner.update`)
    // — gequeuete Debug-Spawns materialisierten nie (Queue-Leak, Reviewer-
    // Befund 1 in docs/lanes/m10-frame-tail-batching.md, Abschnitt Review).
    // Beim Dawn-Start einmal abtragen: Positionen/RNG sind bereits in
    // queueEnemyWave fest; spielkritisches Spawnen läuft nie über die Queue.
    this.spawner.drainDebugQueue();
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
    // Lichtstrahlen vom Horizont (B1-Teil: Bake-Stufen, Draw-Scale <= 1).
    for (let i = 0; i < 7; i++) {
      const rayScale = 2.4 + (i % 2) * 0.4;
      const ray = this.addPillarImage(60 + i * 60, GAME_HEIGHT, rayScale)
        .setScrollFactor(0).setDepth(76)
        .setAlpha(0);
      this.tweens.add({ targets: ray, alpha: runAddAlpha(0.09 + (i % 3) * 0.03), duration: 900 + i * 120, yoyo: true, repeat: 2 });
    }
    const sun = this.add.image(GAME_WIDTH / 2, 18, "light_radius")
      .setScrollFactor(0).setDepth(77).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.lantern]).setScale(2.2).setAlpha(0);
    this.tweens.add({ targets: sun, alpha: runAddAlpha(0.6), scale: 2.8, duration: 2400, ease: "Sine.Out" });
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

  /** M8: View-Wechsel im laufenden Spiel (Resize/Rotation). Kamera und
   *  bildschirmfeste Overlays folgen der neuen logischen Groesse. */
  private onViewResize(): void {
    this.combat?.setRangeScale(weaponRangeFactor(GAME_WIDTH, GAME_HEIGHT));
    if (this.vignette) {
      this.vignette.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2)
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    }
    if (this.dawnRect) {
      this.dawnRect.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2)
        .setSize(GAME_WIDTH, GAME_HEIGHT);
    }
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
      const frames = framesForDef(e.def);
      if (frames) {
        // Bosse: Wind-up-Frame während des Telegraphen, sonst Ruhe/Atmen.
        const windup = e.boss && e.telegraph > 0 && frames.length >= 3 ? frames[2] : null;
        // M10 frame-cadence: 6 fps zyklisch ueber ALLE Frames (vorher
        // `% Math.min(2, frames.length)` — F2/F3 der 4-Frame-Sprites wurden
        // nie gezeigt). Auswahl als reine Funktion in src/logic/enemy-frames.ts.
        const frame = windup ?? frames[runFrameIndex(frames.length, t, e.phase)];
        if (currentFrame(e.sprite) !== frame) applyTexture(e.sprite, frame);
      }
      // M9 art-polish: Elites bekommen ein enges 1-px-Konturlicht in Amber
      // (Palette 20) statt der diffusen weissen ADD-Aura. Die Aura ist eine
      // um 2 Quellpixel groessere, amber getoente Kopie der Silhouette, die
      // hinter dem Sprite liegt — dadurch folgt der Rand der Kontur und ist
      // exakt 1 Spielpixel breit. Kein Near-White, Lesbarkeit bleibt.
      if (e.elite) {
        e.aura.setBlendMode(Phaser.BlendModes.NORMAL);
        // setTintFill statt setTint: die Aura wird als reine Amber-Silhouette
        // gefuellt, statt die Gegnerfarbe zu multiplizieren (sonst verschwindet
        // der Rand bei dunklen Sprites). Deterministisch, nur Elite.
        e.aura.setTintFill(PAL[C.amber]);
        e.aura.setAlpha(0.92);
        const frame = currentFrame(e.sprite);
        if (currentFrame(e.aura) !== frame) applyTexture(e.aura, frame);
        const srcW = Math.max(8, e.aura.width);
        const rim = 1 + 2 / srcW;
        e.aura.setScale(e.sprite.scaleX * rim, e.sprite.scaleY * rim);
        e.aura.setPosition(e.sprite.x, e.sprite.y);
        e.aura.setDepth(e.sprite.depth - 0.01);
        e.aura.setVisible(true);
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

  /**
   * Toggle des Pausenzustands. `ev` wird vom Frame-Pfad (Pad-Start/Touch) als
   * synthetisches Event mitgegeben und durchlaeuft den Dedup in
   * `escToggleAllowed`; ohne Event (ESC-Handler, Portrait-Auto-Pause) wird wie
   * bisher `window.event` gelesen — der ESC-Dedup-Pfad bleibt bitgleich.
   */
  togglePause(ev?: EscToggleEvent | null): void {
    if (this.levelUpOpen || this.chestOpen || this.finished) return;
    // M10-esc-pause-fix: ein physischer ESC-Press togglet genau einmal.
    // Der UI-Handler wird pro Press mehrfach aufgerufen (Doppel-Dispatch
    // desselben Keydowns im selben Game-Step + keyup-getriebene Queue-Replays,
    // Beleg shots/m10-esc-pause-before*.json). window.event ist nur während
    // des DOM-Dispatch gesetzt — genau dort liegen die Duplikat-Aufrufe.
    // Touch-, Gamepad- und Portrait-Pfade rufen aus dem Frame-Update heraus auf
    // (window.event = null) und bleiben unberührt.
    const domEv = (globalThis as unknown as { event?: KeyboardEvent }).event;
    const source = ev ?? (domEv
      ? { key: domEv.key, type: domEv.type, timeStamp: domEv.timeStamp, repeat: domEv.repeat }
      : null);
    const decision = escToggleAllowed(source, this.lastEscToggleTs);
    if (!decision.allowed) return;
    this.lastEscToggleTs = decision.lastAcceptedTs;
    this.paused = !this.paused;
    this.events.emit("pauseChanged", this.paused);
  }

  /** Pause-Menü: Fortsetzen per Knopf/Maus. */
  resumeRun(): void {
    if (!this.paused || this.levelUpOpen || this.chestOpen || this.finished) return;
    this.paused = false;
    this.events.emit("pauseChanged", false);
  }

  /** Pause-Menü: Aufgabe beendet den Lauf und führt zum Ergebnis. */
  giveUp(): void {
    if (this.finished || this.levelUpOpen || this.chestOpen) return;
    this.endRun("giveup");
  }

  /** Debug/Abnahme: Lauf direkt beenden (z. B. Sieg-Screen ohne 30-Minuten-Wartezeit). */
  debugFinishRun(reason: "death" | "dawn" | "giveup"): void {
    if (this.finished) return;
    if (reason === "dawn") this.dawn = true;
    this.endRun(reason);
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

  debugSpawnEnemy(id: EnemyId, n: number, elite = false): number {
    // M10-frame-tail-batching (#11990): das Debug-Harness fuellt per 50-ms-Top-up
    // bis zu 300 Gegner in EINEM rAF-Tick; diese Runtime-Spawns liegen am Geraet
    // mit 33-58 ms Frames in der Statistik (Beleg: .evidence/m10-frame-tail-
    // batching/before-device-frames.json). Der Debug-Pfad verteilt jetzt ueber
    // Frames (queueEnemyWave); Positionen/RNG-Reihenfolge identisch, Spiel-
    // Ereignisse (Dawn/Elite-Aufnahmen) nutzen weiterhin spawnEnemy() sofort.
    return this.spawner.queueEnemyWave(id, n, this.posX, this.posY, elite);
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

  /** Maximale Entfernung, in der ein Tipp die Truhe oeffnet (Gameplay-Entscheidung). */
  static readonly CHEST_TAP_RANGE = 220;

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

  /**
   * M8-input: Truhe per Tippen öffnen. Nur in Reichweite (<= 220 px), damit
   * ein Tap nicht quer über die Karte eine Truhe auslöst. Das Laufen über
   * die Truhe bleibt unverändert der Hauptweg.
   */
  private attachChestTap(chest: ChestRuntime): void {
    chest.sprite.setInteractive({ useHandCursor: true });
    chest.sprite.on("pointerdown", () => {
      if (this.chestOpen || this.levelUpOpen || this.paused || this.finished) return;
      const distance = Phaser.Math.Distance.Between(chest.x, chest.y, this.posX, this.posY);
      if (distance <= Run.CHEST_TAP_RANGE) this.openChest(chest);
    });
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

  /** Leichtgewichtiger Zustand ohne die teure enemyList (Polling-Skripte). */
  getQuickStats(): Record<string, unknown> {
    return {
      scene: "run",
      time: Math.round(this.elapsed * 10) / 10,
      level: this.xpState.level,
      kills: this.kills,
      enemies: this.enemies?.count ?? 0,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      fps: Math.round(this.game.loop.actualFps * 10) / 10,
      weapons: this.levelSys?.weapons.map((w) => ({ id: w.id, level: w.level })) ?? [],
      passives: this.levelSys?.passives.map((p) => ({ id: p.id, level: p.level })) ?? [],
      bossesDefeated: this.bossesDefeated,
      bossesSpawned: this.bossesSpawned.slice(),
      bossFlags: this.bossFlags.slice(),
      boss: this.bosses?.info() ?? null,
      chestsDropped: this.chestsDropped,
      dawn: this.dawn,
      lod: this.lod,
      damageAggregate: shouldAggregateDamage(this.enemies?.count ?? 0, this.lod.damageAggregate),
      fxAlpha: this.fxDampingEnabled
        ? (this.fxRestore > 0 && this.lod.level === "minimal" ? Run.FX_RESTORE_ALPHA : fxAlphaFor(this.lod.level))
        : 1,
      paused: this.paused,
      levelUpOpen: this.levelUpOpen,
      chestOpen: this.chestOpen,
      autoPlay: this.autoPlay,
      god: this.godMode,
      character: this.character.id,
    };
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
      playerX: Math.round(this.posX),
      playerY: Math.round(this.posY),
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
      pickupRadius: this.agg ? effectivePickupRadius(PLAYER_BASE_PICKUP_RADIUS, this.agg)
        * weaponRangeFactor(GAME_WIDTH, GAME_HEIGHT) : 0,
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
  /**
   * B1-Teil: fx_pillar nur noch ueber die Bake-Stufen zeichnen (siehe
   * ensurePillarBake) — Draw-Scale = Scale/L <= 1, Position ganzzahlig.
   * `drawScale` = gewuenschte Groesse jetzt, `bakeScale` = groesste Groesse,
   * die der Sprite in diesem Leben erreicht (waehlt die Bake-Stufe).
   */
  private addPillarImage(x: number, y: number, drawScale: number, bakeScale = drawScale): Phaser.GameObjects.Image {
    const level = pillarBakeLevel(bakeScale);
    const key = ensurePillarBake(this, level)[0];
    // uniformScale erzwingt hier den B5-Cap zentral (Draw-Scale bleibt
    // uniform und <= RUN_PARTICLE_SCALE_CAP).
    const draw = uniformScale(drawScale / level, drawScale / level);
    return makeImage(this, Math.round(x), Math.round(y), key)
      .setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setTint(PAL[C.lantern])
      .setScale(draw.x, draw.y);
  }

  /** Level-up: Lichtsäule + aufsteigende Glut am Spieler. */
  playLevelUpFx(): void {
    if (this.suppressEventFx) return;
    const x = this.visualX || Math.round(this.posX);
    const y = this.visualY || Math.round(this.posY);
    const level = pillarBakeLevel(2.4);
    const pillar = this.addPillarImage(x, y + 12, 1.4, 2.4)
      .setDepth(11).setAlpha(runAddAlpha(0.95));
    this.tweens.add({
      targets: pillar, alpha: 0, scale: 2.4 / level, y: y - 70,
      duration: 950, ease: "Cubic.Out", onComplete: () => pillar.destroy(),
    });
    this.combat?.fx.spawnAnim("fx_halo", x, y, {
      life: 0.6, scaleFrom: 0.6, scaleTo: 2.2, alphaFrom: runAddAlpha(0.9), alphaTo: 0, additive: true,
    });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.combat?.particles.spawn({
        texture: "fx_star", x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10,
        vx: Math.cos(a) * 26, vy: -30 - (i % 4) * 12,
        life: 0.7 + (i % 3) * 0.15, scaleFrom: 0.8, scaleTo: 0.15,
        alphaFrom: runAddAlpha(1), alphaTo: 0, additive: true,
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
    this.slowmoUntil = this.elapsed + 0.9 * 0.45;
    const x = this.visualX || Math.round(this.posX);
    const y = this.visualY || Math.round(this.posY);
    // B1-Teil: Ring ueber den Mixel-Bake-Pfad (fx_shock ist Bake-Basis, Stufen
    // bis 4 -> Draw-Scale <= 1) statt direktem makeImage-Tween.
    this.combat?.fx.spawnAnim("fx_shock", x, y, {
      life: 0.9, scaleFrom: 0.4, scaleTo: 3.4, alphaFrom: runAddAlpha(1), alphaTo: 0,
      additive: true, tint: PAL[C.lantern],
    });
    for (let k = 0; k < 3; k++) {
      this.time.delayedCall(k * 90, () => this.combat?.fx.spawnAnim("fx_shock", x, y, {
        life: 0.55, scaleFrom: 0.5 + k * 0.5, scaleTo: 2.2 + k * 0.5,
        alphaFrom: runAddAlpha(0.9), alphaTo: 0, additive: true, tint: PAL[C.lantern],
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
        life: 0.85, scaleFrom: 1, scaleTo: 0.1, alphaFrom: runAddAlpha(1), alphaTo: 0, additive: true,
        tint: PAL[C.lanternWhite],
      });
    }
    getAudio().play("evolution");
    this.events.emit("evolution", { id, name: name ?? id.toUpperCase() });
  }

  /** Truhe: Lichtstrahl + Glanz + Funken (Weltposition). */
  playChestFx(x: number, y: number): void {
    if (this.suppressEventFx) return;
    const beam = this.addPillarImage(x, y - 4, 0.9, 1.5)
      .setDepth(11).setAlpha(0);
    this.tweens.add({ targets: beam, alpha: runAddAlpha(0.85), scale: 1.5 / pillarBakeLevel(1.5), duration: 260, yoyo: true, hold: 260, onComplete: () => beam.destroy() });
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
        alphaFrom: runAddAlpha(0.85), alphaTo: 0, additive: true, tint: PAL[C.emberOrange],
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
        alphaFrom: runAddAlpha(1), alphaTo: 0, additive: true, tint: i === 0 ? PAL[C.lanternWhite] : tint,
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

  private endRun(reason: "death" | "dawn" | "giveup"): void {
    if (this.finished) return;
    if (reason !== "dawn") getAudio().play("defeat");
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


