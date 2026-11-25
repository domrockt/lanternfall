import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { createAllTextures } from "../gfx/textures";
import { seedFromUrl, hasFlag } from "../logic/rng";

/** Boot/Preload: erzeugt alle prozeduralen Platzhalter-Texturen, dann Titel. */
export class Boot extends Phaser.Scene {
  constructor() { super("boot"); }

  preload(): void {
    // M1 hat noch keine externen Assets — alles wird prozedural erzeugt.
    this.cameras.main.setBackgroundColor(PAL[C.nightDeep]);
    new PixelText(this, 240, 132, "LADE MOOR ...", C.mist, "center");
  }

  create(): void {
    createAllTextures(this);
    const seed = seedFromUrl();
    const debug = hasFlag("debug");
    this.scene.start("title", { seed, debug });
  }
}
