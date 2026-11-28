import Phaser from "phaser";
import { C, PAL } from "../palette";
import { getTouchSnapshot, resetTouchSnapshot, setTouchSnapshot } from "./TouchState";
import {
  insetsOverCanvas,
  insetsToGamePx,
  readDeviceSafeAreaInsets,
  type SafeAreaInsets,
} from "../logic/safearea";

export interface TouchControlsOptions {
  /** Nur dann Joystick/Pause zeigen und Gesten annehmen (Run läuft, nicht pausiert/Level-up/Truhe). */
  canMove(): boolean;
}

/** Logische Radien (interne 480x270-Auflösung), Positionen bleiben ganzzahlig. Exportiert fuer tests/touch-overlay-crisp.test.ts. */
export const RING_RADIUS = 44;
export const KNOB_RADIUS = 14;
const TOUCH_DEPTH = 200;

/**
 * M10-touch-joystick-feel: Feel-Parameter des Joysticks (nur Ausgabe-Semantik,
 * kein Bewegungsbudget/Speed-Eingriff — die Magnitude-Remap passiert unverändert
 * in `InputState.applyTouchDeadzoneHysteresis`).
 */

/** Totzone als Anteil des Ring-Radius (Basis-View 480 px breit). */
export const DEADZONE_FRACTION = 0.16;
/** Basis-Breite, auf die sich `DEADZONE_FRACTION` bezieht. */
const BASE_VIEW_WIDTH = 480;
/** Sektorbreite des 8-Richtungs-Snappings (45°). */
export const SECTOR_STEP = Math.PI / 4;
/**
 * Hysterese-Marge zwischen Nachbarsektoren: Erst wenn der Rohwinkel mehr als
 * `SECTOR_STEP / 2 + SECTOR_HYSTERESIS_RAD` vom Zentrum des bisherigen Sektors
 * entfernt ist, wechselt die Richtung. Verhindert Flackern an Sektorgrenzen.
 */
export const SECTOR_HYSTERESIS_RAD = Math.PI / 32; // 5,625°
/** Ausgabe-Schwelle: erst schreiben, wenn sich der Vektor merklich ändert (≈ 0,9 px). */
export const OUTPUT_EPSILON = 0.02;

/**
 * Totzone in Scene-Einheiten, skaliert mit der Viewport-Breite: Auf breiteren
 * Views (640/780) wächst der physische Abstand proportional — der Daumen hat
 * auf großen Screens mehr Platz, die Totzone skaliert mit.
 */
export function joystickDeadzonePx(viewWidth: number): number {
  const scale = Math.max(1, viewWidth / BASE_VIEW_WIDTH);
  return Math.round(RING_RADIUS * DEADZONE_FRACTION * scale);
}

/** Nächster Sektorindex (0..7, Sektor 0 = +x-Rechts, gegen den Uhrzeigersinn in Screen-Y). */
export function sectorIndex8(angle: number): number {
  return ((Math.round(angle / SECTOR_STEP) % 8) + 8) % 8;
}

/**
 * Sektor mit Hysterese: Ohne Historie oder klar jenseits der Grenze zählt der
 * nächste Sektor; im Marge-Band um den bisherigen Sektor bleibt dieser stehen
 * (kein Richtungsflackern durch Mikro-Jitter an Sektorgrenzen).
 */
export function sectorWithHysteresis(angle: number, lastSector: number | null): number {
  const nearest = sectorIndex8(angle);
  if (lastSector === null || nearest === lastSector) return nearest;
  const lastCenter = lastSector * SECTOR_STEP;
  let diff = angle - lastCenter;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) < SECTOR_STEP / 2 + SECTOR_HYSTERESIS_RAD) return lastSector;
  return nearest;
}

/** m10-hud-safearea: exportiert fuer tests/hud-safearea.test.ts (Pause-Anker). */
export const PAUSE_W = 30;
export const PAUSE_H = 18;
export const PAUSE_MARGIN = 10;
/** Puls-Länge des Pause-Tipps in ms. */
const PAUSE_PULSE_MS = 120;

/**
 * M10-touch-overlay-crisp: Mindest-Deckkraft JEDES Overlay-Fills gegen jeden
 * Untergrund (Laternen-Hotspot inklusive). Beleg shots/m10-touch-overlay-
 * before.json F1-F5: Alpha-Fills (0.55-0.7) blendeten mit dem Spielfeld,
 * Kontrast ueber dem Hotspot 1.01-1.19 (Gate 3.0) und farbliche Drift
 * dark<->hot bis 68 Kanalstufen.
 */
export const OVERLAY_MIN_ALPHA = 0.85;

