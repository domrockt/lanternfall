import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";

export interface MenuButton {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.NineSlice;
  label: PixelText;
  /** Hovern/Fokus setzt Rahmen + Text auf Laternenfarbe. */
  setFocused(value: boolean): void;
  /** Blendet den Knopf aus: verhindert Klicks durch unsichtbare Container. */
  setEnabled(value: boolean): void;
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

  let focus = false;
  let hover = false;
  const paint = (): void => {
    const active = focus || hover;
    text.setColorIndex(active ? C.lantern : color);
    outline.setVisible(active);
  };
  bg.setInteractive({ useHandCursor: true });
  bg.on("pointerover", () => { hover = true; paint(); });
  bg.on("pointerout", () => { hover = false; paint(); });
  bg.on("pointerdown", () => onClick());

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
      if (value) bg.setInteractive({ useHandCursor: true });
      else bg.disableInteractive();
    },
  };
}

/** Unsichtbare Klick-/Touch-Fläche (z. B. für `<`/`>`-Pfeile). */
export function createHitZone(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  w: number,
  h: number,
  onDown: () => void,
): Phaser.GameObjects.Zone {
  const zone = scene.add.zone(Math.round(x), Math.round(y), w, h)
    .setInteractive({ useHandCursor: true });
  zone.on("pointerdown", () => onDown());
  parent.add(zone);
  return zone;
}
