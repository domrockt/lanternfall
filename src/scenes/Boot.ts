import Phaser from "phaser";
import { C, PAL } from "../palette";
import { GAME_WIDTH, GAME_HEIGHT } from "../config";
import { PixelText } from "../gfx/font";
import { addGridTexture, createAllTextures } from "../gfx/textures";
import { GEN_TITLE } from "../gfx/gen-title";
import { GEN_UI } from "../gfx/gen-ui";
import { buildRuntimeAtlas } from "../gfx/atlas";
import { seedFromUrl, hasFlag } from "../logic/rng";
import { AudioSystem, initAudio } from "../audio/AudioSystem";

/**
 * Licht/Vignette lokal erzeugt (1:1 wie createLightTexture/createVignetteTexture
 * in src/gfx/textures.ts). Grund: textures.ts ist Claim der Lane m10-atlas-pack;
 * Export-Freigabe ist beim Disponenten angefragt (.dispatch/requests.md,
 * 2026-11-27T20:06Z). Beide Versionen sind idempotent (textures.exists-Guard),
 * der Warmup (createAllTextures) ueberspringt sie - es gibt keine Doppel- und
 * keine abweichende Erzeugung in einer Session. Bei Freigabe durch einen Import
 * ersetzen und diesen Block loeschen.
 */
