import Phaser from "phaser";
import { C, PAL } from "../palette";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { PixelText } from "../gfx/font";
import { fitTouchRect } from "./touch-targets";

export interface MenuButton {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.NineSlice;
  label: PixelText;
  /** Hovern/Fokus setzt Rahmen + Text auf Laternenfarbe. */
  setFocused(value: boolean): void;
  /** Blendet den Knopf aus: verhindert Klicks durch unsichtbare Container. */
  setEnabled(value: boolean): void;
  /**
   * M10-gamepad-menu-nav: löst den Knopf ohne Zeiger aus (Gamepad-Fokus).
   * Tut nichts, wenn der Knopf deaktiviert ist. Berührt weder Pressed-Optik
   * noch ButtonVisualState — der Fokus-Zustand zeigt die Auswahl bereits an
   * (AE=0 für Maus/Touch-Pfade).
   */
  press(): void;
}

/** Anteil, auf den der Knopf-Hintergrund im Pressed-Zustand abdunkelt. */
export const BUTTON_PRESSED_ALPHA = 0.72;

/** Eingabe-Zustand eines Menüknopfs (rein, testbar — m10-options-focus). */
export interface ButtonVisualState {
  focus: boolean;
  hover: boolean;
  pressed: boolean;
  baseColorIndex: number;
}

/** Sichtbares Ergebnis (Outline/Textfarbe/Hintergrund-Abdunkelung). */
export interface ButtonVisual {
  outlineVisible: boolean;
  labelColorIndex: number;
  bgAlpha: number;
}

/**
 * M10-options-focus: einheitliche Zustandsmatrix aller Menüknöpfe. Tastatur-Fokus,
 * Maus-Hover und Touch-Press zeigen denselben aktiven Zustand (Lanternfarbe +
 * 1-px-Rahmen); gedrückt wirkt zusätzlich kurz dunkler. Idle bleibt unverändert
 * (AE=0): kein Outline, Basisfarbe, bgAlpha 1.
 */
export function menuButtonVisual(s: ButtonVisualState): ButtonVisual {
  const active = s.focus || s.hover || s.pressed;
  return {
    outlineVisible: active,
    labelColorIndex: active ? C.lantern : s.baseColorIndex,
    bgAlpha: s.pressed ? BUTTON_PRESSED_ALPHA : 1,
  };
}

/**
 * Einheitlicher 9-Slice-Menüknopf (Tastatur + Maus/Touch). Der Knopf ist
 * ganzzahlig positioniert und nutzt ausschließlich Palettenfarben.
 */
export function createMenuButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  label: string,
  onClick: () => void,
  options: { height?: number; depth?: number; color?: number } = {},
): MenuButton {
  const height = options.height ?? 22;
  const depth = options.depth ?? 20;
  const color = options.color ?? C.bone;

  const container = scene.add.container(Math.round(x), Math.round(y)).setDepth(depth);
  const bg = scene.add.nineslice(0, 0, "ui_frame", undefined, width, height, 8, 8, 8, 8);
  const outline = scene.add.rectangle(0, 0, width + 2, height + 2, PAL[C.ink], 0)
    .setStrokeStyle(1, PAL[C.lantern]).setVisible(false);
  const text = new PixelText(scene, 0, -3, label, color, "center");
  container.add([bg, outline, text]);

  // M10: unsichtbare Touch-Flaeche >=44x44, mittig ueber dem sichtbaren Knopf.
  // Sie liegt im Container, damit sie mit dem Knopf aus-/eingeblendet wird;
  // die Optik bleibt unveraendert. `setEnabled` schaltet nur diese Flaeche.
  const rect = fitTouchRect(Math.round(x), Math.round(y), width, height, GAME_WIDTH, GAME_HEIGHT);
  const hit = scene.add.zone(rect.x - container.x, rect.y - container.y, rect.w, rect.h)
    .setInteractive({ useHandCursor: true });
  container.add(hit);

  let focus = false;
  let hover = false;
  let pressed = false;
  let enabled = true;
  const paint = (): void => {
    const v = menuButtonVisual({ focus, hover, pressed, baseColorIndex: color });
    text.setColorIndex(v.labelColorIndex);
    outline.setVisible(v.outlineVisible);
    bg.setAlpha(v.bgAlpha);
  };
  hit.on("pointerover", () => { hover = true; paint(); });
  hit.on("pointerout", () => { hover = false; pressed = false; paint(); });
  hit.on("pointerdown", () => {
    // M10-options-focus: Pressed-Zustand (kurz dunkler) beim Runterdruecken,
    // fuer Maus UND Touch (pointerdown feuert in beiden Faellen).
    pressed = true;
    paint();
    onClick();
  });
  hit.on("pointerup", () => { pressed = false; paint(); });

  paint();
  return {
    container,
    bg,
    label: text,
    setFocused(value: boolean): void {
      focus = value;
      paint();
    },
    setEnabled(value: boolean): void {
      enabled = value;
      if (value) {
        hit.setInteractive({ useHandCursor: true });
      } else {
        // M10-options-focus (Review-Befund): Eine deaktivierte Zone kriegt kein
        // pointerout/pointerup mehr (Phaser nimmt sie aus _over). Pressed/Hover
        // muessen hier zurueckgesetzt werden, sonst rendert der Knopf beim
        // Re-Enable stuck aktiv (z. B. FORTSETZEN schliesst die Pause mitten
        // im Pressed-Zustand).
        pressed = false;
        hover = false;
        paint();
        hit.disableInteractive();
      }
    },
    press(): void {
      // M10-gamepad-menu-nav: Gamepad-Confirm. Kein Pressed-Zustand (keine
      // Verweildauer ohne pointerup) — nur der Klick selbst.
      if (enabled) onClick();
    },
  };
}

