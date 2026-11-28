import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { CHARACTER_LIST } from "../data/characters";
import { WEAPONS } from "../data/weapons";
import type { CharacterDef } from "../data/types";
import { iconTextureKey } from "../gfx/icons";
import { readMeta, metaLine } from "../logic/meta";
import { createMenuButton } from "../ui/menu";
import { InputState, allActionsReleased } from "../input/InputState";
import { readSceneGamepad } from "../input/Gamepad";
import { addVignetteBg } from "../gfx/vignette-bg";

interface CharSelectData { seed?: number; debug?: boolean }

export class CharSelect extends Phaser.Scene {
  private seed = 1;
  private debug = false;
  private index = 0;
  private panels: Phaser.GameObjects.Rectangle[] = [];
  private started = false;
  private pad = new InputState();
  /** Erst nach einem Loslassen aller Pad-Aktionen wieder Eingaben annehmen. */
  private padArmed = false;
  private viewW = 0;
  private viewH = 0;

  constructor() { super("charselect"); }

  init(data: CharSelectData): void {
    this.seed = data.seed ?? 1;
    this.debug = data.debug ?? false;
  }

  create(): void {
    this.index = 0;
    this.started = false;
    this.pad.reset();
    this.padArmed = false;
    this.panels = [];
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const cx = W / 2;
    const oy = Math.round((H - 270) / 2);
    this.viewW = W;
    this.viewH = H;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onScaleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,
      () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onScaleResize, this));

    this.cameras.main.setBackgroundColor(PAL[C.night]);
    // Vignette pixelgenau (m10-menubg-crisp): ganzzahliger Scale + Kanten-Fuellung.
    addVignetteBg(this, W, H);
    new PixelText(this, cx, 16, "WÄHLE DEINEN CHARAKTER", C.lantern, "center").setScale(2).setDepth(4);
    new PixelText(this, cx, 32, `SEED ${this.seed} · PFEILE/MAUS = WAHL`, C.fog, "center").setDepth(4);

    CHARACTER_LIST.forEach((char, i) => {
      const x = cx + (i - 0.5) * 224;
      const panel = this.add.rectangle(x, 140 + oy, 204, 196, PAL[C.nightMid])
        .setStrokeStyle(2, PAL[C.nightSlate]).setDepth(2).setInteractive({ useHandCursor: true });
      panel.on("pointerover", () => { this.index = i; this.refresh(); });
      panel.on("pointerdown", () => this.pick(i));
      this.panels.push(panel);
      // Portrait 48x48 @2x sitzt oben bündig im Rahmen.
      this.add.image(x, 92 + oy, `portrait_${char.id}`).setScale(2).setDepth(3);
      this.add.image(x, 92 + oy, "light_radius").setBlendMode(Phaser.BlendModes.ADD).setScale(0.55).setAlpha(0.3).setDepth(1);
      new PixelText(this, x, 148 + oy, char.name, C.candleWhite, "center").setDepth(4);
      new PixelText(this, x, 160 + oy, char.title.toUpperCase(), C.amber, "center").setDepth(4);

      // Stats als reine Anzeige (keine Balance-Änderung).
      new PixelText(this, x - 92, 174 + oy, `HP        ${char.hp}`, C.bone).setDepth(4);
      new PixelText(this, x - 92, 184 + oy, `TEMPO     ${char.speed}`, C.bone).setDepth(4);
      new PixelText(this, x - 92, 194 + oy, `RÜSTUNG   ${char.armor}`, C.bone).setDepth(4);
      new PixelText(this, x, 204 + oy, bonusText(char), C.mist, "center").setDepth(4);

      // Startwaffe mit 16x16-Icon (links neben dem Text, keine Überlappung
      // mit der Bonuszeile darüber).
      const icon = iconTextureKey("weapon", char.startWeapon);
      if (this.textures.exists(icon)) {
        this.add.image(x - 92, 210 + oy, icon).setOrigin(0, 0).setDepth(4);
      }
      new PixelText(this, x - 72, 214 + oy, `START: ${weaponName(char)}`, C.fog).setDepth(4);

      const meta = readMeta();
      new PixelText(this, x, 228 + oy, metaLine(char.id === "mira" ? meta.mira : meta.kael), C.lantern, "center")
        .setDepth(4);
    });

    createMenuButton(this, cx - 154, H - 18, 96, "ZURÜCK", () => this.back(), { height: 18, depth: 6 });
    const start = createMenuButton(
      this, cx + 40, H - 18, 132, "START (ENTER)", () => this.start(), { height: 18, depth: 6 },
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

  private onScaleResize(): void {
    if (this.viewW === GAME_WIDTH && this.viewH === GAME_HEIGHT) return;
    this.time.delayedCall(0, () => {
      if (this.scene.isActive()) this.scene.restart();
    });
  }

  update(): void {
    if (this.started) return;
    const a = this.pad.update({ gamepad: readSceneGamepad(this) }).actions;
    if (!this.padArmed) {
      if (allActionsReleased(a)) this.padArmed = true;
      return;
    }
    if (a.left || a.up) this.move(-1);
    else if (a.right || a.down) this.move(1);
    else if (a.confirm) this.start();
    else if (a.back) this.back();
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

// SSOT (m10-charselect-truth): Anzeige folgt den Daten, nie umgekehrt.
function weaponName(char: CharacterDef): string {
  return (WEAPONS[char.startWeapon]?.name ?? char.startWeapon).toUpperCase();
}

const pct = (v: number): string => `${v >= 0 ? "+" : ""}${v}%`;

/** Bonus-Zeile aus char.mods abgeleitet (m10-charselect-truth): Werte kommen
 * aus src/data, nur die Anzeige-Reihenfolge/Label-Wahl liegt hier. Nicht
 * angezeigt (bewusster Anzeige-Scope, siehe docs/lanes): maxHpFlat, regen, xpPct. */
function bonusText(char: CharacterDef): string {
  const m = char.mods;
  const parts: string[] = [];
  if (m.areaPct) parts.push(`${pct(m.areaPct)} FLÄCHENWIRKUNG`);
  if (m.maxHpPct) parts.push(`${pct(m.maxHpPct)} MAX-HP`);
  if (m.moveSpeedPct) parts.push(`${pct(m.moveSpeedPct)} TEMPO`);
  return parts.join(" / ");
}
