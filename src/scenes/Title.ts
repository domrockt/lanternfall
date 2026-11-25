import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { getSettings, changeSetting } from "../audio/settings";
import { applyOptions } from "../audio/AudioSystem";

export class Title extends Phaser.Scene {
  private seed = 1;
  private debug = false;
  private optionsGroup!: Phaser.GameObjects.Container;
  private optionRows: PixelText[] = [];
  private optionSelected = 0;
  private started = false;

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
    new PixelText(this, 240, 240, "ESC = PAUSE - O = OPTIONEN", C.fog, "center").setDepth(4);
    // Kein Debug-/Seed-Text im Titelbild; der Seed steht im Pause-Screen.
    this.createOptionsUI();
    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => this.onKey(ev));
  }

  private createOptionsUI(): void {
    this.optionsGroup = this.add.container(0, 0).setDepth(110).setVisible(false);
    this.optionsGroup.add(this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, PAL[C.ink], 0.92).setOrigin(0, 0));
    this.optionsGroup.add(this.add.nineslice(GAME_WIDTH / 2, 135, "ui_frame", undefined, 336, 190, 8, 8, 8, 8));
    this.optionsGroup.add(new PixelText(this, GAME_WIDTH / 2, 56, "OPTIONEN", C.lantern, "center").setScale(2));
    this.optionsGroup.add(new PixelText(this, GAME_WIDTH / 2, 76, "PFEILE + ENTER", C.fog, "center"));
    this.optionRows = [];
    for (let i = 0; i < 4; i++) {
      const t = new PixelText(this, GAME_WIDTH / 2 - 92, 104 + i * 22, "", C.bone);
      this.optionsGroup.add(t);
      this.optionRows.push(t);
    }
    this.refreshOptions();
  }

  private refreshOptions(): void {
    const opts = getSettings();
    const labels = [
      `MUSIK        < ${Math.round(opts.music * 100)}% >`,
      `SFX          < ${Math.round(opts.sfx * 100)}% >`,
      `SCREEN-SHAKE     ${opts.shake ? "AN" : "AUS"}`,
      "ZURÜCK",
    ];
    this.optionRows.forEach((row, i) => {
      row.setText(`${i === this.optionSelected ? "> " : "  "}${labels[i]}`);
      row.setColorIndex(i === this.optionSelected ? C.lantern : C.bone);
    });
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.repeat) return;
    const key = ev.key.toLowerCase();
    if (this.optionsGroup.visible) {
      if (key === "o" || ev.key === "Escape") { this.optionsGroup.setVisible(false); return; }
      if (ev.key === "ArrowUp" || key === "w") { this.optionSelected = (this.optionSelected + 3) % 4; this.refreshOptions(); return; }
      if (ev.key === "ArrowDown" || key === "s") { this.optionSelected = (this.optionSelected + 1) % 4; this.refreshOptions(); return; }
      if (ev.key === "ArrowLeft" || key === "a") { this.adjust(-0.1); return; }
      if (ev.key === "ArrowRight" || key === "d") { this.adjust(0.1); return; }
      if (ev.key === "Enter" || ev.key === " ") {
        if (this.optionSelected === 3) this.optionsGroup.setVisible(false);
        else this.adjust(this.optionSelected === 2 ? 1 : 0);
        return;
      }
      return;
    }
    if (key === "o") { this.optionSelected = 0; this.refreshOptions(); this.optionsGroup.setVisible(true); return; }
    if ((ev.key === "Enter" || ev.key === " ") && !this.started) this.startSelect();
  }

  private adjust(delta: number): void {
    const opts = getSettings();
    if (this.optionSelected === 0) applyOptions(changeSetting("music", Math.round((opts.music + delta) * 10) / 10));
    else if (this.optionSelected === 1) applyOptions(changeSetting("sfx", Math.round((opts.sfx + delta) * 10) / 10));
    else if (this.optionSelected === 2) applyOptions(changeSetting("shake", !opts.shake));
    this.refreshOptions();
  }

  private startSelect(): void {
    this.started = true;
    this.cameras.main.fadeOut(180, 6, 7, 12);
    this.time.delayedCall(180, () => this.scene.start("charselect", { seed: this.seed, debug: this.debug }));
  }
}
