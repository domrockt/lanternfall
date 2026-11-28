import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { readMeta, metaLine } from "../logic/meta";
import { TITLE_FLAME_SPOTS } from "../gfx/gen-title";
import { createMenuButton, MenuFocus, type MenuButton } from "../ui/menu";
import { OptionsMenu } from "../ui/options-menu";
import { InputState, allActionsReleased } from "../input/InputState";
import { readSceneGamepad } from "../input/Gamepad";

interface TitleData { seed?: number; debug?: boolean }

export interface TitleBgLayout {
  /** Ganzzahliger Texel-Scale des Kernbilds (nie fraktional -> keine Sub-Pixel-Kanten). */
  scale: number;
  /** Position des Kernbilds (Origin 0,0), ganzzahlig. */
  x: number;
  y: number;
  /** Randbreiten in px, die die Kanten-Fuellung schliesst (links/oben/rechts/unten). */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Titel-Hintergrund pixelgenau: ganzzahliger Scale-Faktor, Restflaeche per
 * Kanten-Fuellung geschlossen. Alle Werte ganzzahlig und >= 0;
 * left + texW*scale + right = gameW, top + texH*scale + bottom = gameH
 * (Fuellung deckt die View komplett ab, kein sichtbarer Rand).
 */
export function titleBgLayout(gameW: number, gameH: number,
  texW = 480, texH = 270): TitleBgLayout {
  const scale = Math.max(1, Math.floor(Math.min(gameW / texW, gameH / texH)));
  const x = Math.round((gameW - texW * scale) / 2);
  const y = Math.round((gameH - texH * scale) / 2);
  return {
    scale, x, y,
    left: x,
    top: y,
    right: gameW - (x + texW * scale),
    bottom: gameH - (y + texH * scale),
  };
}

/** Glas-Reihen des Flammen-Patches: 8x6 Texel ab Patch-Reihe 5 (komplett opak). */
export const TITLE_GLASS_HOLE = { row: 5, w: 8, h: 6 } as const;
/** Nacht-Dim-Stärke der Bodenlasur (unverändert zu main — nur Ausnahmefenster neu). */
export const TITLE_DIM_ALPHA = 0.62;
/** Nacht-Dim-Lasur: Deckel wie in main (Rectangle 0, 132+oy, W, 138). */
export const TITLE_DIM_TOP = 132;
export const TITLE_DIM_HEIGHT = 138;
/**
 * Flammen-Depth wie in main (2): bewusst UNTER den Menue-Buttons (6) und der
 * Vignette (50) — die Dim-Ausnahme läuft über die Glas-Fenster in den Dim-
 * Layern, NICHT über Depth (Flammen dürften nicht über dem Menü landen).
 */
export const TITLE_FLAME_DEPTH = 2;

/**
 * m10-title-dim-lanterns: Dim-Ausnahmefenster für die Laternen-Flammen
 * (Lichtquellen). Je Laterne ein 8x6-Texel-Fenster exakt über den GLAS-Reihen
 * des Flammen-Patches (Reihen 5-10, vollständig opake Texel) — dort zeigt die
 * Szene dann die unverdunkelten Palettenstufen (13 lanternWhite im Kern).
 * Skalenbewusst: Flammen-Patches werden mit bgL.scale gezeichnet, Fenster
 * skalieren mit (bei Scale 1 identisch zu den Texel-Koordinaten).
 * Bewusst NICHT die Funken-Reihen 0-4 (transparent, Hintergrund käme undunkel
 * durch = helles Kasten-Artefakt) und bewusst KEIN Depth > Vignette/Buttons
 * (Flammen dürften nicht über dem Menü landen).
 */
export function lanternGlassHoles(bgL: TitleBgLayout):
  Array<{ x: number; y: number; w: number; h: number }> {
  const s = bgL.scale;
  return TITLE_FLAME_SPOTS.map((spot) => ({
    x: bgL.x + spot.x * s,
    y: bgL.y + (spot.y + TITLE_GLASS_HOLE.row) * s,
    w: TITLE_GLASS_HOLE.w * s,
    h: TITLE_GLASS_HOLE.h * s,
  }));
}

export class Title extends Phaser.Scene {
  private seed = 1;
  private debug = false;
  private options!: OptionsMenu;
  private buttons: MenuButton[] = [];
  /** m10-gamepad-nav-scenes-r2 K2: Fokus-Kreis der Kern-API über allen Knöpfen. */
  private focus!: MenuFocus;
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
    // Titel-Hintergrund pixelgenau (m10-title-bg-crisp): ganzzahliger Scale,
    // Restflaeche schliessen echte Rand-Texel (Kanten-Fuellung) ab.
    // Jeder Teil hat ganzzahlige Texel-Skalierung (keine Sub-Pixel-Kanten) und
    // die Teile kacheln die View lueckenlos (top+270*scale+bottom = H usw.).
    // Kanten-Texturen (je 1 Texel-Reihe/Spalte des Quellbilds) einmalig erzeugen;
    // setCrop ist hier unzuverlaessig (Samplet das falsche Texel).
    const bgL = titleBgLayout(W, H);
    if (!this.textures.exists("title_bg_col_l")) {
      const src = this.textures.get("title_background").getSourceImage() as HTMLCanvasElement;
      const mk = (key: string, x: number, y: number, w: number, h: number): void => {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(src, x, y, w, h, 0, 0, w, h);
        this.textures.addCanvas(key, c);
      };
      mk("title_bg_col_l", 0, 0, 1, 270);
      mk("title_bg_col_r", 479, 0, 1, 270);
      mk("title_bg_row_t", 0, 0, 480, 1);
      mk("title_bg_row_b", 0, 269, 480, 1);
      mk("title_bg_px_tl", 0, 0, 1, 1);
      mk("title_bg_px_tr", 479, 0, 1, 1);
      mk("title_bg_px_bl", 0, 269, 1, 1);
      mk("title_bg_px_br", 479, 269, 1, 1);
    }
    const bgBand = (tex: string, sx: number, sy: number, px: number, py: number): void => {
      this.add.image(px, py, tex).setOrigin(0, 0).setDepth(0).setScale(sx, sy);
    };
    const s = bgL.scale;
    const bx = bgL.x + 480 * s;
    const by = bgL.y + 270 * s;
    if (bgL.top > 0) bgBand("title_bg_row_t", s, bgL.top, bgL.x, 0);
    if (bgL.bottom > 0) bgBand("title_bg_row_b", s, bgL.bottom, bgL.x, by);
    if (bgL.left > 0) bgBand("title_bg_col_l", bgL.left, s, 0, bgL.y);
    if (bgL.right > 0) bgBand("title_bg_col_r", bgL.right, s, bx, bgL.y);
    if (bgL.top > 0 && bgL.left > 0) bgBand("title_bg_px_tl", bgL.left, bgL.top, 0, 0);
    if (bgL.top > 0 && bgL.right > 0) bgBand("title_bg_px_tr", bgL.right, bgL.top, bx, 0);
    if (bgL.bottom > 0 && bgL.left > 0) bgBand("title_bg_px_bl", bgL.left, bgL.bottom, 0, by);
    if (bgL.bottom > 0 && bgL.right > 0) bgBand("title_bg_px_br", bgL.right, bgL.bottom, bx, by);
    this.add.image(bgL.x, bgL.y, "title_background").setOrigin(0, 0).setDepth(0)
      .setScale(s);
    // Atmender Mond-Glow (additiv, nur Licht – keine Off-Palette-Flächen).
    // Mond sitzt im Quellbild bei (404, 56); der Glow folgt der On-Screen-
    // Mondposition (m10-title-bg-crisp: vorher fix an (W-76, 56)).
    const glow = this.add.image(bgL.x + 404, bgL.y + 56, "light_radius")
      .setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.45).setDepth(1);
    this.tweens.add({ targets: glow, alpha: 0.3, scale: 1.0, duration: 2400, yoyo: true, repeat: -1 });
    // Laternen-Flammen (m10-title-flame-crisp): Sparse-Overlay 8x11 Texel
    // (binäres Alpha) an den 4 Moor-Laternen, AE = Glasfläche + Funken.
    // Ruhiger ~2-fps-Texturwechsel (f0 -> f1 -> f0 -> f2), selbe Pixelgröße
    // wie der Hintergrund (bgL.scale ganzzahlig, Muster titleBgLayout/crisp).
    // Phasenversatz je Laterne (art-director-Hinweis): nicht alle 4 Laternen
    // schalten synchron — organischer, gleiches Tempo.
    const flameFrames = ["title_flame_f0", "title_flame_f1", "title_flame_f2"];
    const flameSeq = [0, 1, 0, 2];
    const flames = TITLE_FLAME_SPOTS.map((spot, i) =>
      this.add.image(bgL.x + spot.x, bgL.y + spot.y, flameFrames[flameSeq[i % flameSeq.length]!])
        .setOrigin(0, 0).setDepth(TITLE_FLAME_DEPTH).setScale(s));
    let flameStep = 0;
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        flameStep = (flameStep + 1) % flameSeq.length;
        flames.forEach((f, i) =>
          f.setTexture(flameFrames[flameSeq[(flameStep + i) % flameSeq.length]!]));
      },
    });
    // Dunkle Bodenlasur unter dem Textblock (nur Palettenfarbe, Alpha-Overlay).
    // m10-title-dim-lanterns K2: die Laternen-Flammen (Lichtquellen) bleiben
    // vom Nacht-Dim AUSGENOMMEN — die Lasur ist jetzt eine Canvas-Textur mit
    // Fenstern exakt ueber den opaken Glas-Reihen der 4 Flammen-Patches
    // (lanternGlassHoles). Landschaft/Text-Flaeche bleiben wie in main
    // gedimmt (nightDeep, TITLE_DIM_ALPHA), nur das Glas zeigt ab sofort die
    // ungedimmte Palette (Kern 13 lanternWhite). Kein Depth-Trick: die Flammen
    // bleiben unter Menue-Buttons (L2 Glas liegt hinter OPTIONEN - Bestand).
    const dimTop = oy + TITLE_DIM_TOP;
    const dimHoles = lanternGlassHoles(bgL);
    const dimKey = `title_dim_lasur_${W}x${H}`;
    if (!this.textures.exists(dimKey)) {
      const c = document.createElement("canvas");
      c.width = W; c.height = TITLE_DIM_HEIGHT;
      const ctx = c.getContext("2d")!;
      ctx.globalAlpha = TITLE_DIM_ALPHA;
      ctx.fillStyle = "#" + PAL[C.nightDeep].toString(16).padStart(6, "0");
      ctx.fillRect(0, 0, W, 138);
      ctx.globalAlpha = 1;
      for (const hole of dimHoles) ctx.clearRect(hole.x, hole.y - dimTop, hole.w, hole.h);
      this.textures.addCanvas(dimKey, c);
    }
    this.add.image(0, dimTop, dimKey).setOrigin(0, 0).setDepth(3);
    // Vignette bleibt Vollbild-Dim (depth 50) — ebenfalls mit denselben
    // Glas-Fenstern (lokale Kopie der Boot-Textur, Boot.ts unangetastet).
    // drawImage auf Zielgroesse WxH erzwungen (Verhalten wie setDisplaySize),
    // imageSmoothingEnabled = false fuer pixelgenaue Bandkanten (NEAREST).
    const vinKey = `title_vignette_dim_${W}x${H}`;
    if (!this.textures.exists(vinKey)) {
      const src = this.textures.get("vignette").getSourceImage() as HTMLCanvasElement;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, W, H);
      for (const hole of dimHoles) ctx.clearRect(hole.x, hole.y, hole.w, hole.h);
      this.textures.addCanvas(vinKey, c);
    }
    this.add.image(cx, H / 2, vinKey).setScrollFactor(0).setDepth(50)
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

    // M8: Vollbild-Knopf oben rechts (Desktop + Android-WebView).
    this.fullscreenButton = createMenuButton(
      this, W - 54, 18, 92, "VOLLBILD", () => this.toggleFullscreen(), { height: 18, depth: 6 },
    );
    this.fullscreenButton.setEnabled(true);
    this.buttons.push(this.fullscreenButton);

    // m10-gamepad-nav-scenes-r2 K2: Gamepad-Fokus über der Kern-API (MenuFocus,
    // moveFocus/confirm). Der Fokus-Kreis umfasst ALLE bedienbaren Elemente
    // (START, OPTIONEN, CREDITS, VOLLBILD) und wrappt. Fokus sieht exakt wie
    // Hover aus (menuButtonVisual: setFocused → Lanternfarbe + 1-px-Rahmen);
    // Maus/Touch-Pfade bleiben unberührt (AE=0) — Hover übernimmt nur den
    // Fokus-Index (Start/Hover-Sync, kein zusätzlicher Event).
    this.focus = new MenuFocus(this.buttons);
    this.buttons.forEach((b, i) => {
      const hit = b.container.list[b.container.list.length - 1] as
        Phaser.GameObjects.Zone | undefined;
      hit?.on("pointerover", () => this.focus.setIndex(i));
    });

    // Hinweise am unteren Rand (nicht auf festen 270er-Koordinaten).
    new PixelText(this, cx, H - 38, "WASD/PFEILE BEWEGEN - WAFFEN FEUERN AUTOMATISCH", C.fog, "center").setDepth(4);
    new PixelText(this, cx, H - 28, "MAUS ODER PFEILE + ENTER WÄHLEN", C.fog, "center").setDepth(4);
    new PixelText(this, cx, H - 18, "ESC = PAUSE - O = OPTIONEN", C.fog, "center").setDepth(4);
    if (isIos()) {
      // iOS: Web-App nur ueber den Home-Bildschirm im Vollbild spielbar.
      new PixelText(this, cx, H - 8, "IOS: TEILEN > ZUM HOME-BILDSCHIRM", C.amber, "center").setDepth(4);
    }

    this.options = new OptionsMenu(this, 110, () => {});
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

  /** m10-gamepad-nav-scenes-r2 K2: Kompatibilitäts-Leser (Kern-Harness liest t.selected). */
  get selected(): number {
    return this.focus ? this.focus.currentIndex : 0;
  }

  update(): void {
    if (this.started) return;
    const a = this.pad.update({ gamepad: readSceneGamepad(this) }).actions;
    if (!this.padArmed) {
      if (allActionsReleased(a)) this.padArmed = true;
      return;
    }
    if (this.options.visible) { this.options.handlePad(a); return; }
    // K2: Edge-Aktionen (InputState, rising edge) → ein Pad-Press = eine Aktion.
    if (a.left || a.up) this.focus.moveFocus(-1);
    else if (a.right || a.down) this.focus.moveFocus(1);
    else if (a.confirm) this.focus.confirm();
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.repeat || this.started) return;
    if (this.options.visible) {
      this.options.handleKey(ev);
      return;
    }
    const key = ev.key.toLowerCase();
    if (ev.key === "ArrowLeft" || key === "a") { this.focus.moveFocus(-1); return; }
    if (ev.key === "ArrowRight" || key === "d") { this.focus.moveFocus(1); return; }
    if (ev.key === "ArrowUp" || key === "w") { this.focus.moveFocus(-1); return; }
    if (ev.key === "ArrowDown" || key === "s") { this.focus.moveFocus(1); return; }
    if (key === "o") { this.openOptions(); return; }
    if (key === "c") { this.openCredits(); return; }
    if (ev.key === "Enter" || ev.key === " ") this.focus.confirm();
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
