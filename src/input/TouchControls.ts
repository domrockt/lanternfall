import Phaser from "phaser";
import { C, PAL } from "../palette";
import { getTouchSnapshot, resetTouchSnapshot, setTouchSnapshot } from "./TouchState";

export interface TouchControlsOptions {
  /** Nur dann Joystick/Pause zeigen und Gesten annehmen (Run läuft, nicht pausiert/Level-up/Truhe). */
  canMove(): boolean;
}

/** Logische Radien (interne 480x270-Auflösung), Positionen bleiben ganzzahlig. */
const RING_RADIUS = 44;
const KNOB_RADIUS = 14;
const TOUCH_DEPTH = 200;

const PAUSE_W = 30;
const PAUSE_H = 18;
const PAUSE_MARGIN = 10;
/** Puls-Länge des Pause-Tipps in ms. */
const PAUSE_PULSE_MS = 120;

/**
 * Schwebender virtueller Joystick + Pause-Knopf für Touch-Geräte.
 *
 * - Der Joystick entsteht dort, wo der erste Finger auf der linken Bildhälfte aufsetzt.
 * - Weitere Finger (rechte Hälfte, Menüs) werden nicht als Joystick benutzt und
 *   beim Ende des Joystick-Fingers auch nicht zurückgesetzt.
 * - `TouchControls` ruft selbst **keine** Spielaktion auf; der Lead liest
 *   `pausePressed` bzw. `getTouchSnapshot().pause` und entprellt dort.
 */
export class TouchControls {
  private readonly scene: Phaser.Scene;
  private readonly opts: TouchControlsOptions;
  private readonly canvas: HTMLCanvasElement;
  private enabled: boolean;

  private stickContainer?: Phaser.GameObjects.Container;
  private knob?: Phaser.GameObjects.Graphics;

  private pauseContainer?: Phaser.GameObjects.Container;
  private pauseBg?: Phaser.GameObjects.Rectangle;

  private pulse = false;
  private pulseConsumed = true;
  private pulseTimer?: Phaser.Time.TimerEvent;

  private identifier: number | null = null;
  private originX = 0;
  private originY = 0;
  private lastCanMove = false;
  private destroyed = false;

  private readonly onTouchStart = (ev: TouchEvent): void => {
    if (!this.enabled || this.destroyed || this.identifier !== null) return;
    // M10-chest-lock-touch: Gate EINMALIG vor der Touch-Auswahl pruefen. Mitten in
    // der Schleife zu pruefen war toluerant gegen Gate-Wechsel waehrend derselben
    // Geste; jetzt gilt: Gate zu bei Touchstart => Geste wird komplett verworfen
    // (auch wenn z. B. die Truhe noch im selben Event geschlossen wird).
    if (!this.opts.canMove()) return;
    const width = this.scene.scale.width;
    let picked: Touch | null = null;
    let pos: { x: number; y: number } | null = null;
    for (let i = 0; i < ev.changedTouches.length; i++) {
      const t = ev.changedTouches.item(i);
      if (!t) return;
      const p = this.toScene(t.clientX, t.clientY);
      if (p.x < width * 0.5) {
        picked = t;
        pos = p;
        break;
      }
    }
    if (!picked || !pos) return;

    this.identifier = picked.identifier;
    this.originX = Math.round(pos.x);
    this.originY = Math.round(pos.y);
    this.showStick(this.originX, this.originY);
    this.setKnobOffset(0, 0);

    const prev = getTouchSnapshot();
    setTouchSnapshot({ active: true, x: 0, y: 0, pause: prev.pause || this.pulse });
    ev.preventDefault();
  };

  private readonly onTouchMove = (ev: TouchEvent): void => {
    if (!this.enabled || this.destroyed || this.identifier === null) return;
    // M10-chest-lock-touch: Gate auch beim Move schliessen. Oeffnet sich das
    // Panel (Truhe/Pause/Level-up) waehrend einer gehaltenen Geste, wird die
    // Geste sofort verworfen - bevor update() das naechste UI-Frame sieht.
    // Ohne diesen Check schreibt der Move noch Bewegung in den Snapshot und der
    // Run liest im selben Frame bis zu einen Frame Drift.
    if (!this.opts.canMove()) {
      this.discardGesture();
      ev.preventDefault();
      return;
    }
    const touch = this.findTouch(ev.touches, this.identifier);
    if (!touch) return;

    const pos = this.toScene(touch.clientX, touch.clientY);
    let dx = pos.x - this.originX;
    let dy = pos.y - this.originY;
    const len = Math.hypot(dx, dy);
    if (len > RING_RADIUS) {
      const scale = RING_RADIUS / len;
      dx *= scale;
      dy *= scale;
    }
    this.setKnobOffset(dx, dy);
    setTouchSnapshot({
      active: true,
      x: dx / RING_RADIUS,
      y: dy / RING_RADIUS,
      pause: this.pulse,
    });
    ev.preventDefault();
  };

