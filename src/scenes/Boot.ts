import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { addGridTexture, createAllTextures, createLightTexture, createVignetteTexture } from "../gfx/textures";
import { GEN_TITLE } from "../gfx/gen-title";
import { GEN_UI } from "../gfx/gen-ui";
import { buildRuntimeAtlas } from "../gfx/atlas";
import { seedFromUrl, hasFlag } from "../logic/rng";
import { AudioSystem, initAudio } from "../audio/AudioSystem";

/**
 * Boot-Schnellpfad (m10-boot-startup): Vor `scene.start("title")` entstehen nur
 * die Texturen, die die Titel-Szene im create() wirklich zeichnet (Titelbild,
 * Menü-Rahmen, Licht/Vignette). Font-Glyphen erzeugt PixelText lazy.
 * Alles andere (Gegner, Bosse, FX, Icons, Projektile, ...) ist für den Titel
 * nicht sichtbar und wird als Warmup hinter dem ersten gerenderten Titel-Frame
 * nachgezogen. Messung (shots/m10-boot-startup-baseline.json): createAllTextures
 * frisst 533-682 ms von 770-1200 ms Boot-Zeit; der Warmup bindet davon nur den
 * Titel-Teil in den kritischen Pfad ein.
 *
 * Der Warmup ruft `createAllTextures` erneut auf - alle Creator sind idempotent
 * (textures.exists-Guards), d.h. es entstehen nur die noch fehlenden Texturen.
 * `buildRuntimeAtlas` läuft danach, damit der Atlas-Key-Vertrag hält: heiße
 * Klassen (enemy_/boss_/gem_/fx_/...) liegen im Atlas, sobald der Run startet.
 */
function createTitleTextures(scene: Phaser.Scene): void {
  for (const [key, def] of Object.entries(GEN_TITLE)) {
    addGridTexture(scene, key, def.frames[0], def.w, def.h);
  }
  const frame = GEN_UI.ui_frame;
  addGridTexture(scene, "ui_frame", frame.frames[0], frame.w, frame.h);
  createLightTexture(scene);
  createVignetteTexture(scene);
}

type BootTimings = Record<string, number>;

function timings(): BootTimings {
  return ((window as unknown as { __bootTimings: BootTimings }).__bootTimings ??= {});
}

/** Boot/Preload: erzeugt Titel-Texturen sofort, den Rest warm nach dem Titel. */
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
   * Title-Szene feuert noch vor dem ersten Rendern, deshalb läuft der Warmup
   * erst im nächsten Makro-Task nach CREATE - das ist nach dem Rendern des
   * ersten Titel-Frames (ein rAF-Frame = ein Task inkl. Render). Zwei Häppchen
   * mit setTimeout(0) dazwischen, damit der Titel zwischen den Blöcken
   * eingabefähig bleibt (kein langer Stillstand nach dem Erscheinen).
   */
  private scheduleWarmup(): void {
    const t = timings();
    const mark = (k: string): void => { t[k] = performance.now(); };
    const title = this.scene.get("title");
    title.events.once(Phaser.Scenes.Events.CREATE, () => {
      window.setTimeout(() => {
        mark("warmStart");
        // Häppchen 1: alle restlichen Texturen (Creator sind idempotent, siehe
        // oben - es entstehen nur die noch fehlenden).
        createAllTextures(this);
        mark("warmTexturesDone");
        window.setTimeout(() => {
          // Häppchen 2: Atlas mit allen heißen Klassen (Vertrag: enemy_/boss_/
          // gem_/fx_/... sind gepackt, sobald ein Run startet).
          buildRuntimeAtlas(this);
          mark("warmDone");
        }, 0);
      }, 0);
    });
  }
}
