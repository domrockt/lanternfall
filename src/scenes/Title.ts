import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { readMeta, metaLine } from "../logic/meta";
import { createMenuButton, type MenuButton } from "../ui/menu";
import { OptionsMenu } from "../ui/options-menu";
import { InputState, allActionsReleased } from "../input/InputState";
import { readSceneGamepad } from "../input/Gamepad";

interface TitleData { seed?: number; debug?: boolean }

export class Title extends Phaser.Scene {
  private seed = 1;
  private debug = false;
  private options!: OptionsMenu;
  private buttons: MenuButton[] = [];
  private selected = 0;
  private started = false;
  private pad = new InputState();
  /** Erst nach einem Loslassen aller Pad-Aktionen wieder Eingaben annehmen. */
  private padArmed = false;

  constructor() { super("title"); }

  init(data: TitleData): void {
    this.seed = data.seed ?? 1;
    this.debug = data.debug ?? false;
  }

  create(): void {
    this.started = false;
    this.selected = 0;
    this.pad.reset();
    this.padArmed = false;
    this.buttons = [];
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
    // Titelbild fuellt die aktuelle Breite (Pixel-Art wird ganzzahlig gestreckt).
    this.add.image(0, 0, "title_background").setOrigin(0, 0).setDepth(0)
      .setDisplaySize(W, H);
    // Atmender Mond-Glow (additiv, nur Licht – keine Off-Palette-Flächen).
    const glow = this.add.image(W - 76, 56, "light_radius")
      .setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.45).setDepth(1);
    this.tweens.add({ targets: glow, alpha: 0.3, scale: 1.0, duration: 2400, yoyo: true, repeat: -1 });
    // Dunkle Bodenlasur unter dem Textblock (nur Palettenfarbe, Alpha-Overlay).
    this.add.rectangle(0, 132 + oy, W, 138, PAL[C.nightDeep], 0.62)
      .setOrigin(0, 0).setDepth(3);
    this.add.image(cx, H / 2, "vignette").setScrollFactor(0).setDepth(50)
      .setDisplaySize(W, H);

    this.add.image(cx, 58 + oy, "title_logo").setScale(2).setDepth(2);
    new PixelText(this, cx, 116 + oy, "LANTERNFALL", C.lantern, "center").setScale(3).setDepth(4);
    new PixelText(this, cx, 142 + oy, "DIE LETZTE LATERNE", C.bone, "center").setDepth(4);
    new PixelText(this, cx, 154 + oy, "30 MINUTEN BIS ZUR MORGENDAMMERUNG", C.mist, "center").setDepth(4);

    // Meta-Bestwerte pro Charakter (localStorage, ohne Login/Shop).
    const meta = readMeta();
    new PixelText(this, cx, 172 + oy, "BESTWERTE", C.lantern, "center").setDepth(4);
    new PixelText(this, cx, 184 + oy, `MIRA   ${metaLine(meta.mira)}`, C.bone, "center").setDepth(4);
    new PixelText(this, cx, 194 + oy, `KAEL   ${metaLine(meta.kael)}`, C.bone, "center").setDepth(4);

    this.buttons.push(createMenuButton(
      this, cx - 104, 214 + oy, 96, "START", () => this.startSelect(), { depth: 6 },
    ));
    this.buttons.push(createMenuButton(
      this, cx, 214 + oy, 108, "OPTIONEN", () => this.openOptions(), { depth: 6 },
    ));
    this.buttons.push(createMenuButton(
      this, cx + 106, 214 + oy, 92, "CREDITS", () => this.openCredits(), { depth: 6 },
    ));
    this.refreshButtons();

    // M8: Vollbild-Knopf oben rechts (Desktop + Android-WebView).
    this.fullscreenButton = createMenuButton(
      this, W - 54, 18, 92, "VOLLBILD", () => this.toggleFullscreen(), { height: 18, depth: 6 },
    );
    this.fullscreenButton.setEnabled(true);