  private readonly onTouchEnd = (ev: TouchEvent): void => {
    if (!this.enabled || this.destroyed || this.identifier === null) return;
    const touch = this.findTouch(ev.changedTouches, this.identifier);
    if (!touch) return;
    this.identifier = null;
    this.hideStick();
    resetTouchSnapshot();
    // Eine noch laufende Pause-Pulsierung darf durch das Joystick-Ende nicht verloren gehen.
    if (this.pulse) setTouchSnapshot({ active: false, x: 0, y: 0, pause: true });
    ev.preventDefault();
  };

  private readonly onPointerProbe = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.wasTouch || this.destroyed) return;
    this.enableTouchControls();
  };

  constructor(scene: Phaser.Scene, opts: TouchControlsOptions) {
    this.scene = scene;
    this.opts = opts;
    this.canvas = scene.game.canvas;
    this.enabled = hasTouchSupport();

    if (this.enabled) {
      this.installTouchControls();
    } else {
      // Erster echter Touch schaltet nach: Geräte, die coarse/maxTouchPoints nicht melden.
      // Auf reinen Desktop-Rechnern entstehen so weder Overlay-Objekte noch DOM-Listener.
      this.scene.input.on("pointerdown", this.onPointerProbe);
    }
  }

  private enableTouchControls(): void {
    if (this.enabled || this.destroyed) return;
    this.enabled = true;
    this.scene.input.off("pointerdown", this.onPointerProbe);
    this.installTouchControls();
  }

  private installTouchControls(): void {
    if (this.destroyed || this.stickContainer) return;
    this.createStick();
    this.createPauseButton();
    this.canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.canvas.addEventListener("touchend", this.onTouchEnd, { passive: false });
    this.canvas.addEventListener("touchcancel", this.onTouchEnd, { passive: false });
  }

  /** Pro UI-Frame aufrufen: Pause-Knopf passend ein-/ausblenden, Joystick bei canMove=false zurücksetzen. */
  update(): void {
    if (!this.enabled || this.destroyed) return;
    const canMove = this.opts.canMove();
    if (canMove !== this.lastCanMove) {
      this.lastCanMove = canMove;
      if (this.pauseContainer) {
        this.pauseContainer.setVisible(canMove);
        if (canMove) this.pauseBg?.setInteractive({ useHandCursor: true });
        else this.pauseBg?.disableInteractive();
      }
    }
    if (this.pauseContainer) {
      this.pauseContainer.setPosition(
        Math.round(this.scene.scale.width - PAUSE_MARGIN - PAUSE_W),
        PAUSE_MARGIN,
      );
    }
    if (!canMove) {
      if (this.identifier !== null) {
        this.identifier = null;
        this.hideStick();
      }
      // Bewegung nullen, aber einen noch laufenden Pause-Puls erhalten:
      // Run und UI koennen in unterschiedlicher Reihenfolge updaten.
      const current = getTouchSnapshot();
      setTouchSnapshot({ active: false, x: 0, y: 0, pause: current.pause });
    }
  }

  /**
   * M10-chest-lock-touch: laufende Geste verwerfen (Panel oeffnete statt kleben):
   * Joystick-Identitaet loeschen, Stick verbergen, Bewegung nullen. Ein noch
   * laufender Pause-Puls bleibt erhalten (derselbe Vertrag wie in update()).
   */
  private discardGesture(): void {
    this.identifier = null;
    this.hideStick();
    const current = getTouchSnapshot();
    setTouchSnapshot({ active: false, x: 0, y: 0, pause: current.pause });
  }

  /** Steigende Flanke eines Pause-Tipps (nur einmal lesbar, Puls ca. 120 ms). */
  get pausePressed(): boolean {
    if (!this.pulse || this.pulseConsumed) return false;
    this.pulseConsumed = true;
    return true;
  }

  /** Alias für den API-Vertrag (falls der Lead `touchPressed` liest). */
  get touchPressed(): boolean {
    return this.pausePressed;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pulseTimer?.remove();
    this.pulseTimer = undefined;
    this.scene.input.off("pointerdown", this.onPointerProbe);
    if (this.enabled) {
      this.canvas.removeEventListener("touchstart", this.onTouchStart);
      this.canvas.removeEventListener("touchmove", this.onTouchMove);
      this.canvas.removeEventListener("touchend", this.onTouchEnd);
      this.canvas.removeEventListener("touchcancel", this.onTouchEnd);
    }
    this.stickContainer?.destroy();
    this.pauseContainer?.destroy();
    this.stickContainer = undefined;
    this.pauseContainer = undefined;
    this.pauseBg = undefined;
    this.knob = undefined;
    this.identifier = null;
    resetTouchSnapshot();
  }

  private createStick(): void {
    const ring = this.scene.add.graphics();
    ring.fillStyle(PAL[C.ink], 0.7);
    pixelRing(ring, RING_RADIUS + 1, 2);
    ring.fillStyle(PAL[C.bone], 0.55);
    pixelRing(ring, RING_RADIUS, 2);
    ring.fillStyle(PAL[C.bone], 0.22);
    pixelRing(ring, RING_RADIUS - 7, 1);

    const knob = this.scene.add.graphics();
    knob.fillStyle(PAL[C.ink], 0.85);
    pixelDisk(knob, KNOB_RADIUS);
    knob.fillStyle(PAL[C.bone], 0.6);
    pixelDisk(knob, KNOB_RADIUS - 2);

    const container = this.scene.add
      .container(0, 0, [ring, knob])
      .setDepth(TOUCH_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);
    ring.setScrollFactor(0);
    knob.setScrollFactor(0);
    this.stickContainer = container;
    this.knob = knob;
  }

  private createPauseButton(): void {
    const bg = this.scene.add
      .rectangle(PAUSE_W / 2, PAUSE_H / 2, PAUSE_W, PAUSE_H, PAL[C.nightDeep], 0.55)
      .setStrokeStyle(1, PAL[C.bone], 0.8)
      .setInteractive({ useHandCursor: true });
    const bar1 = this.scene.add.rectangle(9, PAUSE_H / 2, 4, 10, PAL[C.boneLight], 0.9);
    const bar2 = this.scene.add.rectangle(19, PAUSE_H / 2, 4, 10, PAL[C.boneLight], 0.9);
    const container = this.scene.add
      .container(0, 0, [bg, bar1, bar2])
      .setDepth(TOUCH_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);
    bg.setScrollFactor(0);
    bar1.setScrollFactor(0);
    bar2.setScrollFactor(0);
    bg.on("pointerdown", () => this.tapPause());
    this.pauseContainer = container;
    this.pauseBg = bg;
  }

  private tapPause(): void {
    if (!this.enabled || this.destroyed || !this.opts.canMove()) return;
    this.pulse = true;
    this.pulseConsumed = false;
    const prev = getTouchSnapshot();
    setTouchSnapshot({ ...prev, pause: true });
    this.pulseTimer?.remove();
    this.pulseTimer = this.scene.time.delayedCall(PAUSE_PULSE_MS, () => {
      this.pulse = false;
      const s = getTouchSnapshot();
      setTouchSnapshot({ ...s, pause: false });
      this.pulseTimer = undefined;
    });
  }

  private showStick(x: number, y: number): void {
    if (!this.stickContainer) return;
    this.stickContainer.setPosition(x, y).setVisible(true);
  }

  private hideStick(): void {
    this.stickContainer?.setVisible(false);
  }

  private setKnobOffset(dx: number, dy: number): void {
    if (!this.knob) return;
    this.knob.setPosition(Math.round(dx), Math.round(dy));
  }

  private findTouch(list: TouchList, id: number): Touch | null {
    for (let i = 0; i < list.length; i++) {
      const t = list.item(i);
      if (t && t.identifier === id) return t;
    }
    return null;
  }

  /** Bildschirm- in View-Koordinaten umrechnen — nie 480/270 hartkodieren. */
  private toScene(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const viewW = this.scene.scale.width;
    const viewH = this.scene.scale.height;
    const rectW = rect.width || viewW;
    const rectH = rect.height || viewH;
    return {
      x: ((clientX - rect.left) / rectW) * viewW,
      y: ((clientY - rect.top) / rectH) * viewH,
    };
  }
}

