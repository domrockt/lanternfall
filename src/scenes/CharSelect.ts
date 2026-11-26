import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { CHARACTER_LIST } from "../data/characters";
import type { CharacterDef } from "../data/types";
import { iconTextureKey } from "../gfx/icons";
import { readMeta, metaLine } from "../logic/meta";
import { createMenuButton } from "../ui/menu";

interface CharSelectData { seed?: number; debug?: boolean }

export class CharSelect extends Phaser.Scene {
  private seed = 1;
  private debug = false;
  private index = 0;
  private panels: Phaser.GameObjects.Rectangle[] = [];
  private started = false;

  constructor() { super("charselect"); }

  init(data: CharSelectData): void {
    this.seed = data.seed ?? 1;
    this.debug = data.debug ?? false;
  }

  create(): void {
    this.index = 0;
    this.started = false;
    this.panels = [];
    this.cameras.main.setBackgroundColor(PAL[C.night]);
    this.add.image(240, 135, "vignette").setDepth(-1);
    new PixelText(this, 240, 16, "WÄHLE DEINEN CHARAKTER", C.lantern, "center").setScale(2).setDepth(4);
    new PixelText(this, 240, 32, `SEED ${this.seed} · PFEILE/MAUS = WAHL`, C.fog, "center").setDepth(4);

    CHARACTER_LIST.forEach((char, i) => {
      const x = 128 + i * 224;
      const panel = this.add.rectangle(x, 140, 204, 196, PAL[C.nightMid])
        .setStrokeStyle(2, PAL[C.nightSlate]).setDepth(2).setInteractive({ useHandCursor: true });
      panel.on("pointerover", () => { this.index = i; this.refresh(); });
      panel.on("pointerdown", () => this.pick(i));
      this.panels.push(panel);
      // Portrait 48x48 @2x sitzt oben bündig im Rahmen (44..140).
      this.add.image(x, 92, `portrait_${char.id}`).setScale(2).setDepth(3);
      this.add.image(x, 92, "light_radius").setBlendMode(Phaser.BlendModes.ADD).setScale(0.55).setAlpha(0.3).setDepth(1);
      new PixelText(this, x, 148, char.name, C.candleWhite, "center").setDepth(4);
      new PixelText(this, x, 160, char.title.toUpperCase(), C.amber, "center").setDepth(4);

      // Stats als reine Anzeige (keine Balance-Änderung).
      new PixelText(this, x - 92, 174, `HP        ${char.hp}`, C.bone).setDepth(4);
      new PixelText(this, x - 92, 184, `TEMPO     ${char.speed}`, C.bone).setDepth(4);
      new PixelText(this, x - 92, 194, `RÜSTUNG   ${char.armor}`, C.bone).setDepth(4);
      new PixelText(this, x, 204, bonusText(char), C.mist, "center").setDepth(4);

      // Startwaffe mit 16x16-Icon (links neben dem Text, keine Überlappung
      // mit der Bonuszeile darüber).
      const icon = iconTextureKey("weapon", char.startWeapon);
      if (this.textures.exists(icon)) {
        this.add.image(x - 92, 210, icon).setOrigin(0, 0).setDepth(4);
      }
      new PixelText(this, x - 72, 214, `START: ${weaponName(char)}`, C.fog).setDepth(4);

      const meta = readMeta();
      new PixelText(this, x, 228, metaLine(char.id === "mira" ? meta.mira : meta.kael), C.lantern, "center")
        .setDepth(4);
    });

    createMenuButton(this, 86, 252, 96, "ZURÜCK", () => this.back(), { height: 18, depth: 6 });
    const start = createMenuButton(
      this, 280, 252, 132, "START (ENTER)", () => this.start(), { height: 18, depth: 6 },
    );
    start.setFocused(true);

    this.refresh();
    const kb = this.input.keyboard!;
    for (const event of [
      "keydown-LEFT", "keydown-RIGHT", "keydown-A", "keydown-D",
      "keydown-ONE", "keydown-TWO", "keydown-ENTER", "keydown-SPACE", "keydown-ESC",
    ]) kb.removeAllListeners(event);
    kb.on("keydown-LEFT", () => this.move(-1));
    kb.on("keydown-RIGHT", () => this.move(1));
    kb.on("keydown-A", () => this.move(-1));
    kb.on("keydown-D", () => this.move(1));
    kb.on("keydown-ONE", () => this.pick(0));
    kb.on("keydown-TWO", () => this.pick(1));
    kb.on("keydown-ENTER", () => this.start());
    kb.on("keydown-SPACE", () => this.start());
    kb.on("keydown-ESC", () => this.back());
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
    if (this.started) return;
    this.started = true;
    const char = CHARACTER_LIST[this.index];
    this.cameras.main.fadeOut(200, 6, 7, 12);
    this.time.delayedCall(200, () => {
      this.scene.start("run", { character: char.id, seed: this.seed, debug: this.debug });
    });
  }

  private back(): void {
    if (this.started) return;
    this.started = true;
    this.scene.start("title", { seed: this.seed, debug: this.debug });
  }
}

function weaponName(char: CharacterDef): string {
  return char.startWeapon === "ember" ? "GLUTFUNKE" : "KETTENFLEGEL";
}

function bonusText(char: CharacterDef): string {
  return char.id === "mira" ? "+10% FLÄCHENWIRKUNG" : "+20% MAX-HP / -5% TEMPO";
}
