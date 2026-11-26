import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { createAllTextures } from "../gfx/textures";
import { buildRuntimeAtlas } from "../gfx/atlas";
import { seedFromUrl, hasFlag } from "../logic/rng";
import { AudioSystem, initAudio } from "../audio/AudioSystem";

/** Boot/Preload: erzeugt alle prozeduralen Platzhalter-Texturen, dann Titel. */
export class Boot extends Phaser.Scene {
  constructor() { super("boot"); }

  preload(): void {
    // Prozedural erzeugte WAVs (scripts/gen_sfx.py) aus public/sfx laden.
    this.cameras.main.setBackgroundColor(PAL[C.nightDeep]);
    new PixelText(this, 240, 132, "LADE MOOR ...", C.mist, "center");
    AudioSystem.preload(this);
  }

  create(): void {
    createAllTextures(this);
    buildRuntimeAtlas(this);
    initAudio(this.game);
    const seed = seedFromUrl();
    const debug = hasFlag("debug");
    this.scene.start("title", { seed, debug });
  }
}
