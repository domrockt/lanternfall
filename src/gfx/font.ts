import Phaser from "phaser";
import { PAL } from "../palette";
import { GLYPHS } from "./glyphs";
import { packCanvasTexture } from "./bakeAtlas";

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
  // m10-atlas-pack K2: Glyphen landen im Baked-Atlas (alle Glyphen einer Seite
  // teilen sich eine GL-Textur -> HUD-/Damage-Text batcht statt zu flushen).
  packCanvasTexture(scene, key, canvas);
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
  /** M10-ui-text-cost: zuletzt pro Glyph gesetzter Texture-Key (Cache). */
  private glyphKeys: string[] = [];
  /** M10-ui-text-cost: Farbe, mit der zuletzt gerendert wurde (Cache-Invalidierung). */
  private renderedColor = -1;
  private layoutLength = -1;
  private layoutAlign: TextAlign | null = null;

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
    if (a === this.align) return this;
    this.align = a;
    this.layout();
    this.layoutAlign = a;
    return this;
  }

  setText(value: string | number): this {
    textStats.setTextCalls++;
    const next = String(value);
    // M10-ui-text-cost: identischer Text (und identische Farbe) ist reine
    // Frame-Arbeit ohne Bildgewinn -> sofort zurueck, kein Zerlegen/Layout/Textur.
    if (next === this.value && this.colorIndex === this.renderedColor) return this;
    this.value = next;
    const chars = next.split("");
    while (this.glyphs.length < chars.length) {
      const img = this.scene.add.image(0, 0, glyphKey(this.colorIndex, " ")).setOrigin(0, 0);
      this.add(img);
      this.glyphs.push(img);
      this.glyphKeys.push("");
    }
    for (let i = 0; i < this.glyphs.length; i++) {
      const img = this.glyphs[i];
      if (i < chars.length && chars[i] !== " ") {
        const ch = chars[i];
        ensureGlyph(this.scene, this.colorIndex, ch);
        const key = glyphKey(this.colorIndex, ch);
        // M10-ui-text-cost: setTexture nur, wenn dieser Glyph den Key wechselt.
        if (this.glyphKeys[i] !== key) {
          textStats.setTextureCalls++;
          img.setTexture(key);
          this.glyphKeys[i] = key;
        }
        img.setVisible(true);
      } else {
        // Cache leeren, damit ein spaeter wieder sichtbares Zeichen neu setzt.
        this.glyphKeys[i] = "";
        img.setVisible(false);
      }
    }
    // M10-ui-text-cost: Positionen haengen nur an Laenge und Align.
    if (next.length !== this.layoutLength || this.align !== this.layoutAlign) {
      this.layout();
      this.layoutLength = next.length;
      this.layoutAlign = this.align;
    }
    this.renderedColor = this.colorIndex;
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