    // Hinweise am unteren Rand (nicht auf festen 270er-Koordinaten).
    new PixelText(this, cx, H - 38, "WASD/PFEILE BEWEGEN - WAFFEN FEUERN AUTOMATISCH", C.fog, "center").setDepth(4);
    new PixelText(this, cx, H - 28, "MAUS ODER PFEILE + ENTER WÄHLEN", C.fog, "center").setDepth(4);
    new PixelText(this, cx, H - 18, "ESC = PAUSE - O = OPTIONEN", C.fog, "center").setDepth(4);
    if (isIos()) {
      // iOS: Web-App nur ueber den Home-Bildschirm im Vollbild spielbar.
      new PixelText(this, cx, H - 8, "IOS: TEILEN > ZUM HOME-BILDSCHIRM", C.amber, "center").setDepth(4);
    }

    this.options = new OptionsMenu(this, 110, () => this.refreshButtons());
    const kb = this.input.keyboard!;
    // Szenen-Restart darf keine alten Tastatur-Handler ansammeln.
    kb.removeAllListeners("keydown");
    kb.on("keydown", (ev: KeyboardEvent) => this.onKey(ev));
  }

  private viewW = 0;
  private viewH = 0;
  private fullscreenButton?: MenuButton;

  private onScaleResize(): void {
    if (this.viewW === GAME_WIDTH && this.viewH === GAME_HEIGHT) return;
    this.time.delayedCall(0, () => {
      if (this.scene.isActive()) this.scene.restart();
    });
  }

  /** M8: Vollbild anfordern (still ignorieren, wenn der Browser es blockt). */
  private toggleFullscreen(): void {
    try {
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.();
      } else {
        void document.exitFullscreen?.();
      }
    } catch { /* iOS Safari: kein Fullscreen API -> Home-Bildschirm-Hinweis */ }
  }

  update(): void {
    if (this.started) return;
    const a = this.pad.update({ gamepad: readSceneGamepad(this) }).actions;
    if (!this.padArmed) {
      if (allActionsReleased(a)) this.padArmed = true;
      return;
    }
    if (this.options.visible) { this.options.handlePad(a); return; }
    if (a.left || a.up) { this.selected = (this.selected + 2) % 3; this.refreshButtons(); }
    else if (a.right || a.down) { this.selected = (this.selected + 1) % 3; this.refreshButtons(); }
    else if (a.confirm) {
      if (this.selected === 0) this.startSelect();
      else if (this.selected === 1) this.openOptions();
      else this.openCredits();
    }
  }

  private refreshButtons(): void {
    this.buttons.forEach((b, i) => b.setFocused(i === this.selected));
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.repeat || this.started) return;
    if (this.options.visible) {
      this.options.handleKey(ev);
      return;
    }
    const key = ev.key.toLowerCase();
    if (ev.key === "ArrowLeft" || key === "a") { this.selected = (this.selected + 2) % 3; this.refreshButtons(); return; }
    if (ev.key === "ArrowRight" || key === "d") { this.selected = (this.selected + 1) % 3; this.refreshButtons(); return; }
    if (ev.key === "ArrowUp" || key === "w") { this.selected = (this.selected + 2) % 3; this.refreshButtons(); return; }
    if (ev.key === "ArrowDown" || key === "s") { this.selected = (this.selected + 1) % 3; this.refreshButtons(); return; }
    if (key === "o") { this.openOptions(); return; }
    if (key === "c") { this.openCredits(); return; }
    if (ev.key === "Enter" || ev.key === " ") {
      if (this.selected === 0) this.startSelect();
      else if (this.selected === 1) this.openOptions();
      else this.openCredits();
    }
  }

  private openOptions(): void {
    this.options.open();
  }

  private openCredits(): void {
    if (this.started) return;
    this.started = true;
    this.scene.start("credits", { seed: this.seed, debug: this.debug });
  }

  private startSelect(): void {
    if (this.started) return;
    this.started = true;
    this.cameras.main.fadeOut(180, 6, 7, 12);
    this.time.delayedCall(180, () => this.scene.start("charselect", { seed: this.seed, debug: this.debug }));
  }
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
