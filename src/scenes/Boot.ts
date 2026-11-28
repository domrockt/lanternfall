import Phaser from "phaser";
import { C, PAL } from "../palette";
import { GAME_WIDTH, GAME_HEIGHT } from "../config";
import { PixelText } from "../gfx/font";
// m10-loading-screen: Boot erzeugt nur noch Titel-Texturen; alles weitere
// uebernimmt die Loading-Szene (Warmup). createAllTextures entfaellt hier.
import { addGridTexture, createLightTexture, createVignetteTexture } from "../gfx/textures";
import { GEN_TITLE } from "../gfx/gen-title";
import { GEN_UI } from "../gfx/gen-ui";
import { seedFromUrl, hasFlag } from "../logic/rng";
import { AudioSystem, initAudio } from "../audio/AudioSystem";

/**
 * Titel-kritische Texturen: alles, was die Titel-Szene im create() zeichnet
 * (Titelbild, Menü-Rahmen, Licht/Vignette). Font-Glyphen erzeugt PixelText lazy.
 */
/** GEN_UI-Keys, die die Titel-Szene zeichnet (Menü-Rahmen + Logo). */
const TITLE_UI_KEYS = ["ui_frame", "title_logo"] as const;

/**
 * m10-loading-screen K2: von src/gfx/warmup.ts importiert (title-textures-Chunk),
 * damit der Loading-Warmup exakt denselben Titel-Textur-Stand erzeugt wie der
 * fruehere Boot-Schnellpfad.
 */
export function createTitleTextures(scene: Phaser.Scene): void {
  for (const [key, def] of Object.entries(GEN_TITLE)) {
    addGridTexture(scene, key, def.frames[0], def.w, def.h);
  }
  for (const key of TITLE_UI_KEYS) {
    const frame = GEN_UI[key];
    addGridTexture(scene, key, frame.frames[0], frame.w, frame.h);
  }
  // Swap (Lane m10-texture-glow-swap-r2): die ehemals lokale Kopie der
  // Licht-/Vignette-Creator (rev.2-Stufen) ist jetzt in src/gfx/textures.ts
  // heimisch (exportiert, Stufen-Fix + B2-Kern) und wird importiert. Idempotent (textures.exists-Guard): der Warmup in
  // createAllTextures überspringt die bereits registrierten Keys. Der
  // RUN-seitige Alpha/Blend-Deckel bleibt (RUN_LIGHT_ALPHA_MAX in Run.ts):
  // die Lichtfläche wird nur ADD gezeichnet, Alpha dort auf 0,7 gedeckelt;
  // Ring-Alpha <= 0,10 pro Ring, Kern summiert <= ~0,25 vor Blend.
  createLightTexture(scene);
  createVignetteTexture(scene);
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
    // m10-loadscreen-pretext: X an die View-Breite gekoppelt (GAME_WIDTH ist
    // dynamisch, logische Hoehe 360) — vorher fixer X=240 (= Zentrum einer
    // 480er-Annahme) und damit links der Mitte, belegt auf Redmi Pad und Desktop.
    new PixelText(this, Math.round(GAME_WIDTH / 2), 132, "LADE MOOR ...", C.mist, "center");
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
    // m10-loading-screen K2: nicht mehr direkt zum Titel — die Loading-Szene
    // erzeugt jetzt ALLE Texturen/Atlanten/Glyphen (Haeppchen mit Fortschritt),
    // waermt die GPU und startet DANACH den Titel (scheduleWarmup entfallen).
    this.scene.start("loading", { seed, debug });
  }
}