function createLightTextureLocal(scene: Phaser.Scene): void {
  const key = "light_radius";
  if (scene.textures.exists(key)) return;
  const size = 192;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rings: { r: number; color: number; alpha: number }[] = [
    { r: 96, color: 19, alpha: 0.05 },
    { r: 88, color: 19, alpha: 0.05 },
    { r: 80, color: 20, alpha: 0.05 },
    { r: 72, color: 20, alpha: 0.05 },
    { r: 64, color: 21, alpha: 0.06 },
    { r: 56, color: 21, alpha: 0.06 },
    { r: 48, color: 21, alpha: 0.07 },
    { r: 40, color: 22, alpha: 0.07 },
    { r: 32, color: 22, alpha: 0.08 },
    { r: 24, color: 13, alpha: 0.09 },
    { r: 16, color: 13, alpha: 0.10 },
    { r: 8, color: 13, alpha: 0.10 },
  ];
  const c = size / 2;
  for (const ring of rings) {
    ctx.globalAlpha = ring.alpha;
    ctx.fillStyle = "#" + PAL[ring.color].toString(16).padStart(6, "0");
    ctx.beginPath();
    ctx.arc(c, c, ring.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-in";
  const g = ctx.createRadialGradient(c, c, 10, c, c, 96);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.75, "rgba(0,0,0,0.6)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
  scene.textures.addCanvas(key, canvas);
}

function createVignetteTextureLocal(scene: Phaser.Scene): void {
  const key = "vignette";
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement("canvas");
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const c = ctx.createRadialGradient(GAME_WIDTH / 2, GAME_HEIGHT / 2, 70, GAME_WIDTH / 2, GAME_HEIGHT / 2, 290);
  c.addColorStop(0, "rgba(6,7,12,0)");
  c.addColorStop(0.7, "rgba(6,7,12,0.18)");
  c.addColorStop(1, "rgba(6,7,12,0.72)");
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  scene.textures.addCanvas(key, canvas);
}

/**
 * Titel-kritische Texturen: alles, was die Titel-Szene im create() zeichnet
 * (Titelbild, Menü-Rahmen, Licht/Vignette). Font-Glyphen erzeugt PixelText lazy.
 */
/** GEN_UI-Keys, die die Titel-Szene zeichnet (Menü-Rahmen + Logo). */
const TITLE_UI_KEYS = ["ui_frame", "title_logo"] as const;

function createTitleTextures(scene: Phaser.Scene): void {
  for (const [key, def] of Object.entries(GEN_TITLE)) {
    addGridTexture(scene, key, def.frames[0], def.w, def.h);
  }
  for (const key of TITLE_UI_KEYS) {
    const frame = GEN_UI[key];
    addGridTexture(scene, key, frame.frames[0], frame.w, frame.h);
  }
  createLightTextureLocal(scene);
  createVignetteTextureLocal(scene);
}

type BootTimings = Record<string, number>;

function timings(): BootTimings {
  return ((window as unknown as { __bootTimings: BootTimings }).__bootTimings ??= {});
}

/**
 * Boot-Schnellpfad (m10-boot-startup): Vor `scene.start("title")` entstehen nur
 * die Texturen, die die Titel-Szene wirklich zeichnet. Alles andere (Gegner,
 * Bosse, FX, Icons, Projektile, ...) ist für den Titel nicht sichtbar und wird
 * als Warmup hinter dem ersten gerenderten Titel-Frame nachgezogen.
 * Messung (shots/m10-boot-startup-baseline.json + Phasen-Lauf): createAllTextures
 * frisst 533-682 ms von 770-1200 ms Boot-Zeit.
 *
 * Der Warmup ruft `createAllTextures` erneut auf - alle Creator sind idempotent
 * (textures.exists-Guards), d.h. es entstehen nur die noch fehlenden Texturen.
 * `buildRuntimeAtlas` läuft danach, damit der Atlas-Key-Vertrag hält: heiße
 * Klassen (enemy_/boss_/gem_/fx_/...) liegen im Atlas, sobald der Run startet.
 */
export class Boot extends Phaser.Scene {
  constructor() { super("boot"); }

  preload(): void {
    // Prozedural erzeugte WAVs (scripts/gen_sfx.py) aus public/sfx laden.
    const t = timings();
    t.preloadStart = performance.now();
    this.cameras.main.setBackgroundColor(PAL[C.nightDeep]);
    new PixelText(this, 240, 132, "LADE MOOR ...", C.mist, "center");
    AudioSystem.preload(this);
    t.preloadDone = performance.now();
  }

  create(): void {
    const t = timings();
    const mark = (k: string): void => { t[k] = performance.now(); };
    mark("createStart");
    createTitleTextures(this);
    t.titleTextureCount = this.textures.getTextureKeys().length;
    mark("titleTexturesDone");
    initAudio(this.game);
    mark("audioDone");
    const seed = seedFromUrl();
    const debug = hasFlag("debug");
    mark("titleStart");
    this.scene.start("title", { seed, debug });
    this.scheduleWarmup();
  }

  /**
   * Warmup hinter dem ersten gerenderten Titel-Frame: Der CREATE-Event der
   * Title-Szene feuert noch vor dem ersten Rendern (SceneManager.create emittiert
   * synchron am Ende von scene.create), deshalb läuft der Warmup erst im nächsten
   * Makro-Task nach CREATE - das ist nach dem Rendern des ersten Titel-Frames
   * (ein rAF-Frame = ein Task inkl. Render). Zwei Häppchen mit setTimeout(0)
   * dazwischen, damit der Titel zwischen den Blöcken eingabefähig bleibt.
   */
  private scheduleWarmup(): void {
    const t = timings();
    const mark = (k: string): void => { t[k] = performance.now(); };
    const title = this.scene.get("title");
    // Erster gerendertes Titel-Frame = "Titel sichtbar" (RENDER feuert, nachdem
    // die Szene gerendert wurde, im Render-Teil des Frames - vor dem Warmup).
    title.events.once(Phaser.Scenes.Events.RENDER, () => mark("titleRendered"));
    title.events.once(Phaser.Scenes.Events.CREATE, () => {
      window.setTimeout(() => {
        mark("warmStart");
        createAllTextures(this);
        mark("warmTexturesDone");
        window.setTimeout(() => {
          buildRuntimeAtlas(this);
          mark("warmDone");
        }, 0);
      }, 0);
    });
  }
}
