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
  hit.on("pointerupoutside", () => { pressed = false; paint(); });

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
      if (value) hit.setInteractive({ useHandCursor: true });
      else hit.disableInteractive();
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