/** Ein opaker Pixel-Fill des Overlays (Ring-/Knauf-Kommando). */
export interface TouchOverlayFill {
  /** Radius in Spielpixeln (ganzzahlig). */
  radius: number;
  /** Ring: Strichstaerke in Spielpixeln (ganzzahlig); Knauf: 0 = gefuellte Scheibe. */
  thickness: number;
  /** Palettenindex (PAL). */
  colorIndex: number;
  /** Deckkraft, immer >= OVERLAY_MIN_ALPHA (1 = opak). */
  alpha: number;
}

export interface TouchOverlaySpec {
  ring: { radius: number; fills: TouchOverlayFill[] };
  knob: { radius: number; fills: TouchOverlayFill[] };
  pause: {
    width: number;
    height: number;
    bgAlpha: number;
    strokeAlpha: number;
    barWidth: number;
    barHeight: number;
    /** Balken-Anker x im Knopf (ganzzahlig, zentriert: Rander 8/8). */
    barOffsetsX: [number, number];
    barAlpha: number;
  };
}

/**
 * Reine Draw-Geometrie des Touch-Overlays (Vertrag fuer tests/touch-overlay-
 * crisp.test.ts). Alles ganzzahlig in Spielpixeln, alle Alphas opak
 * (>= OVERLAY_MIN_ALPHA) — keine Untergrundabhaengigkeit mehr.
 */
export function touchOverlaySpec(): TouchOverlaySpec {
  return {
    ring: {
      radius: RING_RADIUS,
      fills: [
        { radius: RING_RADIUS + 1, thickness: 2, colorIndex: C.ink, alpha: 1 },
        { radius: RING_RADIUS, thickness: 2, colorIndex: C.bone, alpha: 1 },
        { radius: RING_RADIUS - 7, thickness: 1, colorIndex: C.fogBlue, alpha: 1 },
      ],
    },
    knob: {
      radius: KNOB_RADIUS,
      fills: [
        { radius: KNOB_RADIUS, thickness: 0, colorIndex: C.ink, alpha: 1 },
        { radius: KNOB_RADIUS - 2, thickness: 0, colorIndex: C.boneLight, alpha: 1 },
      ],
    },
    pause: {
      width: PAUSE_W,
      height: PAUSE_H,
      bgAlpha: 0.9,
      strokeAlpha: 0.9,
      barWidth: 4,
      barHeight: 10,
      barOffsetsX: [10, 20],
      barAlpha: 0.9,
    },
  };
}

/**
 * m10-hud-safearea (Formel bytegleich aus update(), jetzt testbar): Pause-Knopf
 * klemmt an View-Rand MINUS Geraete-Inset; Marge mindestens PAUSE_MARGIN.
 */