/**
 * Unsichtbare Klick-/Touch-Fläche (z. B. für `<`/`>`-Pfeile). M10: Die Fläche
 * wird auf mindestens 44x44 logische Pixel vergroessert und bei Randknöpfen in
 * die View geschoben; die sichtbare Grafik bleibt unveraendert.
 */
export function createHitZone(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  w: number,
  h: number,
  onDown: () => void,
): Phaser.GameObjects.Zone {
  const rect = fitTouchRect(x, y, w, h, GAME_WIDTH, GAME_HEIGHT);
  const zone = scene.add.zone(rect.x - parent.x, rect.y - parent.y, rect.w, rect.h)
    .setInteractive({ useHandCursor: true });
  zone.on("pointerdown", () => onDown());
  parent.add(zone);
  return zone;
}

// ---------------------------------------------------------------------------
// M10-gamepad-menu-nav: Gamepad-Fokus-API auf Widget-Ebene.
// Szenen-Wiring folgt als separater Folgejob — diese API ist die Grundlage.
// ---------------------------------------------------------------------------

/** Erstwiederholung beim Halten einer Richtung (ms). */
export const MENU_REPEAT_FIRST_MS = 200;
/** Folgerepeat beim weiteren Halten (ms). */
export const MENU_REPEAT_NEXT_MS = 100;

/** Veränderlicher Zustand des Repeat-Debounce (reine Funktion, testbar). */
export interface MenuRepeatState {
  held: boolean;
  /** Anzahl Feuer seit Press-Flanke (1 = der Press selbst). */
  fires: number;
  /** Zeitpunkt des letzten Feuers (ms). */
  lastFireMs: number;
}

/**
 * Ein Repeat-Kanal (z. B. „Hoch gehalten“). Rein und testbar:
 * - Press-Flanke (held false→true) feuert sofort.
 * - Nach MENU_REPEAT_FIRST_MS feuert die Erstwiederholung,
 *   danach alle MENU_REPEAT_NEXT_MS (driftfrei via lastFireMs += interval).
 * - Loslassen setzt zurück; ein neuer Press feuert wieder sofort.
 */
export function menuRepeatTick(
  s: MenuRepeatState,
  held: boolean,
  nowMs: number,
): boolean {
  if (held) {
    if (!s.held) {
      s.held = true;
      s.fires = 1;
      s.lastFireMs = nowMs;
      return true;
    }
    const interval = s.fires === 1 ? MENU_REPEAT_FIRST_MS : MENU_REPEAT_NEXT_MS;
    if (nowMs - s.lastFireMs >= interval) {
      s.fires++;
      s.lastFireMs += interval;
      return true;
    }
    return false;
  }
  s.held = false;
  s.fires = 0;
  return false;
}

/** Rückrufe des Fokus-Kreises. */
export interface MenuFocusCallbacks {
  /** Back (z. B. B-Knopf) — Szenen-Verantwortung (Overlay schließen o. ä.). */
  onBack?: () => void;
}

/**
 * Fokus-Kreis über einer Knopfliste (Widget-Ebene). moveFocus(delta) springt
 * wrapping weiter/zurück und visualisiert Fokus genau wie Hover (setFocused →
 * Lanternfarbe + 1-px-Rahmen). confirm()/back() feuern die Rückrufe; Maus- und
 * Touch-Pfade (pointerover/pointerdown) werden nicht berührt (AE=0).
 */
export class MenuFocus {
  private readonly buttons: readonly MenuButton[];
  private readonly callbacks: MenuFocusCallbacks;
  private index = 0;

  constructor(buttons: readonly MenuButton[], callbacks: MenuFocusCallbacks = {}) {
    this.buttons = buttons;
    this.callbacks = callbacks;
    this.paint();
  }

  get currentIndex(): number {
    return this.index;
  }

  /** delta = +1 (weiter) / −1 (zurück), wrappt am Kreis. */
  moveFocus(delta: number): void {
    const count = this.buttons.length;
    if (count === 0) return;
    const next = ((this.index + delta) % count + count) % count;
    if (next !== this.index) {
      this.index = next;
      this.paint();
    }
  }

  /** Springt direkt auf einen Index (z. B. um Hover-Fokus zu übernehmen). */
  setIndex(i: number): void {
    if (i < 0 || i >= this.buttons.length || i === this.index) return;
    this.index = i;
    this.paint();
  }

  /**
   * Confirm auf dem fokussierten Knopf: feuert genau EIN Event (den onClick des
   * Knopfs via press()); deaktivierte Knöpfe tun nichts. Kein zusätzlicher
   * onConfirm-Hook — ein Pad-Frame darf nie zwei Events auslösen.
   */
  confirm(): void {
    this.buttons[this.index]?.press();
  }

  back(): void {
    this.callbacks.onBack?.();
  }

  private paint(): void {
    this.buttons.forEach((b, i) => b.setFocused(i === this.index));
  }
}
