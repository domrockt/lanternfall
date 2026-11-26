import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { GAME_WIDTH } from "../config";
import { createMenuButton, type MenuButton } from "../ui/menu";
import { InputState, allActionsReleased } from "../input/InputState";
import { readSceneGamepad } from "../input/Gamepad";

interface CreditsData { seed?: number; debug?: boolean }

const CREDIT_LINES: [string, string][] = [
  ["SPIELIDEE & TECH-LEAD", "RHEA"],
  ["GAMEPLAY & SYSTEME", "JONAS"],
  ["BALANCE & DATEN", "TARIQ"],
  ["ENGINE & PERFORMANCE", "MIKA"],
  ["MENUES & EINGABE", "LEA"],
  ["PIXEL-ART", "PIXEL-ARTIST"],
  ["VFX & INSZENIERUNG", "ILSE"],
  ["SOUND & MUSIK", "KOFI"],
  ["QA & REVIEW", "PLAYTESTER / REVIEWER"],
];

/** Eigene Credits: Rollen aus dem Team, keine fremden Marken oder Assets. */
export class Credits extends Phaser.Scene {
  private seed = 1;
  private debug = false;
  private backButton!: MenuButton;
  private pad = new InputState();
  /** Erst nach einem Loslassen aller Pad-Aktionen wieder Eingaben annehmen. */
  private padArmed = false;

  constructor() { super("credits"); }

  init(data: CreditsData): void {
    this.seed = data.seed ?? 1;
    this.debug = data.debug ?? false;
  }

  create(): void {
    this.pad.reset();
    this.padArmed = false;
    this.cameras.main.setBackgroundColor(PAL[C.nightDeep]);
    this.add.image(GAME_WIDTH / 2, 135, "vignette").setDepth(-1);
    this.add.rectangle(GAME_WIDTH / 2, 135, 412, 244, PAL[C.night], 0.96)
      .setStrokeStyle(2, PAL[C.lantern]).setDepth(0);

    new PixelText(this, GAME_WIDTH / 2, 30, "CREDITS", C.lantern, "center").setScale(2).setDepth(2);
    new PixelText(this, GAME_WIDTH / 2, 50, "LANTERNFALL - DIE LETZTE LATERNE", C.mist, "center").setDepth(2);

    CREDIT_LINES.forEach(([role, name], i) => {
      const y = 70 + i * 13;
      new PixelText(this, 92, y, role, C.fog).setDepth(2);
      new PixelText(this, 388, y, name, C.bone, "right").setDepth(2);
    });
    new PixelText(this, GAME_WIDTH / 2, 192, "GRAFIK-PIPELINE: PROZEDURAL, 32 FARBEN", C.mist, "center").setDepth(2);
    new PixelText(this, GAME_WIDTH / 2, 202, "DANKE FÜRS SPIELEN", C.lantern, "center").setDepth(2);

    this.backButton = createMenuButton(
      this, GAME_WIDTH / 2, 224, 116, "ZURÜCK", () => this.back(), { depth: 3 },
    );
    this.backButton.setFocused(true);
    new PixelText(this, GAME_WIDTH / 2, 247, "ESC / ENTER = ZURÜCK", C.fog, "center").setDepth(2);

    const kb = this.input.keyboard!;
    for (const event of ["keydown-ESC", "keydown-ENTER", "keydown-SPACE"]) kb.removeAllListeners(event);
    kb.on("keydown-ESC", () => this.back());
    kb.on("keydown-ENTER", () => this.back());
    kb.on("keydown-SPACE", () => this.back());
  }

  update(): void {
    const a = this.pad.update({ gamepad: readSceneGamepad(this) }).actions;
    if (!this.padArmed) {
      if (allActionsReleased(a)) this.padArmed = true;
      return;
    }
    if (a.confirm || a.back) this.back();
  }

  private back(): void {
    this.scene.start("title", { seed: this.seed, debug: this.debug });
  }
}