export function pauseAnchor(
  viewWidth: number,
  viewHeight: number,
  insetRight: number,
  insetTop: number,
): { x: number; y: number } {
  return {
    x: Math.round(viewWidth - Math.max(PAUSE_MARGIN, insetRight) - PAUSE_W),
    y: Math.max(PAUSE_MARGIN, insetTop),
  };
}

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
  /** m10-hud-safearea: Geraete-Insets in Spielpixeln (0 ohne Notch), einmalig pro Aufbau. */
  private readonly safeInsetGame: SafeAreaInsets;
  /** M10-touch-joystick-feel: zuletzt gesendeter Sektor (Richtungs-Hysterese). */
  private lastSector: number | null = null;
  /** M10-touch-joystick-feel: zuletzt geschriebener Snapshot-Vektor (Output-Eps). */
  private lastSentX = 0;
  private lastSentY = 0;
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
    this.lastSector = null;
    this.lastSentX = 0;
    this.lastSentY = 0;
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

    // M10-touch-joystick-feel: Feel-Filter — Deadzone, 8-Richtungs-Snapping und
    // Sektor-Hysterese formen nur die AUSGABE. Die Magnitude (dx, dy nach Ring-
    // Klemmung) bleibt unangetastet; Totzone/Remap/Normierung passieren wie zuvor
    // in InputState, der Bewegungsbudget/Speed nicht veraendert.
    const deadzone = joystickDeadzonePx(this.scene.scale.width);
    if (len < deadzone) {
      // Unter der Totzone: Knauf ruht, Vektor exakt 0 (kein Mikro-Drift).
      this.lastSector = null;
      this.applyFeel(0, 0);
    } else {
      const sector = sectorWithHysteresis(Math.atan2(dy, dx), this.lastSector);
      this.lastSector = sector;
      const angle = sector * SECTOR_STEP;
      this.applyFeel(Math.cos(angle) * len, Math.sin(angle) * len);
    }
    ev.preventDefault();
  };

  /**
   * M10-touch-joystick-feel: Knopf + Snapshot nur bei merklicher Aenderung
   * (|Delta| > OUTPUT_EPSILON) schreiben — Mikro-Jitter erzeugt keine
   * Positions-Updates mehr, echte Bewegung bleibt synchron (0 Frames Latenz).
   */
  private applyFeel(dx: number, dy: number): void {
    const nx = dx / RING_RADIUS;
    const ny = dy / RING_RADIUS;
    if (Math.hypot(nx - this.lastSentX, ny - this.lastSentY) <= OUTPUT_EPSILON) return;
    this.lastSentX = nx;
    this.lastSentY = ny;
    this.setKnobOffset(dx, dy);
    setTouchSnapshot({
      active: true,
      x: nx,
      y: ny,
      pause: this.pulse,
    });
  }

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
    // m10-hud-safearea: Insets einmalig lesen (View-Wechsel baut die Szene neu
    // auf -> neuer TouchControls). Nur der Inset-Anteil UEBER dem Canvas wirkt
    // (body-Padding rueckt den Canvas bei Geraeten wie Pixel 7 bereits in die
    // Safe-Area). Pause-Knopf klemmt an View-Rand MINUS Inset.
    const canvasRect = typeof this.canvas?.getBoundingClientRect === "function"
      ? this.canvas.getBoundingClientRect()
      : undefined;
    const screenW = (typeof window !== "undefined" ? window.innerWidth : 0) || scene.scale.width;
    const screenH = (typeof window !== "undefined" ? window.innerHeight : 0) || scene.scale.height;
    this.safeInsetGame = insetsToGamePx(
      scene.scale.width,
      canvasRect?.width ?? scene.scale.width,
      insetsOverCanvas(readDeviceSafeAreaInsets(), canvasRect, screenW, screenH),
    );

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
      // m10-hud-safearea: Marge mindestens Geraete-Inset (Notch/Rundung),
      // sonst HUD-Konvention PAUSE_MARGIN — ohne Notch bitgleich (Formel
      // bytegleich, jetzt ueber pauseAnchor() testbar).
      const anchor = pauseAnchor(
        this.scene.scale.width,
        this.scene.scale.height,
        this.safeInsetGame.right,
        this.safeInsetGame.top,
      );
      this.pauseContainer.setPosition(anchor.x, anchor.y);
    }
    if (!canMove) {
      if (this.identifier !== null) {
        this.identifier = null;
        this.hideStick();
      }
      this.lastSector = null;
      this.lastSentX = 0;
      this.lastSentY = 0;
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
    this.lastSector = null;
    this.lastSentX = 0;
    this.lastSentY = 0;
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
    // M10-touch-overlay-crisp: Draw-Befehle aus der reinen Spec (opak,
    // ganzzahlig) — siehe touchOverlaySpec(); Beleg before/after-JSON.
    const spec = touchOverlaySpec();
    const ring = this.scene.add.graphics();
    for (const f of spec.ring.fills) {
      ring.fillStyle(PAL[f.colorIndex], f.alpha);
      pixelRing(ring, f.radius, f.thickness);
    }

    const knob = this.scene.add.graphics();
    for (const f of spec.knob.fills) {
      knob.fillStyle(PAL[f.colorIndex], f.alpha);
      pixelDisk(knob, f.radius);
    }

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
    // M10-touch-overlay-crisp: Werte aus der Spec (bg 0.9, Stroke 0.9, Balken
    // zentriert auf 10/20 statt 9/19 — Randmargen 8/8 statt 7/9).
    const spec = touchOverlaySpec().pause;
    const bg = this.scene.add
      .rectangle(spec.width / 2, spec.height / 2, spec.width, spec.height, PAL[C.nightDeep], spec.bgAlpha)
      .setStrokeStyle(1, PAL[C.bone], spec.strokeAlpha)
      .setInteractive({ useHandCursor: true });
    const bar1 = this.scene.add.rectangle(spec.barOffsetsX[0], spec.height / 2, spec.barWidth, spec.barHeight, PAL[C.boneLight], spec.barAlpha);
    const bar2 = this.scene.add.rectangle(spec.barOffsetsX[1], spec.height / 2, spec.barWidth, spec.barHeight, PAL[C.boneLight], spec.barAlpha);
    const container = this.scene.add
      .container(0, 0, [bg, bar1, bar2])
      .setDepth(TOUCH_DEPTH)
      .setScrollFactor(0)
      .setVisible(false);
    // m10-hud-safearea: Name fuer die HUD-Messung (kein Layout-Eingriff).
    if (typeof container.setName === "function") container.setName("hud-touch-pause");
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
