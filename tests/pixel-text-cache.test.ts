import { beforeEach, describe, expect, it, vi } from "vitest";

// PixelText lebt von Phaser-Containern; fuer den Cache-Test genuegen Stubs.
// (Kein DOM-Phaser: document.createElement liefert einen Canvas-Stub.)
vi.mock("phaser", () => {
  class Container {
    scene: unknown;
    children: unknown[] = [];
    constructor(scene: unknown) { this.scene = scene; }
    add(child: unknown) { this.children.push(child); return this; }
    setDepth() { return this; }
  }
  return { default: { GameObjects: { Container } } };
});

import { PixelText, textStats } from "../src/gfx/font";

type FakeImage = {
  texture: { key: string };
  key: string;
  visible: boolean;
  x: number;
  y: number;
  setOrigin: () => FakeImage;
  setTexture: (key: string) => FakeImage;
  setVisible: (v: boolean) => FakeImage;
  setPosition: (x: number, y: number) => FakeImage;
};

const GLYPH_KEY = (color: number, ch: string): string => `glyph_${color}_${ch.charCodeAt(0)}`;

function makeScene() {
  const textures = new Set<string>();
  const images: FakeImage[] = [];
  const scene = {
    textures: {
      exists: vi.fn((key: string) => textures.has(key)),
      addCanvas: vi.fn((key: string) => { textures.add(key); }),
    },
    add: {
      existing: vi.fn(),
      image: vi.fn((_x: number, _y: number, key: string) => {
        const img: FakeImage = {
          key,
          texture: { key },
          visible: true,
          x: 0,
          y: 0,
          setOrigin() { return img; },
          setTexture(k) { img.key = k; img.texture.key = k; return img; },
          setVisible(v) { img.visible = v; return img; },
          setPosition(x, y) { img.x = x; img.y = y; return img; },
        };
        images.push(img);
        return img;
      }),
    },
  };
  return { scene: scene as unknown as import("phaser").Scene, images, textures };
}

const counters = () => ({ ...textStats });
const delta = (a: ReturnType<typeof counters>, b: ReturnType<typeof counters>) => ({
  setText: b.setTextCalls - a.setTextCalls,
  setTexture: b.setTextureCalls - a.setTextureCalls,
  ensureGlyph: b.ensureGlyphCalls - a.ensureGlyphCalls,
});

beforeEach(() => {
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ fillStyle: "", fillRect: vi.fn() }),
    }),
  });
});

describe("M10-ui-text-cost: PixelText-Cache", () => {
  it("identischer Text loest 0 setTexture/ensureGlyph aus (Early-Return)", () => {
    const { scene, images } = makeScene();
    const text = new PixelText(scene, 0, 0, "LV 12");
    // Erstes Rendern hat den Glyph erzeugt und Texturen gesetzt.
    expect(images.length).toBe(5);
    const before = counters();
    for (let i = 0; i < 120; i++) text.setText("LV 12");
    expect(delta(before, counters())).toEqual({ setText: 120, setTexture: 0, ensureGlyph: 0 });
  });

  it("geaenderter Text rendert korrekt (Glyphen, Sichtbarkeit, Laenge)", () => {
    const { scene, images } = makeScene();
    const text = new PixelText(scene, 0, 0, "AB", 13);
    expect(images[0].texture.key).toBe(GLYPH_KEY(13, "A"));
    expect(images[1].texture.key).toBe(GLYPH_KEY(13, "B"));
    expect(images[0].visible).toBe(true);
    expect(images[1].visible).toBe(true);

    // Leerzeichen bleibt unsichtbar, Text danach wieder korrekt.
    text.setText("A B");
    expect(images[1].visible).toBe(false);
    expect(images[2].texture.key).toBe(GLYPH_KEY(13, "B"));
    expect(images[2].visible).toBe(true);

    // Kuerzerer Text blendet die uebrigen Glyphen aus.
    text.setText("A");
    expect(images[1].visible).toBe(false);
    expect(images[2].visible).toBe(false);

    // Laengerer Text nutzt den Objekt-Pool weiter und rendert alle Zeichen.
    text.setText("ABC");
    expect(images[0].texture.key).toBe(GLYPH_KEY(13, "A"));
    expect(images[1].texture.key).toBe(GLYPH_KEY(13, "B"));
    expect(images[2].texture.key).toBe(GLYPH_KEY(13, "C"));
    expect(images.slice(0, 3).every((img) => img.visible)).toBe(true);
  });

  it("nur geaenderte Zeichen bekommen ein neues setTexture", () => {
    const { scene, images } = makeScene();
    const text = new PixelText(scene, 0, 0, "00:01", 13);
    const before = counters();
    text.setText("00:02");
    // Nur die letzte Ziffer wechselt.
    expect(delta(before, counters()).setTexture).toBe(1);
    expect(images[4].texture.key).toBe(GLYPH_KEY(13, "2"));
    expect(images[0].texture.key).toBe(GLYPH_KEY(13, "0"));
  });

  it("Center-/Right-Align invalidieren das Layout, ohne Texturen neu zu setzen", () => {
    const { scene, images } = makeScene();
    const text = new PixelText(scene, 0, 0, "AB", 13, "left");
    expect(images.map((i) => i.x)).toEqual([0, 6]);

    const before = counters();
    text.setAlign("center");
    // width = 2*6-1 = 11 -> offset -5
    expect(images.map((i) => i.x)).toEqual([-5, 1]);
    text.setAlign("right");
    expect(images.map((i) => i.x)).toEqual([-11, -5]);
    expect(delta(before, counters()).setTexture).toBe(0);

    // Laengenaenderung loest Layout neu aus (right: width 17 -> -17,-11,-5).
    text.setText("ABC");
    expect(images.slice(0, 3).map((i) => i.x)).toEqual([-17, -11, -5]);
  });

  it("Farbwechsel invalidiert den Cache und setzt alle Glyphen neu", () => {
    const { scene, images } = makeScene();
    const text = new PixelText(scene, 0, 0, "A", 13);
    expect(images[0].texture.key).toBe(GLYPH_KEY(13, "A"));

    const before = counters();
    text.setColorIndex(3);
    expect(delta(before, counters()).setTexture).toBe(1);
    expect(images[0].texture.key).toBe(GLYPH_KEY(3, "A"));

    // Gleiche Farbe erneut -> kein weiteres setTexture.
    const again = counters();
    text.setColorIndex(3);
    expect(delta(again, counters()).setTexture).toBe(0);
  });

  it("gleicher Text nach Farbwechsel wird neu gerendert (Cache-Kombination)", () => {
    const { scene, images } = makeScene();
    const text = new PixelText(scene, 0, 0, "HP", 13);
    text.setText("HP");
    // setText allein mit identischem Wert + identischer Farbe: Early-Return.
    expect(images[0].texture.key).toBe(GLYPH_KEY(13, "H"));
    text.setColorIndex(8);
    expect(images[0].texture.key).toBe(GLYPH_KEY(8, "H"));
    expect(images[1].texture.key).toBe(GLYPH_KEY(8, "P"));
  });
});
