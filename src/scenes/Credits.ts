import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { createMenuButton, type MenuButton } from "../ui/menu";
import { InputState, allActionsReleased } from "../input/InputState";
import { readSceneGamepad } from "../input/Gamepad";
import { addVignetteBg } from "../gfx/vignette-bg";

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
  private viewW = 0;
  private viewH = 0;

  constructor() { super("credits"); }

  init(data: CreditsData): void {
    this.seed = data.seed ?? 1;
    this.debug = data.debug ?? false;
  }

  create(): void {
    this.pad.reset();
    this.padArmed = false;
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const cx = W / 2;
    const oy = Math.round((H - 270) / 2);
    this.viewW = W;
    this.viewH = H;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onScaleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,
      () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onScaleResize, this));

    this.cameras.main.setBackgroundColor(PAL[C.nightDeep]);
    // Vignette pixelgenau (m10-menubg-crisp): ganzzahliger Scale + Kanten-Fuellung.
    addVignetteBg(this, W, H);
    this.add.rectangle(cx, 135 + oy, Math.min(412, W - 24), 244, PAL[C.night], 0.96)
      .setStrokeStyle(2, PAL[C.lantern]).setDepth(0);

    new PixelText(this, cx, 30 + oy, "CREDITS", C.lantern, "center").setScale(2).setDepth(2);
    new PixelText(this, cx, 50 + oy, "LANTERNFALL - DIE LETZTE LATERNE", C.mist, "center").setDepth(2);

    CREDIT_LINES.forEach(([role, name], i) => {
      const y = 70 + oy + i * 13;
      new PixelText(this, cx - 148, y, role, C.fog).setDepth(2);
      new PixelText(this, cx + 148, y, name, C.bone, "right").setDepth(2);
    });
    new PixelText(this, cx, 192 + oy, "GRAFIK-PIPELINE: PROZEDURAL, 32 FARBEN", C.mist, "center").setDepth(2);
    new PixelText(this, cx, 202 + oy, "DANKE FÜRS SPIELEN", C.lantern, "center").setDepth(2);

    this.backButton = createMenuButton(
      this, cx, H - 26, 116, "ZURÜCK", () => this.back(), { depth: 3 },
    );
    this.backButton.setFocused(true);
    new PixelText(this, cx, H - 9, "ESC / ENTER = ZURÜCK", C.fog, "center").setDepth(2);

    const kb = this.input.keyboard!;
    for (const event of ["keydown-ESC", "keydown-ENTER", "keydown-SPACE"]) kb.removeAllListeners(event);
    kb.on("keydown-ESC", () => this.back());
    kb.on("keydown-ENTER", () => this.back());
    kb.on("keydown-SPACE", () => this.back());
  }

  private onScaleResize(): void {
    if (this.viewW === GAME_WIDTH && this.viewH === GAME_HEIGHT) return;
    this.time.delayedCall(0, () => {
      if (this.scene.isActive()) this.scene.restart();
    });
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
