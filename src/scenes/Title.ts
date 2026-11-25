import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";

export class Title extends Phaser.Scene {
  private seed = 1;
  private debug = false;

  constructor() { super("title"); }

  init(data: { seed?: number; debug?: boolean }): void {
    this.seed = data.seed ?? 1;
    this.debug = data.debug ?? false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PAL[C.nightDeep]);
    this.add.image(240, 135, "vignette").setScrollFactor(0).setDepth(50);

    // Mond/Laterne als Lichtanker
    const glow = this.add.image(240, 78, "light_radius")
      .setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setAlpha(0.8).setDepth(1);
    this.tweens.add({ targets: glow, alpha: 0.55, scale: 1.18, duration: 2200, yoyo: true, repeat: -1 });

    this.add.image(240, 78, "lantern_small").setScale(4).setDepth(2);

    new PixelText(this, 240, 108, "LANTERNFALL", C.lantern, "center").setScale(3);
    new PixelText(this, 240, 132, "DIE LETZTE LATERNE", C.bone, "center");
    new PixelText(this, 240, 148, "30 MINUTEN BIS ZUR MORGENDAMMERUNG", C.mist, "center");

    const prompt = new PixelText(this, 240, 196, "ENTER = BEGINNEN", C.candleWhite, "center");
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });

    new PixelText(this, 240, 226, "WASD/PFEILE BEWEGEN - WAFFEN FEUERN AUTOMATISCH", C.fog, "center");
    new PixelText(this, 240, 238, "ESC = PAUSE", C.fog, "center");
    new PixelText(this, 240, 258, `SEED ${this.seed}${this.debug ? " - DEBUG" : ""}`, C.nightSlate, "center");

    this.input.keyboard!.once("keydown-ENTER", () => this.startSelect());
    this.input.keyboard!.once("keydown-SPACE", () => this.startSelect());
  }

  private startSelect(): void {
    this.cameras.main.fadeOut(180, 6, 7, 12);
    this.time.delayedCall(180, () => this.scene.start("charselect", { seed: this.seed, debug: this.debug }));
  }
}
