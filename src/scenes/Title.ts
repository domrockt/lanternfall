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
    this.add.image(0, 0, "title_background").setOrigin(0, 0).setDepth(0);
    // Atmender Mond-Glow (additiv, nur Licht – keine Off-Palette-Flächen).
    const glow = this.add.image(404, 56, "light_radius")
      .setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.45).setDepth(1);
    this.tweens.add({ targets: glow, alpha: 0.3, scale: 1.0, duration: 2400, yoyo: true, repeat: -1 });
    // Dunkle Bodenlasur unter dem Textblock (nur Palettenfarbe, Alpha-Overlay).
    this.add.rectangle(0, 158, GAME_WIDTH, 112, PAL[C.nightDeep], 0.55)
      .setOrigin(0, 0).setDepth(3);
    this.add.image(240, 135, "vignette").setScrollFactor(0).setDepth(50);

    this.add.image(240, 60, "title_logo").setScale(2).setDepth(2);

    new PixelText(this, 240, 126, "LANTERNFALL", C.lantern, "center").setScale(3).setDepth(4);
    new PixelText(this, 240, 152, "DIE LETZTE LATERNE", C.bone, "center").setDepth(4);
    new PixelText(this, 240, 172, "30 MINUTEN BIS ZUR MORGENDAMMERUNG", C.mist, "center").setDepth(4);

    const prompt = new PixelText(this, 240, 200, "ENTER = BEGINNEN", C.candleWhite, "center").setDepth(4);
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });

    new PixelText(this, 240, 228, "WASD/PFEILE BEWEGEN - WAFFEN FEUERN AUTOMATISCH", C.fog, "center").setDepth(4);
    new PixelText(this, 240, 240, "ESC = PAUSE", C.fog, "center").setDepth(4);
    // Kein Debug-/Seed-Text im Titelbild; der Seed steht im Pause-Screen.

    this.input.keyboard!.once("keydown-ENTER", () => this.startSelect());
    this.input.keyboard!.once("keydown-SPACE", () => this.startSelect());
  }

  private startSelect(): void {
    this.cameras.main.fadeOut(180, 6, 7, 12);
    this.time.delayedCall(180, () => this.scene.start("charselect", { seed: this.seed, debug: this.debug }));
  }
}
