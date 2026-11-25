import Phaser from "phaser";
import { PAL } from "../palette";

/** 5x7-Pixel-Bitmap-Font. `1` = Pixel, `0` = transparent. */
const GLYPHS: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "%": ["11001", "11010", "00100", "01000", "10110", "00110", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "=": ["00000", "11111", "00000", "11111", "00000", "00000", "00000"],
  "&": ["01100", "10010", "01100", "10101", "10010", "01101", "00000"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "'": ["00100", "00100", "00000", "00000", "00000", "00000", "00000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const GLYPH_ADVANCE = 6;

function glyphKey(color: number, ch: string): string {
  return `glyph_${color}_${ch.charCodeAt(0)}`;
}

/** Umlaute/ß auf ASCII-Glyphen abbilden (der Font ist bewusst ASCII). */
const FOLD: Record<string, string> = { "Ä": "A", "Ö": "O", "Ü": "U", "ß": "S" };

function ensureGlyph(scene: Phaser.Scene, color: number, ch: string): void {
  const upper = FOLD[ch.toUpperCase()] ?? ch.toUpperCase();
  const rows = GLYPHS[upper] ?? GLYPHS["?"];
  const key = glyphKey(color, ch);
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement("canvas");
  canvas.width = GLYPH_W;
  canvas.height = GLYPH_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#" + PAL[color].toString(16).padStart(6, "0");
  for (let y = 0; y < GLYPH_H; y++) {
    for (let x = 0; x < GLYPH_W; x++) {
      if (rows[y][x] === "1") ctx.fillRect(x, y, 1, 1);
    }
  }
  scene.textures.addCanvas(key, canvas);
}

export type TextAlign = "left" | "center" | "right";

/**
 * Crisper Pixel-Text: ein 5x7-Glyphen-Sprite pro Zeichen, aus dem Object-Pool
 * der Container-Kinder wiederverwendet. Farben sind exakt Palettenindizes.
 */
export class PixelText extends Phaser.GameObjects.Container {
  private glyphs: Phaser.GameObjects.Image[] = [];
  private value = "";
  private colorIndex = 13;
  private align: TextAlign = "left";

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text = "",
    colorIndex = 13,
    align: TextAlign = "left",
  ) {
    super(scene, x, y);
    this.colorIndex = colorIndex;
    this.align = align;
    scene.add.existing(this);
    this.setText(text);
  }

  setColorIndex(i: number): this {
    if (i === this.colorIndex) return this;
    this.colorIndex = i;
    this.setText(this.value);
    return this;
  }

  setAlign(a: TextAlign): this {
    this.align = a;
    this.layout();
    return this;
  }

  setText(value: string | number): this {
    this.value = String(value);
    const chars = this.value.split("");
    while (this.glyphs.length < chars.length) {
      const img = this.scene.add.image(0, 0, glyphKey(this.colorIndex, " ")).setOrigin(0, 0);
      this.add(img);
      this.glyphs.push(img);
    }
    for (let i = 0; i < this.glyphs.length; i++) {
      const img = this.glyphs[i];
      if (i < chars.length && chars[i] !== " ") {
        const ch = chars[i];
        ensureGlyph(this.scene, this.colorIndex, ch);
        img.setTexture(glyphKey(this.colorIndex, ch));
        img.setVisible(true);
      } else {
        img.setVisible(false);
      }
    }
    this.layout();
    return this;
  }

  private layout(): void {
    const width = Math.max(0, this.value.length * GLYPH_ADVANCE - 1);
    let offset = 0;
    if (this.align === "center") offset = -Math.floor(width / 2);
    else if (this.align === "right") offset = -width;
    for (let i = 0; i < this.glyphs.length; i++) {
      this.glyphs[i].setPosition(offset + i * GLYPH_ADVANCE, 0);
    }
  }

  get textWidth(): number {
    return Math.max(0, this.value.length * GLYPH_ADVANCE - 1);
  }

  get valueText(): string {
    return this.value;
  }
}
