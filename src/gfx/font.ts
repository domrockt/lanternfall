import Phaser from "phaser";
import { PAL } from "../palette";
import { GLYPHS } from "./glyphs";

export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const GLYPH_ADVANCE = 6;

/**
 * M10-ui-text-cost: reine Zähler für das Messskript `scripts/m10-ui-cost.mjs`.
 * Kein Verhalten, keine Ausgabe; im Browser unter `window.__lfText` lesbar.
 */
export const textStats = {
  setTextCalls: 0,
  setTextureCalls: 0,
  ensureGlyphCalls: 0,
};

if (typeof window !== "undefined") {
  (window as unknown as { __lfText: typeof textStats }).__lfText = textStats;
}

function glyphKey(color: number, ch: string): string {
  return `glyph_${color}_${ch.charCodeAt(0)}`;
}

function ensureGlyph(scene: Phaser.Scene, color: number, ch: string): void {
  textStats.ensureGlyphCalls++;
  // Großbuchstaben bevorzugen, damit Kleinbuchstaben in Beschreibungen nicht als
  // gemischte Glyphenhöhen zwischen Versalien erscheinen. Umlaute/ß bleiben exakt.
  const upper = ch.toUpperCase();
  const rows = GLYPHS[upper] ?? GLYPHS[ch] ?? GLYPHS["?"];
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
    textStats.setTextCalls++;
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
        textStats.setTextureCalls++;
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
