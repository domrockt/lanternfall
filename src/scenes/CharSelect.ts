import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { CHARACTER_LIST } from "../data/characters";
import type { CharacterDef } from "../data/types";

export class CharSelect extends Phaser.Scene {
  private seed = 1;
  private debug = false;
  private index = 0;
  private panels: Phaser.GameObjects.Rectangle[] = [];

  constructor() { super("charselect"); }

  init(data: { seed?: number; debug?: boolean }): void {
    this.seed = data.seed ?? 1;
    this.debug = data.debug ?? false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PAL[C.night]);
    this.add.image(240, 135, "vignette").setDepth(-1);
    new PixelText(this, 240, 22, "WÄHLE DEINEN CHARAKTER", C.lantern, "center").setScale(2).setDepth(4);

    this.panels = [];
    CHARACTER_LIST.forEach((char, i) => {
      const x = 128 + i * 224;
      const panel = this.add.rectangle(x, 137, 204, 176, PAL[C.nightMid]).setStrokeStyle(2, PAL[C.nightSlate]).setDepth(2);
      this.panels.push(panel);
      this.add.image(x, 88, char.spriteKey).setScale(4).setDepth(3);
      this.add.image(x, 88, "light_radius").setBlendMode(Phaser.BlendModes.ADD).setScale(0.55).setAlpha(0.3).setDepth(1);
      new PixelText(this, x, 128, char.name, C.candleWhite, "center").setDepth(4);
      new PixelText(this, x, 140, char.title.toUpperCase(), C.amber, "center").setDepth(4);
      const bonusLines = char.id === "mira"
        ? ["+10% FLÄCHE", `HP ${char.hp}`]
        : ["+20% MAX-HP, 1 RÜSTUNG", "-5% TEMPO"];
      bonusLines.forEach((line, li) => {
        new PixelText(this, x, 156 + li * 10, line, C.fog, "center").setDepth(4);
      });
      new PixelText(this, x, 180, char.id === "mira" ? "SCHNELL UND FLÄCHENSTARK" : "ROBUST UND LANGSAM", C.mist, "center").setDepth(4);
      new PixelText(this, x, 194, `START: ${weaponName(char)}`, C.fog, "center").setDepth(4);
      new PixelText(this, x, 208, `TASTE ${i + 1}`, C.lantern, "center").setDepth(4);
    });

    this.refresh();
    new PixelText(this, 240, 244, "PFEILE = AUSWAHL   ENTER = START", C.mist, "center").setDepth(4);
    new PixelText(this, 240, 257, this.debug ? "DEBUG-MODUS" : `SEED ${this.seed}`, C.nightSlate, "center").setDepth(4);

    const kb = this.input.keyboard!;
    kb.on("keydown-LEFT", () => this.move(-1));
    kb.on("keydown-RIGHT", () => this.move(1));
    kb.on("keydown-A", () => this.move(-1));
    kb.on("keydown-D", () => this.move(1));
    kb.on("keydown-ONE", () => this.pick(0));
    kb.on("keydown-TWO", () => this.pick(1));
    kb.on("keydown-ENTER", () => this.start());
    kb.on("keydown-SPACE", () => this.start());
  }

  private move(delta: number): void {
    this.index = (this.index + delta + CHARACTER_LIST.length) % CHARACTER_LIST.length;
    this.refresh();
  }

  private refresh(): void {
    this.panels.forEach((panel, i) => {
      panel.setStrokeStyle(i === this.index ? 3 : 1, i === this.index ? PAL[C.lantern] : PAL[C.nightSlate]);
    });
  }

  private pick(i: number): void {
    this.index = i;
    this.refresh();
  }

  private start(): void {
    const char = CHARACTER_LIST[this.index];
    this.cameras.main.fadeOut(200, 6, 7, 12);
    this.time.delayedCall(200, () => {
      this.scene.start("run", { character: char.id, seed: this.seed, debug: this.debug });
    });
  }
}

function weaponName(char: CharacterDef): string {
  return char.startWeapon === "ember" ? "GLUTFUNKE" : "KETTENFLEGEL";
}