/** Pixelgenauer Ring statt weicher Vektor-Bögen. */
function pixelRing(g: Phaser.GameObjects.Graphics, radius: number, thickness: number): void {
  const inner = Math.max(0, radius - thickness);
  for (let y = -radius; y <= radius; y++) {
    const xo = Math.floor(Math.sqrt(Math.max(0, radius * radius - y * y)));
    if (Math.abs(y) > inner) {
      g.fillRect(-xo, y, xo * 2 + 1, 1);
      continue;
    }
    const xi = Math.floor(Math.sqrt(Math.max(0, inner * inner - y * y)));
    if (xi <= 0) {
      g.fillRect(-xo, y, xo * 2 + 1, 1);
    } else {
      g.fillRect(-xo, y, xo - xi, 1);
      g.fillRect(xi + 1, y, xo - xi, 1);
    }
  }
}

/** Pixelgenauer gefüllter Kreis (Knauf). */
function pixelDisk(g: Phaser.GameObjects.Graphics, radius: number): void {
  for (let y = -radius; y <= radius; y++) {
    const x = Math.floor(Math.sqrt(Math.max(0, radius * radius - y * y)));
    g.fillRect(-x, y, x * 2 + 1, 1);
  }
}

/** Touch-Gerät: grober Zeiger oder vorhandene Touchpunkte. */
function hasTouchSupport(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) {
    return true;
  }
  return typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0;
}
